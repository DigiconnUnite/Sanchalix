import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { todayIn, weekdayOf } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Homework } from '@/server/models/homework';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { Subject } from '@/server/models/subject';
import { User } from '@/server/models/user';
import { listUpcoming } from '@/server/modules/calendar/events';
import { getStudentAttendance, getStudentFees } from '@/server/modules/sis/queries';
import { getTimetable } from '@/server/modules/timetable/service';
import { createAccount } from '@/server/modules/users/service';

const E = 'portal.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);

export const PortalAccountInput = z.object({
  studentId: Id,
  /** Omitted for the student's own account. */
  guardianId: Id.optional(),
  email: z.string().trim().toLowerCase().pipe(z.email(`${E}.email`)),
});
export type PortalAccountInput = z.infer<typeof PortalAccountInput>;

export type PortalAccountRow = {
  /** The guardian's id, or null for the student. */
  guardianId: string | null;
  name: string;
  suggestedEmail: string;
  accountEmail: string | null;
};

const officeScope = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});

async function studentWithGuardians(ctx: RequestContext, studentId: string) {
  const student = Types.ObjectId.isValid(studentId)
    ? await Student.findOne({ ...officeScope(ctx), _id: studentId }).select('firstName lastName guardianIds').lean()
    : null;
  if (!student) throw new AppError('NOT_FOUND', `${E}.notFound`);
  const guardians = await Guardian.find({ schoolId: ctx.schoolId, _id: { $in: student.guardianIds } })
    .select('name email')
    .lean();
  return { student, guardians, name: `${student.firstName} ${student.lastName ?? ''}`.trim() };
}

/** Who around this student has, or could have, a portal sign-in: the student and each guardian. */
export async function listPortalAccounts(ctx: RequestContext, studentId: string): Promise<PortalAccountRow[]> {
  const { student, guardians, name } = await studentWithGuardians(ctx, studentId);
  const accounts = await User.find({
    roles: { $elemMatch: { schoolId: ctx.schoolId } },
    $or: [{ studentId: student._id }, { guardianId: { $in: guardians.map((guardian) => guardian._id) } }],
  })
    .select('email studentId guardianId')
    .lean();
  const emailOf = (match: (account: (typeof accounts)[number]) => boolean) => accounts.find(match)?.email ?? null;
  return [
    {
      guardianId: null,
      name,
      suggestedEmail: '',
      accountEmail: emailOf((account) => Boolean(account.studentId?.equals(student._id))),
    },
    ...guardians.map((guardian) => ({
      guardianId: String(guardian._id),
      name: guardian.name,
      suggestedEmail: guardian.email ?? '',
      accountEmail: emailOf((account) => Boolean(account.guardianId?.equals(guardian._id))),
    })),
  ];
}

export async function createPortalAccount(ctx: RequestContext, { studentId, guardianId, email }: PortalAccountInput) {
  const { student, guardians, name } = await studentWithGuardians(ctx, studentId);
  const guardian = guardianId ? guardians.find((candidate) => String(candidate._id) === guardianId) : null;
  if (guardianId && !guardian) throw new AppError('NOT_FOUND', `${E}.notFound`);
  const link = guardian ? { guardianId: guardian._id } : { studentId: student._id };
  if (await User.exists({ roles: { $elemMatch: { schoolId: ctx.schoolId } }, ...link })) {
    throw new AppError('CONFLICT', `${E}.exists`);
  }
  return createAccount(ctx, { name: guardian?.name ?? name, email, role: guardian ? 'parent' : 'student' }, link);
}

export type PortalHome = {
  children: { id: string; name: string; classSection: string | null }[];
  selected: { id: string; name: string; classSection: string | null; admissionNo: string };
  periods: { number: number; time: string; subject: string; teacher: string }[];
  homework: { id: string; title: string; subject: string; instructions: string; dueOn: string }[];
  attendance: Awaited<ReturnType<typeof getStudentAttendance>>;
  fees: Awaited<ReturnType<typeof getStudentFees>>;
  upcoming: Awaited<ReturnType<typeof listUpcoming>>;
};

/** A student's own record, or a parent's children. Never anyone else: the ids come from the signed-in account. */
async function ownStudentIds(ctx: RequestContext) {
  if (ctx.role === 'student') return ctx.studentId ? [ctx.studentId] : [];
  if (ctx.role !== 'parent' || !ctx.guardianId) return [];
  const guardian = await Guardian.findOne({ schoolId: ctx.schoolId, _id: ctx.guardianId }).select('studentIds').lean();
  return guardian?.studentIds ?? [];
}

export async function getPortalHome(ctx: RequestContext, requestedId?: string): Promise<PortalHome | null> {
  const { schoolId } = ctx;
  const students = await Student.find({ schoolId, _id: { $in: await ownStudentIds(ctx) }, status: 'active' })
    .sort({ firstName: 1 })
    .select('firstName lastName admissionNo currentEnrollmentId')
    .lean();
  const student = students.find((candidate) => String(candidate._id) === requestedId) ?? students[0];
  if (!student) return null;

  const enrollments = await Enrollment.find({
    schoolId,
    _id: { $in: students.map((candidate) => candidate.currentEnrollmentId) },
  })
    .select('sectionId')
    .lean();
  const sections = await Section.find({ schoolId, _id: { $in: enrollments.map((enrollment) => enrollment.sectionId) } })
    .select('displayName')
    .lean();
  const sectionIdOf = new Map(enrollments.map((enrollment) => [String(enrollment._id), String(enrollment.sectionId)]));
  const sectionName = new Map(sections.map((section) => [String(section._id), section.displayName]));
  const describe = (candidate: (typeof students)[number]) => ({
    id: String(candidate._id),
    name: `${candidate.firstName} ${candidate.lastName ?? ''}`.trim(),
    classSection: sectionName.get(sectionIdOf.get(String(candidate.currentEnrollmentId)) ?? '') ?? null,
  });

  const id = String(student._id);
  const sectionId = sectionIdOf.get(String(student.currentEnrollmentId)) ?? '';
  const school = await School.findById(schoolId).select('timezone').lean();
  const today = todayIn(school?.timezone ?? 'Asia/Kolkata');
  const [timetable, homework, attendance, fees, upcoming] = await Promise.all([
    getTimetable(ctx, sectionId),
    Types.ObjectId.isValid(sectionId)
      ? Homework.find({ schoolId, sectionIds: sectionId, status: 'published', dueOn: { $gte: today } })
          .sort({ dueOn: 1 })
          .limit(10)
          .select('title subjectId instructions dueOn')
          .lean()
      : [],
    getStudentAttendance(ctx, id),
    getStudentFees(ctx, id),
    listUpcoming(ctx),
  ]);
  const subjects = await Subject.find({ schoolId, _id: { $in: homework.map((item) => item.subjectId) } })
    .setOptions({ withDeleted: true })
    .select('name')
    .lean();
  const subjectOf = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
  const weekday = weekdayOf(today);

  return {
    children: students.map(describe),
    selected: { ...describe(student), admissionNo: student.admissionNo },
    periods: timetable.periods.flatMap((period) => {
      const cell = timetable.cells[`${weekday}-${period.number}`];
      return cell
        ? [{ number: period.number, time: `${period.start}–${period.end}`, subject: cell.subject, teacher: cell.teacher }]
        : [];
    }),
    homework: homework.map((item) => ({
      id: String(item._id),
      title: item.title,
      subject: subjectOf.get(String(item.subjectId)) ?? '',
      instructions: item.instructions,
      dueOn: item.dueOn,
    })),
    attendance,
    fees,
    upcoming,
  };
}
