import 'server-only';
import { type ClientSession, Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Counter } from '@/server/models/counter';
import { Enrollment } from '@/server/models/enrollment';
import { optionalSubjectsOffered } from './queries';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { todayIn } from '@/lib/dates';
import { User } from '@/server/models/user';
import type { GuardianUpdate, StudentInput, StudentUpdate } from './schemas';

/** Runs in its own transaction, or inside the caller's when a session is passed (accepting an admission). */
export async function createStudent(ctx: RequestContext, input: StudentInput, outer?: ClientSession) {
  const { schoolId } = ctx;
  const section = await Section.findOne({ schoolId, _id: input.sectionId }).lean();
  if (!section || (ctx.scope === 'branch' && !section.branchId.equals(ctx.branchId))) {
    throw new AppError('NOT_FOUND', 'sis.students.errors.section');
  }
  const [school, year] = await Promise.all([
    School.findById(schoolId).select('code').lean(),
    AcademicYear.findOne({ schoolId, _id: section.academicYearId }).select('startDate').lean(),
  ]);
  if (!school || !year) throw new AppError('NOT_FOUND', 'sis.students.errors.section');

  const studentId = new Types.ObjectId();
  const enrollmentId = new Types.ObjectId();
  const audit = { createdBy: ctx.userId, updatedBy: ctx.userId };
  const admissionYear = year.startDate.slice(0, 4);

  const run = async (session: ClientSession) => {
    // Incremented inside the transaction, so an aborted admission doesn't consume a number.
    const counter = await Counter.findOneAndUpdate(
      { _id: `${schoolId.toString()}:admission:${admissionYear}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after', session },
    ).lean();
    const admissionNo = `${school.code}-${admissionYear}-${String(counter.seq).padStart(5, '0')}`;

    const guardianIds: Types.ObjectId[] = [];
    for (const { email, ...guardian } of input.guardians) {
      // The same phone means the same parent, which is how siblings end up sharing a guardian.
      const existing = await Guardian.findOneAndUpdate(
        { schoolId, phone: guardian.phone },
        { $addToSet: { studentIds: studentId }, updatedBy: ctx.userId },
        { session },
      )
        .select('_id')
        .lean();
      const guardianId = existing?._id ?? new Types.ObjectId();
      if (!existing) {
        await Guardian.create(
          [{ _id: guardianId, schoolId, ...guardian, email: email ?? null, studentIds: [studentId], ...audit }],
          { session },
        );
      }
      guardianIds.push(guardianId);
    }
    const primaryGuardianId = guardianIds[input.primaryGuardianIndex] ?? guardianIds[0];
    if (!primaryGuardianId) throw new AppError('VALIDATION', 'sis.students.errors.guardianName');

    const last = await Enrollment.findOne({ schoolId, sectionId: section._id })
      .sort({ rollNo: -1 })
      .select('rollNo')
      .session(session)
      .lean();

    await Student.create(
      [
        {
          _id: studentId,
          schoolId,
          branchId: section.branchId,
          admissionNo,
          firstName: input.firstName,
          lastName: input.lastName,
          dob: input.dob,
          gender: input.gender,
          bloodGroup: input.bloodGroup ?? null,
          address: { ...input.address, country: 'IN' },
          guardianIds,
          primaryGuardianId,
          currentEnrollmentId: enrollmentId,
          ...audit,
        },
      ],
      { session },
    );
    await Enrollment.create(
      [
        {
          _id: enrollmentId,
          schoolId,
          branchId: section.branchId,
          studentId,
          academicYearId: section.academicYearId,
          classId: section.classId,
          sectionId: section._id,
          rollNo: (last?.rollNo ?? 0) + 1,
          ...audit,
        },
      ],
      { session },
    );

    return { id: studentId, admissionNo, name: `${input.firstName} ${input.lastName}`.trim() };
  };
  return outer ? run(outer) : withTransaction(run);
}

const officeScope = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});

export async function updateStudent(ctx: RequestContext, { id, version, ...changes }: StudentUpdate) {
  const scope = officeScope(ctx);
  // The version is the record's last-updated time when the form was opened. If someone saved since, nothing matches.
  const before = await Student.findOneAndUpdate(
    { ...scope, _id: id, updatedAt: new Date(version) },
    {
      firstName: changes.firstName,
      lastName: changes.lastName,
      dob: changes.dob,
      gender: changes.gender,
      bloodGroup: changes.bloodGroup ?? null,
      address: { ...changes.address, country: 'IN' },
      updatedBy: ctx.userId,
    },
  )
    .select('firstName lastName dob gender bloodGroup')
    .lean();
  if (!before) {
    const exists = await Student.exists({ ...scope, _id: id });
    throw exists ? new AppError('CONFLICT', 'sis.students.errors.stale') : new AppError('NOT_FOUND', 'sis.students.errors.notFound');
  }
  return {
    id: before._id,
    name: `${changes.firstName} ${changes.lastName}`.trim(),
    before: { firstName: before.firstName, lastName: before.lastName, dob: before.dob, gender: before.gender },
  };
}

/** Corrects a guardian's details. The guardian must belong to this student, and a phone can't be shared by two guardians. */
export async function updateGuardian(ctx: RequestContext, { studentId, guardianId, email, ...changes }: GuardianUpdate) {
  const { schoolId } = ctx;
  const student = await Student.exists({ ...officeScope(ctx), _id: studentId, guardianIds: guardianId });
  if (!student) throw new AppError('NOT_FOUND', 'sis.students.errors.notFound');
  if (await Guardian.exists({ schoolId, phone: changes.phone, _id: { $ne: guardianId } })) {
    throw new AppError('CONFLICT', 'sis.students.errors.phoneTaken');
  }
  const before = await Guardian.findOneAndUpdate(
    { schoolId, _id: guardianId },
    { ...changes, email: email ?? null, updatedBy: ctx.userId },
  )
    .select('name relation phone')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', 'sis.students.errors.notFound');
  // The parent's sign-in follows the phone, so a phone-code sign-in keeps working on the new number.
  if (before.phone !== changes.phone && !(await User.exists({ phone: changes.phone }))) {
    await User.updateOne({ guardianId: before._id, roles: { $elemMatch: { schoolId } } }, { phone: changes.phone });
  }
  return { studentId: student._id, name: changes.name, before: { name: before.name, relation: before.relation } };
}

/** Moves an active student to another section of the same academic year and gives them its next roll number. */
export async function transferStudent(ctx: RequestContext, id: string, sectionId: string) {
  const { schoolId } = ctx;
  const scope = officeScope(ctx);
  return withTransaction(async (session) => {
    const student = await Student.findOne({ ...scope, _id: id, status: 'active' })
      .select('firstName lastName currentEnrollmentId')
      .session(session)
      .lean();
    if (!student) throw new AppError('BUSINESS_RULE', 'sis.students.errors.notActive');
    const enrollment = await Enrollment.findOne({ schoolId, _id: student.currentEnrollmentId })
      .select('sectionId academicYearId')
      .session(session)
      .lean();
    const section = await Section.findOne({ ...scope, _id: sectionId })
      .select('classId academicYearId displayName')
      .session(session)
      .lean();
    if (!enrollment || !section || !section.academicYearId.equals(enrollment.academicYearId)) {
      throw new AppError('NOT_FOUND', 'sis.students.errors.section');
    }
    if (section._id.equals(enrollment.sectionId)) throw new AppError('BUSINESS_RULE', 'sis.students.errors.sameSection');

    const last = await Enrollment.findOne({ schoolId, sectionId: section._id })
      .sort({ rollNo: -1 })
      .select('rollNo')
      .session(session)
      .lean();
    const rollNo = (last?.rollNo ?? 0) + 1;
    await Enrollment.updateOne(
      { schoolId, _id: enrollment._id },
      { sectionId: section._id, classId: section.classId, rollNo, updatedBy: ctx.userId },
      { session },
    );
    return {
      id: student._id,
      name: `${student.firstName} ${student.lastName ?? ''}`.trim(),
      from: String(enrollment.sectionId),
      section: section.displayName,
      rollNo,
    };
  });
}

/** Marks an active student as withdrawn and closes their enrollment. The record and its history stay. */
/**
 * Ends a student's time at the school. A transfer out also gives their transfer certificate its serial number, and
 * with fees unpaid it is the principal's call (US-2.4), so only a role that approves certificates may go ahead.
 */
/** Gives a student the optional subjects they take this year. Only subjects their class offers are accepted. */
export async function setOptionalSubjects(ctx: RequestContext, studentId: string, subjectIds: string[]) {
  const student = await Student.findOne({ ...officeScope(ctx), _id: studentId, status: 'active' })
    .select('currentEnrollmentId')
    .lean();
  const enrollment =
    student && (await Enrollment.findOne({ schoolId: ctx.schoolId, _id: student.currentEnrollmentId }).select('classId optionalSubjectIds').lean());
  if (!student || !enrollment) throw new AppError('NOT_FOUND', 'sis.students.errors.notFound');
  const unique = [...new Set(subjectIds)];
  const offered = new Set((await optionalSubjectsOffered(ctx, enrollment.classId)).map(({ id }) => id));
  if (unique.some((id) => !offered.has(id))) throw new AppError('VALIDATION', 'sis.students.errors.optionalSubjects');
  await Enrollment.updateOne({ schoolId: ctx.schoolId, _id: enrollment._id }, { optionalSubjectIds: unique, updatedBy: ctx.userId });
  return { id: student._id, before: enrollment.optionalSubjectIds.length, after: unique.length };
}

export async function withdrawStudent(ctx: RequestContext, id: string, reason: string, transferOut = false) {
  const scope = officeScope(ctx);
  if (transferOut && !can(ctx.role, 'sis.certificate.approve')) {
    const unpaid = { schoolId: ctx.schoolId, studentId: id, status: { $ne: 'void' as const }, balanceMinor: { $gt: 0 } };
    if (await Invoice.exists(unpaid)) throw new AppError('BUSINESS_RULE', 'sis.students.errors.duesUnpaid');
  }
  const school = await School.findById(ctx.schoolId).select('timezone').lean();
  const leftOn = todayIn(school?.timezone ?? 'Asia/Kolkata');

  return withTransaction(async (session) => {
    // Taken inside the transaction, so a transfer that fails doesn't leave a gap in the certificate register.
    const counter = transferOut
      ? await Counter.findOneAndUpdate(
          { _id: `${ctx.schoolId.toString()}:tc:${leftOn.slice(0, 4)}` },
          { $inc: { seq: 1 } },
          { upsert: true, returnDocument: 'after', session },
        ).lean()
      : null;
    const tcNo = counter ? `TC/${leftOn.slice(0, 4)}/${String(counter.seq).padStart(4, '0')}` : null;
    const student = await Student.findOneAndUpdate(
      { ...scope, _id: id, status: 'active' },
      {
        status: transferOut ? 'transferred' : 'withdrawn',
        leftOn,
        leavingReason: reason,
        ...(tcNo && { tcNo }),
        updatedBy: ctx.userId,
      },
      { session },
    )
      .select('firstName lastName currentEnrollmentId')
      .lean();
    if (!student) throw new AppError('BUSINESS_RULE', 'sis.students.errors.notActive');
    await Enrollment.updateOne(
      { schoolId: ctx.schoolId, _id: student.currentEnrollmentId },
      { status: 'transferred', updatedBy: ctx.userId },
      { session },
    );
    return { id: student._id, name: `${student.firstName} ${student.lastName ?? ''}`.trim(), leftOn, tcNo };
  });
}
