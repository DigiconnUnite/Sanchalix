import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { hashPassword } from '@/server/auth/service';
import { paginate } from '@/server/db/paginate';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Branch } from '@/server/models/branch';
import { Organization } from '@/server/models/organization';
import { PlatformAuditLog } from '@/server/models/platformAuditLog';
import { School } from '@/server/models/school';
import { Session } from '@/server/models/session';
import { Staff } from '@/server/models/staff';
import { Student } from '@/server/models/student';
import { User } from '@/server/models/user';
import { temporaryPassword } from '@/server/modules/users/service';

const E = 'platform.errors';
const text = (key: string, max: number) => z.string().trim().min(1, `${E}.${key}`).max(max, `${E}.${key}`);
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);

export const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB', 'IGCSE', 'OTHER'] as const;
export const PLANS = ['starter', 'growth', 'enterprise'] as const;

export const SchoolInput = z.object({
  name: z.string().trim().min(2, `${E}.name`).max(120, `${E}.name`),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,8}$/, `${E}.code`),
  board: z.enum(BOARDS, `${E}.board`),
  plan: z.enum(PLANS, `${E}.plan`),
  address: z.object({
    line1: text('line1', 120),
    city: text('city', 60),
    state: text('state', 60),
    pincode: z.string().trim().regex(/^\d{6}$/, `${E}.pincode`),
  }),
  admin: z.object({
    name: text('adminName', 120),
    email: z.string().trim().toLowerCase().pipe(z.email(`${E}.adminEmail`)),
  }),
});
export type SchoolInput = z.infer<typeof SchoolInput>;

export const SchoolId = Id;
export const SchoolStatusInput = z.object({
  id: Id,
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(300, `${E}.reason`).default(''),
});
export type SchoolStatusInput = z.infer<typeof SchoolStatusInput>;
export const AdminId = z.object({ schoolId: Id, userId: Id });
export const ListSchools = z.object({ cursor: z.string().optional().catch(undefined) });
export type ListSchools = z.infer<typeof ListSchools>;
export const ListAudit = z.object({ cursor: z.string().optional().catch(undefined) });

export type SchoolRow = {
  id: string;
  name: string;
  code: string;
  board: string;
  city: string;
  status: 'onboarding' | 'active' | 'suspended';
  students: number;
  createdAt: string;
};

export type SchoolDetail = SchoolRow & {
  plan: string;
  organization: string;
  state: string;
  staff: number;
  users: number;
  admins: { id: string; name: string; email: string | null; status: string; lastLoginAt: string | null }[];
};

export type PlatformSummary = {
  schools: Record<SchoolRow['status'], number>;
  students: number;
  staff: number;
  users: number;
};

/** Tenant collections are read here across every school on purpose: this is the one place that sees the whole platform. */
const countBySchool = async (collection: typeof Student.collection | typeof Staff.collection, match: Record<string, unknown>) =>
  new Map(
    (
      await collection
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          { $match: { deletedAt: null, ...match } },
          { $group: { _id: '$schoolId', count: { $sum: 1 } } },
        ])
        .toArray()
    ).map((row) => [String(row._id), row.count]),
  );

export async function getPlatformSummary(): Promise<PlatformSummary> {
  const [byStatus, students, staff, users] = await Promise.all([
    School.aggregate<{ _id: SchoolRow['status']; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Student.collection.countDocuments({ deletedAt: null, status: 'active' }),
    Staff.collection.countDocuments({ deletedAt: null, status: { $in: ['active', 'on_leave'] } }),
    User.countDocuments({ status: 'active', 'roles.schoolId': { $exists: true } }),
  ]);
  const count = (status: SchoolRow['status']) => byStatus.find((row) => row._id === status)?.count ?? 0;
  return {
    schools: { onboarding: count('onboarding'), active: count('active'), suspended: count('suspended') },
    students,
    staff,
    users,
  };
}

export async function listSchools(query: ListSchools) {
  const { rows, ...page } = await paginate(School, {}, {
    sortField: 'name',
    select: ['name', 'code', 'board', 'address', 'status'],
    limit: 50,
    cursor: query.cursor,
  });
  const students = await countBySchool(Student.collection, { status: 'active', schoolId: { $in: rows.map((row) => row._id) } });
  const schools: SchoolRow[] = rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    code: row.code,
    board: row.board,
    city: row.address?.city ?? '',
    status: row.status,
    students: students.get(String(row._id)) ?? 0,
    createdAt: row._id.getTimestamp().toISOString(),
  }));
  return { rows: schools, ...page };
}

export async function getSchool(id: string): Promise<SchoolDetail | null> {
  if (!Id.safeParse(id).success) return null;
  const school = await School.findById(id).select('name code board address organizationId status').lean();
  if (!school) return null;
  const [organization, students, staff, users, admins] = await Promise.all([
    Organization.findById(school.organizationId).select('name plan').lean(),
    Student.collection.countDocuments({ schoolId: school._id, deletedAt: null, status: 'active' }),
    Staff.collection.countDocuments({ schoolId: school._id, deletedAt: null, status: { $in: ['active', 'on_leave'] } }),
    User.countDocuments({ roles: { $elemMatch: { schoolId: school._id } } }),
    User.find({ roles: { $elemMatch: { schoolId: school._id, role: 'school_admin' } } })
      .sort({ name: 1 })
      .select('name email status lastLoginAt')
      .lean(),
  ]);
  return {
    id,
    name: school.name,
    code: school.code,
    board: school.board,
    city: school.address?.city ?? '',
    state: school.address?.state ?? '',
    status: school.status,
    students,
    staff,
    users,
    plan: organization?.plan ?? '',
    organization: organization?.name ?? '',
    createdAt: school._id.getTimestamp().toISOString(),
    admins: admins.map((admin) => ({
      id: String(admin._id),
      name: admin.name,
      email: admin.email ?? null,
      status: admin.status,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    })),
  };
}

