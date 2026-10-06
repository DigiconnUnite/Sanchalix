import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { GATEWAYS, PaymentOrder, WebhookEvent } from '@/server/models/paymentOrder';
import { Student } from '@/server/models/student';
import { ownStudentIds } from '@/server/modules/portal/own';
import { collectPayment } from './paymentService';

const E = 'fees.online.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.invoices`);
const ORDER_TTL = 30 * 60_000;
const OPEN = ['issued', 'partially_paid', 'overdue'] as const;

// ponytail: the only gateway is "dev", a stand-in that takes no money: the parent presses Pay on our own page and
// the same event handler runs that a real gateway's webhook would trigger. With Razorpay keys, create the order
// through their API here and let /api/webhooks/razorpay deliver the events; nothing after that changes.
const PROVIDER: (typeof GATEWAYS)[number] = 'dev';

export const CheckoutInput = z.object({ studentId: Id, invoiceIds: z.array(Id).min(1, `${E}.invoices`).max(24) });
export type CheckoutInput = z.infer<typeof CheckoutInput>;
export const OrderId = z.string().regex(/^order_[A-Za-z0-9_-]{6,60}$/, `${E}.notFound`);

export type GatewayEvent = {
  provider: (typeof GATEWAYS)[number];
  eventId: string;
  type: 'payment.captured' | 'payment.failed';
  schoolId: Types.ObjectId;
  orderId: string;
  gatewayPaymentId: string;
  amountMinor: number;
};

export type OrderView = {
  orderId: string;
  provider: string;
  studentName: string;
  amountMinor: number;
  status: 'created' | 'paid' | 'expired' | 'failed';
  receiptNo: string | null;
  installments: string[];
};

