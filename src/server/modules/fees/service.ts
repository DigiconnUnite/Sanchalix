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

export async function createFeeStructure(ctx: RequestContext, input: FeeStructureInput) {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) throw new AppError('BUSINESS_RULE', 'fees.errors.noYear');

  const [classes, heads] = await Promise.all([
    Class.countDocuments({ schoolId, academicYearId, _id: { $in: input.classIds } }),
    FeeHead.countDocuments({ schoolId, _id: { $in: input.lines.map((line) => line.feeHeadId) } }),
  ]);
  if (classes !== new Set(input.classIds).size) throw new AppError('NOT_FOUND', 'fees.errors.classes');
  if (heads !== input.lines.length) throw new AppError('NOT_FOUND', 'fees.errors.lineHead');

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

/** Approves a draft structure and, in the same transaction, issues every installment's invoice to every active student. */
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
      .select('name gstRate')
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
        const lines = structure.lines.map((line, lineIndex) => {
          const head = headById.get(String(line.feeHeadId));
          const amountMinor = shares[lineIndex]?.[index] ?? 0;
          return {
            feeHeadId: line.feeHeadId,
            description: head?.name ?? '',
            amountMinor,
            taxMinor: Math.round((amountMinor * (head?.gstRate ?? 0)) / 100),
          };
        });
        const totalMinor = lines.reduce((sum, line) => sum + line.amountMinor + line.taxMinor, 0);
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
