import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { AcademicYear } from '@/server/models/academicYear';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { Exam, EXAM_TYPES, ExamSchedule, Mark } from '@/server/models/exam';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { Subject } from '@/server/models/subject';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { getCurrentYearId } from '@/server/modules/academics/queries';

const E = 'exams.errors';
const Id = (key: string) => z.string().regex(/^[0-9a-f]{24}$/, `${E}.${key}`);
const isDuplicateKey = (error: unknown) => error instanceof Error && 'code' in error && error.code === 11000;

// ponytail: one grading scale for every school (CBSE's 9-point bands, pass at 33%). Read it from gradingSchemes
// once the grading-scheme editor exists.
const BANDS = [
  [91, 'A1'],
  [81, 'A2'],
  [71, 'B1'],
  [61, 'B2'],
  [51, 'C1'],
  [41, 'C2'],
  [33, 'D'],
  [0, 'E'],
] as const;
export const gradeFor = (marks: number, maxMarks: number) => {
  const percent = Math.round((marks / maxMarks) * 100);
  return BANDS.find(([min]) => percent >= min)?.[1] ?? 'E';
};

export const ExamInput = z.object({
  name: z.string().trim().min(1, `${E}.name`).max(80, `${E}.name`),
  type: z.enum(EXAM_TYPES, `${E}.type`),
  classIds: z.array(Id('classes')).min(1, `${E}.classes`).max(30, `${E}.classes`),
  termId: z.union([z.literal('').transform(() => undefined), Id('term')]).optional(),
});
export type ExamInput = z.infer<typeof ExamInput>;

