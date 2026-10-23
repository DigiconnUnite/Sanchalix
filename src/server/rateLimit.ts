import 'server-only';
import { headers } from 'next/headers';
import { AppError } from '@/lib/appError';
import { connectDb } from '@/server/db/connect';
import { RateLimit } from '@/server/models/rateLimit';

/**
 * The caller's address as the host's proxy reports it. It can be forged by anyone who reaches the app without going
 * through the proxy, so the app must only be reachable through it.
 */
export async function clientIp() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Allows `limit` calls per `seconds` for one caller and bucket, counted in fixed windows shared by every server
 * instance. Returns false once the limit is passed; the next window starts clean.
 */
export async function withinLimit(bucket: string, who: string, limit: number, seconds: number) {
  await connectDb();
  const window = Math.floor(Date.now() / (seconds * 1000));
  const row = await RateLimit.findOneAndUpdate(
    { _id: `${bucket}:${who}:${window}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * seconds * 1000 + 60_000) } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return row.count <= limit;
}

/** Throws `RATE_LIMITED` when the caller has used up the bucket. */
export async function enforceLimit(bucket: string, limit: number, seconds: number, who?: string) {
  if (!(await withinLimit(bucket, who ?? (await clientIp()), limit, seconds))) {
    throw new AppError('RATE_LIMITED', 'errors.rateLimited');
  }
}
