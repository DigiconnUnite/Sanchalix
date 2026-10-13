import 'server-only';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import type { RoleKey, Scope } from '@/server/auth/permissions';
import { hashPassword } from '@/server/auth/service';
import { paginate } from '@/server/db/paginate';
import { Session } from '@/server/models/session';
import { Staff } from '@/server/models/staff';
import { User } from '@/server/models/user';

const E = 'users.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);

/** Roles the school office hands out here. Students and parents get accounts from the student's profile. */
export const STAFF_ROLES = [
  'school_admin',
  'principal',
  'teacher',
  'accountant',
  'librarian',
  'transport_manager',
] as const satisfies readonly RoleKey[];
const SCOPE_OF: Partial<Record<RoleKey, Scope>> = { teacher: 'assigned', student: 'self', parent: 'ward' };

export const UserInput = z.object({
  name: z.string().trim().min(1, `${E}.name`).max(120, `${E}.name`),
  email: z.string().trim().toLowerCase().pipe(z.email(`${E}.email`)),
  role: z.enum(STAFF_ROLES, `${E}.role`),
  staffId: z.union([z.literal('').transform(() => undefined), Id]).optional(),
});
export type UserInput = z.infer<typeof UserInput>;

export const UserId = Id;
export const AddRole = z.object({ id: Id, role: z.enum(STAFF_ROLES, `${E}.role`) });
export const UserStatus = z.object({ id: Id, status: z.enum(['active', 'disabled']) });
export const ListUsers = z.object({ cursor: z.string().optional().catch(undefined) });
export type ListUsers = z.infer<typeof ListUsers>;

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  roles: RoleKey[];
  staffName: string | null;
  status: 'invited' | 'active' | 'locked' | 'disabled';
  lastLoginAt: string | null;
  isSelf: boolean;
};

// No look-alike characters (0/O, 1/l/I), so it can be read out over a counter or a phone call.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const temporaryPassword = () =>
  Array.from(randomBytes(14), (byte) => ALPHABET[byte % ALPHABET.length]).join('');

const inSchool = (ctx: RequestContext) => ({ roles: { $elemMatch: { schoolId: ctx.schoolId } } });

/**
 * Creates a sign-in for someone in this school with a one-time temporary password, which is returned once and never
 * stored in the clear. `link` ties the account to a staff, student or guardian record.
 */
export async function createAccount(
  ctx: RequestContext,
  input: { name: string; email: string; role: RoleKey },
  link: { staffId?: Types.ObjectId; studentId?: Types.ObjectId; guardianId?: Types.ObjectId; phone?: string } = {},
) {
  const password = temporaryPassword();
  if (await User.exists({ email: input.email })) throw new AppError('CONFLICT', `${E}.emailTaken`);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(password),
    roles: [{ role: input.role, schoolId: ctx.schoolId, scope: SCOPE_OF[input.role] ?? 'school' }],
    status: 'active',
    ...link,
  });
  return { id: user._id, name: user.name, email: input.email, password };
}

export async function createUser(ctx: RequestContext, { staffId, ...input }: UserInput) {
  const { schoolId } = ctx;
  if (staffId) {
    const [staff, linked] = await Promise.all([
      Staff.exists({ schoolId, _id: staffId }),
      User.exists({ ...inSchool(ctx), staffId }),
    ]);
    if (!staff) throw new AppError('NOT_FOUND', `${E}.staff`);
    if (linked) throw new AppError('CONFLICT', `${E}.staffLinked`);
  }
  const account = await createAccount(ctx, input, staffId ? { staffId: new Types.ObjectId(staffId) } : {});
  if (staffId) await Staff.updateOne({ schoolId, _id: staffId }, { userId: account.id, updatedBy: ctx.userId });
  return account;
}

export async function listUsers(ctx: RequestContext, query: ListUsers) {
  const { rows, ...page } = await paginate(User, inSchool(ctx), {
    sortField: 'name',
    select: ['name', 'email', 'roles', 'staffId', 'status', 'lastLoginAt'],
    limit: 50,
    cursor: query.cursor,
  });
  const staff = await Staff.find({ schoolId: ctx.schoolId, _id: { $in: rows.flatMap((row) => row.staffId ?? []) } })
    .setOptions({ withDeleted: true })
    .select('name employeeNo')
    .lean();
  const staffOf = new Map(staff.map((member) => [String(member._id), `${member.name} (${member.employeeNo})`]));
  const users: UserRow[] = rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    email: row.email ?? null,
    roles: row.roles.filter((assignment) => assignment.schoolId?.equals(ctx.schoolId)).map(({ role }) => role),
    staffName: staffOf.get(String(row.staffId)) ?? null,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    isSelf: row._id.equals(ctx.userId),
  }));
  return { rows: users, ...page };
}

