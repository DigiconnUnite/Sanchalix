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
  studentId?: Types.ObjectId;
  guardianId?: Types.ObjectId;
};

export const getContext = cache(async (): Promise<RequestContext | null> => {
  const session = await readSession();
  if (!session?.activeSchoolId || session.totpPending) return null;

  const user = await User.findById(session.userId).select('name roles staffId studentId guardianId status').lean();
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
    ...(user.studentId && { studentId: user.studentId }),
    ...(user.guardianId && { guardianId: user.guardianId }),
  };
});

export type PlatformContext = { userId: Types.ObjectId; name: string; role: 'super_admin' };

/** The signed-in platform staff member. Platform staff work across schools, so they have no school in their session. */
export const getPlatformContext = cache(async (): Promise<PlatformContext | null> => {
  const session = await readSession();
  if (session?.activeRole !== 'super_admin' || session.activeSchoolId || session.totpPending) return null;
  const user = await User.findById(session.userId).select('name roles status').lean();
  if (user?.status !== 'active' || !user.roles.some((r) => r.role === 'super_admin' && !r.schoolId)) return null;
  return { userId: user._id, name: user.name, role: 'super_admin' };
});

export async function requirePlatform(permission: Permission) {
  const ctx = await getPlatformContext();
  if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
  if (!can(ctx.role, permission)) throw new AppError('FORBIDDEN', 'errors.forbidden');
  return ctx;
}

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