import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';

const E = 'promotion.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.section`);
const Day = (key: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.${key}`);

export const NextYearInput = z
  .object({
    label: z.string().trim().regex(/^\d{4}–\d{2}$/, `${E}.label`),
    startDate: Day('startDate'),
    endDate: Day('endDate'),
  })
  .refine(({ startDate, endDate }) => endDate > startDate, { path: ['endDate'], message: `${E}.endDate` });
export type NextYearInput = z.infer<typeof NextYearInput>;

export const ACTIONS = ['promote', 'detain', 'graduate', 'leave'] as const;
export const PromoteSection = z.object({
  sectionId: Id,
  decisions: z
    .array(z.object({ studentId: Id, action: z.enum(ACTIONS), toSectionId: Id.optional() }))
    .min(1, `${E}.none`)
    .max(200),
});
export type PromoteSection = z.infer<typeof PromoteSection>;

type Option = { id: string; name: string };
export type PromotionState = {
  current: { label: string } | null;
  next: { label: string } | null;
  suggested: NextYearInput;
  /** Students still enrolled in the current year. The year can close only when this is zero. */
  remaining: number;
  sections: (Option & { students: number })[];
};
export type PromotionSheet = {
  section: Option;
  students: { id: string; name: string; rollNo: number }[];
  promoteTo: Option[];
  detainIn: Option[];
};

const years = async (ctx: RequestContext) => {
  const found = await AcademicYear.find({ schoolId: ctx.schoolId, status: { $in: ['current', 'planned'] } })
    .sort({ startDate: 1 })
    .select('label status startDate endDate')
    .lean();
  return {
    current: found.find((year) => year.status === 'current') ?? null,
    next: found.find((year) => year.status === 'planned') ?? null,
  };
};

const plusYear = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;

export async function getPromotionState(ctx: RequestContext): Promise<PromotionState> {
  const { schoolId } = ctx;
  const { current, next } = await years(ctx);
  const sections = current
    ? await Section.find({ schoolId, academicYearId: current._id }).select('displayName').lean()
    : [];
  const counts = sections.length
    ? await Enrollment.aggregate<{ _id: unknown; students: number }>([
        { $match: { schoolId, status: 'active', sectionId: { $in: sections.map((section) => section._id) } } },
        { $group: { _id: '$sectionId', students: { $sum: 1 } } },
      ])
    : [];
  const countOf = new Map(counts.map((row) => [String(row._id), row.students]));
  const start = Number(current?.label.slice(0, 4) ?? new Date().getUTCFullYear()) + 1;
  return {
    current: current && { label: current.label },
    next: next && { label: next.label },
    suggested: {
      label: `${start}–${String((start + 1) % 100).padStart(2, '0')}`,
      startDate: current ? plusYear(current.startDate) : '',
      endDate: current ? plusYear(current.endDate) : '',
    },
    remaining: counts.reduce((sum, row) => sum + row.students, 0),
    sections: sections
      .map((section) => ({
        id: String(section._id),
        name: section.displayName,
        students: countOf.get(String(section._id)) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })),
  };
}

/** Plans the next academic year and copies this year's classes and sections into it, without their students. */
export async function createNextYear(ctx: RequestContext, input: NextYearInput) {
  const { schoolId } = ctx;
  const { current, next } = await years(ctx);
  if (!current) throw new AppError('BUSINESS_RULE', `${E}.noCurrent`);
  if (next) throw new AppError('CONFLICT', `${E}.nextExists`);
  if (input.startDate <= current.endDate) throw new AppError('BUSINESS_RULE', `${E}.overlap`);
  const audit = { createdBy: ctx.userId, updatedBy: ctx.userId };

  return withTransaction(async (session) => {
    const [year] = await AcademicYear.create([{ schoolId, ...input, status: 'planned', ...audit }], { session });
    if (!year) throw new AppError('INTERNAL', 'errors.conflict');
    const [classes, sections] = await Promise.all([
      Class.find({ schoolId, academicYearId: current._id }).session(session).lean(),
      Section.find({ schoolId, academicYearId: current._id }).session(session).lean(),
    ]);
    const newClassId = new Map(classes.map((schoolClass) => [String(schoolClass._id), new Types.ObjectId()]));
    if (classes.length) {
      await Class.insertMany(
        classes.map((schoolClass) => ({
          _id: newClassId.get(String(schoolClass._id)) as Types.ObjectId,
          schoolId,
          branchId: schoolClass.branchId,
          academicYearId: year._id,
          name: schoolClass.name,
          order: schoolClass.order,
          subjectIds: schoolClass.subjectIds,
          ...audit,
        })),
        { session },
      );
    }
    if (sections.length) {
      await Section.insertMany(
        sections.map((section) => ({
          schoolId,
          branchId: section.branchId,
          academicYearId: year._id,
          classId: newClassId.get(String(section.classId)) as Types.ObjectId,
          name: section.name,
          displayName: section.displayName,
          capacity: section.capacity,
          room: section.room ?? null,
          ...audit,
        })),
        { session },
      );
    }
    return { id: year._id, label: year.label, classes: classes.length, sections: sections.length };
  });
}

/** Sections of the next year a student of `section` may go to: the class above (promote) or the same class (detain). */
async function targets(ctx: RequestContext, sectionId: string) {
  const { schoolId } = ctx;
  const { current, next } = await years(ctx);
  if (!current || !next) throw new AppError('BUSINESS_RULE', `${E}.noNext`);
  const section = Types.ObjectId.isValid(sectionId)
    ? await Section.findOne({ schoolId, _id: sectionId, academicYearId: current._id }).lean()
    : null;
  if (!section) throw new AppError('NOT_FOUND', `${E}.section`);
  const from = await Class.findOne({ schoolId, _id: section.classId }).select('order').lean();
  const classes = await Class.find({
    schoolId,
    academicYearId: next._id,
    branchId: section.branchId,
    order: { $in: [from?.order ?? -1, (from?.order ?? -1) + 1] },
  })
    .select('order')
    .lean();
  const nextSections = await Section.find({ schoolId, classId: { $in: classes.map((schoolClass) => schoolClass._id) } })
    .sort({ displayName: 1 })
    .select('classId displayName branchId academicYearId')
    .lean();
  const orderOf = new Map(classes.map((schoolClass) => [String(schoolClass._id), schoolClass.order]));
  const inOrder = (order: number) => nextSections.filter((candidate) => orderOf.get(String(candidate.classId)) === order);
  return { section, promoteTo: inOrder((from?.order ?? -1) + 1), detainIn: inOrder(from?.order ?? -1), nextSections };
}

export async function getPromotionSheet(ctx: RequestContext, sectionId: string): Promise<PromotionSheet> {
  const { schoolId } = ctx;
  const { section, promoteTo, detainIn } = await targets(ctx, sectionId);
  const enrollments = await Enrollment.find({ schoolId, sectionId: section._id, status: 'active' })
    .sort({ rollNo: 1 })
    .select('studentId rollNo')
    .lean();
  const students = await Student.find({ schoolId, _id: { $in: enrollments.map((enrollment) => enrollment.studentId) } })
    .select('firstName lastName')
    .lean();
  const nameOf = new Map(students.map((student) => [String(student._id), `${student.firstName} ${student.lastName ?? ''}`.trim()]));
  const option = (target: { _id: unknown; displayName: string }) => ({ id: String(target._id), name: target.displayName });
  return {
    section: option(section),
    students: enrollments.map((enrollment) => ({
      id: String(enrollment.studentId),
      name: nameOf.get(String(enrollment.studentId)) ?? '',
      rollNo: enrollment.rollNo,
    })),
    promoteTo: promoteTo.map(option),
    detainIn: detainIn.map(option),
  };
}

/**
 * Moves the listed students of one section into the next year, or out of the school, in one transaction. Only a
 * student still actively enrolled in that section is touched, so submitting the same list twice changes nothing more.
 */
export async function promoteSection(ctx: RequestContext, { sectionId, decisions }: PromoteSection) {
  const { schoolId } = ctx;
  const { section, promoteTo, detainIn } = await targets(ctx, sectionId);
  const allowed = { promote: promoteTo, detain: detainIn };
  const school = await School.findById(schoolId).select('timezone').lean();
  const today = todayIn(school?.timezone ?? 'Asia/Kolkata');
  const audit = { createdBy: ctx.userId, updatedBy: ctx.userId };
  const done = { promoted: 0, detained: 0, graduated: 0, left: 0 };

  await withTransaction(async (session) => {
    const nextRoll = new Map<string, number>();
    const offered = new Map<string, Set<string>>();
    for (const decision of decisions) {
      const target =
        decision.action === 'promote' || decision.action === 'detain'
          ? allowed[decision.action].find((candidate) => String(candidate._id) === decision.toSectionId)
          : null;
      if (target === undefined) throw new AppError('VALIDATION', `${E}.target`);

      const outcome = { promote: 'promoted', detain: 'detained', graduate: 'completed', leave: 'transferred' } as const;
      const enrollment = await Enrollment.findOneAndUpdate(
        { schoolId, sectionId: section._id, studentId: decision.studentId, status: 'active' },
        { status: outcome[decision.action], updatedBy: ctx.userId },
        { session },
      )
        .select('_id optionalSubjectIds')
        .lean();
      if (!enrollment) continue;

      if (target) {
        const key = String(target._id);
        if (!nextRoll.has(key)) {
          const last = await Enrollment.findOne({ schoolId, sectionId: target._id })
            .sort({ rollNo: -1 })
            .select('rollNo')
            .session(session)
            .lean();
          nextRoll.set(key, (last?.rollNo ?? 0) + 1);
        }
        const rollNo = nextRoll.get(key) ?? 1;
        nextRoll.set(key, rollNo + 1);
        if (!offered.has(String(target.classId))) {
          const next = await Class.findOne({ schoolId, _id: target.classId }).select('subjectIds').session(session).lean();
          offered.set(String(target.classId), new Set((next?.subjectIds ?? []).map(String)));
        }
        // The choice carries over where the next class still offers the subject; a student picks again for the rest.
        const carried = (enrollment.optionalSubjectIds ?? []).filter((subjectId) => offered.get(String(target.classId))?.has(String(subjectId)));
        const enrollmentId = new Types.ObjectId();
        await Enrollment.create(
          [
            {
              _id: enrollmentId,
              schoolId,
              branchId: target.branchId,
              studentId: decision.studentId,
              academicYearId: target.academicYearId,
              classId: target.classId,
              sectionId: target._id,
              rollNo,
              optionalSubjectIds: carried,
              ...audit,
            },
          ],
          { session },
        );
        await Student.updateOne(
          { schoolId, _id: decision.studentId },
          { currentEnrollmentId: enrollmentId, updatedBy: ctx.userId },
          { session },
        );
        done[decision.action === 'promote' ? 'promoted' : 'detained'] += 1;
      } else {
        const graduated = decision.action === 'graduate';
        await Student.updateOne(
          { schoolId, _id: decision.studentId },
          {
            status: graduated ? 'alumni' : 'withdrawn',
            leftOn: today,
            ...(!graduated && { leavingReason: 'Left at the end of the academic year' }),
            updatedBy: ctx.userId,
          },
          { session },
        );
        done[graduated ? 'graduated' : 'left'] += 1;
      }
    }
  });
  return { sectionId: section._id, section: section.displayName, ...done };
}

/** Closes the current year and makes the planned one current. Refused while anyone is still enrolled in the old year. */
export async function closeYear(ctx: RequestContext) {
  const { schoolId } = ctx;
  const { current, next } = await years(ctx);
  if (!current || !next) throw new AppError('BUSINESS_RULE', `${E}.noNext`);
  const remaining = await Enrollment.countDocuments({ schoolId, academicYearId: current._id, status: 'active' });
  if (remaining > 0) throw new AppError('BUSINESS_RULE', `${E}.remaining`, { count: remaining });

  await withTransaction(async (session) => {
    // Closed first: the index allows one current year per school, so the two can never both be current.
    await AcademicYear.updateOne({ schoolId, _id: current._id }, { status: 'closed', updatedBy: ctx.userId }, { session });
    await AcademicYear.updateOne({ schoolId, _id: next._id }, { status: 'current', updatedBy: ctx.userId }, { session });
  });
  return { id: next._id, closed: current.label, current: next.label };
}
