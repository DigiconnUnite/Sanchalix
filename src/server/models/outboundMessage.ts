import 'server-only';
import { Schema } from 'mongoose';
import { defineModel, defineTenantModel } from './shared';

const DAY_SECONDS = 86_400;

const message = new Schema(
  {
    channel: { type: String, required: true, enum: ['sms', 'email'] },
    to: { type: String, required: true },
    template: { type: String, required: true },
    subject: String,
    // Kept only by the development provider, so a tester can read a code or a link. A real provider's record has none.
    body: String,
    status: { type: String, required: true, enum: ['sent', 'failed', 'skipped', 'held'] },
    // Set while a text waits for quiet hours to end. The scheduled run sends it after this moment.
    sendAfter: Date,
    // For an absence alert: the child and day it is about, checked again before it goes out.
    recheck: { type: { studentId: Schema.Types.ObjectId, date: String }, _id: false },
    provider: { type: String, required: true },
    error: String,
    dedupeKey: String,
  },
  { timestamps: true },
);
message.index({ schoolId: 1, createdAt: -1 });
message.index({ schoolId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
message.index({ status: 1, sendAfter: 1 });
message.index({ createdAt: 1 }, { expireAfterSeconds: 30 * DAY_SECONDS });

export const OutboundMessage = defineTenantModel('OutboundMessage', message, 'outboundMessages');

const challenge = new Schema(
  {
    phone: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    purpose: { type: String, enum: ['login', 'verify_phone'], default: 'login' },
  },
  { timestamps: true },
);
challenge.index({ phone: 1, purpose: 1 });
challenge.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge = defineModel('OtpChallenge', challenge, 'otpChallenges');
