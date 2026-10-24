import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { todayIn, weekdayOf } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Enrollment } from '@/server/models/enrollment';
import { Holiday } from '@/server/models/holiday';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { getAttendanceSheet } from './queries';
import { getAttendanceReport } from './reports';
import type { MarkableStatus } from './schemas';
import { submitAttendance } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
const TODAY = todayIn('Asia/Kolkata');
const daysAgo = (days: number) => todayIn('Asia/Kolkata', new Date(Date.now() - days * 86_400_000));

const classTeacher = new Types.ObjectId();
const students = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
let admin: RequestContext;
let sectionId: string;
let otherSectionId: string;

async function seedSchool(code: string, workingDays: number[]) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: `School ${code}`,
    code,
    board: 'CBSE',
    address: ADDRESS,
    settings: { workingDays },
  });
  const section = await Section.create({
    schoolId: school._id,
    branchId: new Types.ObjectId(),
    academicYearId: new Types.ObjectId(),
    classId: new Types.ObjectId(),
    name: 'B',
    displayName: '7-B',
    classTeacherId: classTeacher,
  });
  return { schoolId: school._id, section };
}

const context = (schoolId: Types.ObjectId, overrides: Partial<RequestContext> = {}): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Test user',
  role: 'school_admin',
  scope: 'school',
  schoolId,
  ...overrides,
});

const sheet = (statuses: MarkableStatus[], overrides: Record<string, unknown> = {}) => ({
  sectionId,
  date: TODAY,
  mode: 'daily' as const,
  entries: students.map((id, index) => ({ studentId: String(id), status: statuses[index] ?? 'present' })),
  idempotencyKey: randomUUID(),
  ...overrides,
});

beforeAll(async () => {
  await connectDb();
  await AttendanceRecord.init();
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  const ours = await seedSchool(`C${suffix}`, everyDay);
  const theirs = await seedSchool(`D${suffix}`, everyDay);
  admin = context(ours.schoolId);
  sectionId = String(ours.section._id);
  otherSectionId = String(theirs.section._id);

  await Enrollment.insertMany(
    students.map((studentId, index) => ({
      schoolId: ours.schoolId,
      branchId: ours.section.branchId,
      studentId,
      academicYearId: ours.section.academicYearId,
      classId: ours.section.classId,
      sectionId: ours.section._id,
      rollNo: index + 1,
    })),
  );
});

afterAll(() => mongoose.disconnect());

it('defaults every student to present before anything is submitted', async () => {
  const before = await getAttendanceSheet(admin, sectionId, undefined);
  expect(before).toMatchObject({ date: TODAY, state: 'open', submitted: false });
  expect(before?.students.map((student) => [student.rollNo, student.status])).toEqual([
    [1, 'present'],
    [2, 'present'],
    [3, 'present'],
  ]);
});

it('saves a whole section in one record and reports the counts', async () => {
  const result = await submitAttendance(admin, sheet(['present', 'absent', 'late']));
  expect(result.summary).toEqual({ present: 1, absent: 1, late: 1, half_day: 0, leave: 0 });
  expect(result.before).toBeNull();
  expect(await AttendanceRecord.countDocuments({ schoolId: admin.schoolId })).toBe(1);

  const after = await getAttendanceSheet(admin, sectionId, TODAY);
  expect(after).toMatchObject({ submitted: true, edited: false, state: 'open' });
  expect(after?.students.map((student) => student.status)).toEqual(['present', 'absent', 'late']);
});

it('returns the first result for a retried request instead of writing again', async () => {
  const request = sheet(['absent', 'absent', 'absent']);
  await submitAttendance(admin, request);
  const retried = await submitAttendance(admin, { ...request, entries: sheet(['present']).entries });
  expect(retried.summary.absent).toBe(3);
  expect(retried.before).toBeNull();
});

it('marks a same-day change as edited and reports the earlier counts', async () => {
  const result = await submitAttendance(admin, sheet(['present', 'present', 'leave']));
  expect(result.before).toMatchObject({ absent: 3 });
  expect(result.summary).toMatchObject({ present: 2, leave: 1 });
  expect(await getAttendanceSheet(admin, sectionId, TODAY)).toMatchObject({ edited: true });
});

it('rejects a list that does not match the section’s students', async () => {
  const missingOne = sheet(['present', 'present']);
  missingOne.entries.pop();
  await expect(submitAttendance(admin, missingOne)).rejects.toMatchObject({ messageKey: 'attendance.errors.roster' });

  const stranger = sheet(['present']);
  stranger.entries[0] = { studentId: String(new Types.ObjectId()), status: 'present' };
  await expect(submitAttendance(admin, stranger)).rejects.toMatchObject({ messageKey: 'attendance.errors.roster' });
});

it('rejects a future date, a holiday and a non-working day', async () => {
  const tomorrow = todayIn('Asia/Kolkata', new Date(Date.now() + 86_400_000));
  await expect(submitAttendance(admin, sheet([], { date: tomorrow }))).rejects.toMatchObject({
    messageKey: 'attendance.errors.future',
  });

  await Holiday.create({ schoolId: admin.schoolId, date: daysAgo(2), name: 'Gandhi Jayanti' });
  await expect(submitAttendance(admin, sheet([], { date: daysAgo(2) }))).rejects.toMatchObject({
    messageKey: 'attendance.errors.holiday',
  });
  expect(await getAttendanceSheet(admin, sectionId, daysAgo(2))).toMatchObject({
    state: 'holiday',
    holidayName: 'Gandhi Jayanti',
  });

  await School.updateOne({ _id: admin.schoolId }, { 'settings.workingDays': [(weekdayOf(daysAgo(3)) + 1) % 7] });
  await expect(submitAttendance(admin, sheet([], { date: daysAgo(3) }))).rejects.toMatchObject({
    messageKey: 'attendance.errors.nonWorking',
  });
  await School.updateOne({ _id: admin.schoolId }, { 'settings.workingDays': [0, 1, 2, 3, 4, 5, 6] });
});

