import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import { AppError } from '@/lib/appError';
import { env } from '@/lib/env';
import { connectDb } from '@/server/db/connect';
import { User } from '@/server/models/user';
import { TOTP_REQUIRED_ROLES } from './permissions';

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_MS = 15 * 60_000;

export const hashPassword = (password: string) => hash(password, ARGON2);
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

// Verified against when the account doesn't exist, so response time doesn't reveal which emails are registered.
const decoyHash = hashPassword('decoy');

export async function verifyCredentials(email: string, password: string) {
  await connectDb();
  const user = await User.findOne({ email }).select('+passwordHash roles status lockedUntil visualMode totp.enabledAt').lean();

  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new AppError('RATE_LIMITED', 'auth.signIn.locked');

  const matches = await verify(user?.passwordHash ?? (await decoyHash), password);
  if (!user?.passwordHash || !matches || user.status !== 'active') {
    if (user) await recordFailure(user._id);
    throw new AppError('UNAUTHENTICATED', 'auth.signIn.invalid');
  }

  const assignment = user.roles.find((r) => r.schoolId);
  if (!assignment?.schoolId) throw new AppError('UNAUTHENTICATED', 'auth.signIn.invalid');

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } },
  );
  return {
    userId: user._id,
    role: assignment.role,
    schoolId: assignment.schoolId,
    visualMode: user.visualMode,
    needsTotp:
      env.TWO_FACTOR_ENABLED === 'true' &&
      (TOTP_REQUIRED_ROLES.includes(assignment.role) || Boolean(user.totp?.enabledAt)),
  };
}

export async function recordFailure(userId: unknown) {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLoginCount: 1 } },
    { returnDocument: 'after' },
  )
    .select('failedLoginCount')
    .lean();
  if (updated && updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    await User.updateOne(
      { _id: userId },
      { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } },
    );
  }
}
