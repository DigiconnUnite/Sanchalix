import { createHmac } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { PaymentOrder, WebhookEvent } from '@/server/models/paymentOrder';
import { School } from '@/server/models/school';
import { createCheckout, getOrder, handleGatewayEvent, payWithDevGateway, reconcileOrders, verifyRazorpaySignature } from './online';
import { createRazorpayOrder } from './razorpay';
import { getCollectionReport } from './reports';

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

it('reports what was collected by method and day, for this school only', async () => {
  const report = await getCollectionReport(parent, undefined, undefined);
  expect(report).toMatchObject({ totalMinor: 200000, receipts: 1, outstandingMinor: 40000 });
  expect(report.byMethod).toEqual([{ method: 'online', amountMinor: 200000, receipts: 1 }]);
  expect(report.byDay).toHaveLength(1);
  expect(report.from).toBe(`${report.to.slice(0, 7)}-01`);

  expect(await getCollectionReport(parent, '2020-01-01', '2020-01-31')).toMatchObject({ totalMinor: 0, byDay: [] });
  expect(await getCollectionReport(parent, '2026-12-31', '2026-01-01')).toMatchObject({ from: '2026-01-01', to: '2026-01-01' });
  const elsewhere = await getCollectionReport({ ...parent, schoolId: new Types.ObjectId() }, undefined, undefined);
  expect(elsewhere).toMatchObject({ totalMinor: 0, outstandingMinor: 0 });
});

it('opens the order at Razorpay when keys are set, and creates nothing if Razorpay refuses', async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  try {
    const calls: { url: string; init: RequestInit }[] = [];
    const reply = (status: number, body: unknown) =>
      vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(body), { status });
      });
    const count = () => PaymentOrder.countDocuments({ schoolId });
    const before = await count();

    reply(500, { error: { description: 'down' } });
    await expect(checkout([invoiceIds[2] as Types.ObjectId])).rejects.toMatchObject({ code: 'PAYMENT_FAILED' });
    expect(await count()).toBe(before);

    reply(200, { id: 'order_RzpTest123' });
    const order = await checkout([invoiceIds[2] as Types.ObjectId]);
    expect(order).toMatchObject({ orderId: 'order_RzpTest123', amountMinor: 40000 });
    const sent = calls.at(-1);
    expect(sent?.url).toBe('https://api.razorpay.com/v1/orders');
    expect((sent?.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('rzp_test_key:rzp_test_secret').toString('base64')}`,
    );
    expect(JSON.parse(String(sent?.init.body))).toMatchObject({ amount: 40000, currency: 'INR', notes: { schoolId: String(schoolId) } });
    expect(await getOrder(parent, 'order_RzpTest123')).toMatchObject({ provider: 'razorpay', keyId: 'rzp_test_key', status: 'created' });
    await expect(payWithDevGateway(parent, 'order_RzpTest123', 'captured')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    reply(200, { id: 'not-an-order' });
    await expect(createRazorpayOrder({ keyId: 'a', keySecret: 'b' }, { amountMinor: 100, receipt: 'r', notes: {} })).rejects.toMatchObject({
      code: 'PAYMENT_FAILED',
    });
  } finally {
    vi.unstubAllGlobals();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  }
});

it('applies a payment whose webhook never arrived, once, and ignores one Razorpay did not capture', async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  try {
    const order = await PaymentOrder.findOne({ schoolId, orderId: 'order_RzpTest123' }).orFail().lean();
    const asked: string[] = [];
    let status = 'created';
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify({ items: [{ id: 'pay_missed_1', status, amount: order.amountMinor }] }), { status: 200 });
    });

    expect(await reconcileOrders(schoolId)).toBe(0);
    // createdAt is immutable through Mongoose, so the order is aged in the raw collection.
    await PaymentOrder.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await reconcileOrders(schoolId)).toBe(0);
    expect(asked[0]).toBe('https://api.razorpay.com/v1/orders/order_RzpTest123/payments');
    expect((await getOrder(parent, order.orderId))?.status).toBe('created');

    status = 'captured';
    const paymentsBefore = await Payment.countDocuments({ schoolId, studentId });
    expect(await reconcileOrders(schoolId)).toBe(1);
    expect(await Payment.countDocuments({ schoolId, studentId })).toBe(paymentsBefore + 1);
    expect(await getOrder(parent, order.orderId)).toMatchObject({ status: 'paid' });
    expect(await reconcileOrders(schoolId)).toBe(0);
    expect(await reconcileOrders(new Types.ObjectId())).toBe(0);
  } finally {
    vi.unstubAllGlobals();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  }
});
