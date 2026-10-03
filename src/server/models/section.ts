import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    classId: { type: ObjectId, ref: 'Class', required: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    classTeacherId: { type: ObjectId, ref: 'Staff' },
    capacity: { type: Number, default: 40, min: 1 },
    room: String,
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, classId: 1, name: 1 }, { unique: true });
schema.index({ schoolId: 1, classTeacherId: 1 });

export const Section = defineTenantModel('Section', schema, 'sections');
