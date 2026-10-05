import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { Guardian } from '@/server/models/guardian';

/** A student's own record, or a parent's children. Never anyone else: the ids come from the signed-in account. */
export async function ownStudentIds(ctx: RequestContext) {
  if (ctx.role === 'student') return ctx.studentId ? [ctx.studentId] : [];
  if (ctx.role !== 'parent' || !ctx.guardianId) return [];
  const guardian = await Guardian.findOne({ schoolId: ctx.schoolId, _id: ctx.guardianId }).select('studentIds').lean();
  return guardian?.studentIds ?? [];
}
