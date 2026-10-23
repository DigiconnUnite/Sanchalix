import 'server-only';
import type { Types } from 'mongoose';
import { headers } from 'next/headers';
import { PlatformAuditLog } from '@/server/models/platformAuditLog';

export async function platformAudit(
  actorId: Types.ObjectId,
  action: string,
  entity: { type: string; id?: Types.ObjectId },
  change: { targetSchoolId?: Types.ObjectId; before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string } = {},
) {
  const requestHeaders = await headers();
  await PlatformAuditLog.create({
    actorId,
    action,
    entity,
    ...change,
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent')?.slice(0, 256) ?? null,
  });
}
