import 'server-only';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { paginate } from '@/server/db/paginate';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { AuditLog } from '@/server/models/auditLog';
import { User } from '@/server/models/user';
import type { HistoryEntry, ListStudents, StudentProfile, StudentRow, StudentStatus } from './schemas';

const COUNT_CAP = 10_001;

async function scopeFilter(ctx: RequestContext) {
  const { schoolId } = ctx;
  if (ctx.scope === 'school') return { schoolId };
  if (ctx.scope === 'branch' && ctx.branchId) return { schoolId, branchId: ctx.branchId };
  if (ctx.scope === 'assigned' && ctx.staffId) {
    const sections = await Section.find({ schoolId, classTeacherId: ctx.staffId }).select('_id').lean();
    const enrollments = await Enrollment.find({
      schoolId,
      sectionId: { $in: sections.map((s) => s._id) },
      status: 'active',
    })
      .select('studentId')
      .lean();
    return { schoolId, _id: { $in: enrollments.map((e) => e.studentId) } };
  }
  throw new AppError('FORBIDDEN', 'errors.forbidden');
}

export async function listStudents(ctx: RequestContext, query: ListStudents) {
  const { schoolId } = ctx;
  const filter = { ...(await scopeFilter(ctx)), status: query.status };
  const { rows, ...page } = await paginate(Student, filter, {
    sortField: 'lastName',
    select: ['firstName', 'lastName', 'admissionNo', 'status', 'primaryGuardianId', 'currentEnrollmentId'],
    limit: query.pageSize,
    cursor: query.cursor,
  });

  const [enrollments, guardians] = await Promise.all([
    Enrollment.find({ schoolId, _id: { $in: rows.map((s) => s.currentEnrollmentId) } })
      .select('sectionId rollNo')
      .lean(),
    Guardian.find({ schoolId, _id: { $in: rows.map((s) => s.primaryGuardianId) } })
      .select('name phone')
      .lean(),
  ]);
  const sections = await Section.find({ schoolId, _id: { $in: enrollments.map((e) => e.sectionId) } })
    .select('displayName')
    .lean();

  const byId = <T extends { _id: unknown }>(docs: T[]) => new Map(docs.map((doc) => [String(doc._id), doc]));
  const enrollmentById = byId(enrollments);
  const guardianById = byId(guardians);
  const sectionById = byId(sections);

  const students: StudentRow[] = rows.map((student) => {
    const enrollment = enrollmentById.get(String(student.currentEnrollmentId));
    const guardian = guardianById.get(String(student.primaryGuardianId));
    return {
      id: String(student._id),
      name: `${student.firstName} ${student.lastName}`.trim(),
      admissionNo: student.admissionNo,
      classSection: sectionById.get(String(enrollment?.sectionId))?.displayName ?? null,
      rollNo: enrollment?.rollNo ?? null,
      guardianName: guardian?.name ?? null,
      guardianPhone: guardian?.phone ?? null,
      status: student.status,
    };
  });
  return { rows: students, ...page };
}

export async function countStudents(ctx: RequestContext, status: StudentStatus) {
  return Student.countDocuments({ ...(await scopeFilter(ctx)), status }).limit(COUNT_CAP);
}

export async function getStudent(ctx: RequestContext, id: string): Promise<StudentProfile | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const { schoolId } = ctx;
  // and() rather than a spread, because the teacher scope already filters on _id and a spread would replace it.
  const student = await Student.findOne(await scopeFilter(ctx))
    .and([{ _id: id }])
    .select('firstName lastName admissionNo dob gender bloodGroup status address guardianIds primaryGuardianId currentEnrollmentId')
    .lean();
  if (!student) return null;

  const [enrollment, guardians] = await Promise.all([
    Enrollment.findOne({ schoolId, _id: student.currentEnrollmentId }).select('sectionId rollNo').lean(),
    Guardian.find({ schoolId, _id: { $in: student.guardianIds } }).select('name relation phone email').lean(),
  ]);
  const section = enrollment
    ? await Section.findOne({ schoolId, _id: enrollment.sectionId }).select('displayName').lean()
    : null;
  const { address } = student;

  return {
    id: String(student._id),
    name: `${student.firstName} ${student.lastName}`.trim(),
    admissionNo: student.admissionNo,
    dob: student.dob,
    gender: student.gender,
    bloodGroup: student.bloodGroup ?? null,
    status: student.status,
    classSection: section?.displayName ?? null,
    rollNo: enrollment?.rollNo ?? null,
    address: address ? [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ') : null,
    guardians: guardians.map((guardian) => ({
      id: String(guardian._id),
      name: guardian.name,
      relation: guardian.relation,
      phone: guardian.phone,
      email: guardian.email ?? null,
      isPrimary: guardian._id.equals(student.primaryGuardianId),
    })),
  };
}

export async function listStudentHistory(ctx: RequestContext, studentId: string): Promise<HistoryEntry[]> {
  const entries = await AuditLog.find({ schoolId: ctx.schoolId, 'entity.type': 'student', 'entity.id': studentId })
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