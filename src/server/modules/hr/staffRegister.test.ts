import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Holiday } from '@/server/models/holiday';
import { School } from '@/server/models/school';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { getStaffRegister } from './staffRegister';

const schoolId = new Types.ObjectId();
const branchId = new Types.ObjectId();
const ctx: RequestContext = { userId: new Types.ObjectId(), name: 'Office', role: 'school_admin', scope: 'school', schoolId };
const staffId = new Types.ObjectId();

beforeAll(async () => {
  await connectDb();
  await School.collection.insertOne({ _id: schoolId, name: 'S', code: `S${Date.now()}`, timezone: 'Asia/Kolkata', settings: { workingDays: [1, 2, 3, 4, 5] } });
  await Staff.collection.insertOne({ _id: staffId, schoolId, branchId, name: 'Meena', employeeNo: 'EMP-0001', status: 'active', deletedAt: null });
  await Holiday.collection.insertOne({ schoolId, date: '2026-09-02', name: 'Fest', deletedAt: null });
  const mark = (date: string, status: string) => ({ schoolId, branchId, staffId, date, status, source: 'manual', deletedAt: null });
  await StaffAttendance.collection.insertMany([mark('2026-09-01', 'present'), mark('2026-09-03', 'half_day'), mark('2026-09-04', 'absent'), mark('2026-09-07', 'leave')]);
});

afterAll(async () => {
  await Promise.all([School, Staff, Holiday, StaffAttendance].map((model) => model.collection.deleteMany({ schoolId: { $in: [schoolId] } })));
  await School.collection.deleteMany({ _id: schoolId });
  await mongoose.disconnect();
});

it('lays a month out as a row per staff member, counting a half day as half present', async () => {
  const register = await getStaffRegister(ctx, '2026-09');
  expect(register.days).toHaveLength(30);
  expect(register.days.find((day) => day.date === '2026-09-02')?.kind).toBe('holiday');
  expect(register.days.find((day) => day.date === '2026-09-05')?.kind).toBe('nonWorking');
  expect(register.staff).toMatchObject([{ name: 'Meena', present: 1.5, absent: 1, leave: 1 }]);
  expect((await getStaffRegister({ ...ctx, schoolId: new Types.ObjectId() }, '2026-09')).staff).toEqual([]);
});
