import 'server-only';
import type { Types } from 'mongoose';
import { cache } from 'react';
import { AppError } from '@/lib/appError';
import { User } from '@/server/models/user';
import { can, type Permission, type RoleKey, type Scope } from './permissions';
import { readSession } from './session';

export type RequestContext = {
  userId: Types.ObjectId;
  name: string;
  role: RoleKey;
  scope: Scope;
  schoolId: Types.ObjectId;
  branchId?: Types.ObjectId;
  staffId?: Types.ObjectId;
};

export const getContext = cache(async (): Promise<RequestContext | null> => {
  const session = await readSession();
  if (!session?.activeSchoolId || session.totpPending) return null;

  const user = await User.findById(session.userId).select('name roles staffId status').lean();
  if (user?.status !== 'active') return null;

  const schoolId = session.activeSchoolId;
  const assignment = user.roles.find((r) => r.role === session.activeRole && r.schoolId?.equals(schoolId));
  if (!assignment) return null;

  return {
    userId: user._id,
    name: user.name,
    role: assignment.role,
    scope: assignment.scope,
    schoolId,
    ...(assignment.branchId && { branchId: assignment.branchId }),
    ...(user.staffId && { staffId: user.staffId }),
  };
});

export async function requirePermission(permission: Permission) {
  const ctx = await getContext();
  if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
  if (!can(ctx.role, permission)) throw new AppError('FORBIDDEN', 'errors.forbidden');
  return ctx;
}

export async function getPendingSession() {
  const session = await readSession();
  return session?.totpPending ? session : null;
}