import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const DISCOUNT_KINDS = ['sibling', 'staff_ward', 'early_payment', 'custom'] as const;
export const DISCOUNT_STATUSES = ['pending', 'approved', 'rejected'] as const;

const schema = new Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, required: true, enum: DISCOUNT_KINDS },
    type: { type: String, required: true, enum: ['percent', 'fixed'] },
    // A percentage (1 to 100), or for `fixed` the amount off for the whole year in minor units.
    value: { type: Number, required: true, min: 0, validate: Number.isInteger },
    active: { type: Boolean, default: true },
    studentId: { type: ObjectId, ref: 'Student' },
    academicYearId: { type: ObjectId, ref: 'AcademicYear' },
    reason: String,
    status: { type: String, enum: DISCOUNT_STATUSES, default: 'approved' },
    approvedBy: { type: ObjectId, ref: 'User' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, kind: 1, status: 1 });
schema.index({ schoolId: 1, studentId: 1, academicYearId: 1 });

export const Discount = defineTenantModel('Discount', schema, 'discounts');
