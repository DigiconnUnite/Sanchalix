import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = new Schema(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    dayPattern: { type: String, enum: ['mon_fri', 'mon_sat'], default: 'mon_sat' },
    periods: [
      {
        _id: false,
        number: { type: Number, required: true, min: 1 },
        label: String,
        start: { type: String, required: true, match: HH_MM },
        end: { type: String, required: true, match: HH_MM },
        isBreak: { type: Boolean, default: false },
      },
    ],
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, branchId: 1 }, { unique: true });

export const PeriodDefinition = defineTenantModel('PeriodDefinition', schema, 'periodDefinitions');
