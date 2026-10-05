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
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { Subject } from '@/server/models/subject';
import type {
  HistoryEntry,
  ListStudents,
  StudentAttendance,
  StudentFees,
  StudentProfile,
  StudentRow,
  StudentStatus,
} from './schemas';

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
    .select(
      'firstName lastName admissionNo dob gender bloodGroup status address guardianIds primaryGuardianId currentEnrollmentId updatedAt',
    )
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
    address: address
      ? [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ')
      : null,
    editable: {
      firstName: student.firstName,
      lastName: student.lastName ?? '',
      line1: address?.line1 ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      pincode: address?.pincode ?? '',
      version: student.updatedAt.toISOString(),
    },
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

/** The student's marks for the last 60 days, newest first. Call only after getStudent has confirmed access. */
export async function getStudentAttendance(ctx: RequestContext, studentId: string): Promise<StudentAttendance> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const all = await AttendanceRecord.find({
    schoolId: ctx.schoolId,
    'entries.studentId': studentId,
    date: { $gte: since },
  })
    .sort({ date: -1 })
    .select('date mode subjectId entries.studentId entries.status')
    .lean();
  const records = all.filter((record) => record.mode === 'daily');
  const statusIn = (record: (typeof all)[number]) =>
    record.entries.find((candidate) => String(candidate.studentId) === studentId)?.status;

  const perSubject = new Map<string, { attended: number; total: number }>();
  for (const record of all) {
    const status = statusIn(record);
    if (record.mode !== 'period' || !record.subjectId || !status) continue;
    const tally = perSubject.get(String(record.subjectId)) ?? { attended: 0, total: 0 };
    tally.total += 1;
    if (status === 'present' || status === 'late') tally.attended += 1;
    perSubject.set(String(record.subjectId), tally);
  }
  const subjects = await Subject.find({ schoolId: ctx.schoolId, _id: { $in: [...perSubject.keys()] } })
    .setOptions({ withDeleted: true })
    .select('name')
    .lean();
  const days = records.flatMap((record) => {
    const entry = record.entries.find((candidate) => String(candidate.studentId) === studentId);
    return entry ? [{ date: record.date, status: entry.status as string }] : [];
  });
  const count = (...statuses: string[]) => days.filter((day) => statuses.includes(day.status)).length;
  const attended = count('present', 'late') + count('half_day') * 0.5;
  return {
    present: count('present', 'late'),
    absent: count('absent'),
    percent: days.length ? Math.round((attended / days.length) * 1000) / 10 : null,
    days,
    bySubject: subjects
      .map((subject) => {
        const tally = perSubject.get(String(subject._id)) ?? { attended: 0, total: 0 };
        return { subject: subject.name, ...tally, percent: Math.round((tally.attended / tally.total) * 1000) / 10 };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject)),
  };
}

/** Every invoice and receipt of the student. Call only after getStudent has confirmed access. */
export async function getStudentFees(ctx: RequestContext, studentId: string): Promise<StudentFees> {
  const { schoolId } = ctx;
  const [invoices, payments] = await Promise.all([
    Invoice.find({ schoolId, studentId })
      .sort({ dueDate: 1 })
      .select('invoiceNo installmentLabel dueDate totalMinor balanceMinor status')
      .lean(),
    Payment.find({ schoolId, studentId }).sort({ createdAt: -1 }).select('receiptNo method amountMinor createdAt').lean(),
  ]);
  return {
    dueMinor: invoices
      .filter((invoice) => invoice.status !== 'void')
      .reduce((sum, invoice) => sum + invoice.balanceMinor, 0),
    invoices: invoices.map((invoice) => ({
      id: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      installment: invoice.installmentLabel,
      dueDate: invoice.dueDate,
      totalMinor: invoice.totalMinor,
      balanceMinor: invoice.balanceMinor,
      status: invoice.status,
    })),
    payments: payments.map((payment) => ({
      id: String(payment._id),
      receiptNo: payment.receiptNo,
      collectedAt: payment.createdAt.toISOString(),
      method: payment.method,
      amountMinor: payment.amountMinor,
    })),
  };
}
