import 'server-only';
import { Types } from 'mongoose';
import { todayIn, weekdayOf } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Enrollment } from '@/server/models/enrollment';
import { Holiday } from '@/server/models/holiday';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { Subject } from '@/server/models/subject';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { getCurrentYearId } from '@/server/modules/academics/queries';
import { listTaughtSectionIds, PERIODS } from '@/server/modules/timetable/service';
import type { AttendanceRegister, AttendanceSheet, MarkableStatus } from './schemas';

/**
 * The section, if the user may take or see its attendance. A teacher gets daily attendance only for the section they
 * are class teacher of; with `mode: 'any'` a section they teach on the timetable also counts (period attendance).
 */
export async function findAttendanceSection(ctx: RequestContext, sectionId: string, mode: 'daily' | 'any' = 'daily') {
  if (!Types.ObjectId.isValid(sectionId)) return null;
  const section = await Section.findOne({ schoolId: ctx.schoolId, _id: sectionId }).lean();
  if (!section) return null;
  if (ctx.scope === 'branch' && !section.branchId.equals(ctx.branchId)) return null;
  if (ctx.scope === 'assigned') {
    if (!ctx.staffId) return null;
    const teaches =
      mode === 'any' &&
      (await TimetableSlot.exists({ schoolId: ctx.schoolId, sectionId: section._id, teacherId: ctx.staffId }));
    if (!section.classTeacherId?.equals(ctx.staffId) && !teaches) return null;
  }
  return ['school', 'branch', 'assigned'].includes(ctx.scope) ? section : null;
}

