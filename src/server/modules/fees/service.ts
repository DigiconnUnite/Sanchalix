import 'server-only';
import { AppError } from '@/lib/appError';
import { splitByPercent } from '@/lib/money';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Counter } from '@/server/models/counter';
import { Enrollment } from '@/server/models/enrollment';
import { FeeHead } from '@/server/models/feeHead';
import { FeeStructure } from '@/server/models/feeStructure';
import { Invoice } from '@/server/models/invoice';
import { getCurrentYearId } from '@/server/modules/academics/queries';
import { discountsFor, priceInvoice } from './discounts';
import type { FeeHeadInput, FeeStructureInput } from './schemas';

const isDuplicateKey = (error: unknown) => error instanceof Error && 'code' in error && error.code === 11000;

export async function createFeeHead(ctx: RequestContext, input: FeeHeadInput) {
  try {
    const head = await FeeHead.create({
      schoolId: ctx.schoolId,
      ...input,
      taxable: input.gstRate > 0,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return { id: head._id, name: head.name };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'fees.errors.headCodeTaken', { code: input.code });
    throw error;
  }
}

export async function setFeeHeadDiscountable(ctx: RequestContext, id: string, discountable: boolean) {
  const head = await FeeHead.findOneAndUpdate({ schoolId: ctx.schoolId, _id: id }, { discountable, updatedBy: ctx.userId })
    .select('name discountable')
    .lean();
  if (!head) throw new AppError('NOT_FOUND', 'fees.errors.lineHead');
  return { id: head._id, name: head.name, before: head.discountable };
}

/** Saves a new draft, or with an id replaces a draft. An approved structure has invoices, so it can't change. */
export async function createFeeStructure(ctx: RequestContext, input: FeeStructureInput, id?: string | undefined) {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) throw new AppError('BUSINESS_RULE', 'fees.errors.noYear');

  const [classes, heads] = await Promise.all([
    Class.countDocuments({ schoolId, academicYearId, _id: { $in: input.classIds } }),
    FeeHead.countDocuments({ schoolId, _id: { $in: input.lines.map((line) => line.feeHeadId) } }),
  ]);
  if (classes !== new Set(input.classIds).size) throw new AppError('NOT_FOUND', 'fees.errors.classes');
  if (heads !== input.lines.length) throw new AppError('NOT_FOUND', 'fees.errors.lineHead');

  if (id) {
    const updated = await FeeStructure.findOneAndUpdate(
      { schoolId, _id: id, status: 'draft' },
      { ...input, updatedBy: ctx.userId },
    )
      .select('_id')
      .lean();
    if (!updated) throw new AppError('BUSINESS_RULE', 'fees.errors.notDraft');
    return { id: updated._id, name: input.name };
  }
  const structure = await FeeStructure.create({
    schoolId,
    academicYearId,
    ...input,
    status: 'draft',
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: structure._id, name: structure.name };
}

/** Only a draft can go: once approved, invoices point at the structure. */
export async function deleteDraftFeeStructure(ctx: RequestContext, id: string) {
  const structure = await FeeStructure.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: id, status: 'draft' },
    { deletedAt: new Date(), updatedBy: ctx.userId },
  )
    .select('name')
    .lean();
  if (!structure) throw new AppError('BUSINESS_RULE', 'fees.errors.notDraft');
  return { id: structure._id, name: structure.name };
}

export async function approveFeeStructure(ctx: RequestContext, id: string) {
  const { schoolId } = ctx;
  const structure = await FeeStructure.findOne({ schoolId, _id: id }).lean();
  if (!structure) throw new AppError('NOT_FOUND', 'fees.errors.structureNotFound');
  if (structure.status !== 'draft') throw new AppError('BUSINESS_RULE', 'fees.errors.alreadyApproved');

  const [year, heads, enrollments] = await Promise.all([
    AcademicYear.findOne({ schoolId, _id: structure.academicYearId }).select('label').lean(),
    FeeHead.find({ schoolId, _id: { $in: structure.lines.map((line) => line.feeHeadId) } })
      .select('name gstRate discountable')
      .lean(),
    Enrollment.find({
      schoolId,
      academicYearId: structure.academicYearId,
      classId: { $in: structure.classIds },
      status: 'active',
    })
      .select('studentId branchId')
      .lean(),
  ]);
  if (!year) throw new AppError('NOT_FOUND', 'fees.errors.structureNotFound');
  const headById = new Map(heads.map((head) => [String(head._id), head]));
  const yearLabel = year.label.replace('–', '-');
  const percents = structure.installments.map((installment) => installment.percent);
  const shares = structure.lines.map((line) => splitByPercent(line.amountMinor, percents));
  const invoiceCount = enrollments.length * structure.installments.length;
  const discounts = await discountsFor(
    ctx,
    enrollments.map((enrollment) => enrollment.studentId),
    structure.academicYearId,
  );

  return withTransaction(async (session) => {
    const approved = await FeeStructure.updateOne(
      { schoolId, _id: structure._id, status: 'draft' },
      { status: 'active', approvedBy: ctx.userId, updatedBy: ctx.userId },
      { session },
    );
    if (approved.modifiedCount !== 1) throw new AppError('CONFLICT', 'fees.errors.alreadyApproved');
    if (invoiceCount === 0) return { name: structure.name, invoicesIssued: 0 };

    // One increment reserves the whole block of numbers; it rolls back with the transaction, so there are no gaps.
    const counter = await Counter.findOneAndUpdate(
      { _id: `${schoolId.toString()}:invoice:${yearLabel}` },
      { $inc: { seq: invoiceCount } },
      { upsert: true, returnDocument: 'after', session },
    ).lean();
    let seq = counter.seq - invoiceCount;

    const invoices = enrollments.flatMap((enrollment) =>
      structure.installments.map((installment, index) => {
        const { lines, concessions, totalMinor } = priceInvoice(
          structure.lines.map((line, lineIndex) => ({
            feeHeadId: line.feeHeadId,
            description: headById.get(String(line.feeHeadId))?.name ?? '',
            amountMinor: shares[lineIndex]?.[index] ?? 0,
          })),
          (headId) => headById.get(String(headId)),
          discounts.get(String(enrollment.studentId)) ?? [],
          installment.percent,
        );
        seq += 1;
        return {
          schoolId,
          branchId: enrollment.branchId,
          academicYearId: structure.academicYearId,
          invoiceNo: `INV/${yearLabel}/${String(seq).padStart(6, '0')}`,
          studentId: enrollment.studentId,
          feeStructureId: structure._id,
          installmentId: installment._id,
          installmentLabel: installment.label,
          lines,
          concessions,
          totalMinor,
          balanceMinor: totalMinor,
          dueDate: installment.dueDate,
          status: 'issued' as const,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        };
      }),
    );
    await Invoice.insertMany(invoices, { session });
    return { name: structure.name, invoicesIssued: invoiceCount };
  });
}
