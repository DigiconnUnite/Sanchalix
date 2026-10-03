import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { SESSION_COOKIE } from '@/lib/sessionCookie';
import { MODE_COOKIE, type VisualMode } from '@/lib/visualMode';
import { connectDb } from '@/server/db/connect';
import { Session } from '@/server/models/session';
import { type RoleKey, TOTP_REQUIRED_ROLES } from './permissions';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const TOTP_PENDING_MS = 10 * MINUTE;
const FAMILY: readonly RoleKey[] = ['parent', 'student'];

function lifetimes(role: RoleKey) {
  if (TOTP_REQUIRED_ROLES.includes(role)) return { idle: 30 * MINUTE, absolute: 12 * HOUR };
  if (FAMILY.includes(role)) return { idle: 30 * DAY, absolute: 90 * DAY };
  return { idle: 8 * HOUR, absolute: 90 * DAY };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(
  userId: Types.ObjectId,
  role: RoleKey,
  schoolId: Types.ObjectId,
  totpPending = false,
) {
  const token = randomBytes(32).toString('base64url');
  const { idle, absolute } = lifetimes(role);
  const requestHeaders = await headers();

  await Session.create({
    sessionToken: hashToken(token),
    userId,
    activeRole: role,
    activeSchoolId: schoolId,
    expires: new Date(Date.now() + (totpPending ? TOTP_PENDING_MS : idle)),
    totpPending,
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent')?.slice(0, 256) ?? null,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: absolute / 1000,
  });
}

export async function setModeCookie(mode: VisualMode) {
  (await cookies()).set(MODE_COOKIE, mode, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: (365 * DAY) / 1000,
  });
}

export const readSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  await connectDb();
  const now = Date.now();
  const session = await Session.findOne({ sessionToken: hashToken(token), expires: { $gt: new Date(now) } }).lean();
  if (!session) return null;

  const { idle, absolute } = lifetimes(session.activeRole);
  const hardLimit = session.createdAt.getTime() + absolute;
  if (now >= hardLimit) return null;

  // Sliding expiry is written only once half the idle window has passed, so most requests cost no write.
  if (!session.totpPending && session.expires.getTime() - now < idle / 2) {
    await Session.updateOne({ _id: session._id }, { expires: new Date(Math.min(now + idle, hardLimit)) });
  }
  return session;
});

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await connectDb();
  await Session.deleteOne({ sessionToken: hashToken(token) });
  store.delete(SESSION_COOKIE);
}
