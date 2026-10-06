import 'server-only';
import { Schema } from 'mongoose';
import { ROLE_KEYS, SCOPES } from '@/server/auth/permissions';
import { defineModel, E164 } from './shared';

const ObjectId = Schema.Types.ObjectId;

const roleAssignment = new Schema(
  {
    role: { type: String, required: true, enum: ROLE_KEYS },
    schoolId: { type: ObjectId, ref: 'School' },
    branchId: { type: ObjectId, ref: 'Branch' },
    scope: { type: String, required: true, enum: SCOPES },
  },
  { _id: false },
);

const schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, match: E164 },
    passwordHash: { type: String, select: false },
    roles: {
      type: [roleAssignment],
      required: true,
      validate: (roles: unknown[]) => roles.length >= 1,
    },
    staffId: { type: ObjectId, ref: 'Staff' },
    studentId: { type: ObjectId, ref: 'Student' },
    guardianId: { type: ObjectId, ref: 'Guardian' },
    locale: String,
    visualMode: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
    totp: {
      secret: { type: String, select: false },
      enabledAt: Date,
      recoveryCodeHashes: { type: [String], select: false },
    },
    status: { type: String, enum: ['invited', 'active', 'locked', 'disabled'], default: 'invited' },
    passwordReset: { tokenHash: { type: String, select: false }, expiresAt: Date },
    lastLoginAt: Date,
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
  },
  { timestamps: true },
);

schema.pre('validate', function () {
  if (!this.email && !this.phone) this.invalidate('email', 'An email or a phone number is required');
});

schema.index({ email: 1 }, { unique: true, sparse: true });
schema.index({ phone: 1 }, { unique: true, sparse: true });
schema.index({ 'roles.schoolId': 1, 'roles.role': 1 });

export const User = defineModel('User', schema, 'users');
