import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Discount } from '@/server/models/discount';
import { Enrollment } from '@/server/models/enrollment';
import { FeeHead } from '@/server/models/feeHead';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { School } from '@/server/models/school';
import { Staff } from '@/server/models/staff';
import { Student } from '@/server/models/student';
import {
  decideStudentDiscount,
  getDiscountRules,
  priceInvoice,
  requestStudentDiscount,
  runFeeUpkeep,
  setAutomaticDiscounts,
  setLateFeeRule,
  StudentDiscount,
  withdrawStudentDiscount,
} from './discounts';
import { importOpeningBalances, OPENING_BALANCE_COLUMNS } from './openingBalances';
import { FeeHeadInput, FeeStructureInput } from './schemas';
import { approveFeeStructure, createFeeHead, createFeeStructure } from './service';

let ctx: RequestContext;
let classId: string;
let tuition: string;
let transport: string;
let issued: string;
const NAMES = { sibling: 'Sibling discount', staff_ward: 'Staff ward discount' };

const structure = (name: string, dueDate = '2026-04-10') =>
  FeeStructureInput.parse({
    name,
    classIds: [classId],
    lines: [
      { feeHeadId: tuition, amountMinor: '10000' },
      { feeHeadId: transport, amountMinor: '2000' },
    ],
    installments: [{ label: 'Annual', dueDate, percent: '100' }],
  });
const invoiceOf = (admissionNo: string, feeStructureId: string) =>
  Student.findOne({ schoolId: ctx.schoolId, admissionNo })
    .orFail()
    .then((student) => Invoice.findOne({ schoolId: ctx.schoolId, studentId: student._id, feeStructureId }).orFail().lean());

beforeAll(async () => {
  await connectDb();
  await Promise.all([FeeHead.init(), Invoice.init()]);
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: `Fees ${stamp}`,
    code: `F${stamp}`,
    board: 'CBSE',
    address: { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' },
  });
  const schoolId = school._id;
  const branchId = new Types.ObjectId();
  const year = await AcademicYear.create({ schoolId, label: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'current' });
  const schoolClass = await Class.create({ schoolId, branchId, academicYearId: year._id, name: 'Class 7', order: 7 });
  classId = String(schoolClass._id);

  // Two children of one parent (elder born 2012), one child of a staff member, one child with neither.
  const families = [
    { phone: '+919800000001', children: [['ELDER', '2012-01-10'], ['YOUNGER', '2014-06-01']] },
    { phone: '+919800000002', children: [['WARD', '2013-03-03']] },
    { phone: '+919800000003', children: [['PLAIN', '2013-04-04']] },
  ] as const;
  let rollNo = 0;
  for (const family of families) {
    const guardianId = new Types.ObjectId();
    const ids = family.children.map(() => new Types.ObjectId());
    await Guardian.create({ _id: guardianId, schoolId, name: 'Parent', relation: 'mother', phone: family.phone, studentIds: ids });
    for (const [index, [admissionNo, dob]] of family.children.entries()) {
      const studentId = ids[index] ?? new Types.ObjectId();
      await Student.create({
        _id: studentId,
        schoolId,
        branchId,
        admissionNo,
        firstName: admissionNo,
        dob,
        gender: 'female',
        guardianIds: [guardianId],
        primaryGuardianId: guardianId,
      });
      rollNo += 1;
      await Enrollment.create({ schoolId, branchId, studentId, academicYearId: year._id, classId, sectionId: new Types.ObjectId(), rollNo });
    }
  }
  await Staff.create({
    schoolId,
    branchId,
    employeeNo: 'EMP-0001',
    name: 'Kavita Rao',
    phone: '+919800000002',
    designation: 'TGT Science',
    type: 'teaching',
    joinedOn: '2020-06-01',
  });
  ctx = { userId: new Types.ObjectId(), name: 'Ramesh Gupta', role: 'accountant', scope: 'school', schoolId };
  tuition = String((await createFeeHead(ctx, FeeHeadInput.parse({ name: 'Tuition', code: 'TUI', gstRate: '18', discountable: true }))).id);
  transport = String((await createFeeHead(ctx, FeeHeadInput.parse({ name: 'Transport', code: 'TRN', gstRate: '5' }))).id);
});

