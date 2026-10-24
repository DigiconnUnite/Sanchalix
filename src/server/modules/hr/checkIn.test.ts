import { URL } from 'node:url';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Holiday } from '@/server/models/holiday';
import { School } from '@/server/models/school';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { checkInStaff, checkInUrl } from './checkIn';

let ctx: RequestContext;
let other: RequestContext;
let schoolId: Types.ObjectId;
const tokenOf = (id: Types.ObjectId, date: string) => new URL(checkInUrl(String(id), date)).searchParams.get('s') ?? '';

async function seed(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: code,
    code,
    board: 'CBSE',
    address: { line1: '1 Road', city: 'Bhopal', state: 'MP', pincode: '462001', country: 'IN' },
    // Every day is a working day, so the test doesn't depend on the weekday it runs.
    settings: { workingDays: [0, 1, 2, 3, 4, 5, 6] },
  });
  const member = await Staff.create({
    schoolId: school._id,
    branchId: new Types.ObjectId(),
    employeeNo: 'EMP-0001',
    name: 'Meena Joshi',
    phone: '+919810000001',
    designation: 'TGT',
    type: 'teaching',
    joinedOn: '2024-04-01',
  });
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Meena Joshi',
    role: 'teacher',
    scope: 'assigned',
    schoolId: school._id,
    staffId: member._id,
  };
  return { context, school };
}

beforeAll(async () => {
  await connectDb();
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const first = await seed(`K${stamp}`);
  ctx = first.context;
  schoolId = first.school._id;
  other = (await seed(`L${stamp}`)).context;
});

afterAll(() => mongoose.disconnect());

it('marks a staff member present from today’s code, once, and keeps the first arrival', async () => {
  const today = todayIn('Asia/Kolkata');
  const token = tokenOf(schoolId, today);

  await expect(checkInStaff(ctx, { token: tokenOf(schoolId, '2020-01-01') })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(checkInStaff(ctx, { token: tokenOf(other.schoolId, today) })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(checkInStaff({ ...ctx, staffId: undefined as never }, { token })).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const first = await checkInStaff(ctx, { token });
  expect(first).toMatchObject({ already: false, date: today });
  const second = await checkInStaff(ctx, { token });
  expect(second).toMatchObject({ already: true });
  expect(second.at.getTime()).toBe(first.at.getTime());
  expect(await StaffAttendance.find({ schoolId, date: today }).lean()).toMatchObject([{ status: 'present', source: 'qr' }]);
});

it('turns an absence the office entered into present, and refuses a holiday', async () => {
  const today = todayIn('Asia/Kolkata');
  await StaffAttendance.updateOne({ schoolId, staffId: ctx.staffId ?? new Types.ObjectId(), date: today }, { $unset: { checkIn: 1 }, status: 'absent', source: 'manual' });
  await checkInStaff(ctx, { token: tokenOf(schoolId, today) });
  expect(await StaffAttendance.findOne({ schoolId, date: today }).lean()).toMatchObject({ status: 'present', source: 'qr' });

  await Holiday.create({ schoolId: other.schoolId, date: today, name: 'Closed' });
  await expect(checkInStaff(other, { token: tokenOf(other.schoolId, today) })).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
});
