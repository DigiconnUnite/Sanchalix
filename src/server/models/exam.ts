import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const EXAM_TYPES = ['unit_test', 'term', 'annual', 'practical', 'other'] as const;
export const EXAM_STATUSES = ['draft', 'scheduled', 'in_progress', 'results_published'] as const;

const exam = new Schema(
  {
    academicYearId: { type: ObjectId, ref: 'AcademicYear', required: true },
    termId: ObjectId,
    name: { type: String, required: true, maxlength: 80 },
    type: { type: String, required: true, enum: EXAM_TYPES },
    weightage: { type: Number, min: 0, max: 100 },
    classIds: { type: [{ type: ObjectId, ref: 'Class' }], required: true },
    status: { type: String, enum: EXAM_STATUSES, default: 'draft' },
    ...audit,
  },
  { timestamps: true },
);
exam.index({ schoolId: 1, academicYearId: 1, createdAt: -1 });

export const Exam = defineTenantModel('Exam', exam, 'exams');

const schedule = new Schema(
  {
    examId: { type: ObjectId, ref: 'Exam', required: true },
    classId: { type: ObjectId, ref: 'Class', required: true },
    subjectId: { type: ObjectId, ref: 'Subject', required: true },
    date: { type: String, required: true, match: DATE_STR },
    start: String,
    end: String,
    maxMarks: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, required: true, min: 0 },
    components: [{ _id: false, name: { type: String, enum: ['theory', 'practical', 'internal'] }, maxMarks: Number }],
    status: { type: String, enum: ['scheduled', 'marks_open', 'submitted', 'locked'], default: 'marks_open' },
    lockedBy: { type: ObjectId, ref: 'User' },
    lockedAt: Date,
    ...audit,
  },
  { timestamps: true },
);
schedule.index({ schoolId: 1, examId: 1, classId: 1, subjectId: 1 }, { unique: true });

export const ExamSchedule = defineTenantModel('ExamSchedule', schedule, 'examSchedules');

const mark = new Schema(
  {
    examScheduleId: { type: ObjectId, ref: 'ExamSchedule', required: true },
    studentId: { type: ObjectId, ref: 'Student', required: true },
    sectionId: { type: ObjectId, ref: 'Section', required: true },
    components: [{ _id: false, name: String, marks: Number }],
    total: { type: Number, default: null },
    isAbsent: { type: Boolean, default: false },
    grade: String,
    enteredBy: { type: ObjectId, ref: 'User' },
    ...audit,
  },
  { timestamps: true },
);
mark.index({ schoolId: 1, examScheduleId: 1, studentId: 1 }, { unique: true });
mark.index({ schoolId: 1, studentId: 1 });

export const Mark = defineTenantModel('Mark', mark, 'marks');
