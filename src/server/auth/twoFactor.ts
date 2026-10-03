import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import { generateTotpSecret, otpauthUrl, verifyTotpCode } from '@/lib/totp';
import { User } from '@/server/models/user';
import { open, seal } from './secretBox';
import { recordFailure } from './service';

const RECOVERY_CODES = 10;

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const normalise = (code: string) => code.replace(/[\s-]/g, '').toLowerCase();

async function loadTotp(userId: Types.ObjectId, rejectLocked = true) {
  const user = await User.findById(userId).select('email phone lockedUntil +totp.secret totp.enabledAt').lean();
  if (!user) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
  if (rejectLocked && user.lockedUntil && user.lockedUntil > new Date()) throw new AppError('RATE_LIMITED', 'auth.signIn.locked');
  return user;
}

/** The secret to enrol, or null once 2FA is set up. An unconfirmed secret is reused, so a reload shows the same QR. */
export async function getTotpSetup(userId: Types.ObjectId) {
  const user = await loadTotp(userId, false);
  if (user.totp?.enabledAt) return null;

  let secret = user.totp?.secret ? open(user.totp.secret) : null;
  if (!secret) {
    secret = generateTotpSecret();
    await User.updateOne({ _id: userId }, { 'totp.secret': seal(secret) });
  }
  return { secret, otpauthUrl: otpauthUrl(secret, user.email ?? user.phone ?? '') };
}

export async function confirmTotpSetup(userId: Types.ObjectId, code: string) {
  const user = await loadTotp(userId);
  if (user.totp?.enabledAt || !user.totp?.secret) throw new AppError('BUSINESS_RULE', 'auth.totp.alreadySetUp');
  if (!verifyTotpCode(open(user.totp.secret), normalise(code))) {
    await recordFailure(userId);
    throw new AppError('VALIDATION', 'auth.totp.wrongCode');
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODES }, () => {
    const raw = randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await User.updateOne(
    { _id: userId },
    { 'totp.enabledAt': new Date(), 'totp.recoveryCodeHashes': recoveryCodes.map((c) => hashCode(normalise(c))) },
  );
  return recoveryCodes;
}

/** Checks a 6-digit TOTP code or a single-use recovery code. Returns which one was used. */
export async function verifyTotpChallenge(userId: Types.ObjectId, input: string) {
  const user = await loadTotp(userId);
  const code = normalise(input);
  if (user.totp?.enabledAt && user.totp.secret) {
    if (/^\d{6}$/.test(code) && verifyTotpCode(open(user.totp.secret), code)) return 'totp' as const;

    const used = await User.updateOne(
      { _id: userId, 'totp.recoveryCodeHashes': hashCode(code) },
      { $pull: { 'totp.recoveryCodeHashes': hashCode(code) } },
    );
    if (used.modifiedCount === 1) return 'recoveryCode' as const;
  }
  await recordFailure(userId);
  throw new AppError('UNAUTHENTICATED', 'auth.totp.wrongCode');
}
