import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { FeeHead } from '@/server/models/feeHead';
import { Invoice } from '@/server/models/invoice';
import { Student } from '@/server/models/student';
import { listFeeStructures, listInvoices } from './queries';
import { FeeHeadInput, FeeStructureInput } from './schemas';
import { approveFeeStructure, createFeeHead, createFeeStructure } from './service';
import { FeeStructure } from '@/server/models/feeStructure';

let ctx: RequestContext;
let other: RequestContext;
let classId: string;
let tuition: string;
let transport: string;

async function seedSchool(studentCount: number) {
  const schoolId = new Types.ObjectId();
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const branchId = new Types.ObjectId();
  const schoolClass = await Class.create({ schoolId, branchId, academicYearId: year._id, name: 'Class 7', order: 7 });
  for (let rollNo = 1; rollNo <= studentCount; rollNo += 1) {
    const studentId = new Types.ObjectId();
    const guardianId = new Types.ObjectId();
    await Student.create({
      _id: studentId,
      schoolId,
      branchId,
      admissionNo: `ADM-${rollNo}`,
      firstName: 'Aarav',
      lastName: `Sharma${rollNo}`,
      dob: '2014-05-15',
      gender: 'male',
      guardianIds: [guardianId],
      primaryGuardianId: guardianId,
    });
    await Enrollment.create({
      schoolId,
      branchId,
      studentId,
      academicYearId: year._id,
      classId: schoolClass._id,
      sectionId: new Types.ObjectId(),
      rollNo,
    });
  }
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Ramesh Gupta',
    role: 'accountant',
    scope: 'school',
    schoolId,
  };
  return { context, classId: String(schoolClass._id) };
}

const structureInput = (overrides: Record<string, unknown> = {}) =>
  FeeStructureInput.parse({
    name: 'Class 7, 2026–27',
    classIds: [classId],
    lines: [
      { feeHeadId: tuition, amountMinor: '1000.01' },
      { feeHeadId: transport, amountMinor: '600' },
    ],
    installments: [
      { label: 'Q1', dueDate: '2026-04-10', percent: '33' },
      { label: 'Q2', dueDate: '2026-07-10', percent: '33' },
      { label: 'Q3', dueDate: '2026-10-10', percent: '34' },
    ],
    ...overrides,
  });

beforeAll(async () => {
  await connectDb();
  await Promise.all([FeeHead.init(), Invoice.init()]);
  ({ context: ctx, classId } = await seedSchool(2));
  ({ context: other } = await seedSchool(1));
  tuition = String((await createFeeHead(ctx, FeeHeadInput.parse({ name: 'Tuition', code: 'tui', gstRate: '0' }))).id);
  transport = String((await createFeeHead(ctx, FeeHeadInput.parse({ name: 'Transport', code: 'TRN', gstRate: '5' }))).id);
});

afterAll(() => mongoose.disconnect());

it('refuses a second fee head with the same code, but allows it in another school', async () => {
  await expect(createFeeHead(ctx, FeeHeadInput.parse({ name: 'Tuition 2', code: 'TUI', gstRate: '0' }))).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(createFeeHead(other, FeeHeadInput.parse({ name: 'Tuition', code: 'TUI', gstRate: '0' }))).resolves.toBeTruthy();
});

it('validates amounts, duplicate heads and the 100% installment rule', () => {
  const invalid = (overrides: Record<string, unknown>) => {
    const result = FeeStructureInput.safeParse({ ...structureRaw(), ...overrides });
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };
  const structureRaw = () => ({
    name: 'X',
    classIds: [classId],
    lines: [{ feeHeadId: tuition, amountMinor: '100' }],
    installments: [{ label: 'Q1', dueDate: '2026-04-10', percent: '100' }],
  });
  expect(invalid({})).toEqual([]);
  expect(invalid({ lines: [{ feeHeadId: tuition, amountMinor: '12,500' }] })).toContain('fees.errors.amount');
  expect(invalid({ lines: [structureRaw().lines[0], structureRaw().lines[0]] })).toContain('fees.errors.duplicateHead');
  expect(invalid({ installments: [{ label: 'Q1', dueDate: '2026-04-10', percent: '90' }] })).toContain(
    'fees.errors.percentTotal',
  );
});

