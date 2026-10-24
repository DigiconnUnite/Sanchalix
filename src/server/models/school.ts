import 'server-only';
import { Schema } from 'mongoose';
import { address, defineModel } from './shared';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = { type: String, match: HH_MM };
const window = new Schema({ start: { ...time, required: true }, end: { ...time, required: true } }, { _id: false });
const secret = { type: String, select: false };

const settings = new Schema(
  {
    attendanceMode: { type: String, enum: ['daily', 'period', 'both'], default: 'daily' },
    absenceAlertTime: { ...time, default: '09:30' },
    attendanceEditWindow: { type: String, enum: ['same_day'], default: 'same_day' },
    leaveCountsAsAbsent: { type: Boolean, default: true },
    transportWindows: [window],
    lateFeeRule: {
      graceDays: { type: Number, min: 0, default: 0 },
      amountMinor: { type: Number, min: 0, default: 0, validate: Number.isInteger },
      perDay: { type: Boolean, default: false },
    },
    // Days a year of each paid leave type. Leave without pay has no limit.
    leaveQuotas: {
      CL: { type: Number, min: 0, max: 366, default: 12 },
      SL: { type: Number, min: 0, max: 366, default: 10 },
      EL: { type: Number, min: 0, max: 366, default: 15 },
    },
    quietHours: { type: window, default: () => ({ start: '21:00', end: '07:00' }) },
    weekStart: { type: Number, min: 0, max: 6, default: 1 },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    // A due date that lands on a holiday or a non-working day moves to the next working day when invoices are issued.
    shiftDueDates: { type: Boolean, default: false },
    receiptPrefix: { type: String, default: 'RCPT' },
    messagingStudentsEnabled: { type: Boolean, default: false },
    aiInsightsEnabled: { type: Boolean, default: false },
    llmSummariesEnabled: { type: Boolean, default: false },
    defaultGradingSchemeId: Schema.Types.ObjectId,
  },
  { _id: false },
);

const schema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    code: { type: String, required: true, match: /^[A-Z0-9]{3,8}$/ },
    board: { type: String, required: true, enum: ['CBSE', 'ICSE', 'STATE', 'IB', 'IGCSE', 'OTHER'] },
    affiliationNo: String,
    address: { type: address, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    locales: { type: [String], default: ['en', 'hi'] },
    logoUrl: String,
    settings: { type: settings, default: () => ({}) },
    integrations: {
      razorpay: { keyId: String, keySecret: secret, webhookSecret: secret },
      stripe: { secretKey: secret, webhookSecret: secret },
      emailDomain: String,
      allowedGoogleDomains: [String],
    },
    status: { type: String, enum: ['onboarding', 'active', 'suspended'], default: 'onboarding' },
  },
  { timestamps: true },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ organizationId: 1 });

export const School = defineModel('School', schema, 'schools');
