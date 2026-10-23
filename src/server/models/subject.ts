import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

export const SUBJECT_TYPES = ['scholastic', 'co_scholastic'] as const;

const schema = new Schema(
  {
    name: { type: String, required: true, maxlength: 60 },
    code: { type: String, required: true, uppercase: true },
    type: { type: String, required: true, enum: SUBJECT_TYPES },
    // Not every student of the class takes it: each is given it on their profile, and only they sit its papers.
    isOptional: { type: Boolean, default: false },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, code: 1 }, { unique: true });

export const Subject = defineTenantModel('Subject', schema, 'subjects');
