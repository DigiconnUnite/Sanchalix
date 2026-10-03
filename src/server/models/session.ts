import 'server-only';
import { Schema } from 'mongoose';
import { ROLE_KEYS } from '@/server/auth/permissions';
import { defineModel } from './shared';

const schema = new Schema(
  {
    sessionToken: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activeRole: { type: String, required: true, enum: ROLE_KEYS },
    activeSchoolId: { type: Schema.Types.ObjectId, ref: 'School' },
    expires: { type: Date, required: true },
    totpPending: { type: Boolean, default: false },
    ip: String,
    userAgent: String,
  },
  { timestamps: true },
);

schema.index({ sessionToken: 1 }, { unique: true });
schema.index({ expires: 1 }, { expireAfterSeconds: 0 });

export const Session = defineModel('Session', schema, 'sessions');
