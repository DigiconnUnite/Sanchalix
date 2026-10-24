import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { AuditLog } from '@/server/models/auditLog';
import { User } from '@/server/models/user';

export type HistoryEntry = { id: string; at: string; actor: string; action: string };

/** Who changed a record and when: the latest 50 audit entries for it, newest first. The caller checks access to the record. */
export async function listHistory(ctx: RequestContext, entityType: string, entityId: string): Promise<HistoryEntry[]> {
  if (!/^[0-9a-f]{24}$/.test(entityId)) return [];
  const entries = await AuditLog.find({ schoolId: ctx.schoolId, 'entity.type': entityType, 'entity.id': entityId })
    .sort({ at: -1 })
    .limit(50)
    .select('at actorId action')
    .lean();
  const actors = await User.find({ _id: { $in: entries.map((entry) => entry.actorId) } }).select('name').lean();
  const nameById = new Map(actors.map((actor) => [String(actor._id), actor.name]));
  return entries.map((entry) => ({
    id: String(entry._id),
    at: entry.at.toISOString(),
    actor: nameById.get(String(entry.actorId)) ?? '',
    action: entry.action,
  }));
}
