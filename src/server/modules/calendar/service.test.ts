import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Enrollment } from '@/server/models/enrollment';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { getRegister } from '@/server/modules/attendance/queries';
import { submitAttendance } from '@/server/modules/attendance/service';
import { addHoliday, listHolidays, removeHoliday } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
const TODAY = todayIn('Asia/Kolkata');
const students = [new Types.ObjectId(), new Types.ObjectId()];
let ctx: RequestContext;
let other: RequestContext;
let sectionId: string;

async function seedSchool(code: string): Promise<RequestContext> {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: `School ${code}`,
    code,
    board: 'CBSE',
    address: ADDRESS,
    settings: { workingDays: [0, 1, 2, 3, 4, 5, 6] },
  });
  return { userId: new Types.ObjectId(), name: 'Meena Joshi', role: 'school_admin', scope: 'school', schoolId: school._id };
}

const mark = (first: 'present' | 'absent' | 'late' | 'half_day', second: 'present' | 'absent') =>
  submitAttendance(ctx, {
    sectionId,
    date: TODAY,
    mode: 'daily',
    entries: [
      { studentId: String(students[0]), status: first },
      { studentId: String(students[1]), status: second },
    ],
    idempotencyKey: randomUUID(),
  });

beforeAll(async () => {
  await connectDb();
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  [ctx, other] = await Promise.all([seedSchool(`E${suffix}`), seedSchool(`F${suffix}`)]);
  const section = await Section.create({
    schoolId: ctx.schoolId,
    branchId: new Types.ObjectId(),
    academicYearId: new Types.ObjectId(),
    classId: new Types.ObjectId(),
    name: 'A',
    displayName: '6-A',
  });
  sectionId = String(section._id);
  await Enrollment.insertMany(
    students.map((studentId, index) => ({
      schoolId: ctx.schoolId,
      branchId: section.branchId,
      studentId,
      academicYearId: section.academicYearId,
      classId: section.classId,
      sectionId: section._id,
      rollNo: index + 1,
    })),
  );
});

afterAll(() => mongoose.disconnect());

it('shows each student’s marks, totals and attendance % for the month', async () => {
  await mark('half_day', 'absent');
  const register = await getRegister(ctx, sectionId, TODAY.slice(0, 7));
  const day = register?.days.find(({ date }) => date === TODAY);
  expect(day).toMatchObject({ kind: 'working', taken: true });
  expect(register?.students).toEqual([
    expect.objectContaining({ rollNo: 1, marks: { [TODAY]: 'half_day' }, present: 0, absent: 0, percent: 50 }),
    expect.objectContaining({ rollNo: 2, marks: { [TODAY]: 'absent' }, present: 0, absent: 1, percent: 0 }),
  ]);
  expect(await getRegister(other, sectionId, undefined)).toBeNull();
});

it('adds a holiday, warns about attendance already taken, and refuses a second one on the same day', async () => {
  const holiday = await addHoliday(ctx, { date: TODAY, name: 'Founders’ Day' });
  expect(holiday.affectedAttendanceRecords).toBe(1);
  await expect(addHoliday(ctx, { date: TODAY, name: 'Again' })).rejects.toMatchObject({ code: 'CONFLICT' });

  expect(await listHolidays(ctx)).toEqual([expect.objectContaining({ date: TODAY, name: 'Founders’ Day' })]);
  expect(await listHolidays(other)).toEqual([]);
  const register = await getRegister(ctx, sectionId, undefined);
  expect(register?.days.find(({ date }) => date === TODAY)?.kind).toBe('holiday');
  await expect(mark('present', 'present')).rejects.toMatchObject({ messageKey: 'attendance.errors.holiday' });
});

it('lets attendance be taken again once the holiday is deleted, and hides it from other schools', async () => {
  const [holiday] = await listHolidays(ctx);
  await expect(removeHoliday(other, holiday?.id ?? '')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await removeHoliday(ctx, holiday?.id ?? '');
  expect(await listHolidays(ctx)).toEqual([]);
  await expect(mark('present', 'present')).resolves.toMatchObject({ summary: { present: 2 } });
});
