import 'server-only';
import type { Types } from 'mongoose';
import { headers } from 'next/headers';
import type { RoleKey } from '@/server/auth/permissions';
import { AuditLog } from '@/server/models/auditLog';

type Actor = { userId: Types.ObjectId; role: RoleKey; schoolId: Types.ObjectId };

export async function audit(
  actor: Actor,
  action: string,
  entity: { type: string; id: Types.ObjectId },
  change: { before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string } = {},
) {
  const requestHeaders = await headers();
  await AuditLog.create({
    schoolId: actor.schoolId,
    actorId: actor.userId,
    actorRole: actor.role,
    action,
    entity,
    ...change,
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent')?.slice(0, 256) ?? null,
  });
}
