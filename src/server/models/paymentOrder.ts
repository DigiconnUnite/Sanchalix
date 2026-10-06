import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineModel, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;
const DAY_SECONDS = 86_400;
export const GATEWAYS = ['dev', 'razorpay', 'stripe'] as const;

const order = new Schema(
  {
    provider: { type: String, required: true, enum: GATEWAYS },
    orderId: { type: String, required: true },
    studentId: { type: ObjectId, ref: 'Student', required: true },
    invoiceIds: { type: [{ type: ObjectId, ref: 'Invoice' }], required: true },
    invoiceSetHash: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isInteger },
    guardianId: { type: ObjectId, ref: 'Guardian' },
    status: { type: String, enum: ['created', 'paid', 'expired', 'failed'], default: 'created' },
    expiresAt: { type: Date, required: true },
    paymentId: { type: ObjectId, ref: 'Payment' },
    error: String,
    ...audit,
  },
  { timestamps: true },
);
order.index({ orderId: 1 }, { unique: true });
order.index({ schoolId: 1, invoiceSetHash: 1, status: 1 });

export const PaymentOrder = defineTenantModel('PaymentOrder', order, 'paymentOrders');

const event = new Schema(
  {
    provider: { type: String, required: true, enum: [...GATEWAYS, 'msg91', 'ses'] },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    payload: Schema.Types.Mixed,
    receivedAt: { type: Date, default: Date.now },
    processedAt: Date,
    error: String,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
event.index({ provider: 1, eventId: 1 }, { unique: true });
event.index({ receivedAt: 1 }, { expireAfterSeconds: 180 * DAY_SECONDS });

export const WebhookEvent = defineModel('WebhookEvent', event, 'webhookEvents');
