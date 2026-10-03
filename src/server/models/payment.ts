import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;
const minor = { type: Number, required: true, min: 0, validate: Number.isInteger };

export const PAYMENT_METHODS = ['cash', 'cheque', 'upi', 'card', 'netbanking', 'bank_transfer', 'online'] as const;

// A receipt is a legal record: the amount, its allocations and its number can never change once written.
const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    receiptNo: { type: String, required: true, immutable: true },
    studentId: { type: ObjectId, ref: 'Student', required: true, immutable: true },
    payerGuardianId: { type: ObjectId, ref: 'Guardian' },
    allocations: {
      type: [{ _id: false, invoiceId: { type: ObjectId, ref: 'Invoice', required: true }, amountMinor: minor }],
      immutable: true,
    },
    advanceMinor: { ...minor, default: 0 },
    amountMinor: { ...minor, min: 1, immutable: true },
    method: { type: String, required: true, enum: PAYMENT_METHODS },
    gateway: {
      provider: { type: String, enum: ['razorpay', 'stripe'] },
      orderId: String,
      paymentId: String,
      signatureVerified: Boolean,
    },
    chequeNo: String,
    bankName: String,
    reference: String,
    note: { type: String, maxlength: 200 },
    status: {
      type: String,
      enum: ['pending', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'captured',
    },
    refunds: [
      {
        _id: false,
        amountMinor: minor,
        reason: String,
        approvedBy: { type: ObjectId, ref: 'User' },
        gatewayRefundId: String,
        at: Date,
      },
    ],
    collectedBy: { type: ObjectId, ref: 'User', required: true },
    idempotencyKey: { type: String, required: true },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, receiptNo: 1 }, { unique: true });
schema.index({ schoolId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ 'gateway.paymentId': 1 }, { unique: true, sparse: true });
schema.index({ schoolId: 1, createdAt: -1 });

export const Payment = defineTenantModel('Payment', schema, 'payments');
