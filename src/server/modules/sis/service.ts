import 'server-only';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Counter } from '@/server/models/counter';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import type { StudentInput } from './schemas';

export async function createStudent(ctx: RequestContext, input: StudentInput) {
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

  return withTransaction(async (session) => {
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
  });
}
