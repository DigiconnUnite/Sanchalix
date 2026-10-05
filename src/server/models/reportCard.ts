import 'server-only';
import { Schema } from 'mongoose';
import { audit, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    studentId: { type: ObjectId, ref: 'Student', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: ObjectId, default: null },
    // The section the card was generated for, so the class teacher and the section list can find it.
    sectionId: { type: ObjectId, ref: 'Section', required: true },
    examIds: [{ type: ObjectId, ref: 'Exam' }],
    snapshot: { type: Schema.Types.Mixed, required: true },
    classTeacherRemark: { type: String, maxlength: 300, default: '' },
    principalRemark: { type: String, maxlength: 300, default: '' },
    pdfKey: String,
    status: { type: String, enum: ['draft', 'published', 'withdrawn'], default: 'draft' },
    publishedAt: Date,
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, studentId: 1, academicYearId: 1, termId: 1 }, { unique: true });
schema.index({ schoolId: 1, sectionId: 1 });

export const ReportCard = defineTenantModel('ReportCard', schema, 'reportCards');
