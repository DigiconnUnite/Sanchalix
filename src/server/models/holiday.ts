import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const schema = new Schema(
  {
    date: { type: String, required: true, match: DATE_STR },
    name: { type: String, required: true },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, date: 1 });

export const Holiday = defineTenantModel('Holiday', schema, 'holidays');
