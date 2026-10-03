import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;
const minor = { type: Number, required: true, min: 0, validate: Number.isInteger };

export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'] as const;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    invoiceNo: { type: String, required: true },
    studentId: { type: ObjectId, ref: 'Student', required: true },
    feeStructureId: { type: ObjectId, ref: 'FeeStructure', required: true },
    installmentId: { type: ObjectId, required: true },
    installmentLabel: { type: String, required: true },
    lines: [
      {
        _id: false,
        feeHeadId: { type: ObjectId, ref: 'FeeHead', required: true },
        description: { type: String, required: true },
        amountMinor: minor,
        taxMinor: minor,
      },
    ],
    concessions: [
      {
        _id: false,
        source: { type: String, required: true, enum: ['discount', 'scholarship'] },
        refId: { type: ObjectId, required: true },
        description: { type: String, required: true },
        amountMinor: minor,
      },
    ],
    lateFeeMinor: { ...minor, default: 0 },
    totalMinor: minor,
    paidMinor: { ...minor, default: 0 },
    balanceMinor: minor,
    dueDate: { type: String, required: true, match: DATE_STR },
    status: { type: String, enum: INVOICE_STATUSES, default: 'issued' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, invoiceNo: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, dueDate: 1 });
schema.index({ schoolId: 1, studentId: 1, installmentId: 1 }, { unique: true });

export const Invoice = defineTenantModel('Invoice', schema, 'invoices');
