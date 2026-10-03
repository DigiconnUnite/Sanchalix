import 'server-only';
import { Schema } from 'mongoose';
import { address, audit, defineTenantModel, E164 } from './shared';

const schema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: address, required: true },
    phone: { type: String, match: E164 },
    isDefault: { type: Boolean, default: false },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, code: 1 }, { unique: true });

export const Branch = defineTenantModel('Branch', schema, 'branches');