afterAll(() => mongoose.disconnect());

it('takes discounts off discountable heads only, never more than they charge, and taxes what is left', () => {
  const [a, b] = [new Types.ObjectId(), new Types.ObjectId()];
  const lines = [
    { feeHeadId: a, description: 'Tuition', amountMinor: 100_000 },
    { feeHeadId: b, description: 'Transport', amountMinor: 20_000 },
  ];
  const headOf = (id: Types.ObjectId) => (id.equals(a) ? { gstRate: 18, discountable: true } : { gstRate: 5, discountable: false });
  const off = (type: 'percent' | 'fixed', value: number) => ({ id: new Types.ObjectId(), name: 'D', type, value });

  const half = priceInvoice(lines, headOf, [off('percent', 10), off('fixed', 30_000)], 50);
  expect(half.concessions.map((concession) => concession.amountMinor)).toEqual([10_000, 15_000]);
  expect(half.lines.map((line) => line.taxMinor)).toEqual([13_500, 1_000]);
  expect(half.totalMinor).toBe(100_000 + 20_000 + 13_500 + 1_000 - 25_000);

  const capped = priceInvoice(lines, headOf, [off('percent', 80), off('percent', 50)], 100);
  expect(capped.concessions.map((concession) => concession.amountMinor)).toEqual([80_000, 20_000]);
  expect(capped.totalMinor).toBe(20_000 + 1_000);
});

it('gives the younger sibling and the staff ward their discount when invoices are issued', async () => {
  await setAutomaticDiscounts(ctx, { siblingPercent: 10, staffWardPercent: 25 }, NAMES);
  const draft = await createFeeStructure(ctx, structure('With discounts'));
  await approveFeeStructure({ ...ctx, role: 'principal' }, String(draft.id));
  issued = String(draft.id);

  const concession = async (admissionNo: string) => (await invoiceOf(admissionNo, issued)).concessions.map((item) => item.amountMinor);
  expect(await concession('ELDER')).toEqual([]);
  expect(await concession('YOUNGER')).toEqual([100_000]);
  expect(await concession('WARD')).toEqual([250_000]);
  expect(await concession('PLAIN')).toEqual([]);
  // Tuition 10,000 less 10% is 9,000, with 18% GST; transport 2,000 with 5% GST and no discount.
  expect((await invoiceOf('YOUNGER', issued)).totalMinor).toBe(900_000 + 162_000 + 200_000 + 10_000);
});

