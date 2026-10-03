import 'server-only';
import { Schema } from 'mongoose';
import { address, audit, defineTenantModel, E164 } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    relation: { type: String, required: true, enum: ['mother', 'father', 'guardian', 'other'] },
    phone: { type: String, required: true, match: E164 },
    email: { type: String, lowercase: true, trim: true },
    occupation: String,
    address,
    studentIds: [{ type: ObjectId, ref: 'Student' }],
    userId: { type: ObjectId, ref: 'User' },
    pendingContactReview: { type: Boolean, default: false },
    notificationPrefs: [
      {
        _id: false,
        channel: { type: String, required: true, enum: ['in_app', 'email', 'sms', 'push'] },
        category: {
          type: String,
          required: true,
          enum: [
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
          ],
        },
        enabled: { type: Boolean, required: true },
      },
    ],
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, phone: 1 });
schema.index({ schoolId: 1, studentIds: 1 });

export const Guardian = defineTenantModel('Guardian', schema, 'guardians');
