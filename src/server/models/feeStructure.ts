import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;
const minor = { type: Number, required: true, min: 1, validate: Number.isInteger };

const schema = new Schema(
  {
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    classIds: { type: [{ type: ObjectId, ref: 'Class' }], required: true },
    name: { type: String, required: true },
    lines: [{ _id: false, feeHeadId: { type: ObjectId, ref: 'FeeHead', required: true }, amountMinor: minor }],
    installments: [
      {
        label: { type: String, required: true },
        dueDate: { type: String, required: true, match: DATE_STR },
        percent: { type: Number, required: true, min: 1, max: 100 },
      },
    ],
    status: { type: String, enum: ['draft', 'approved', 'active'], default: 'draft' },
    approvedBy: { type: ObjectId, ref: 'User' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, academicYearId: 1 });

export const FeeStructure = defineTenantModel('FeeStructure', schema, 'feeStructures');
