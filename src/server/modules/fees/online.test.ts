import { createHmac } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { PaymentOrder, WebhookEvent } from '@/server/models/paymentOrder';
import { School } from '@/server/models/school';
import { createCheckout, getOrder, handleGatewayEvent, payWithDevGateway, verifyRazorpaySignature } from './online';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
const studentId = new Types.ObjectId();
const invoiceIds = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
let schoolId: Types.ObjectId;
let parent: RequestContext;
let stranger: RequestContext;

const balances = async () =>
  (await Invoice.find({ schoolId, studentId }).sort({ dueDate: 1 }).lean()).map((invoice) => [
    invoice.balanceMinor,
    invoice.status,
  ]);

beforeAll(async () => {
  await connectDb();
  await Promise.all([PaymentOrder, WebhookEvent, Payment, Invoice].map((model) => model.init()));
  const code = `Q${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const school = await School.create({ organizationId: new Types.ObjectId(), name: code, code, board: 'CBSE', address: ADDRESS });
  schoolId = school._id;
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  // Raw inserts: only the fields a payment reads, not a full fee structure.
  await Invoice.collection.insertMany(
    invoiceIds.map((_id, index) => ({
      _id,
      schoolId,
      branchId: new Types.ObjectId(),
      academicYearId: year._id,
      studentId,
      invoiceNo: `INV-${index}`,
      installmentId: new Types.ObjectId(),
      installmentLabel: `Quarter ${index + 1}`,
      dueDate: `2026-0${index + 4}-10`,
      totalMinor: 100000,
      paidMinor: 0,
      balanceMinor: 100000,
      status: 'issued',
      deletedAt: null,
    })),
  );
  const guardian = await Guardian.collection.insertOne({ schoolId, name: 'A Parent', studentIds: [studentId], deletedAt: null });
  const person = (guardianId: Types.ObjectId): RequestContext => ({
    userId: new Types.ObjectId(),
    name: 'Parent',
    role: 'parent',
    scope: 'ward',
    schoolId,
    guardianId,
  });
  parent = person(guardian.insertedId);
  stranger = person(new Types.ObjectId());
});

afterAll(() => mongoose.disconnect());

const checkout = (ids: Types.ObjectId[], ctx = parent) =>
  createCheckout(ctx, { studentId: String(studentId), invoiceIds: ids.map(String) });

it('lets only the child’s own parent start a payment, and reuses a pending order', async () => {
  await expect(checkout([invoiceIds[0] as Types.ObjectId], stranger)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(checkout([invoiceIds[0] as Types.ObjectId], { ...parent, role: 'school_admin' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(checkout([new Types.ObjectId()])).rejects.toMatchObject({ code: 'BUSINESS_RULE' });

  const first = await checkout(invoiceIds.slice(0, 2));
  expect(first).toMatchObject({ amountMinor: 200000, reused: false });
  expect(await checkout(invoiceIds.slice(0, 2).reverse())).toMatchObject({ orderId: first.orderId, reused: true });
  expect(await getOrder(stranger, first.orderId)).toBeNull();
  expect(await getOrder(parent, first.orderId)).toMatchObject({ status: 'created', installments: ['Quarter 1', 'Quarter 2'] });
});

it('writes nothing for a failed payment, and one receipt for a captured one', async () => {
  const pending = await checkout(invoiceIds.slice(0, 2));
  await expect(payWithDevGateway(stranger, pending.orderId, 'captured')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await payWithDevGateway(parent, pending.orderId, 'failed')).toMatchObject({ status: 'failed' });
  expect(await balances()).toEqual([[100000, 'issued'], [100000, 'issued'], [100000, 'issued']]);
  await expect(payWithDevGateway(parent, pending.orderId, 'captured')).rejects.toMatchObject({ code: 'BUSINESS_RULE' });

  const order = await checkout(invoiceIds.slice(0, 2));
  expect(order.orderId).not.toBe(pending.orderId);
  const paid = await payWithDevGateway(parent, order.orderId, 'captured');
  expect(paid).toMatchObject({ status: 'paid' });
  expect(await balances()).toEqual([[0, 'paid'], [0, 'paid'], [100000, 'issued']]);
  const payments = await Payment.find({ schoolId, studentId }).lean();
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ method: 'online', amountMinor: 200000, gateway: { provider: 'dev', orderId: order.orderId } });
  expect(await getOrder(parent, order.orderId)).toMatchObject({ status: 'paid', receiptNo: payments[0]?.receiptNo });
  await expect(payWithDevGateway(parent, order.orderId, 'captured')).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
});

it('applies a gateway event once, and never a wrong amount or changed dues', async () => {
  const order = await checkout([invoiceIds[2] as Types.ObjectId]);
  const event = {
    provider: 'dev' as const,
    eventId: `evt_test_${Date.now()}`,
    type: 'payment.captured' as const,
    schoolId,
    orderId: order.orderId,
    gatewayPaymentId: 'pay_test_1',
    amountMinor: 100000,
  };
  expect(await handleGatewayEvent({ ...event, eventId: `${event.eventId}_other`, schoolId: new Types.ObjectId() })).toMatchObject({
    status: 'ignored',
  });
  expect(await handleGatewayEvent({ ...event, eventId: `${event.eventId}_short`, amountMinor: 1 })).toMatchObject({
    status: 'unapplied',
  });
  expect(await balances()).toEqual([[0, 'paid'], [0, 'paid'], [100000, 'issued']]);

  // The counter takes part of the dues while the parent is on the bank's page.
  const again = await checkout([invoiceIds[2] as Types.ObjectId]);
  await Invoice.updateOne({ schoolId, _id: invoiceIds[2] }, { balanceMinor: 40000, paidMinor: 60000, status: 'partially_paid' });
  const late = { ...event, eventId: `${event.eventId}_late`, orderId: again.orderId };
  expect(await handleGatewayEvent(late)).toMatchObject({ status: 'unapplied' });
  expect(await handleGatewayEvent(late)).toMatchObject({ status: 'duplicate' });
  expect(await Payment.countDocuments({ schoolId, studentId })).toBe(1);
  expect((await getOrder(parent, again.orderId))?.status).toBe('failed');
});

it('accepts only a correctly signed Razorpay body', () => {
  const body = JSON.stringify({ event: 'payment.captured' });
  const signature = createHmac('sha256', 'whsec_test').update(body).digest('hex');
  expect(verifyRazorpaySignature(body, signature, 'whsec_test')).toBe(true);
  expect(verifyRazorpaySignature(`${body} `, signature, 'whsec_test')).toBe(false);
  expect(verifyRazorpaySignature(body, signature, 'another_secret')).toBe(false);
  expect(verifyRazorpaySignature(body, '', 'whsec_test')).toBe(false);
});
