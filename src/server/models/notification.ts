import 'server-only';
import { Schema } from 'mongoose';
import { defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;
const DAY_SECONDS = 86_400;

export const NOTIFICATION_CATEGORIES = [
  'attendance',
  'fees',
  'exams',
  'homework',
  'announcements',
  'messages',
  'transport',
  'library',
  'approvals',
  'system',
] as const;

const schema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, enum: NOTIFICATION_CATEGORIES },
    title: { type: String, required: true },
    body: String,
    link: String,
    readAt: { type: Date, default: null },
    deliveries: [
      {
        _id: false,
        channel: { type: String, required: true, enum: ['in_app', 'email', 'sms', 'push'] },
        status: { type: String, required: true, enum: ['queued', 'sent', 'failed', 'skipped'] },
        providerId: String,
        error: String,
        at: Date,
      },
    ],
    dedupeKey: String,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, userId: 1, readAt: 1, createdAt: -1 });
schema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * DAY_SECONDS });

export const Notification = defineTenantModel('Notification', schema, 'notifications');
