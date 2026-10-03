import 'server-only';
import { Schema } from 'mongoose';
import { defineModel } from './shared';

const schema = new Schema(
  {
    name: { type: String, required: true, minlength: 2, maxlength: 120 },
    legalName: String,
    gstin: { type: String, match: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
    billingEmail: { type: String, required: true, match: /^\S+@\S+\.\S+$/ },
    plan: { type: String, required: true, enum: ['starter', 'growth', 'enterprise'] },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true },
);

schema.index({ name: 1 });

export const Organization = defineModel('Organization', schema, 'organizations');
