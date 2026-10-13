import 'server-only';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { daysBefore, todayIn } from '@/lib/dates';
import { toMinor } from '@/lib/money';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Discount } from '@/server/models/discount';
import { FeeHead } from '@/server/models/feeHead';
import { FeeStructure } from '@/server/models/feeStructure';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { School } from '@/server/models/school';
import { Staff } from '@/server/models/staff';
import { Student } from '@/server/models/student';

const E = 'fees.discounts.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);
const Percent = z.coerce.number().int(`${E}.percent`).min(0, `${E}.percent`).max(100, `${E}.percent`);
const Rupees = (key: string) =>
  z
    .string()
    .transform((rupees) => toMinor(rupees))
    .refine((amount): amount is number => amount !== null, `${E}.${key}`);

export const AutomaticDiscounts = z.object({ siblingPercent: Percent, staffWardPercent: Percent });
export type AutomaticDiscounts = z.infer<typeof AutomaticDiscounts>;

export const LateFeeRule = z.object({
  amountMinor: Rupees('lateFee'),
  graceDays: z.coerce.number().int(`${E}.graceDays`).min(0, `${E}.graceDays`).max(90, `${E}.graceDays`),
});
export type LateFeeRule = z.infer<typeof LateFeeRule>;

export const StudentDiscount = z
  .object({
    admissionNo: z.string().trim().min(1, `${E}.student`).max(40, `${E}.student`),
    name: z.string().trim().min(1, `${E}.name`).max(60, `${E}.name`),
    type: z.enum(['percent', 'fixed'], `${E}.type`),
    value: z.string().trim(),
    reason: z.string().trim().min(1, `${E}.reason`).max(200, `${E}.reason`),
  })
  .transform((input, context) => {
    const value = input.type === 'percent' ? (/^\d{1,3}$/.test(input.value) ? Number(input.value) : null) : toMinor(input.value);
    if (value === null || value < 1 || (input.type === 'percent' && value > 100)) {
      context.addIssue({ code: 'custom', path: ['value'], message: `${E}.${input.type === 'percent' ? 'percent' : 'amount'}` });
      return z.NEVER;
    }
    return { ...input, value };
  });
export type StudentDiscount = z.infer<typeof StudentDiscount>;

export const DiscountDecision = z.object({ id: Id, decision: z.enum(['approved', 'rejected']) });
export type DiscountDecision = z.infer<typeof DiscountDecision>;

export type DiscountRules = {
  siblingPercent: number;
  staffWardPercent: number;
  lateFee: { amountMinor: number; graceDays: number };
  students: {
    id: string;
    student: string;
    admissionNo: string;
    name: string;
    type: 'percent' | 'fixed';
    value: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
  }[];
};

type Line = { feeHeadId: Types.ObjectId; description: string; amountMinor: number };
type Head = { gstRate?: number | null; discountable?: boolean | null };
type Applicable = { id: Types.ObjectId; name: string; type: 'percent' | 'fixed'; value: number };

/**
 * Prices one installment's invoice. Discounts come off the discountable fee heads only, in the order given, and
 * together never exceed what those heads charge. A fixed discount is for the year, so an installment takes its
 * share. GST is charged on what is left of each line after its part of the discount.
 */
export function priceInvoice(
  lines: Line[],
  headOf: (id: Types.ObjectId) => Head | undefined,
  discounts: Applicable[],
  installmentPercent: number,
  alreadyDiscounted = 0,
) {
  const discountable = lines.filter((line) => headOf(line.feeHeadId)?.discountable);
  const base = discountable.reduce((sum, line) => sum + line.amountMinor, 0);
  let left = base - alreadyDiscounted;
  const concessions = discounts.flatMap((discount) => {
    const wanted = Math.round(((discount.type === 'percent' ? base : discount.value) * (discount.type === 'percent' ? discount.value : installmentPercent)) / 100);
    const amountMinor = Math.max(0, Math.min(wanted, left));
    left -= amountMinor;
    return amountMinor > 0
      ? [{ source: 'discount' as const, refId: discount.id, description: discount.name, amountMinor }]
      : [];
  });

  const discounted = base - left;
  let spread = 0;
  const priced = lines.map((line) => {
    const head = headOf(line.feeHeadId);
    let net = line.amountMinor;
    if (head?.discountable && base > 0) {
      // The last discountable line takes whatever rounding left over, so the parts add up to the discount exactly.
      const part = line === discountable.at(-1) ? discounted - spread : Math.floor((discounted * line.amountMinor) / base);
      spread += part;
      net -= part;
    }
    return { ...line, taxMinor: Math.round((net * (head?.gstRate ?? 0)) / 100) };
  });
  const totalMinor = priced.reduce((sum, line) => sum + line.amountMinor + line.taxMinor, 0) - discounted;
  return { lines: priced, concessions, totalMinor };
}

/**
 * The discounts each of these students gets on invoices of that year: the better of the sibling and staff-ward
 * discounts, then any discount approved for the student by name.
 * ponytail: a staff ward is a child whose parent's mobile number is a staff member's. Link guardians to staff
 * records if a school ever has two people sharing a number.
 */
