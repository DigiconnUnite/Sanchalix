import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Encode(bytes: Uint8Array) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) ?? []).map((chunk) => ALPHABET[parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}

function base32Decode(secret: string) {
  let bits = '';
  for (const char of secret) bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

/** The RFC 6238 code (SHA-1, 6 digits, 30 s step) for the base32 `secret` at `time`. */
export function totpCode(secret: string, time = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / STEP_SECONDS)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Accepts the previous, current and next step, so a slightly wrong phone clock still works. */
export function verifyTotpCode(secret: string, code: string, time = Date.now()) {
  return [-1, 0, 1].some((drift) => {
    const expected = Buffer.from(totpCode(secret, time + drift * STEP_SECONDS * 1000));
    const given = Buffer.from(code);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Vidyawan:${account}`)}?secret=${secret}&issuer=Vidyawan`;
