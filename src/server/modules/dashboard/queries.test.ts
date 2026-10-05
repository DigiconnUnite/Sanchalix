import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Enrollment } from '@/server/models/enrollment';
import { FeeStructure } from '@/server/models/feeStructure';
import { Invoice } from '@/server/models/invoice';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { submitAttendance } from '@/server/modules/attendance/service';
import { collectPayment } from '@/server/modules/fees/paymentService';
import { getAttendanceToday, getFeesSummary } from './queries';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
const TODAY = todayIn('Asia/Kolkata');
const classTeacher = new Types.ObjectId();
const payer = new Types.ObjectId();
const students = [payer, new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
let admin: RequestContext;
let other: RequestContext;
let yearId: Types.ObjectId;
let sevenA: string;

const context = (schoolId: Types.ObjectId, overrides: Partial<RequestContext> = {}): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Test user',
  role: 'school_admin',
  scope: 'school',
  schoolId,
  ...overrides,
});

async function seedSchool(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: `School ${code}`,
    code,
    board: 'CBSE',
    address: ADDRESS,
    settings: { workingDays: [0, 1, 2, 3, 4, 5, 6] },
  });
  await AcademicYear.create({
    schoolId: school._id,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  return school._id;
}

async function addInvoice(dueDate: string, totalMinor: number) {
  const invoice = await Invoice.create({
    schoolId: admin.schoolId,
    branchId: new Types.ObjectId(),
    academicYearId: yearId,
    invoiceNo: `INV/2026-27/${randomUUID().slice(0, 6)}`,
    studentId: payer,
    feeStructureId: new Types.ObjectId(),
    installmentId: new Types.ObjectId(),
    installmentLabel: 'Q1',
    lines: [{ feeHeadId: new Types.ObjectId(), description: 'Tuition', amountMinor: totalMinor, taxMinor: 0 }],
    totalMinor,
    balanceMinor: totalMinor,
    dueDate,
  });
  return String(invoice._id);
}

beforeAll(async () => {
  await connectDb();
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  admin = context(await seedSchool(`G${suffix}`));
  other = context(await seedSchool(`H${suffix}`));
  const year = await AcademicYear.findOne({ schoolId: admin.schoolId }).lean();
  if (!year) throw new Error('expected a year');
  yearId = year._id;

  const section = (name: string, teacher?: Types.ObjectId) =>
    Section.create({
      schoolId: admin.schoolId,
      branchId: new Types.ObjectId(),
      academicYearId: yearId,
      classId: new Types.ObjectId(),
      name,
      displayName: `7-${name}`,
      ...(teacher && { classTeacherId: teacher }),
    });
  const [a, b] = await Promise.all([section('A', classTeacher), section('B')]);
  sevenA = String(a._id);
  await Enrollment.insertMany(
    students.map((studentId, index) => ({
      schoolId: admin.schoolId,
      branchId: a.branchId,
      studentId,
      academicYearId: yearId,
      classId: a.classId,
      sectionId: index < 2 ? a._id : b._id,
      rollNo: index + 1,
    })),
  );
});

afterAll(() => mongoose.disconnect());

it('reports nothing taken, then the percentage and the sections still pending', async () => {
  const before = await getAttendanceToday(admin);
  expect(before).toMatchObject({ state: 'open', sections: 2, submitted: 0, percent: null });
  expect(before.firstPending?.name).toBe('7-A');

  await submitAttendance(admin, {
    sectionId: sevenA,
    date: TODAY,
    mode: 'daily',
    entries: [
      { studentId: String(students[0]), status: 'half_day' },
      { studentId: String(students[1]), status: 'absent' },
    ],
    idempotencyKey: randomUUID(),
  });
  const after = await getAttendanceToday(admin);
  expect(after).toMatchObject({ sections: 2, submitted: 1, absent: 1, percent: 25 });
  expect(after.firstPending?.name).toBe('7-B');
});

it('limits a teacher to their own section and shows other schools nothing', async () => {
  const teacher = context(admin.schoolId, { role: 'teacher', scope: 'assigned', staffId: classTeacher });
  expect(await getAttendanceToday(teacher)).toMatchObject({ sections: 1, submitted: 1, firstPending: null });
  expect(await getAttendanceToday(other)).toMatchObject({ sections: 0, submitted: 0, percent: null });
});

it('sums today’s collection, what is overdue and the drafts waiting for approval', async () => {
  const yesterday = todayIn('Asia/Kolkata', new Date(Date.now() - 86_400_000));
  const overdue = await addInvoice(yesterday, 500_000);
  await addInvoice(TODAY, 900_000);
  await FeeStructure.create({ schoolId: admin.schoolId, academicYearId: yearId, classIds: [new Types.ObjectId()], name: 'Draft' });

  await collectPayment(admin, {
    studentId: String(students[0]),
    allocations: [{ invoiceId: overdue, amountMinor: 200_000 }],
    method: 'cash',
    idempotencyKey: randomUUID(),
  });

  expect(await getFeesSummary(admin)).toEqual({
    collectedTodayMinor: 200_000,
    receiptsToday: 1,
    collectedMonthMinor: 200_000,
    overdueMinor: 300_000,
    overdueInvoices: 1,
    draftStructures: 1,
  });
  expect(await getFeesSummary(other)).toMatchObject({ collectedTodayMinor: 0, overdueMinor: 0, draftStructures: 0 });
});