/** The Indian school year that includes today: April to March. */
const yearFor = (today: Date) => {
  const start = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return {
    label: `${start}–${String((start + 1) % 100).padStart(2, '0')}`,
    startDate: `${start}-04-01`,
    endDate: `${start + 1}-03-31`,
  };
};

/**
 * Sets a school up in one step: its organization, the school itself (still onboarding), a main campus, the current
 * academic year and the first school admin, who gets a one-time temporary password (returned once, never stored in
 * the clear). The school is switched on afterwards, when its data is in.
 */
export async function createSchool(input: SchoolInput, today = new Date()) {
  if (await School.exists({ code: input.code })) throw new AppError('CONFLICT', `${E}.codeTaken`);
  if (await User.exists({ email: input.admin.email })) throw new AppError('CONFLICT', `${E}.adminEmailTaken`);
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const address = { ...input.address, country: 'IN' };

  const [organizationId, schoolId, adminId] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  await withTransaction(async (session) => {
    await Organization.create([{ _id: organizationId, name: input.name, billingEmail: input.admin.email, plan: input.plan }], { session });
    await School.create(
      [{ _id: schoolId, organizationId, name: input.name, code: input.code, board: input.board, address, status: 'onboarding' }],
      { session },
    );
    await Branch.create([{ schoolId, name: 'Main campus', code: 'MAIN', address, isDefault: true }], { session });
    await AcademicYear.create([{ schoolId, ...yearFor(today), status: 'current' }], { session });
    await User.create(
      [
        {
          _id: adminId,
          name: input.admin.name,
          email: input.admin.email,
          passwordHash,
          roles: [{ role: 'school_admin', schoolId, scope: 'school' }],
          status: 'active',
        },
      ],
      { session },
    );
  });
  return { id: schoolId, name: input.name, adminId, adminName: input.admin.name, adminEmail: input.admin.email, password };
}

/**
 * Switches a school on, suspends it or brings it back. A suspended school's people are signed out at once and can't
 * sign in again, and the scheduled jobs skip it.
 */
export async function setSchoolStatus({ id, status, reason }: SchoolStatusInput) {
  if (status === 'suspended' && reason.length < 3) throw new AppError('VALIDATION', `${E}.reason`);
  const school = await School.findOneAndUpdate(
    { _id: id, status: status === 'suspended' ? { $ne: 'suspended' } : { $ne: 'active' } },
    { status },
  )
    .select('name status')
    .lean();
  if (!school) {
    throw (await School.exists({ _id: id }))
      ? new AppError('CONFLICT', `${E}.alreadyThere`)
      : new AppError('NOT_FOUND', `${E}.notFound`);
  }
  if (status === 'suspended') await Session.deleteMany({ activeSchoolId: school._id });
  return { id: school._id, name: school.name, before: school.status };
}

/** A new temporary password for one of the school's admins, for when they are locked out. They are signed out everywhere. */
export async function resetAdminPassword(schoolId: string, userId: string) {
  const password = temporaryPassword();
  const user = await User.findOneAndUpdate(
    { _id: userId, roles: { $elemMatch: { schoolId, role: 'school_admin' } } },
    { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
  )
    .select('name')
    .lean();
  if (!user) throw new AppError('NOT_FOUND', `${E}.notFound`);
  await Session.deleteMany({ userId: user._id });
  return { id: user._id, name: user.name, password };
}

export type AuditRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  school: string | null;
  reason: string | null;
};

const AUDIT_PAGE = 50;

/** The newest entries first. `cursor` is the id of the last entry on the page before, so the next page is older. */
export async function listPlatformAudit(query: z.infer<typeof ListAudit>) {
  const before = query.cursor && Id.safeParse(query.cursor).success ? { _id: { $lt: query.cursor } } : {};
  const found = await PlatformAuditLog.find(before)
    .sort({ _id: -1 })
    .limit(AUDIT_PAGE + 1)
    .select('at actorId action targetSchoolId reason')
    .lean();
  const rows = found.slice(0, AUDIT_PAGE);
  const [actors, schools] = await Promise.all([
    User.find({ _id: { $in: rows.map((row) => row.actorId) } }).select('name').lean(),
    School.find({ _id: { $in: rows.flatMap((row) => row.targetSchoolId ?? []) } }).select('name').lean(),
  ]);
  const actorName = new Map(actors.map((actor) => [String(actor._id), actor.name]));
  const schoolName = new Map(schools.map((school) => [String(school._id), school.name]));
  const audit: AuditRow[] = rows.map((row) => ({
    id: String(row._id),
    at: row.at.toISOString(),
    actor: actorName.get(String(row.actorId)) ?? '',
    action: row.action,
    school: row.targetSchoolId ? (schoolName.get(String(row.targetSchoolId)) ?? null) : null,
    reason: row.reason ?? null,
  }));
  return { rows: audit, nextCursor: found.length > AUDIT_PAGE ? String(rows.at(-1)?._id) : null };
}