/** Staff who don't have a sign-in yet, for the Add user form. */
export async function listUnlinkedStaff(ctx: RequestContext) {
  const linked = await User.distinct('staffId', { ...inSchool(ctx), staffId: { $ne: null } });
  const staff = await Staff.find({ schoolId: ctx.schoolId, _id: { $nin: linked }, status: { $in: ['active', 'on_leave'] } })
    .sort({ name: 1 })
    .select('name employeeNo email type')
    .lean();
  return staff.map((member) => ({
    id: String(member._id),
    name: member.name,
    label: `${member.name} (${member.employeeNo})`,
    email: member.email ?? '',
    teaching: member.type === 'teaching',
  }));
}

export async function setUserStatus(ctx: RequestContext, id: string, status: 'active' | 'disabled') {
  if (ctx.userId.equals(id)) throw new AppError('BUSINESS_RULE', `${E}.self`);
  const user = await User.findOneAndUpdate(
    { ...inSchool(ctx), _id: id, status: { $ne: status } },
    { status, ...(status === 'active' && { failedLoginCount: 0, lockedUntil: null }) },
  )
    .select('name status')
    .lean();
  if (!user) throw new AppError('NOT_FOUND', `${E}.notFound`);
  if (status === 'disabled') await Session.deleteMany({ userId: user._id });
  return { id: user._id, name: user.name, before: user.status };
}

/** Gives someone a second role in this school. They choose which one is active from the user menu. */
export async function addUserRole(ctx: RequestContext, id: string, role: (typeof STAFF_ROLES)[number]) {
  if (ctx.userId.equals(id)) throw new AppError('BUSINESS_RULE', `${E}.selfRole`);
  const { schoolId } = ctx;
  const user = await User.findOneAndUpdate(
    { _id: id, $and: [inSchool(ctx), { roles: { $not: { $elemMatch: { schoolId, role } } } }] },
    { $push: { roles: { role, schoolId, scope: SCOPE_OF[role] ?? 'school' } } },
  )
    .select('name')
    .lean();
  if (user) return { id: user._id, name: user.name };
  throw (await User.exists({ ...inSchool(ctx), _id: id }))
    ? new AppError('CONFLICT', `${E}.roleHeld`)
    : new AppError('NOT_FOUND', `${E}.notFound`);
}

/**
 * Takes one of a person's roles in this school away. They keep at least one, and anything they have open under the
 * removed role is signed out.
 */
export async function removeUserRole(ctx: RequestContext, id: string, role: (typeof STAFF_ROLES)[number]) {
  if (ctx.userId.equals(id)) throw new AppError('BUSINESS_RULE', `${E}.selfRole`);
  const { schoolId } = ctx;
  const user = await User.findOne({ ...inSchool(ctx), _id: id }).select('name roles').lean();
  if (!user) throw new AppError('NOT_FOUND', `${E}.notFound`);
  const here = user.roles.filter((assignment) => assignment.schoolId?.equals(schoolId));
  if (!here.some((assignment) => assignment.role === role)) throw new AppError('NOT_FOUND', `${E}.roleNotHeld`);
  if (here.length < 2) throw new AppError('BUSINESS_RULE', `${E}.lastRole`);
  await User.updateOne({ _id: user._id }, { $pull: { roles: { role, schoolId } } });
  await Session.deleteMany({ userId: user._id, activeRole: role, activeSchoolId: schoolId });
  return { id: user._id, name: user.name };
}

/** Gives the user a new temporary password and signs them out everywhere. The password is returned once. */
export async function resetUserPassword(ctx: RequestContext, id: string) {
  if (ctx.userId.equals(id)) throw new AppError('BUSINESS_RULE', `${E}.selfReset`);
  const password = temporaryPassword();
  const user = await User.findOneAndUpdate(
    { ...inSchool(ctx), _id: id },
    { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
  )
    .select('name')
    .lean();
  if (!user) throw new AppError('NOT_FOUND', `${E}.notFound`);
  await Session.deleteMany({ userId: user._id });
  return { id: user._id, name: user.name, password };
}
