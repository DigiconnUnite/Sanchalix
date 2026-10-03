import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    subjectIds: [{ type: ObjectId, ref: 'Subject' }],
    gradingSchemeId: { type: ObjectId, ref: 'GradingScheme' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, branchId: 1, academicYearId: 1, order: 1 }, { unique: true });

export const Class = defineTenantModel('Class', schema, 'classes');
