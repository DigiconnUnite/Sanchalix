import 'server-only';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { paginate } from '@/server/db/paginate';
import { Branch } from '@/server/models/branch';
import { Counter } from '@/server/models/counter';
import { AcademicYear } from '@/server/models/academicYear';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { Subject } from '@/server/models/subject';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { toDocumentRows } from '@/server/modules/sis/documents';
import { getLeaveBalances } from './leave';
import type { ListStaff, StaffInput, StaffMember, StaffProfile, StaffRow, StaffUpdate } from './schemas';

const scopeOf = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});

export async function getStaffMember(ctx: RequestContext, id: string): Promise<StaffMember | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const member = await Staff.findOne({ ...scopeOf(ctx), _id: id })
    .select('name designation department type phone email joinedOn status qualifications')
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
      qualifications: member.qualifications.map((item) => ({
        degree: item.degree ?? '',
        institution: item.institution ?? '',
        year: item.year ? String(item.year) : '',
      })),
    }
  );
}

/** The staff record with this year's work: the class they look after, what they teach and the leave they have left. */
export async function getStaffProfile(ctx: RequestContext, id: string): Promise<StaffProfile | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const { schoolId } = ctx;
  const [member, year] = await Promise.all([
    Staff.findOne({ ...scopeOf(ctx), _id: id })
      .select('name employeeNo designation department type phone email joinedOn status userId qualifications documents')
      .lean(),
    AcademicYear.findOne({ schoolId, status: 'current' }).select('_id').lean(),
  ]);
  if (!member) return null;

  const thisYear = { schoolId, academicYearId: year?._id ?? null };
  const [ownSections, slots, leave] = await Promise.all([
    Section.find({ ...thisYear, classTeacherId: member._id }).sort({ displayName: 1 }).select('displayName').lean(),
    TimetableSlot.find({ ...thisYear, teacherId: member._id }).select('sectionId subjectId').lean(),
    getLeaveBalances({ ...ctx, staffId: member._id }),
  ]);
  const [subjects, sections] = await Promise.all([
    Subject.find({ schoolId, _id: { $in: slots.map((slot) => slot.subjectId) } }).sort({ name: 1 }).select('name').lean(),
    Section.find({ schoolId, _id: { $in: slots.map((slot) => slot.sectionId) } })
      .sort({ displayName: 1 })
      .select('displayName')
      .lean(),
  ]);

  return {
    id,
    name: member.name,
    employeeNo: member.employeeNo,
    designation: member.designation,
    department: member.department || null,
    type: member.type,
    phone: member.phone,
    email: member.email || null,
    joinedOn: member.joinedOn,
    status: member.status,
    hasAccount: Boolean(member.userId),
    qualifications: member.qualifications.map((item) => ({
      degree: item.degree ?? '',
      institution: item.institution ?? '',
      year: item.year ?? null,
    })),
    documents: toDocumentRows(member.documents),
    classTeacherOf: ownSections.map((section) => section.displayName),
    teaches: subjects.map((subject) => {
      const own = slots.filter((slot) => slot.subjectId.equals(subject._id));
      return {
        subject: subject.name,
        sections: sections
          .filter((section) => own.some((slot) => slot.sectionId.equals(section._id)))
          .map((section) => section.displayName)
          .join(', '),
        periods: own.length,
      };
    }),
    leave,
  };
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
