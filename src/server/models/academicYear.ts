import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const date = { type: String, required: true, match: DATE_STR };

const schema = new Schema(
  {
    label: { type: String, required: true, match: /^\d{4}–\d{2}$/ },
    startDate: date,
    endDate: date,
    status: { type: String, enum: ['planned', 'current', 'closed'], default: 'planned' },
    terms: [{ name: { type: String, required: true }, startDate: date, endDate: date }],
    ...audit,
  },
  { timestamps: true },
);

schema.pre('validate', function () {
  if (this.endDate <= this.startDate) this.invalidate('endDate', 'End date must be after the start date');
});

schema.index({ schoolId: 1, label: 1 }, { unique: true });
schema.index({ schoolId: 1 }, { unique: true, partialFilterExpression: { status: 'current' } });

export const AcademicYear = defineTenantModel('AcademicYear', schema, 'academicYears');
