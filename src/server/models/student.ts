import 'server-only';
import { Schema } from 'mongoose';
import { address, audit, DATE_STR, defineTenantModel, documentRef, E164 } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const STUDENT_STATUSES = ['active', 'transferred', 'alumni', 'withdrawn'] as const;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    admissionNo: { type: String, required: true },
    firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60, default: '' },
    dob: { type: String, required: true, match: DATE_STR },
    gender: { type: String, required: true, enum: ['female', 'male', 'other', 'undisclosed'] },
    photoKey: String,
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    aadhaarNo: { type: String, match: /^\d{12}$/, select: false },
    medical: {
      type: { allergies: String, conditions: String, notes: String },
      select: false,
    },
    address,
    guardianIds: {
      type: [{ type: ObjectId, ref: 'Guardian' }],
      validate: (ids: unknown[]) => ids.length >= 1,
    },
    primaryGuardianId: { type: ObjectId, ref: 'Guardian', required: true },
    siblingGroupId: ObjectId,
    category: { type: String, enum: ['general', 'obc', 'sc', 'st', 'ews', 'other'] },
    status: { type: String, enum: STUDENT_STATUSES, default: 'active' },
    userId: { type: ObjectId, ref: 'User' },
    currentEnrollmentId: { type: ObjectId, ref: 'Enrollment' },
    documents: [documentRef],
    consents: [
      {
        _id: false,
        purpose: { type: String, required: true, enum: ['core', 'photos_public', 'ai_insights'] },
        noticeVersion: { type: String, required: true },
        givenByGuardianId: { type: ObjectId, ref: 'Guardian', required: true },
        phone: { type: String, required: true, match: E164 },
        at: { type: Date, required: true },
        ip: String,
        withdrawnAt: Date,
      },
    ],
    leftOn: { type: String, match: DATE_STR },
    leavingReason: String,
    ...audit,
  },
  { timestamps: true },
);

schema.pre('validate', function () {
  if (!this.guardianIds.some((id) => id.equals(this.primaryGuardianId))) {
    this.invalidate('primaryGuardianId', 'The primary guardian must be one of the student’s guardians');
  }
});

schema.index({ schoolId: 1, admissionNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, lastName: 1, _id: 1 });
schema.index({ firstName: 'text', lastName: 'text', admissionNo: 'text' });

export const Student = defineTenantModel('Student', schema, 'students');
