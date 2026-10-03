import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { getStudent } from './queries';
import { StudentInput } from './schemas';
import { createStudent } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' };
let ctx: RequestContext;
let otherSchool: RequestContext;
let sectionId: string;
let otherSectionId: string;

async function seedSchool(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: `School ${code}`,
    code,
    board: 'CBSE',
    address: { ...ADDRESS, country: 'IN' },
  });
  const schoolId = school._id;
  const year = await AcademicYear.create({ schoolId, label: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31' });
  const section = await Section.create({
    schoolId,
    branchId: new Types.ObjectId(),
    academicYearId: year._id,
    classId: new Types.ObjectId(),
    name: 'B',
    displayName: '7-B',
  });
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Meena Joshi',
    role: 'school_admin',
    scope: 'school',
    schoolId,
  };
  return { context, sectionId: String(section._id) };
}

const input = (overrides: Record<string, unknown> = {}) =>
  StudentInput.parse({
    firstName: ' Aarav ',
    lastName: 'Sharma',
    dob: '2014-05-15',
    gender: 'male',
    sectionId,
    guardians: [{ name: 'Sunita Sharma', relation: 'mother', phone: '9876543210', email: '' }],
    address: ADDRESS,
    ...overrides,
  });

beforeAll(async () => {
  await connectDb();
  await Promise.all([Student, Guardian, Enrollment, Section, AcademicYear, School].map((model) => model.init()));
  ({ context: ctx, sectionId } = await seedSchool(`A${Date.now().toString(36).slice(-5).toUpperCase()}`));
  ({ context: otherSchool, sectionId: otherSectionId } = await seedSchool(
    `B${Date.now().toString(36).slice(-5).toUpperCase()}`,
  ));
});

afterAll(() => mongoose.disconnect());

it('rejects a bad phone, a future date of birth and a missing name with field-level messages', () => {
  const result = StudentInput.safeParse({
    firstName: '',
    dob: '2999-01-01',
    gender: 'male',
    sectionId,
    guardians: [{ name: 'Sunita', relation: 'mother', phone: '12345' }],
    address: ADDRESS,
  });
  const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  expect(paths).toEqual(expect.arrayContaining(['firstName', 'dob', 'guardians.0.phone']));
});

it('creates the student, guardian and enrollment with the next admission and roll numbers', async () => {
  const first = await createStudent(ctx, input());
  const second = await createStudent(ctx, input({ firstName: 'Diya' }));
  expect(first.admissionNo).toMatch(/^A\w{5}-2026-00001$/);
  expect(second.admissionNo).toMatch(/-2026-00002$/);

  const profile = await getStudent(ctx, String(second.id));
  expect(profile).toMatchObject({ name: 'Diya Sharma', classSection: '7-B', rollNo: 2, status: 'active' });
  expect(profile?.guardians).toEqual([
    expect.objectContaining({ name: 'Sunita Sharma', phone: '+919876543210', email: null, isPrimary: true }),
  ]);
});

it('links siblings to the same guardian by phone instead of duplicating the parent', async () => {
  const guardians = await Guardian.find({ schoolId: ctx.schoolId, phone: '+919876543210' }).lean();
  expect(guardians).toHaveLength(1);
  expect(guardians[0]?.studentIds).toHaveLength(2);
});

it('refuses a section from another school and writes nothing', async () => {
  const before = await Student.countDocuments({ schoolId: ctx.schoolId });
  await expect(createStudent(ctx, input({ sectionId: otherSectionId }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await Student.countDocuments({ schoolId: ctx.schoolId })).toBe(before);
  expect(await Student.countDocuments({ schoolId: otherSchool.schoolId })).toBe(0);
});

it('rolls back the admission number when the write fails part-way', async () => {
  const original = Student.create;
  Student.create = (() => Promise.reject(new Error('disk full'))) as unknown as typeof Student.create;
  const newParent = { guardians: [{ name: 'Rajesh Mehta', relation: 'father', phone: '9123456780' }] };
  await expect(createStudent(ctx, input({ firstName: 'Kabir', ...newParent }))).rejects.toThrow('disk full');
  Student.create = original;

  expect(await Guardian.countDocuments({ schoolId: ctx.schoolId, phone: '+919123456780' })).toBe(0);
  const next = await createStudent(ctx, input({ firstName: 'Kabir' }));
  expect(next.admissionNo).toMatch(/-2026-00003$/);
});

it('hides a student from another school', async () => {
  const student = await Student.findOne({ schoolId: ctx.schoolId, firstName: 'Aarav' }).lean();
  expect(await getStudent(otherSchool, String(student?._id))).toBeNull();
  expect(await getStudent(ctx, 'not-an-id')).toBeNull();
});