/** With `mode: 'any'` a teacher also gets the sections they teach on the timetable, for period attendance. */
export async function listAttendanceSections(ctx: RequestContext, mode: 'daily' | 'any' = 'daily') {
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) return [];
  if (ctx.scope === 'assigned' && !ctx.staffId) return [];
  const taught = ctx.scope === 'assigned' && mode === 'any' ? await listTaughtSectionIds(ctx) : [];
  const sections = await Section.find({
    schoolId: ctx.schoolId,
    academicYearId,
    ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
  })
    .and(
      ctx.scope === 'assigned' && ctx.staffId
        ? [{ $or: [{ classTeacherId: ctx.staffId }, { _id: { $in: taught } }] }]
        : [{}],
    )
    .select('displayName')
    .lean();
  return sections
    .map((section) => ({ id: String(section._id), name: section.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

export async function getSchoolCalendar(ctx: RequestContext) {
  const school = await School.findById(ctx.schoolId).select('timezone settings.workingDays').lean();
  return {
    today: todayIn(school?.timezone ?? 'Asia/Kolkata'),
    workingDays: school?.settings?.workingDays ?? [1, 2, 3, 4, 5, 6],
  };
}

/** Whether attendance can be taken on `requested` (today in the school's time zone when omitted). */
export async function getDayState(ctx: RequestContext, requested?: string) {
  const { today, workingDays } = await getSchoolCalendar(ctx);
  const date = requested ?? today;
  const holiday = await Holiday.findOne({ schoolId: ctx.schoolId, date }).select('name').lean();
  const state =
    date > today
      ? ('future' as const)
      : holiday
        ? ('holiday' as const)
        : workingDays.includes(weekdayOf(date))
          ? ('open' as const)
          : ('nonWorking' as const);
  return { date, today, state, holidayName: holiday?.name ?? null };
}

export async function getAttendanceSheet(
  ctx: RequestContext,
  sectionId: string,
  requestedDate: string | undefined,
  requestedPeriod?: number,
): Promise<AttendanceSheet | null> {
  const { schoolId } = ctx;
  const section = await findAttendanceSection(ctx, sectionId, 'any');
  if (!section) return null;
  const assigned = ctx.scope === 'assigned';
  const canDaily = !assigned || Boolean(ctx.staffId && section.classTeacherId?.equals(ctx.staffId));

  const validDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : undefined;
  const day = await getDayState(ctx, validDate);
  const { date } = day;

  // A teacher takes period attendance only for the periods they teach; the office sees every period.
  const slots = await TimetableSlot.find({
    schoolId,
    sectionId: section._id,
    day: weekdayOf(date),
    status: 'published',
    ...(assigned && { teacherId: ctx.staffId ?? null }),
  })
    .sort({ period: 1 })
    .select('period subjectId')
    .lean();
  const subjects = await Subject.find({ schoolId, _id: { $in: slots.map((slot) => slot.subjectId) } })
    .setOptions({ withDeleted: true })
    .select('name')
    .lean();
  const subjectOf = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
  const periods = slots.flatMap((slot) => {
    const bell = PERIODS.find((candidate) => candidate.number === slot.period);
    return bell
      ? [{ number: slot.period, time: `${bell.start}–${bell.end}`, subject: subjectOf.get(String(slot.subjectId)) ?? '' }]
      : [];
  });
  const period =
    periods.find(({ number }) => number === requestedPeriod)?.number ?? (canDaily ? null : (periods[0]?.number ?? null));
  const noPeriod = !canDaily && period === null;

  const [record, enrollments] = await Promise.all([
    AttendanceRecord.findOne({ schoolId, sectionId: section._id, date, mode: period ? 'period' : 'daily', period })
      .select('entries editedAfterSubmit')
      .lean(),
    Enrollment.find({ schoolId, sectionId: section._id, status: 'active' }).select('studentId rollNo').lean(),
  ]);
  const students = await Student.find({ schoolId, _id: { $in: enrollments.map((e) => e.studentId) } })
    .select('firstName lastName')
    .lean();
  const nameById = new Map(students.map((s) => [String(s._id), `${s.firstName} ${s.lastName}`.trim()]));
  const statusById = new Map(record?.entries.map((entry) => [String(entry.studentId), entry.status]));

  return {
    section: { id: String(section._id), name: section.displayName },
    date,
    today: day.today,
    // A submitted day can be changed by its teacher only on that same day.
    state: noPeriod ? 'noPeriod' : day.state === 'open' && record && date !== day.today ? 'locked' : day.state,
    period,
    periods,
    canDaily,
    holidayName: day.holidayName,
    submitted: Boolean(record),
    edited: record?.editedAfterSubmit ?? false,
    students: enrollments
      .sort((a, b) => a.rollNo - b.rollNo)
      .map((enrollment) => ({
        id: String(enrollment.studentId),
        name: nameById.get(String(enrollment.studentId)) ?? '',
        rollNo: enrollment.rollNo,
        status: (statusById.get(String(enrollment.studentId)) ?? 'present') as MarkableStatus,
      })),
  };
}

export async function getRegister(
  ctx: RequestContext,
  sectionId: string,
  requestedMonth: string | undefined,
): Promise<AttendanceRegister | null> {
  const { schoolId } = ctx;
  const section = await findAttendanceSection(ctx, sectionId);
  if (!section) return null;

  const { today, workingDays } = await getSchoolCalendar(ctx);
  const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const inMonth = { $gte: `${month}-01`, $lte: `${month}-31` };

  const [records, holidays, enrollments] = await Promise.all([
    AttendanceRecord.find({ schoolId, sectionId: section._id, mode: 'daily', date: inMonth })
      .select('date entries.studentId entries.status')
      .lean(),
    Holiday.find({ schoolId, date: inMonth }).select('date').lean(),
    Enrollment.find({ schoolId, sectionId: section._id, status: 'active' }).select('studentId rollNo').lean(),
  ]);
  const students = await Student.find({ schoolId, _id: { $in: enrollments.map((e) => e.studentId) } })
    .select('firstName lastName')
    .lean();
  const nameById = new Map(students.map((s) => [String(s._id), `${s.firstName} ${s.lastName}`.trim()]));
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const takenDates = new Set(records.map((record) => record.date));

  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).getUTCDate();
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const kind = holidayDates.has(date) ? 'holiday' : workingDays.includes(weekdayOf(date)) ? 'working' : 'nonWorking';
    return { date, day: index + 1, kind: kind as 'holiday' | 'working' | 'nonWorking', taken: takenDates.has(date) };
  });

  return {
    section: { id: String(section._id), name: section.displayName },
    month,
    days,
    students: enrollments
      .sort((a, b) => a.rollNo - b.rollNo)
      .map((enrollment) => {
        const id = String(enrollment.studentId);
        const marks: Record<string, MarkableStatus> = {};
        for (const record of records) {
          const entry = record.entries.find((candidate) => String(candidate.studentId) === id);
          if (entry) marks[record.date] = entry.status as MarkableStatus;
        }
        const statuses = Object.values(marks);
        const count = (status: MarkableStatus) => statuses.filter((mark) => mark === status).length;
        // Attendance % counts late as present and a half day as half, over the days attendance was taken.
        const attended = count('present') + count('late') + count('half_day') * 0.5;
        return {
          id,
          name: nameById.get(id) ?? '',
          rollNo: enrollment.rollNo,
          marks,
          present: count('present') + count('late'),
          absent: count('absent'),
          percent: statuses.length ? Math.round((attended / statuses.length) * 1000) / 10 : null,
        };
      }),
  };
}