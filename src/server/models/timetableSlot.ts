import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    sectionId: { type: ObjectId, ref: 'Section', required: true },
    day: { type: Number, required: true, min: 1, max: 7 },
    period: { type: Number, required: true, min: 1 },
    subjectId: { type: ObjectId, ref: 'Subject', required: true },
    teacherId: { type: ObjectId, ref: 'Staff', required: true },
    room: String,
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, academicYearId: 1, sectionId: 1, day: 1, period: 1 }, { unique: true });
schema.index(
  { schoolId: 1, academicYearId: 1, teacherId: 1, day: 1, period: 1 },
  { unique: true, partialFilterExpression: { status: 'published' } },
);

export const TimetableSlot = defineTenantModel('TimetableSlot', schema, 'timetableSlots');
