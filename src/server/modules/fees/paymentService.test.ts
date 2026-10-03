import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { allocateInOrder } from '@/lib/allocate';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { Student } from '@/server/models/student';
import { collectPayment } from './paymentService';
import { getCounterStudent, getReceipt, searchStudents } from './queries';
import { CollectPayment } from './schemas';

let ctx: RequestContext;
let other: RequestContext;
let studentId: string;
let siblingId: string;
let yearId: Types.ObjectId;
const branchId = new Types.ObjectId();
let invoiceSeq = 0;

async function addStudent(schoolId: Types.ObjectId, firstName: string, admissionNo: string) {
  const guardianId = new Types.ObjectId();
  const student = await Student.create({
    schoolId,
    branchId,
    admissionNo,
    firstName,
    lastName: 'Sharma',
    dob: '2014-05-15',
    gender: 'male',
    guardianIds: [guardianId],
    primaryGuardianId: guardianId,
  });
  return String(student._id);
}

async function addInvoice(student: string, dueDate: string, totalMinor: number, schoolId = ctx.schoolId) {
  invoiceSeq += 1;
  const invoice = await Invoice.create({
    schoolId,
    branchId,
    academicYearId: yearId,
    invoiceNo: `INV/2026-27/${String(invoiceSeq).padStart(6, '0')}`,
    studentId: student,
    feeStructureId: new Types.ObjectId(),
    installmentId: new Types.ObjectId(),
    installmentLabel: `Q${invoiceSeq}`,
    lines: [{ feeHeadId: new Types.ObjectId(), description: 'Tuition', amountMinor: totalMinor, taxMinor: 0 }],
    totalMinor,
    balanceMinor: totalMinor,
    dueDate,
  });
  return String(invoice._id);
}

const pay = (allocations: { invoiceId: string; amountMinor: number }[], overrides: Record<string, unknown> = {}) =>
  CollectPayment.parse({ studentId, allocations, method: 'cash', idempotencyKey: randomUUID(), ...overrides });

const context = (schoolId: Types.ObjectId): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Ramesh Gupta',
  role: 'accountant',
  scope: 'school',
  schoolId,
});

beforeAll(async () => {
  await connectDb();
  await Promise.all([Payment.init(), Invoice.init()]);
  ctx = context(new Types.ObjectId());
  other = context(new Types.ObjectId());
  const year = await AcademicYear.create({
    schoolId: ctx.schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
  });
  yearId = year._id;
  studentId = await addStudent(ctx.schoolId, 'Aarav', 'VWN-2026-00001');
  siblingId = await addStudent(ctx.schoolId, 'Diya', 'VWN-2026-00002');
});

afterAll(() => mongoose.disconnect());

it('fills the oldest invoice first when a payment is spread over several', () => {
  const invoices = [
    { id: 'a', balanceMinor: 500 },
    { id: 'b', balanceMinor: 300 },
  ];
  expect(allocateInOrder(invoices, 600)).toEqual({
    allocations: [
      { invoiceId: 'a', amountMinor: 500 },
      { invoiceId: 'b', amountMinor: 100 },
    ],
    unallocatedMinor: 0,
  });
  expect(allocateInOrder(invoices, 900).unallocatedMinor).toBe(100);
});

it('requires a 6-digit cheque number for cheques', () => {
  const cheque = { studentId, allocations: [{ invoiceId: 'a'.repeat(24), amountMinor: 100 }], method: 'cheque', idempotencyKey: randomUUID() };
  expect(CollectPayment.safeParse({ ...cheque, reference: '12' }).success).toBe(false);
  expect(CollectPayment.safeParse({ ...cheque, reference: '123456' }).success).toBe(true);
});

it('takes a part payment, then the rest, with consecutive receipt numbers', async () => {
  const invoice = await addInvoice(studentId, '2026-04-10', 1_250_000);

  const first = await collectPayment(ctx, pay([{ invoiceId: invoice, amountMinor: 500_000 }]));
  expect(first.receiptNo).toBe('RCPT/2026-27/000001');
  expect(await Invoice.findOne({ schoolId: ctx.schoolId, _id: invoice }).lean()).toMatchObject({
    paidMinor: 500_000,
    balanceMinor: 750_000,
    status: 'partially_paid',
  });

  const second = await collectPayment(ctx, pay([{ invoiceId: invoice, amountMinor: 750_000 }], { method: 'upi', reference: 'UPI123' }));
  expect(second.receiptNo).toBe('RCPT/2026-27/000002');
  expect(await Invoice.findOne({ schoolId: ctx.schoolId, _id: invoice }).lean()).toMatchObject({
    paidMinor: 1_250_000,
    balanceMinor: 0,
    status: 'paid',
  });
});

