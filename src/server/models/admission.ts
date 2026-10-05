import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel, documentRef, E164 } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const ADMISSION_STATUSES = [
  'enquiry',
  'applied',
  'documents_pending',
  'assessment',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
] as const;
export const ADMISSION_SOURCES = ['walk_in', 'website', 'referral', 'campaign'] as const;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    applicationNo: { type: String, required: true },
    status: { type: String, enum: ADMISSION_STATUSES, default: 'enquiry' },
    applicant: {
      type: new Schema(
        {
          firstName: { type: String, required: true },
          lastName: { type: String, default: '' },
          dob: { type: String, required: true, match: DATE_STR },
          gender: { type: String, required: true, enum: ['female', 'male', 'other', 'undisclosed'] as const },
          previousSchool: String,
          classSought: { type: ObjectId, ref: 'Class', required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    guardians: [
      {
        _id: false,
        name: { type: String, required: true },
        relation: { type: String, required: true, enum: ['mother', 'father', 'guardian', 'other'] },
        phone: { type: String, required: true, match: E164 },
        email: String,
      },
    ],
    documents: [documentRef],
    requiredDocuments: [String],
    assessment: { date: String, score: Number, remarks: String },
    source: { type: String, enum: ADMISSION_SOURCES, default: 'walk_in' },
    studentId: { type: ObjectId, ref: 'Student' },
    history: [{ _id: false, at: Date, by: { type: ObjectId, ref: 'User' }, from: String, to: String, note: String }],
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, applicationNo: 1 }, { unique: true });
schema.index({ schoolId: 1, academicYearId: 1, status: 1 });

export const Admission = defineTenantModel('Admission', schema, 'admissions');
