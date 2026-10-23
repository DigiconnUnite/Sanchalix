import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import type { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import { env } from '@/lib/env';
import { connectDb } from '@/server/db/connect';
import { AuditLog } from '@/server/models/auditLog';
import { School } from '@/server/models/school';
import { User } from '@/server/models/user';
import { type RoleKey, TOTP_REQUIRED_ROLES } from './permissions';

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_MS = 15 * 60_000;

export const hashPassword = (password: string) => hash(password, ARGON2);
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

// Verified against when the account doesn't exist, so response time doesn't reveal which emails are registered.
const decoyHash = hashPassword('decoy');

/**
 * The schools a person can work in, apart from the one they are in now, each with the role they would start in.
 * A suspended school is left out.
 */
export async function listOtherSchools(userId: Types.ObjectId, currentSchoolId: Types.ObjectId) {
  const user = await User.findById(userId).select('roles').lean();
  const wanted = new Map(
    (user?.roles ?? []).flatMap((assignment) =>
      assignment.schoolId && !assignment.schoolId.equals(currentSchoolId)
        ? [[String(assignment.schoolId), assignment.role] as const]
        : [],
    ),
  );
  const schools = await School.find({ _id: { $in: [...wanted.keys()] }, status: { $ne: 'suspended' } })
    .select('name')
    .sort({ name: 1 })
    .lean();
  return schools.map((school) => ({ id: String(school._id), name: school.name, role: wanted.get(String(school._id)) as RoleKey }));
}

type Origin = { ip: string | null; userAgent: string | null };

export async function verifyCredentials(email: string, password: string, origin: Origin = { ip: null, userAgent: null }) {
  await connectDb();
  const user = await User.findOne({ email }).select('+passwordHash roles status lockedUntil visualMode totp.enabledAt').lean();

  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new AppError('RATE_LIMITED', 'auth.signIn.locked');

  const matches = await verify(user?.passwordHash ?? (await decoyHash), password);
  if (!user?.passwordHash || !matches || user.status !== 'active') {
    if (user) await recordFailure(user._id, user.roles.find((role) => role.schoolId), origin);
    throw new AppError('UNAUTHENTICATED', 'auth.signIn.invalid');
  }

  // Platform staff hold a role that belongs to no school; everyone else signs in to the first school they work in.
  const assignment = user.roles.find((r) => r.schoolId) ?? user.roles.find((r) => r.role === 'super_admin');
  if (!assignment) throw new AppError('UNAUTHENTICATED', 'auth.signIn.invalid');

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } },
  );
  return {
    userId: user._id,
    role: assignment.role,
    schoolId: assignment.schoolId ?? null,
    visualMode: user.visualMode,
    needsTotp:
      env.TWO_FACTOR_ENABLED === 'true' &&
      (TOTP_REQUIRED_ROLES.includes(assignment.role) || Boolean(user.totp?.enabledAt)),
  };
}

/**
 * Counts a failed sign-in, locks the account at the limit, and writes both to the audit log of the person's school,
 * so the school can see someone guessing at an account. Nothing about the attempt itself (the password) is kept.
 */
export async function recordFailure(
  userId: Types.ObjectId,
  assignment?: { role: RoleKey; schoolId?: Types.ObjectId | null | undefined } | undefined,
  origin: Origin = { ip: null, userAgent: null },
) {
  const log = (action: string) =>
    assignment?.schoolId
      ? AuditLog.create({
          schoolId: assignment.schoolId,
          actorId: userId,
          actorRole: assignment.role,
          action,
          entity: { type: 'user', id: userId },
          ...origin,
        })
      : null;
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLoginCount: 1 } },
    { returnDocument: 'after' },
  )
    .select('failedLoginCount')
    .lean();
  await log('auth.signIn.failed');
  if (updated && updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    await log('auth.signIn.locked');
    await User.updateOne(
      { _id: userId },
      { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } },
    );
  }
}