it('creates one payment when the same request is sent twice, even at the same moment', async () => {
  const invoice = await addInvoice(studentId, '2026-07-10', 400_000);
  const request = pay([{ invoiceId: invoice, amountMinor: 400_000 }]);

  const [a, b] = await Promise.all([collectPayment(ctx, request), collectPayment(ctx, request)]);
  expect(a.receiptNo).toBe(b.receiptNo);
  const again = await collectPayment(ctx, request);
  expect(again).toMatchObject({ receiptNo: a.receiptNo, repeated: true });

  expect(await Payment.countDocuments({ schoolId: ctx.schoolId, idempotencyKey: request.idempotencyKey })).toBe(1);
  expect(await Invoice.findOne({ schoolId: ctx.schoolId, _id: invoice }).lean()).toMatchObject({ paidMinor: 400_000 });
});

it('refuses more than the balance and leaves no payment, no number and no change behind', async () => {
  const invoice = await addInvoice(studentId, '2026-10-10', 300_000);
  const receiptsBefore = await Payment.countDocuments({ schoolId: ctx.schoolId });

  await expect(collectPayment(ctx, pay([{ invoiceId: invoice, amountMinor: 300_001 }]))).rejects.toMatchObject({
    messageKey: 'fees.errors.overBalance',
  });
  expect(await Payment.countDocuments({ schoolId: ctx.schoolId })).toBe(receiptsBefore);
  expect(await Invoice.findOne({ schoolId: ctx.schoolId, _id: invoice }).lean()).toMatchObject({ paidMinor: 0 });

  const next = await collectPayment(ctx, pay([{ invoiceId: invoice, amountMinor: 300_000 }]));
  expect(next.receiptNo).toBe(`RCPT/2026-27/${String(receiptsBefore + 1).padStart(6, '0')}`);
});

it('rolls back the first invoice when a later one in the same payment fails', async () => {
  const good = await addInvoice(studentId, '2027-01-10', 100_000);
  const tooSmall = await addInvoice(studentId, '2027-01-11', 50_000);
  await expect(
    collectPayment(ctx, pay([{ invoiceId: good, amountMinor: 100_000 }, { invoiceId: tooSmall, amountMinor: 60_000 }])),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect(await Invoice.findOne({ schoolId: ctx.schoolId, _id: good }).lean()).toMatchObject({
    paidMinor: 0,
    status: 'issued',
  });
});

it('keeps receipt numbers unique and gap-free when many payments arrive together', async () => {
  const invoices = await Promise.all(Array.from({ length: 12 }, () => addInvoice(siblingId, '2026-04-10', 10_000)));
  const before = await Payment.countDocuments({ schoolId: ctx.schoolId });
  const results = await Promise.all(
    invoices.map((invoiceId) =>
      collectPayment(ctx, pay([{ invoiceId, amountMinor: 10_000 }], { studentId: siblingId })),
    ),
  );
  const numbers = results.map((result) => Number(result.receiptNo.slice(-6))).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 12 }, (_, index) => before + index + 1));
});

it('refuses another student’s invoice and another school’s invoice', async () => {
  const siblingInvoice = await addInvoice(siblingId, '2026-04-10', 10_000);
  await expect(collectPayment(ctx, pay([{ invoiceId: siblingInvoice, amountMinor: 10_000 }]))).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(
    collectPayment(other, pay([{ invoiceId: siblingInvoice, amountMinor: 10_000 }], { studentId: siblingId })),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('shows the counter only open invoices, oldest first, and finds students by name or admission number', async () => {
  const counter = await getCounterStudent(ctx, studentId);
  expect(counter?.invoices.map((invoice) => invoice.dueDate)).toEqual(['2027-01-10', '2027-01-11']);
  expect(counter?.totalDueMinor).toBe(150_000);
  expect(await getCounterStudent(other, studentId)).toBeNull();

  expect((await searchStudents(ctx, 'aar')).map((match) => match.name)).toEqual(['Aarav Sharma']);
  expect((await searchStudents(ctx, 'vwn-2026-00002')).map((match) => match.name)).toEqual(['Diya Sharma']);
  expect(await searchStudents(ctx, 'a')).toEqual([]);
  expect(await searchStudents(ctx, '.*')).toEqual([]);
  expect(await searchStudents(other, 'Aarav')).toEqual([]);
});

it('cannot change a receipt’s amount or number after it is written', async () => {
  const payment = await Payment.findOne({ schoolId: ctx.schoolId, receiptNo: 'RCPT/2026-27/000001' });
  if (!payment) throw new Error('expected the first receipt');
  await Payment.updateOne({ schoolId: ctx.schoolId, _id: payment._id }, { amountMinor: 1, receiptNo: 'X' });
  const receipt = await getReceipt(ctx, String(payment._id));
  expect(receipt).toMatchObject({ receiptNo: 'RCPT/2026-27/000001', amountMinor: 500_000, studentName: 'Aarav Sharma' });
  expect(receipt?.allocations).toEqual([expect.objectContaining({ amountMinor: 500_000 })]);
  expect(await getReceipt(other, String(payment._id))).toBeNull();
});
