import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half_day', 'leave', 'holiday'] as const;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    sectionId: { type: ObjectId, ref: 'Section', required: true },
    date: { type: String, required: true, match: DATE_STR },
    mode: { type: String, required: true, enum: ['daily', 'period'] },
    period: { type: Number, default: null },
    subjectId: { type: ObjectId, ref: 'Subject' },
    takenBy: { type: ObjectId, ref: 'Staff' },
    entries: [
      {
        _id: false,
        studentId: { type: ObjectId, ref: 'Student', required: true },
        status: { type: String, required: true, enum: ATTENDANCE_STATUSES },
        source: { type: String, required: true, enum: ['manual', 'qr', 'biometric', 'import'] },
        note: { type: String, maxlength: 200 },
        at: { type: Date, required: true },
      },
    ],
    submittedAt: { type: Date, required: true },
    editedAfterSubmit: { type: Boolean, default: false },
    idempotencyKey: { type: String, required: true },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, sectionId: 1, date: 1, mode: 1, period: 1 }, { unique: true });
schema.index({ schoolId: 1, 'entries.studentId': 1, date: -1 });

export const AttendanceRecord = defineTenantModel('AttendanceRecord', schema, 'attendanceRecords');
