import 'server-only';
import { AppError } from '@/lib/appError';
import { todayIn, weekdayOf } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { PeriodDefinition } from '@/server/models/periodDefinition';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { Subject } from '@/server/models/subject';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { getCurrentYearId } from '@/server/modules/academics/queries';
import type { ClearSlot, Period, SlotInput, SubjectInput, SubjectRow, TeacherPeriod, Timetable } from './schemas';

const isDuplicateKey = (error: unknown) => error instanceof Error && 'code' in error && error.code === 11000;

// The bell schedule a school starts with: 8 periods of 40 minutes, lunch after the 4th. Settings replaces it.
const STARTS = ['08:00', '08:40', '09:20', '10:00', '11:00', '11:40', '12:20', '13:00'];
const DEFAULT_PERIODS: Period[] = STARTS.map((start, index) => {
  const minutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 40;
  const end = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { number: index + 1, start, end };
});

/** The school's teaching periods in order, from Settings, or the default schedule until it is set. */
export async function getPeriods(ctx: RequestContext): Promise<Period[]> {
  const definition = await PeriodDefinition.findOne({ schoolId: ctx.schoolId }).select('periods').lean();
  const periods = definition?.periods.filter((period) => !period.isBreak) ?? [];
  return periods.length
    ? periods.map(({ number, start, end }) => ({ number, start, end })).sort((a, b) => a.number - b.number)
    : DEFAULT_PERIODS;
}

export async function listSubjects(ctx: RequestContext): Promise<SubjectRow[]> {
  const subjects = await Subject.find({ schoolId: ctx.schoolId }).sort({ name: 1 }).select('name code type').lean();
  return subjects.map((subject) => ({
    id: String(subject._id),
    name: subject.name,
    code: subject.code,
    type: subject.type,
  }));
}

export async function createSubject(ctx: RequestContext, input: SubjectInput) {
  try {
    const subject = await Subject.create({
      schoolId: ctx.schoolId,
      ...input,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return { id: subject._id, name: subject.name };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'academics.timetable.errors.codeTaken', input);
    throw error;
  }
}

export async function getTimetable(ctx: RequestContext, sectionId: string): Promise<Timetable> {
  const { schoolId } = ctx;
  const slots = /^[0-9a-f]{24}$/.test(sectionId)
    ? await TimetableSlot.find({ schoolId, sectionId }).select('day period subjectId teacherId').lean()
    : [];
  const [periods, subjects, teachers] = await Promise.all([
    getPeriods(ctx),
    Subject.find({ schoolId, _id: { $in: slots.map((slot) => slot.subjectId) } })
      .setOptions({ withDeleted: true })
      .select('name')
      .lean(),
    Staff.find({ schoolId, _id: { $in: slots.map((slot) => slot.teacherId) } })
      .setOptions({ withDeleted: true })
      .select('name')
      .lean(),
  ]);
  const nameOf = new Map([...subjects, ...teachers].map((doc) => [String(doc._id), doc.name]));
  return {
    periods,
    cells: Object.fromEntries(
      slots.map((slot) => [
        `${slot.day}-${slot.period}`,
        {
          subjectId: String(slot.subjectId),
          subject: nameOf.get(String(slot.subjectId)) ?? '',
          teacherId: String(slot.teacherId),
          teacher: nameOf.get(String(slot.teacherId)) ?? '',
        },
      ]),
    ),
  };
}

export async function setSlot(ctx: RequestContext, input: SlotInput) {
  const { schoolId } = ctx;
  const [academicYearId, section, subject, teacher] = await Promise.all([
    getCurrentYearId(ctx),
    Section.findOne({ schoolId, _id: input.sectionId }).select('branchId academicYearId displayName').lean(),
    Subject.findOne({ schoolId, _id: input.subjectId }).select('name').lean(),
    Staff.findOne({ schoolId, _id: input.teacherId, status: 'active', type: 'teaching' }).select('name').lean(),
  ]);
  if (!section || !academicYearId || !section.academicYearId.equals(academicYearId)) {
    throw new AppError('NOT_FOUND', 'academics.timetable.errors.section');
  }
  if (!subject) throw new AppError('NOT_FOUND', 'academics.timetable.errors.subject');
  if (!teacher) throw new AppError('NOT_FOUND', 'academics.timetable.errors.teacher');

  try {
    await TimetableSlot.findOneAndUpdate(
      { schoolId, academicYearId, sectionId: section._id, day: input.day, period: input.period },
      {
        $set: { subjectId: subject._id, teacherId: teacher._id, status: 'published', updatedBy: ctx.userId },
        $setOnInsert: { branchId: section.branchId, createdBy: ctx.userId },
      },
      { upsert: true },
    );
  } catch (error) {
    // The unique index on teacher, day and period is what stops a teacher being in two rooms at once.
    if (isDuplicateKey(error)) {
      throw new AppError('CONFLICT', 'academics.timetable.errors.teacherBusy', { name: teacher.name });
    }
    throw error;
  }
  return { sectionId: section._id, section: section.displayName, subject: subject.name, teacher: teacher.name };
}

export async function clearSlot(ctx: RequestContext, input: ClearSlot) {
  // A hard delete: a soft-deleted slot would keep its place in the unique index and block the period forever.
  const slot = await TimetableSlot.findOneAndDelete({
    schoolId: ctx.schoolId,
    sectionId: input.sectionId,
    day: input.day,
    period: input.period,
  })
    .select('subjectId teacherId')
    .lean();
  if (!slot) throw new AppError('NOT_FOUND', 'academics.timetable.errors.slot');
  return { id: slot._id, subjectId: String(slot.subjectId), teacherId: String(slot.teacherId) };
}

/** Sections a teacher has on the timetable, on any day. */
export async function listTaughtSectionIds(ctx: RequestContext) {
  if (!ctx.staffId) return [];
  const ids = await TimetableSlot.distinct('sectionId', { schoolId: ctx.schoolId, teacherId: ctx.staffId });
  return ids.map(String);
}

/** The signed-in teacher's periods today, in order. Empty on Sunday and for people who don't teach. */
export async function getTeacherDay(ctx: RequestContext): Promise<TeacherPeriod[]> {
  const { schoolId } = ctx;
  if (!ctx.staffId) return [];
  const school = await School.findById(schoolId).select('timezone').lean();
  const day = weekdayOf(todayIn(school?.timezone ?? 'Asia/Kolkata'));
  const slots = await TimetableSlot.find({ schoolId, teacherId: ctx.staffId, day, status: 'published' })
    .sort({ period: 1 })
    .select('period sectionId subjectId')
    .lean();
  const [periods, sections, subjects] = await Promise.all([
    getPeriods(ctx),
    Section.find({ schoolId, _id: { $in: slots.map((slot) => slot.sectionId) } })
      .select('displayName')
      .lean(),
    Subject.find({ schoolId, _id: { $in: slots.map((slot) => slot.subjectId) } })
      .select('name')
      .lean(),
  ]);
  const sectionOf = new Map(sections.map((section) => [String(section._id), section.displayName]));
  const subjectOf = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
  return slots.flatMap((slot) => {
    const period = periods.find((candidate) => candidate.number === slot.period);
    return period
      ? [
          {
            ...period,
            section: sectionOf.get(String(slot.sectionId)) ?? '',
            subject: subjectOf.get(String(slot.subjectId)) ?? '',
          },
        ]
      : [];
  });
}
