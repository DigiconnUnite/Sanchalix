import 'server-only';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { paginate } from '@/server/db/paginate';
import { Branch } from '@/server/models/branch';
import { Counter } from '@/server/models/counter';
import { Staff } from '@/server/models/staff';
import type { ListStaff, StaffInput, StaffMember, StaffRow, StaffUpdate } from './schemas';

const scopeOf = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});

export async function getStaffMember(ctx: RequestContext, id: string): Promise<StaffMember | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const member = await Staff.findOne({ ...scopeOf(ctx), _id: id })
    .select('name designation department type phone email joinedOn status')
    .lean();
  return (
    member && {
      id,
      name: member.name,
      designation: member.designation,
      department: member.department ?? '',
      type: member.type,
      phone: member.phone.replace(/^\+91/, ''),
      email: member.email ?? '',
      joinedOn: member.joinedOn,
      status: member.status,
    }
  );
}

export async function updateStaff(ctx: RequestContext, { id, email, department, ...rest }: StaffUpdate) {
  const before = await Staff.findOneAndUpdate(
    { ...scopeOf(ctx), _id: id },
    { ...rest, email: email ?? null, department: department || null, updatedBy: ctx.userId },
  )
    .select('designation type status')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', 'hr.errors.notFound');
  return {
    id: before._id,
    name: rest.name,
    before: { designation: before.designation, type: before.type, status: before.status },
  };
}

export async function createStaff(ctx: RequestContext, input: StaffInput) {
  const { schoolId } = ctx;
  const branch = ctx.branchId
    ? { _id: ctx.branchId }
    : await Branch.findOne({ schoolId, isDefault: true }).select('_id').lean();
  if (!branch) throw new AppError('BUSINESS_RULE', 'hr.errors.noBranch');

  // Employee numbers only need to be unique, not gap-free, so the counter isn't tied to a transaction.
  const counter = await Counter.findOneAndUpdate(
    { _id: `${schoolId.toString()}:employee` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  const { email, department, ...rest } = input;
  const staff = await Staff.create({
    schoolId,
    branchId: branch._id,
    employeeNo: `EMP-${String(counter.seq).padStart(4, '0')}`,
    ...rest,
    email: email ?? null,
    department: department || null,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: staff._id, name: staff.name, employeeNo: staff.employeeNo };
}

export async function listStaff(ctx: RequestContext, query: ListStaff) {
  const { rows, ...page } = await paginate(
    Staff,
    scopeOf(ctx),
    {
      sortField: 'name',
      select: ['name', 'employeeNo', 'designation', 'type', 'phone', 'status'],
      limit: query.pageSize,
      cursor: query.cursor,
    },
  );
  const staff: StaffRow[] = rows.map((member) => ({
    id: String(member._id),
    name: member.name,
    employeeNo: member.employeeNo,
    designation: member.designation,
    type: member.type,
    phone: member.phone,
    status: member.status,
  }));
  return { rows: staff, ...page };
}

/** Active teaching staff, for choosing a class teacher. */
export async function listTeachers(ctx: RequestContext) {
  const teachers = await Staff.find({ schoolId: ctx.schoolId, status: 'active', type: 'teaching' })
    .sort({ name: 1 })
    .select('name')
    .lean();
  return teachers.map((teacher) => ({ id: String(teacher._id), name: teacher.name }));
}