export async function discountsFor(ctx: RequestContext, studentIds: Types.ObjectId[], academicYearId: Types.ObjectId) {
  const { schoolId } = ctx;
  const [rules, custom, guardians, staffPhones] = await Promise.all([
    Discount.find({ schoolId, kind: { $in: ['sibling', 'staff_ward'] }, active: true, value: { $gt: 0 } }).lean(),
    Discount.find({ schoolId, kind: 'custom', status: 'approved', active: true, academicYearId, studentId: { $in: studentIds } })
      .sort({ createdAt: 1 })
      .lean(),
    Guardian.find({ schoolId, studentIds: { $in: studentIds } }).select('studentIds phone').lean(),
    Staff.distinct('phone', { schoolId, status: { $in: ['active', 'on_leave'] } }),
  ]);
  const sibling = rules.find((rule) => rule.kind === 'sibling');
  const staffWard = rules.find((rule) => rule.kind === 'staff_ward');
  const family = sibling
    ? await Student.find({ schoolId, _id: { $in: guardians.flatMap((guardian) => guardian.studentIds) }, status: 'active' })
        .select('dob')
        .lean()
    : [];
  const dobOf = new Map(family.map((child) => [String(child._id), child.dob]));
  const staff = new Set(staffPhones as string[]);
  const toApplicable = (rule: { _id: Types.ObjectId; name: string; type: 'percent' | 'fixed'; value: number }) => ({
    id: rule._id,
    name: rule.name,
    type: rule.type,
    value: rule.value,
  });

  return new Map(
    studentIds.map((studentId) => {
      const own = guardians.filter((guardian) => guardian.studentIds.some((id) => id.equals(studentId)));
      const key = String(studentId);
      // The eldest child pays in full; the discount is for the brothers and sisters after them.
      const hasElder = [...new Set(own.flatMap((guardian) => guardian.studentIds.map(String)))].some((other) => {
        const [theirs, mine] = [dobOf.get(other), dobOf.get(key)];
        return other !== key && theirs !== undefined && mine !== undefined && (theirs < mine || (theirs === mine && other < key));
      });
      const automatic = [
        ...(sibling && hasElder ? [sibling] : []),
        ...(staffWard && own.some((guardian) => staff.has(guardian.phone)) ? [staffWard] : []),
      ].sort((a, b) => b.value - a.value)[0];
      return [
        key,
        [...(automatic ? [automatic] : []), ...custom.filter((discount) => discount.studentId?.equals(studentId))].map(toApplicable),
      ] as const;
    }),
  );
}

export async function getDiscountRules(ctx: RequestContext): Promise<DiscountRules> {
  const { schoolId } = ctx;
  const [rules, custom, school] = await Promise.all([
    Discount.find({ schoolId, kind: { $in: ['sibling', 'staff_ward'] }, active: true }).select('kind value').lean(),
    Discount.find({ schoolId, kind: 'custom' }).sort({ createdAt: -1 }).limit(200).lean(),
    School.findById(schoolId).select('settings.lateFeeRule').lean(),
  ]);
  const students = await Student.find({ schoolId, _id: { $in: custom.flatMap((discount) => discount.studentId ?? []) } })
    .select('firstName lastName admissionNo')
    .lean();
  const studentOf = new Map(students.map((student) => [String(student._id), student]));
  const percentOf = (kind: string) => rules.find((rule) => rule.kind === kind)?.value ?? 0;
  return {
    siblingPercent: percentOf('sibling'),
    staffWardPercent: percentOf('staff_ward'),
    lateFee: {
      amountMinor: school?.settings?.lateFeeRule?.amountMinor ?? 0,
      graceDays: school?.settings?.lateFeeRule?.graceDays ?? 0,
    },
    students: custom.map((discount) => {
      const student = studentOf.get(String(discount.studentId));
      return {
        id: String(discount._id),
        student: student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : '',
        admissionNo: student?.admissionNo ?? '',
        name: discount.name,
        type: discount.type,
        value: discount.value,
        reason: discount.reason ?? '',
        status: discount.status,
      };
    }),
  };
}

/** Sets the two school-wide percentages. They take effect on invoices issued from now on, not on ones already out. */
export async function setAutomaticDiscounts(ctx: RequestContext, input: AutomaticDiscounts, names: { sibling: string; staff_ward: string }) {
  const { schoolId } = ctx;
  const before = await getDiscountRules(ctx);
  for (const [kind, value] of [['sibling', input.siblingPercent], ['staff_ward', input.staffWardPercent]] as const) {
    await Discount.findOneAndUpdate(
      { schoolId, kind },
      {
        $set: { name: names[kind], type: 'percent', value, active: value > 0, status: 'approved', updatedBy: ctx.userId },
        $setOnInsert: { createdBy: ctx.userId },
      },
      { upsert: true },
    );
  }
  return { before: { siblingPercent: before.siblingPercent, staffWardPercent: before.staffWardPercent } };
}

export async function setLateFeeRule(ctx: RequestContext, { amountMinor, graceDays }: LateFeeRule) {
  const school = await School.findByIdAndUpdate(ctx.schoolId, {
    'settings.lateFeeRule': { amountMinor, graceDays, perDay: false },
  })
    .select('settings.lateFeeRule')
    .lean();
  return { before: school?.settings?.lateFeeRule ?? null };
}