it('allows a first submission for a past day but not a change to it', async () => {
  await submitAttendance(admin, sheet(['absent'], { date: daysAgo(4) }));
  await expect(submitAttendance(admin, sheet(['present'], { date: daysAgo(4) }))).rejects.toMatchObject({
    messageKey: 'attendance.errors.locked',
  });
  expect(await getAttendanceSheet(admin, sectionId, daysAgo(4))).toMatchObject({ state: 'locked', submitted: true });
});

it('lets only the class teacher take a section’s attendance', async () => {
  const teacher = { role: 'teacher', scope: 'assigned' } as const;
  const theirs = context(admin.schoolId, { ...teacher, staffId: classTeacher });
  const another = context(admin.schoolId, { ...teacher, staffId: new Types.ObjectId() });

  await expect(submitAttendance(another, sheet([], { date: daysAgo(5) }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await getAttendanceSheet(another, sectionId, TODAY)).toBeNull();
  await expect(submitAttendance(theirs, sheet([], { date: daysAgo(5) }))).resolves.toMatchObject({
    summary: { present: 3 },
  });
});

it('refuses a section from another school', async () => {
  await expect(submitAttendance(admin, sheet([], { sectionId: otherSectionId }))).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(await getAttendanceSheet(admin, otherSectionId, TODAY)).toBeNull();
});

it('takes period attendance only for a period on the timetable, by the teacher who teaches it', async () => {
  const section = await Section.findOne({ schoolId: admin.schoolId, _id: sectionId }).orFail().lean();
  const subjectTeacher = new Types.ObjectId();
  await TimetableSlot.create({
    schoolId: admin.schoolId,
    branchId: section.branchId,
    academicYearId: section.academicYearId,
    sectionId: section._id,
    day: weekdayOf(TODAY) || 7,
    period: 2,
    subjectId: new Types.ObjectId(),
    teacherId: subjectTeacher,
  });
  // The timetable runs Monday to Saturday; on a Sunday there is no period to take, which is the rule under test.
  if (weekdayOf(TODAY) === 0) {
    await expect(submitAttendance(admin, sheet([], { mode: 'period', period: 2 }))).rejects.toMatchObject({
      code: 'BUSINESS_RULE',
    });
    return;
  }
  const teacher = { role: 'teacher', scope: 'assigned' } as const;
  const teaches = context(admin.schoolId, { ...teacher, staffId: subjectTeacher });
  const homeroom = context(admin.schoolId, { ...teacher, staffId: classTeacher });
  const period = (overrides: Record<string, unknown> = {}) => sheet(['absent'], { mode: 'period', period: 2, ...overrides });

  await expect(submitAttendance(admin, period({ period: 5 }))).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await expect(submitAttendance(homeroom, period())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(submitAttendance(teaches, sheet([]))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(submitAttendance(teaches, period())).resolves.toMatchObject({ summary: { absent: 1, present: 2 } });

  expect(await getAttendanceSheet(teaches, sectionId, TODAY)).toMatchObject({
    period: 2,
    canDaily: false,
    submitted: true,
    students: [{ status: 'absent' }, { status: 'present' }, { status: 'present' }],
  });
  const daily = await getAttendanceSheet(homeroom, sectionId, TODAY);
  expect(daily).toMatchObject({ period: null, canDaily: true, periods: [] });
  expect(await AttendanceRecord.countDocuments({ schoolId: admin.schoolId, sectionId, date: TODAY, mode: 'period' })).toBe(1);
});

it('lets a past day be corrected only as a correction, and only if it was taken', async () => {
  const past = daysAgo(5);
  const principal = context(admin.schoolId, { role: 'principal' });
  await expect(submitAttendance(admin, sheet(['absent'], { date: past }))).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect(await getAttendanceSheet(admin, sectionId, past)).toMatchObject({ state: 'locked', correcting: false });
  expect(await getAttendanceSheet(principal, sectionId, past)).toMatchObject({ state: 'open', correcting: true });

  await expect(submitAttendance(principal, sheet(['absent', 'absent'], { date: past }), true)).resolves.toMatchObject({
    summary: { absent: 2, present: 1 },
    before: { present: 3 },
  });
  const record = await AttendanceRecord.findOne({ schoolId: admin.schoolId, sectionId, date: past, mode: 'daily' }).lean();
  expect(record?.editedAfterSubmit).toBe(true);
  await expect(submitAttendance(principal, sheet([], { date: daysAgo(40) }), true)).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
});

it('reports attendance for the sections a person may see, and nothing of another school', async () => {
  const section = await Section.findOne({ schoolId: admin.schoolId, _id: sectionId }).orFail().lean();
  await AcademicYear.create({
    _id: section.academicYearId,
    schoolId: admin.schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const report = await getAttendanceReport(admin, undefined, undefined);
  expect(report.to).toBe(todayIn('Asia/Kolkata'));
  expect(report.percent).toBeGreaterThan(0);
  expect(report.sections.map((section) => section.id)).toContain(sectionId);
  expect(report.low.every((student) => student.percent < 75)).toBe(true);

  const reversed = await getAttendanceReport(admin, '2030-01-01', '2020-01-01');
  expect(reversed).toMatchObject({ from: '2020-01-01', to: '2020-01-01', percent: null, sections: [] });
  const elsewhere = await getAttendanceReport({ ...admin, schoolId: new Types.ObjectId() }, undefined, undefined);
  expect(elsewhere).toMatchObject({ percent: null, sections: [], low: [] });
});