/** A parent starts paying their own child's open invoices in full. A pending order for the same invoices is reused. */
export async function createCheckout(ctx: RequestContext, { studentId, invoiceIds }: CheckoutInput) {
  const { schoolId } = ctx;
  const own = await ownStudentIds(ctx);
  if (ctx.role !== 'parent' || !own.some((id) => String(id) === studentId)) {
    throw new AppError('FORBIDDEN', 'errors.forbidden');
  }
  const ids = [...new Set(invoiceIds)].sort();
  const invoices = await Invoice.find({ schoolId, studentId, _id: { $in: ids }, status: { $in: OPEN } })
    .select('balanceMinor')
    .lean();
  const amountMinor = invoices.reduce((sum, invoice) => sum + invoice.balanceMinor, 0);
  if (invoices.length !== ids.length || amountMinor <= 0) throw new AppError('BUSINESS_RULE', `${E}.invoices`);

  // The hash covers the amount too: after a part payment at the counter, the old order no longer fits.
  const invoiceSetHash = createHash('sha256').update(`${ids.join(',')}:${amountMinor}`).digest('hex');
  const pending = await PaymentOrder.findOne({
    schoolId,
    invoiceSetHash,
    status: 'created',
    expiresAt: { $gt: new Date() },
    createdBy: ctx.userId,
  })
    .select('orderId amountMinor')
    .lean();
  if (pending) return { orderId: pending.orderId, amountMinor: pending.amountMinor, reused: true };

  const order = await PaymentOrder.create({
    schoolId,
    provider: PROVIDER,
    orderId: `order_dev_${randomBytes(12).toString('base64url')}`,
    studentId,
    invoiceIds: ids,
    invoiceSetHash,
    amountMinor,
    guardianId: ctx.guardianId ?? null,
    expiresAt: new Date(Date.now() + ORDER_TTL),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { orderId: order.orderId, amountMinor, reused: false };
}

const ownOrder = (ctx: RequestContext, orderId: string) =>
  PaymentOrder.findOne({ schoolId: ctx.schoolId, orderId, createdBy: ctx.userId }).lean();

export async function getOrder(ctx: RequestContext, orderId: string): Promise<OrderView | null> {
  const order = OrderId.safeParse(orderId).success ? await ownOrder(ctx, orderId) : null;
  if (!order) return null;
  const [student, invoices, payment] = await Promise.all([
    Student.findOne({ schoolId: ctx.schoolId, _id: order.studentId }).select('firstName lastName').lean(),
    Invoice.find({ schoolId: ctx.schoolId, _id: { $in: order.invoiceIds } }).sort({ dueDate: 1 }).select('installmentLabel').lean(),
    order.paymentId ? Payment.findOne({ schoolId: ctx.schoolId, _id: order.paymentId }).select('receiptNo').lean() : null,
  ]);
  const expired = order.status === 'created' && order.expiresAt <= new Date();
  return {
    orderId: order.orderId,
    provider: order.provider,
    studentName: student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : '',
    amountMinor: order.amountMinor,
    status: expired ? 'expired' : order.status,
    receiptNo: payment?.receiptNo ?? null,
    installments: invoices.map((invoice) => invoice.installmentLabel),
  };
}

/**
 * Applies one gateway event, once. This is the only place an online payment becomes a receipt: the event is stored
 * first, the order is claimed atomically, and the receipt and invoice balances are written by the same transaction
 * the fee counter uses.
 */
export async function handleGatewayEvent(event: GatewayEvent) {
  const { schoolId } = event;
  try {
    await WebhookEvent.create({ provider: event.provider, eventId: event.eventId, type: event.type, payload: event });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) return { status: 'duplicate' as const };
    throw error;
  }
  const done = (error?: string) =>
    WebhookEvent.updateOne(
      { provider: event.provider, eventId: event.eventId },
      { processedAt: new Date(), $inc: { attempts: 1 }, ...(error && { error }) },
    );

  const captured = event.type === 'payment.captured';
  const order = await PaymentOrder.findOneAndUpdate(
    { schoolId, orderId: event.orderId, provider: event.provider, status: 'created' },
    { status: captured ? 'paid' : 'failed' },
  ).lean();
  if (!order) {
    await done('No pending order for this event');
    return { status: 'ignored' as const };
  }
  if (!captured) {
    await done();
    return { status: 'failed' as const };
  }

  const fail = async (reason: string) => {
    // Money was taken but couldn't be applied (the dues changed meanwhile). The order says so for the office to refund.
    await PaymentOrder.updateOne({ schoolId, _id: order._id }, { status: 'failed', error: reason });
    await done(reason);
    return { status: 'unapplied' as const };
  };
  if (event.amountMinor !== order.amountMinor) return fail('Amount does not match the order');
  const invoices = await Invoice.find({ schoolId, _id: { $in: order.invoiceIds } }).select('balanceMinor').lean();
  // Checked before anything is written: a receipt must be for exactly what the gateway took.
  if (invoices.reduce((sum, invoice) => sum + invoice.balanceMinor, 0) !== order.amountMinor) {
    return fail('Dues changed before the payment arrived');
  }
  try {
    const payment = await collectPayment(
      { userId: order.createdBy as Types.ObjectId, name: '', role: 'parent', scope: 'ward', schoolId },
      {
        studentId: String(order.studentId),
        allocations: invoices.map((invoice) => ({ invoiceId: String(invoice._id), amountMinor: invoice.balanceMinor })),
        method: 'online',
        reference: event.gatewayPaymentId,
        gateway: { provider: event.provider, orderId: order.orderId, paymentId: event.gatewayPaymentId },
        idempotencyKey: `order:${order.orderId}`,
      },
    );
    await PaymentOrder.updateOne({ schoolId, _id: order._id }, { paymentId: payment.id });
    await done();
    return { status: 'paid' as const, paymentId: payment.id, receiptNo: payment.receiptNo };
  } catch (error) {
    return fail(error instanceof AppError ? error.messageKey : 'Could not record the payment');
  }
}

/** The stand-in gateway's Pay and Fail buttons. Refused for any real provider. */
export async function payWithDevGateway(ctx: RequestContext, orderId: string, outcome: 'captured' | 'failed') {
  const order = await ownOrder(ctx, orderId);
  if (!order || order.provider !== 'dev') throw new AppError('NOT_FOUND', `${E}.notFound`);
  if (order.status !== 'created' || order.expiresAt <= new Date()) throw new AppError('BUSINESS_RULE', `${E}.closed`);
  return handleGatewayEvent({
    provider: 'dev',
    eventId: `evt_dev_${randomBytes(9).toString('base64url')}`,
    type: `payment.${outcome}`,
    schoolId: ctx.schoolId,
    orderId: order.orderId,
    gatewayPaymentId: `pay_dev_${randomBytes(9).toString('base64url')}`,
    amountMinor: order.amountMinor,
  });
}

/** Razorpay signs the raw request body with the webhook secret (HMAC-SHA-256, hex). */
export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string) {
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
