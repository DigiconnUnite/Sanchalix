import { expect, it } from 'vitest';
import { generateTotpSecret, totpCode, verifyTotpCode } from './totp';

// "12345678901234567890" in base32, the shared secret of the RFC 6238 test vectors.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

it('matches the RFC 6238 SHA-1 test vectors', () => {
  expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
  expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
  expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
});

it('accepts a code from the step before or after, and nothing further away', () => {
  const now = 1_700_000_000_000;
  const secret = generateTotpSecret();
  expect(verifyTotpCode(secret, totpCode(secret, now), now)).toBe(true);
  expect(verifyTotpCode(secret, totpCode(secret, now - 30_000), now)).toBe(true);
  expect(verifyTotpCode(secret, totpCode(secret, now + 30_000), now)).toBe(true);
  expect(verifyTotpCode(secret, totpCode(secret, now - 90_000), now)).toBe(false);
  expect(verifyTotpCode(secret, '12345', now)).toBe(false);
});