it('applies an approved student discount to unpaid invoices only, and only once', async () => {
  const paid = await invoiceOf('ELDER', issued);
  await Invoice.updateOne({ schoolId: ctx.schoolId, _id: paid._id }, { paidMinor: 100, balanceMinor: paid.totalMinor - 100, status: 'partially_paid' });

  const request = (admissionNo: string) =>
    requestStudentDiscount(ctx, StudentDiscount.parse({ admissionNo, name: 'Merit', type: 'fixed', value: '1000', reason: 'Topper' }));
  await expect(request('NOBODY')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const [forPlain, forElder] = [await request('PLAIN'), await request('ELDER')];
  const before = await invoiceOf('PLAIN', issued);

  expect(await decideStudentDiscount(ctx, { id: String(forPlain.id), decision: 'approved' })).toMatchObject({ invoices: 1 });
  await expect(decideStudentDiscount(ctx, { id: String(forPlain.id), decision: 'approved' })).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  const after = await invoiceOf('PLAIN', issued);
  // ₹1,000 off tuition also takes its 18% GST with it.
  expect(before.totalMinor - after.totalMinor).toBe(100_000 + 18_000);
  expect(after.balanceMinor).toBe(after.totalMinor);

  expect(await decideStudentDiscount(ctx, { id: String(forElder.id), decision: 'approved' })).toMatchObject({ invoices: 0 });
  expect((await invoiceOf('ELDER', issued)).totalMinor).toBe(paid.totalMinor);
});

it('marks unpaid invoices overdue and adds the late fee once, after the grace days', async () => {
  await setLateFeeRule(ctx, { amountMinor: 10_000, graceDays: 7 });
  const before = await invoiceOf('WARD', issued);

  expect(await runFeeUpkeep(ctx.schoolId)).toMatchObject({ lateFees: 4 });
  expect(await runFeeUpkeep(ctx.schoolId)).toEqual({ overdue: 0, lateFees: 0 });
  const after = await Invoice.findOne({ schoolId: ctx.schoolId, _id: before._id }).orFail().lean();
  expect(after).toMatchObject({ status: 'overdue', lateFeeMinor: 10_000, totalMinor: before.totalMinor + 10_000, balanceMinor: before.balanceMinor + 10_000 });

  const future = await createFeeStructure(ctx, structure('Due later', '2099-01-10'));
  await approveFeeStructure({ ...ctx, role: 'principal' }, String(future.id));
  expect(await runFeeUpkeep(ctx.schoolId)).toEqual({ overdue: 0, lateFees: 0 });
});

it('takes a withdrawn student discount back off unpaid invoices, once', async () => {
  const discount = await Discount.findOne({ schoolId: ctx.schoolId, kind: 'custom', status: 'approved' }).sort({ createdAt: 1 }).orFail().lean();
  const before = await invoiceOf('PLAIN', issued);
  expect(before.concessions).toHaveLength(1);

  // Two invoices carry it: the one it was approved onto, and one issued later by another fee structure.
  expect(await withdrawStudentDiscount(ctx, String(discount._id))).toMatchObject({ invoices: 2 });
  const after = await invoiceOf('PLAIN', issued);
  expect(after.concessions).toHaveLength(0);
  expect(after.totalMinor - before.totalMinor).toBe(100_000 + 18_000);
  expect(after.balanceMinor).toBe(after.totalMinor);
  await expect(withdrawStudentDiscount(ctx, String(discount._id))).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect((await getDiscountRules(ctx)).students.find((row) => row.id === String(discount._id))?.status).toBe('withdrawn');
});

it('imports opening balances as one invoice per student, once', async () => {
  const file = (...rows: string[]) => [OPENING_BALANCE_COLUMNS.join(','), ...rows].join('\n');
  const count = () => Invoice.countDocuments({ schoolId: ctx.schoolId });
  const before = await count();

  const bad = await importOpeningBalances(ctx, file('NOBODY,500,2026-04-01', 'ELDER,0,2026-04-01', 'WARD,750.50,soon', 'WARD,10,2026-04-01'), false, 'Opening balance');
  expect(bad.errors.map((error) => [error.row, error.field])).toEqual([
    [2, 'admissionNo'],
    [3, 'amount'],
    [4, 'dueDate'],
    [5, 'admissionNo'],
  ]);
  expect(await count()).toBe(before);

  const good = file('ELDER,1250.50,2026-04-01', 'WARD,300,2026-04-01');
  expect(await importOpeningBalances(ctx, good, true, 'Opening balance')).toMatchObject({ total: 2, imported: 0, errors: [] });
  expect(await count()).toBe(before);
  expect(await importOpeningBalances(ctx, good, false, 'Opening balance')).toMatchObject({ imported: 2 });
  expect(await count()).toBe(before + 2);

  const elder = await Student.findOne({ schoolId: ctx.schoolId, admissionNo: 'ELDER' }).orFail().lean();
  const invoice = await Invoice.findOne({ schoolId: ctx.schoolId, studentId: elder._id, installmentId: null }).orFail().lean();
  expect(invoice).toMatchObject({ installmentLabel: 'Opening balance', totalMinor: 125_050, balanceMinor: 125_050, status: 'issued' });
  expect(invoice.invoiceNo).toMatch(/^INV\/2026-27\/\d{6}$/);

  const again = await importOpeningBalances(ctx, good, false, 'Opening balance');
  expect(again.imported).toBe(0);
  expect(again.errors).toHaveLength(2);
});
