import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Branch } from '@/server/models/branch';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { Section } from '@/server/models/section';
import { listSections } from './queries';
import { ClassInput, SectionInput } from './schemas';
import { createClass, createSection } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };

async function seedSchool(): Promise<RequestContext> {
  const schoolId = new Types.ObjectId();
  await Branch.create({ schoolId, name: 'Main campus', code: 'MAIN', address: ADDRESS, isDefault: true });
  await AcademicYear.create({ schoolId, label: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'current' });
  return { userId: new Types.ObjectId(), name: 'Meena Joshi', role: 'school_admin', scope: 'school', schoolId };
}

let ctx: RequestContext;
let other: RequestContext;

beforeAll(async () => {
  await connectDb();
  await Promise.all([Class, Section, AcademicYear, Branch].map((model) => model.init()));
  [ctx, other] = await Promise.all([seedSchool(), seedSchool()]);
});

afterAll(() => mongoose.disconnect());

it('validates class and section input', () => {
  expect(ClassInput.safeParse({ name: '', order: '25' }).success).toBe(false);
  expect(SectionInput.parse({ classId: 'a'.repeat(24), name: ' b ', capacity: '40' })).toMatchObject({
    name: 'B',
    capacity: 40,
    room: '',
  });
});

it('creates classes and refuses a second class with the same order', async () => {
  await createClass(ctx, { name: 'Class 7', order: 7 });
  await expect(createClass(ctx, { name: 'Class Seven', order: 7 })).rejects.toMatchObject({
    code: 'CONFLICT',
    messageKey: 'academics.classes.errors.orderTaken',
  });
  await expect(createClass(other, { name: 'Class 7', order: 7 })).resolves.toMatchObject({ name: 'Class 7' });
});

it('names sections from the class and refuses a duplicate', async () => {
  const nursery = await createClass(ctx, { name: 'Nursery', order: 1 });
  const seven = await Class.findOne({ schoolId: ctx.schoolId, order: 7 }).lean();
  const classId = String(seven?._id);

  expect(await createSection(ctx, { classId, name: 'B', capacity: 40, room: '204' })).toMatchObject({ name: '7-B' });
  expect(await createSection(ctx, { classId: String(nursery.id), name: 'A', capacity: 25, room: '' })).toMatchObject({
    name: 'Nursery-A',
  });
  await expect(createSection(ctx, { classId, name: 'B', capacity: 40, room: '' })).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

it('refuses a class from another school', async () => {
  const theirs = await Class.findOne({ schoolId: other.schoolId }).lean();
  await expect(
    createSection(ctx, { classId: String(theirs?._id), name: 'Z', capacity: 40, room: '' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('lists the school’s sections in class order with their strength', async () => {
  const section = await Section.findOne({ schoolId: ctx.schoolId, displayName: '7-B' }).lean();
  if (!section) throw new Error('expected 7-B');
  await Enrollment.create({
    schoolId: ctx.schoolId,
    branchId: section.branchId,
    studentId: new Types.ObjectId(),
    academicYearId: section.academicYearId,
    classId: section.classId,
    sectionId: section._id,
    rollNo: 1,
  });

  const rows = await listSections(ctx);
  expect(rows.map((row) => row.name)).toEqual(['Nursery-A', '7-B']);
  expect(rows[1]).toMatchObject({ className: 'Class 7', strength: 1, capacity: 40, room: '204' });
  expect(await listSections(other)).toEqual([]);
});