/** A discount for one student this year. It does nothing until the principal approves it. */
export async function requestStudentDiscount(ctx: RequestContext, input: StudentDiscount) {
  const { schoolId } = ctx;
  const [student, year] = await Promise.all([
    Student.findOne({ schoolId, admissionNo: input.admissionNo, status: 'active' }).select('firstName lastName').lean(),
    AcademicYear.findOne({ schoolId, status: 'current' }).select('_id').lean(),
  ]);
  if (!student) throw new AppError('NOT_FOUND', `${E}.student`);
  if (!year) throw new AppError('BUSINESS_RULE', 'fees.errors.noYear');
  const discount = await Discount.create({
    schoolId,
    name: input.name,
    kind: 'custom',
    type: input.type,
    value: input.value,
    studentId: student._id,
    academicYearId: year._id,
    reason: input.reason,
    status: 'pending',
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: discount._id, student: `${student.firstName} ${student.lastName ?? ''}`.trim() };
}

/**
 * The principal's decision. An approved discount comes off the student's invoices that nobody has paid towards
 * yet; an invoice with a receipt against it is left as it was billed.
 */
export async function decideStudentDiscount(ctx: RequestContext, { id, decision }: DiscountDecision) {
  const { schoolId } = ctx;
  return withTransaction(async (session) => {
    const discount = await Discount.findOneAndUpdate(
      { schoolId, _id: id, kind: 'custom', status: 'pending' },
      { status: decision, approvedBy: ctx.userId, updatedBy: ctx.userId },
      { session },
    ).lean();
    if (!discount?.studentId || !discount.academicYearId) throw new AppError('BUSINESS_RULE', `${E}.decided`);
    if (decision === 'rejected') return { id: discount._id, name: discount.name, invoices: 0 };

    const invoices = await Invoice.find({
      schoolId,
      studentId: discount.studentId,
      academicYearId: discount.academicYearId,
      status: { $in: ['issued', 'overdue'] },
      paidMinor: 0,
    })
      .session(session)
      .lean();
    const [heads, structures] = await Promise.all([
      FeeHead.find({ schoolId, _id: { $in: invoices.flatMap((invoice) => invoice.lines.map((line) => line.feeHeadId)) } })
        .select('gstRate discountable')
        .session(session)
        .lean(),
      FeeStructure.find({ schoolId, _id: { $in: invoices.map((invoice) => invoice.feeStructureId) } })
        .select('installments')
        .session(session)
        .lean(),
    ]);
    const headOf = (headId: Types.ObjectId) => heads.find((head) => head._id.equals(headId));
    let changed = 0;
    for (const invoice of invoices) {
      const percent =
        structures
          .find((structure) => structure._id.equals(invoice.feeStructureId))
          ?.installments.find((installment) => installment._id.equals(invoice.installmentId))?.percent ?? 0;
      const already = invoice.concessions.reduce((sum, concession) => sum + concession.amountMinor, 0);
      const priced = priceInvoice(
        invoice.lines,
        headOf,
        [{ id: discount._id, name: discount.name, type: discount.type, value: discount.value }],
        percent,
        already,
      );
      const concession = priced.concessions[0];
      if (!concession) continue;
      const totalMinor = priced.totalMinor - already + invoice.lateFeeMinor;
      await Invoice.updateOne(
        { schoolId, _id: invoice._id, paidMinor: 0 },
        { $set: { lines: priced.lines, totalMinor, balanceMinor: totalMinor, updatedBy: ctx.userId }, $push: { concessions: concession } },
        { session },
      );
      changed += 1;
    }
    return { id: discount._id, name: discount.name, invoices: changed };
  });
}

/**
 * The nightly fee upkeep for one school: an unpaid invoice past its due date is marked overdue, and once the grace
 * days are over it gets the school's late fee, once. Safe to run any number of times a day.
 */
export async function runFeeUpkeep(schoolId: Types.ObjectId) {
  const school = await School.findById(schoolId).select('timezone settings.lateFeeRule').lean();
  if (!school) return { overdue: 0, lateFees: 0 };
  const today = todayIn(school.timezone ?? 'Asia/Kolkata');
  const unpaid = { schoolId, balanceMinor: { $gt: 0 } };
  const overdue = await Invoice.updateMany({ ...unpaid, status: 'issued', dueDate: { $lt: today } }, { status: 'overdue' });

  const { amountMinor = 0, graceDays = 0 } = school.settings?.lateFeeRule ?? {};
  if (amountMinor <= 0) return { overdue: overdue.modifiedCount, lateFees: 0 };
  const lateFees = await Invoice.updateMany(
    {
      ...unpaid,
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
      lateFeeMinor: 0,
      dueDate: { $lt: daysBefore(today, graceDays) },
    },
    { $set: { lateFeeMinor: amountMinor }, $inc: { totalMinor: amountMinor, balanceMinor: amountMinor } },
  );
  return { overdue: overdue.modifiedCount, lateFees: lateFees.modifiedCount };
}
