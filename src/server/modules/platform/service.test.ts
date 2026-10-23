import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Branch } from '@/server/models/branch';
import { Session } from '@/server/models/session';
import { User } from '@/server/models/user';
import { createSchool, getPlatformSummary, getSchool, listSchools, resetAdminPassword, SchoolInput, setSchoolStatus } from './service';

const stamp = Date.now().toString(36).slice(-5).toUpperCase();
const input = SchoolInput.parse({
  name: `Green Valley ${stamp}`,
  code: `GV${stamp}`,
  board: 'CBSE',
  plan: 'starter',
  address: { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' },
  admin: { name: 'Meena Joshi', email: `admin-${stamp.toLowerCase()}@school.example` },
});
let schoolId = '';

beforeAll(async () => {
  await connectDb();
  await Promise.all([User, Session].map((model) => model.init()));
});

afterAll(() => mongoose.disconnect());

it('validates the school and its first admin', () => {
  expect(SchoolInput.safeParse({ ...input, code: 'ab' }).success).toBe(false);
  expect(SchoolInput.safeParse({ ...input, address: { ...input.address, pincode: '12' } }).success).toBe(false);
  expect(SchoolInput.safeParse({ ...input, admin: { ...input.admin, email: 'nope' } }).success).toBe(false);
});

it('sets a school up with a campus, the current year and a first admin, once', async () => {
  const created = await createSchool(input, new Date('2026-10-21T00:00:00Z'));
  schoolId = String(created.id);
  expect(created.password).toHaveLength(14);

  const school = await getSchool(schoolId);
  expect(school).toMatchObject({ name: input.name, status: 'onboarding', students: 0, plan: 'starter' });
  expect(school?.admins).toMatchObject([{ name: 'Meena Joshi', email: input.admin.email, status: 'active' }]);
  expect(await Branch.countDocuments({ schoolId, isDefault: true })).toBe(1);
  expect(await AcademicYear.findOne({ schoolId, status: 'current' }).lean()).toMatchObject({
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
  });

  await expect(createSchool(input)).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(createSchool({ ...input, code: `GX${stamp}` })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await listSchools({})).rows.some((row) => row.id === schoolId)).toBe(true);
  expect((await getPlatformSummary()).schools.onboarding).toBeGreaterThan(0);
});

it('switches a school on, and suspends it by signing its people out', async () => {
  expect(await setSchoolStatus({ id: schoolId, status: 'active', reason: '' })).toMatchObject({ before: 'onboarding' });
  await expect(setSchoolStatus({ id: schoolId, status: 'active', reason: '' })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(setSchoolStatus({ id: schoolId, status: 'suspended', reason: '' })).rejects.toMatchObject({ code: 'VALIDATION' });

  const admin = await User.findOne({ email: input.admin.email }).lean();
  await Session.create({
    sessionToken: `t-${stamp}`,
    userId: admin?._id ?? new Types.ObjectId(),
    activeRole: 'school_admin',
    activeSchoolId: new Types.ObjectId(schoolId),
    expires: new Date(Date.now() + 60_000),
  });
  await setSchoolStatus({ id: schoolId, status: 'suspended', reason: 'Unpaid invoice' });
  expect(await Session.countDocuments({ activeSchoolId: schoolId })).toBe(0);
  expect((await getSchool(schoolId))?.status).toBe('suspended');
  await expect(setSchoolStatus({ id: String(new Types.ObjectId()), status: 'active', reason: '' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('gives a locked-out school admin a new temporary password, only for that school', async () => {
  const admin = await User.findOne({ email: input.admin.email }).select('+passwordHash').lean();
  const result = await resetAdminPassword(schoolId, String(admin?._id));
  expect(result.password).toHaveLength(14);
  expect((await User.findById(admin?._id).select('+passwordHash').lean())?.passwordHash).not.toBe(admin?.passwordHash);
  await expect(resetAdminPassword(String(new Types.ObjectId()), String(admin?._id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