export const ScheduleInput = z
  .object({
    examId: Id('notFound'),
    classId: Id('class'),
    subjectId: Id('subject'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.date`)
      .refine((date) => !Number.isNaN(Date.parse(date)), `${E}.date`),
    maxMarks: z.coerce.number(`${E}.maxMarks`).int(`${E}.maxMarks`).min(1, `${E}.maxMarks`).max(1000, `${E}.maxMarks`),
    passMarks: z.coerce.number(`${E}.passMarks`).int(`${E}.passMarks`).min(0, `${E}.passMarks`),
  })
  .refine(({ maxMarks, passMarks }) => passMarks <= maxMarks, { path: ['passMarks'], message: `${E}.passMarks` });
export type ScheduleInput = z.infer<typeof ScheduleInput>;

export const SaveMarks = z.object({
  examScheduleId: Id('notFound'),
  sectionId: Id('section'),
  entries: z
    .array(z.object({ studentId: Id('roster'), marks: z.number().min(0).nullable(), isAbsent: z.boolean() }))
    .min(1, `${E}.roster`)
    .max(200),
});
export type SaveMarks = z.infer<typeof SaveMarks>;

export const LockInput = z
  .object({ examScheduleId: Id('notFound'), locked: z.boolean(), reason: z.string().trim().max(200).default('') })
  .refine(({ locked, reason }) => locked || reason.length > 0, { path: ['reason'], message: `${E}.reason` });
export type LockInput = z.infer<typeof LockInput>;
export const ExamId = Id('notFound');

type Option = { id: string; name: string };
export type ExamRow = {
  id: string;
  name: string;
  type: (typeof EXAM_TYPES)[number];
  classes: string;
  /** The term the exam counts towards, if the school uses terms. */
  term: string | null;
  papers: number;
  published: boolean;
};
export type ExamDetail = ExamRow & {
  classOptions: Option[];
  subjectOptions: Option[];
  schedules: {
    id: string;
    className: string;
    subject: string;
    date: string;
    maxMarks: number;
    passMarks: number;
    locked: boolean;
    entered: number;
  }[];
};
export type MarksSheet = {
  exam: Option & { published: boolean };
  paper: { id: string; className: string; subject: string; date: string; maxMarks: number; passMarks: number; locked: boolean };
  sections: Option[];
  section: Option | null;
  canEdit: boolean;
  students: { id: string; name: string; rollNo: number; marks: number | null; isAbsent: boolean; grade: string | null }[];
};

const namesOf = async (ctx: RequestContext, classIds: unknown[]) => {
  const classes = await Class.find({ schoolId: ctx.schoolId, _id: { $in: classIds } })
    .sort({ order: 1 })
    .select('name')
    .lean();
  return classes.map((schoolClass) => ({ id: String(schoolClass._id), name: schoolClass.name }));
};

/** The names of the current year's terms by id, for labelling exams. */
export async function termNames(ctx: RequestContext) {
  const year = await AcademicYear.findOne({ schoolId: ctx.schoolId, status: 'current' }).select('terms').lean();
  return new Map((year?.terms ?? []).map((term) => [String(term._id), term.name]));
}

export const listTerms = async (ctx: RequestContext) =>
  [...(await termNames(ctx))].map(([id, name]) => ({ id, name }));

export async function listExams(ctx: RequestContext): Promise<ExamRow[]> {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) return [];
  const exams = await Exam.find({ schoolId, academicYearId }).sort({ createdAt: -1 }).limit(100).lean();
  const [terms, classes, papers] = await Promise.all([
    termNames(ctx),
    namesOf(
      ctx,
      exams.flatMap((exam) => exam.classIds),
    ),
    ExamSchedule.aggregate<{ _id: unknown; papers: number }>([
      { $match: { schoolId, deletedAt: null, examId: { $in: exams.map((exam) => exam._id) } } },
      { $group: { _id: '$examId', papers: { $sum: 1 } } },
    ]),
  ]);
  const nameOf = new Map(classes.map(({ id, name }) => [id, name]));
  const papersOf = new Map(papers.map((row) => [String(row._id), row.papers]));
  return exams.map((exam) => ({
    id: String(exam._id),
    name: exam.name,
    type: exam.type,
    classes: classes
      .filter(({ id }) => exam.classIds.some((classId) => String(classId) === id))
      .map(({ id }) => nameOf.get(id))
      .join(', '),
    term: terms.get(String(exam.termId)) ?? null,
    papers: papersOf.get(String(exam._id)) ?? 0,
    published: exam.status === 'results_published',
  }));
}

export async function createExam(ctx: RequestContext, input: ExamInput) {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  const valid = academicYearId
    ? await Class.countDocuments({ schoolId, academicYearId, _id: { $in: input.classIds } })
    : 0;
  if (!academicYearId || valid !== new Set(input.classIds).size) throw new AppError('NOT_FOUND', `${E}.classes`);
  if (input.termId && !(await termNames(ctx)).has(input.termId)) throw new AppError('NOT_FOUND', `${E}.term`);
  const { termId, ...details } = input;
  const exam = await Exam.create({
    schoolId,
    academicYearId,
    ...details,
    ...(termId && { termId }),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: exam._id, name: exam.name };
}

export async function getExam(ctx: RequestContext, id: string): Promise<ExamDetail | null> {
  const { schoolId } = ctx;
  const exam = Types.ObjectId.isValid(id) ? await Exam.findOne({ schoolId, _id: id }).lean() : null;
  if (!exam) return null;
  const schedules = await ExamSchedule.find({ schoolId, examId: exam._id }).sort({ date: 1 }).lean();
  const [classOptions, subjects, entered] = await Promise.all([
    namesOf(ctx, exam.classIds),
    Subject.find({ schoolId }).sort({ name: 1 }).select('name').lean(),
    Mark.aggregate<{ _id: unknown; entered: number }>([
      { $match: { schoolId, deletedAt: null, examScheduleId: { $in: schedules.map((schedule) => schedule._id) } } },
      { $group: { _id: '$examScheduleId', entered: { $sum: 1 } } },
    ]),
  ]);
  const className = new Map(classOptions.map(({ id: classId, name }) => [classId, name]));
  const subjectName = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
  const enteredOf = new Map(entered.map((row) => [String(row._id), row.entered]));
  return {
    id: String(exam._id),
    name: exam.name,
    type: exam.type,
    classes: classOptions.map(({ name }) => name).join(', '),
    term: (await termNames(ctx)).get(String(exam.termId)) ?? null,
    papers: schedules.length,
    published: exam.status === 'results_published',
    classOptions,
    subjectOptions: subjects.map((subject) => ({ id: String(subject._id), name: subject.name })),
    schedules: schedules.map((schedule) => ({
      id: String(schedule._id),
      className: className.get(String(schedule.classId)) ?? '',
      subject: subjectName.get(String(schedule.subjectId)) ?? '',
      date: schedule.date,
      maxMarks: schedule.maxMarks,
      passMarks: schedule.passMarks,
      locked: schedule.status === 'locked',
      entered: enteredOf.get(String(schedule._id)) ?? 0,
    })),
  };
}

export async function addSchedule(ctx: RequestContext, { examId, ...input }: ScheduleInput) {
  const { schoolId } = ctx;
  const [exam, subject] = await Promise.all([
    Exam.findOne({ schoolId, _id: examId }).select('classIds status').lean(),
    Subject.exists({ schoolId, _id: input.subjectId }),
  ]);
  if (!exam) throw new AppError('NOT_FOUND', `${E}.notFound`);
  if (exam.status === 'results_published') throw new AppError('BUSINESS_RULE', `${E}.published`);
  if (!exam.classIds.some((classId) => String(classId) === input.classId)) throw new AppError('NOT_FOUND', `${E}.class`);
  if (!subject) throw new AppError('NOT_FOUND', `${E}.subject`);
  try {
    const schedule = await ExamSchedule.create({
      schoolId,
      examId: exam._id,
      ...input,
      status: 'marks_open',
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return { id: schedule._id };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', `${E}.paperExists`);
    throw error;
  }
}

/** Sections of the paper's class whose marks this user may enter or see: a teacher only where they teach the subject. */
async function paperAccess(ctx: RequestContext, scheduleId: string) {
  const { schoolId } = ctx;
  const schedule = Types.ObjectId.isValid(scheduleId)
    ? await ExamSchedule.findOne({ schoolId, _id: scheduleId }).lean()
    : null;
  if (!schedule) throw new AppError('NOT_FOUND', `${E}.notFound`);
  const [exam, all] = await Promise.all([
    Exam.findOne({ schoolId, _id: schedule.examId }).select('name status').lean(),
    Section.find({ schoolId, classId: schedule.classId }).sort({ displayName: 1 }).select('displayName').lean(),
  ]);
  if (!exam) throw new AppError('NOT_FOUND', `${E}.notFound`);
  let sections = all;
  if (ctx.scope === 'assigned') {
    const taught = ctx.staffId
      ? await TimetableSlot.distinct('sectionId', {
          schoolId,
          teacherId: ctx.staffId,
          subjectId: schedule.subjectId,
          sectionId: { $in: all.map((section) => section._id) },
        })
      : [];
    sections = all.filter((section) => taught.some((id) => id.equals(section._id)));
  }
  return { schedule, exam, sections };
}

export async function getMarksSheet(ctx: RequestContext, scheduleId: string, sectionId?: string): Promise<MarksSheet> {
  const { schoolId } = ctx;
  const { schedule, exam, sections } = await paperAccess(ctx, scheduleId);
  const section = sections.find((candidate) => String(candidate._id) === sectionId) ?? sections[0] ?? null;
  const [paperClass, subject, enrollments] = await Promise.all([
    Class.findOne({ schoolId, _id: schedule.classId }).select('name').lean(),
    Subject.findOne({ schoolId, _id: schedule.subjectId }).setOptions({ withDeleted: true }).select('name').lean(),
    section
      ? Enrollment.find({ schoolId, sectionId: section._id, status: 'active' }).sort({ rollNo: 1 }).select('studentId rollNo').lean()
      : [],
  ]);
  const ids = enrollments.map((enrollment) => enrollment.studentId);
  const [students, marks] = await Promise.all([
    Student.find({ schoolId, _id: { $in: ids } }).select('firstName lastName').lean(),
    Mark.find({ schoolId, examScheduleId: schedule._id, studentId: { $in: ids } }).select('studentId total isAbsent grade').lean(),
  ]);
  const nameOf = new Map(students.map((student) => [String(student._id), `${student.firstName} ${student.lastName ?? ''}`.trim()]));
  const markOf = new Map(marks.map((mark) => [String(mark.studentId), mark]));
  const locked = schedule.status === 'locked';
  const published = exam.status === 'results_published';
  const option = (target: { _id: unknown; displayName: string }) => ({ id: String(target._id), name: target.displayName });
  return {
    exam: { id: String(exam._id), name: exam.name, published },
    paper: {
      id: String(schedule._id),
      className: paperClass?.name ?? '',
      subject: subject?.name ?? '',
      date: schedule.date,
      maxMarks: schedule.maxMarks,
      passMarks: schedule.passMarks,
      locked,
    },
    sections: sections.map(option),
    section: section && option(section),
    canEdit: can(ctx.role, 'exams.mark.update') && Boolean(section) && !locked && !published,
    students: enrollments.map((enrollment) => {
      const id = String(enrollment.studentId);
      const mark = markOf.get(id);
      return {
        id,
        name: nameOf.get(id) ?? '',
        rollNo: enrollment.rollNo,
        marks: mark?.total ?? null,
        isAbsent: mark?.isAbsent ?? false,
        grade: mark?.grade ?? null,
      };
    }),
  };
}

export async function saveMarks(ctx: RequestContext, { examScheduleId, sectionId, entries }: SaveMarks) {
  const { schoolId } = ctx;
  const { schedule, exam, sections } = await paperAccess(ctx, examScheduleId);
  const section = sections.find((candidate) => String(candidate._id) === sectionId);
  if (!section) throw new AppError('NOT_FOUND', `${E}.section`);
  if (schedule.status === 'locked' || exam.status === 'results_published') {
    throw new AppError('BUSINESS_RULE', `${E}.locked`);
  }
  const enrolled = await Enrollment.distinct('studentId', { schoolId, sectionId: section._id, status: 'active' });
  const roster = new Set(enrolled.map(String));
  const seen = new Set(entries.map((entry) => entry.studentId));
  if (seen.size !== entries.length || entries.some((entry) => !roster.has(entry.studentId))) {
    throw new AppError('VALIDATION', `${E}.roster`);
  }
  // Marks are whole or half numbers up to the paper's maximum. An absent student has no marks.
  const invalid = entries.find(
    ({ marks, isAbsent }) =>
      marks !== null && (isAbsent || marks > schedule.maxMarks || !Number.isInteger(marks * 2)),
  );
  if (invalid) throw new AppError('VALIDATION', `${E}.marks`, { max: schedule.maxMarks });

  const filled = entries.filter((entry) => entry.isAbsent || entry.marks !== null);
  const cleared = entries.filter((entry) => !entry.isAbsent && entry.marks === null);
  // bulkWrite skips the tenant plugin's query hooks, so every filter names the school itself.
  await Mark.bulkWrite([
    ...filled.map(({ studentId, marks, isAbsent }) => ({
      updateOne: {
        filter: { schoolId, examScheduleId: schedule._id, studentId: new Types.ObjectId(studentId) },
        update: {
          $set: {
            sectionId: section._id,
            total: marks,
            isAbsent,
            grade: marks === null ? null : gradeFor(marks, schedule.maxMarks),
            enteredBy: ctx.userId,
            updatedBy: ctx.userId,
          },
          $setOnInsert: { createdBy: ctx.userId, deletedAt: null },
        },
        upsert: true,
      },
    })),
    ...cleared.map(({ studentId }) => ({
      deleteOne: { filter: { schoolId, examScheduleId: schedule._id, studentId: new Types.ObjectId(studentId) } },
    })),
  ]);
  return { id: schedule._id, section: section.displayName, saved: filled.length, cleared: cleared.length };
}

export async function setLock(ctx: RequestContext, { examScheduleId, locked }: LockInput) {
  const paper = await ExamSchedule.findOne({ schoolId: ctx.schoolId, _id: examScheduleId }).select('examId').lean();
  if (!paper) throw new AppError('NOT_FOUND', `${E}.notFound`);
  // Published results are what families were shown, so their papers stay locked.
  if (!locked && (await Exam.exists({ schoolId: ctx.schoolId, _id: paper.examId, status: 'results_published' }))) {
    throw new AppError('BUSINESS_RULE', `${E}.published`);
  }
  const schedule = await ExamSchedule.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: examScheduleId, status: locked ? { $ne: 'locked' } : 'locked' },
    locked
      ? { status: 'locked', lockedBy: ctx.userId, lockedAt: new Date(), updatedBy: ctx.userId }
      : { status: 'marks_open', lockedBy: null, lockedAt: null, updatedBy: ctx.userId },
  )
    .select('examId')
    .lean();
  if (!schedule) throw new AppError('BUSINESS_RULE', `${E}.lockState`);
  return { id: schedule._id };
}

/** Results go out only when every paper is locked, so nothing a family sees can still change. */
export async function publishResults(ctx: RequestContext, examId: string) {
  const { schoolId } = ctx;
  const [papers, open] = await Promise.all([
    ExamSchedule.countDocuments({ schoolId, examId }),
    ExamSchedule.countDocuments({ schoolId, examId, status: { $ne: 'locked' } }),
  ]);
  if (papers === 0) throw new AppError('BUSINESS_RULE', `${E}.noPapers`);
  if (open > 0) throw new AppError('BUSINESS_RULE', `${E}.notLocked`, { count: open });
  const exam = await Exam.findOneAndUpdate(
    { schoolId, _id: examId, status: { $ne: 'results_published' } },
    { status: 'results_published', updatedBy: ctx.userId },
  )
    .select('name')
    .lean();
  if (!exam) throw new AppError('BUSINESS_RULE', `${E}.published`);
  return { id: exam._id, name: exam.name, papers };
}

export type StudentResult = {
  examId: string;
  exam: string;
  term?: string | null;
  papers: { subject: string; marks: number | null; maxMarks: number; isAbsent: boolean; grade: string | null; passed: boolean }[];
  total: number;
  maxTotal: number;
  percent: number | null;
};

/** A student's marks, exam by exam. Families pass `publishedOnly`; staff see marks as they are entered. */
export async function getStudentResults(
  ctx: RequestContext,
  studentId: string,
  publishedOnly: boolean,
  academicYearId?: Types.ObjectId,
) {
  const { schoolId } = ctx;
  const marks = await Mark.find({ schoolId, studentId }).select('examScheduleId total isAbsent grade').lean();
  const schedules = await ExamSchedule.find({ schoolId, _id: { $in: marks.map((mark) => mark.examScheduleId) } })
    .select('examId subjectId maxMarks passMarks date')
    .lean();
  const [exams, subjects] = await Promise.all([
    Exam.find({
      schoolId,
      _id: { $in: schedules.map((schedule) => schedule.examId) },
      ...(publishedOnly && { status: 'results_published' as const }),
      ...(academicYearId && { academicYearId }),
    })
      .sort({ createdAt: -1 })
      .select('name termId')
      .lean(),
    Subject.find({ schoolId, _id: { $in: schedules.map((schedule) => schedule.subjectId) } })
      .setOptions({ withDeleted: true })
      .select('name')
      .lean(),
  ]);
  const subjectName = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
  const terms = await termNames(ctx);
  const markOf = new Map(marks.map((mark) => [String(mark.examScheduleId), mark]));
  return exams.map((exam): StudentResult => {
    const papers = schedules
      .filter((schedule) => schedule.examId.equals(exam._id))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((schedule) => {
        const mark = markOf.get(String(schedule._id));
        return {
          subject: subjectName.get(String(schedule.subjectId)) ?? '',
          marks: mark?.total ?? null,
          maxMarks: schedule.maxMarks,
          isAbsent: mark?.isAbsent ?? false,
          grade: mark?.grade ?? null,
          passed: (mark?.total ?? -1) >= schedule.passMarks,
        };
      });
    const total = papers.reduce((sum, paper) => sum + (paper.marks ?? 0), 0);
    const maxTotal = papers.reduce((sum, paper) => sum + paper.maxMarks, 0);
    return {
      examId: String(exam._id),
      exam: exam.name,
      term: terms.get(String(exam.termId)) ?? null,
      papers,
      total,
      maxTotal,
      percent: maxTotal ? Math.round((total / maxTotal) * 1000) / 10 : null,
    };
  });
}
