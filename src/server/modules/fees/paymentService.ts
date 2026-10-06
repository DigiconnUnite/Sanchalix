import 'server-only';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Counter } from '@/server/models/counter';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';
import type { CollectPayment } from './schemas';

const PAYABLE = ['issued', 'partially_paid', 'overdue'] as const;

async function findByKey(ctx: RequestContext, idempotencyKey: string) {
  const payment = await Payment.findOne({ schoolId: ctx.schoolId, idempotencyKey })
    .select('receiptNo amountMinor')
    .lean();
  return payment && { id: payment._id, receiptNo: payment.receiptNo, amountMinor: payment.amountMinor, repeated: true };
}

/** A counter payment, or an online one, which arrives from the gateway with its own references. */
export type PaymentInput = Omit<CollectPayment, 'method' | 'idempotencyKey'> & {
  method: CollectPayment['method'] | 'online';
  idempotencyKey: string;
  gateway?: { provider: 'dev' | 'razorpay' | 'stripe'; orderId: string; paymentId: string };
};

/** Records a payment: the receipt, its number and the invoice balances change together or not at all. */
export async function collectPayment(ctx: RequestContext, input: PaymentInput) {
  const { schoolId } = ctx;
  // A double click or a retried request returns the first receipt instead of taking the money twice.
  const repeated = await findByKey(ctx, input.idempotencyKey);
  if (repeated) return repeated;

  const invoices = await Invoice.find({
    schoolId,
    studentId: input.studentId,
    _id: { $in: input.allocations.map((allocation) => allocation.invoiceId) },
  })
    .select('branchId academicYearId balanceMinor status')
    .lean();
  const first = invoices[0];
  if (!first || invoices.length !== input.allocations.length) throw new AppError('NOT_FOUND', 'fees.errors.allocation');

  const [school, year] = await Promise.all([
    School.findById(schoolId).select('settings.receiptPrefix').lean(),
    AcademicYear.findOne({ schoolId, _id: first.academicYearId }).select('label').lean(),
  ]);
  const yearLabel = (year?.label ?? '').replace('–', '-');
  const amountMinor = input.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);

  try {
    return await withTransaction(async (session) => {
      for (const allocation of input.allocations) {
        // The balance check is part of the update itself, so two cashiers can't both collect the same dues.
        const updated = await Invoice.findOneAndUpdate(
          {
            schoolId,
            _id: allocation.invoiceId,
            status: { $in: PAYABLE },
            balanceMinor: { $gte: allocation.amountMinor },
          },
          {
            $inc: { paidMinor: allocation.amountMinor, balanceMinor: -allocation.amountMinor },
            updatedBy: ctx.userId,
          },
          { returnDocument: 'after', session },
        )
          .select('balanceMinor')
          .lean();
        if (!updated) throw new AppError('BUSINESS_RULE', 'fees.errors.overBalance');
        await Invoice.updateOne(
          { schoolId, _id: allocation.invoiceId },
          { status: updated.balanceMinor === 0 ? 'paid' : 'partially_paid' },
          { session },
        );
      }

      // Incremented inside the transaction, so a failed collection never leaves a gap in the receipt numbers.
      const counter = await Counter.findOneAndUpdate(
        { _id: `${schoolId.toString()}:receipt:${yearLabel}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session },
      ).lean();
      const receiptNo = `${school?.settings?.receiptPrefix ?? 'RCPT'}/${yearLabel}/${String(counter.seq).padStart(6, '0')}`;

      const id = new Types.ObjectId();
      await Payment.create(
        [
          {
            _id: id,
            schoolId,
            branchId: first.branchId,
            receiptNo,
            studentId: input.studentId,
            allocations: input.allocations,
            amountMinor,
            method: input.method,
            chequeNo: input.method === 'cheque' ? (input.reference ?? null) : null,
            reference: input.method === 'cheque' ? null : input.reference || null,
            bankName: input.bankName || null,
            note: input.note || null,
            ...(input.gateway && { gateway: { ...input.gateway, signatureVerified: true } }),
            status: 'captured' as const,
            collectedBy: ctx.userId,
            idempotencyKey: input.idempotencyKey,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
        ],
        { session },
      );
      return { id, receiptNo, amountMinor, repeated: false };
    });
  } catch (error) {
    // When two identical requests race, the loser fails on the paid-up balance or on the unique idempotency key.
    // Either way the first one's receipt is the answer.
    const winner = await findByKey(ctx, input.idempotencyKey);
    if (winner) return winner;
    throw error;
  }
}
