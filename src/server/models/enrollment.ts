import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    studentId: { type: ObjectId, ref: 'Student', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    classId: { type: ObjectId, ref: 'Class', required: true },
    sectionId: { type: ObjectId, ref: 'Section', required: true },
    rollNo: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['active', 'promoted', 'detained', 'transferred', 'completed'],
      default: 'active',
    },
    optionalSubjectIds: [{ type: ObjectId, ref: 'Subject' }],
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, studentId: 1, academicYearId: 1 }, { unique: true });
schema.index({ schoolId: 1, sectionId: 1, rollNo: 1 }, { unique: true });

export const Enrollment = defineTenantModel('Enrollment', schema, 'enrollments');
