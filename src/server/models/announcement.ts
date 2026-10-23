import 'server-only';
import { Schema } from 'mongoose';
import { ROLE_KEYS } from '@/server/auth/permissions';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    kind: { type: String, enum: ['announcement', 'notice'], default: 'announcement' },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 5000 },
    audience: {
      type: { type: String, required: true, enum: ['school', 'branch', 'class', 'section', 'role'] },
      ids: [ObjectId],
      roles: [{ type: String, enum: ROLE_KEYS }],
    },
    channels: { type: [String], enum: ['in_app', 'email', 'sms', 'push'], default: ['in_app'] },
    attachments: [
      {
        key: { type: String, required: true },
        fileName: { type: String, required: true },
        mime: { type: String, required: true, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
        size: { type: Number, required: true, max: 5 * 1024 * 1024 },
      },
    ],
    requiresAck: { type: Boolean, default: false },
    acks: [{ _id: false, userId: { type: ObjectId, ref: 'User', required: true }, at: { type: Date, required: true } }],
    publishAt: Date,
    expiresAt: Date,
    status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived'], default: 'draft' },
    authorId: { type: ObjectId, ref: 'User', required: true },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, status: 1, publishAt: -1 });
schema.index({ schoolId: 1, 'audience.ids': 1 });

export const Announcement = defineTenantModel('Announcement', schema, 'announcements');
