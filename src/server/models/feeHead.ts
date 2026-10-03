import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

export const GST_RATES = [0, 5, 12, 18] as const;

const schema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    taxable: { type: Boolean, default: false },
    gstRate: { type: Number, enum: GST_RATES, default: 0 },
    refundable: { type: Boolean, default: false },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, code: 1 }, { unique: true });

export const FeeHead = defineTenantModel('FeeHead', schema, 'feeHeads');