it('rejects classes and fee heads that belong to another school', async () => {
  await expect(createFeeStructure(other, structureInput())).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('issues one invoice per student per installment, with exact totals, GST and gap-free numbers', async () => {
  const draft = await createFeeStructure(ctx, structureInput());
  expect(await Invoice.countDocuments({ schoolId: ctx.schoolId })).toBe(0);

  const approved = await approveFeeStructure({ ...ctx, role: 'principal' }, String(draft.id));
  expect(approved.invoicesIssued).toBe(6);

  const invoices = await Invoice.find({ schoolId: ctx.schoolId }).sort({ invoiceNo: 1 }).lean();
  expect(invoices.map((invoice) => invoice.invoiceNo)).toEqual(
    [1, 2, 3, 4, 5, 6].map((n) => `INV/2026-27/00000${n}`),
  );

  const oneStudent = invoices.filter((invoice) => invoice.studentId.equals(invoices[0]?.studentId));
  expect(oneStudent.map((invoice) => invoice.installmentLabel)).toEqual(['Q1', 'Q2', 'Q3']);
  const tuitionParts = oneStudent.map((invoice) => invoice.lines[0]?.amountMinor);
  expect(tuitionParts).toEqual([33_000, 33_000, 34_001]);
  expect(oneStudent.map((invoice) => invoice.lines[1])).toEqual([
    expect.objectContaining({ amountMinor: 19_800, taxMinor: 990 }),
    expect.objectContaining({ amountMinor: 19_800, taxMinor: 990 }),
    expect.objectContaining({ amountMinor: 20_400, taxMinor: 1_020 }),
  ]);
  for (const invoice of oneStudent) {
    expect(invoice.totalMinor).toBe(invoice.lines.reduce((sum, line) => sum + line.amountMinor + line.taxMinor, 0));
    expect(invoice).toMatchObject({ balanceMinor: invoice.totalMinor, paidMinor: 0, status: 'issued' });
  }
  expect(oneStudent.reduce((sum, invoice) => sum + invoice.totalMinor, 0)).toBe(100_001 + 60_000 + 3_000);
});

it('cannot be approved twice, so nobody is billed twice', async () => {
  const [structure] = await listFeeStructures(ctx);
  expect(structure).toMatchObject({ status: 'active', totalMinor: 160_001, installments: 3, classes: 'Class 7' });
  await expect(approveFeeStructure(ctx, structure?.id ?? '')).rejects.toMatchObject({
    messageKey: 'fees.errors.alreadyApproved',
  });
  expect(await Invoice.countDocuments({ schoolId: ctx.schoolId })).toBe(6);
});

it('rolls back the approval and the invoice numbers when issuing fails', async () => {
  const draft = await createFeeStructure(ctx, structureInput({ name: 'Second structure' }));
  const original = Invoice.insertMany;
  Invoice.insertMany = (() => Promise.reject(new Error('disk full'))) as unknown as typeof Invoice.insertMany;
  await expect(approveFeeStructure(ctx, String(draft.id))).rejects.toThrow('disk full');
  Invoice.insertMany = original;

  expect((await FeeStructure.findOne({ schoolId: ctx.schoolId, _id: draft.id }).lean())?.status).toBe('draft');
  expect(await Invoice.countDocuments({ schoolId: ctx.schoolId })).toBe(6);
});

it('lists invoices for the school only, with the student and paging', async () => {
  const first = await listInvoices(ctx, { pageSize: 10 });
  expect(first.rows).toHaveLength(6);
  expect(first.rows[0]).toMatchObject({ invoiceNo: 'INV/2026-27/000001', installment: 'Q1', admissionNo: 'ADM-1' });
  expect((await listInvoices(ctx, { status: 'paid', pageSize: 10 })).rows).toEqual([]);
  expect((await listInvoices(other, { pageSize: 10 })).rows).toEqual([]);
  await expect(approveFeeStructure(other, first.rows[0]?.id ?? '')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
