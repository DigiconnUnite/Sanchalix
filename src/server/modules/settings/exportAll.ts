import 'server-only';
import type { Model } from 'mongoose';
import type { RequestContext } from '@/server/auth/context';
import { AcademicYear } from '@/server/models/academicYear';
import { Announcement } from '@/server/models/announcement';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { Exam, ExamSchedule, Mark } from '@/server/models/exam';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { LeaveRequest } from '@/server/models/leaveRequest';
import { Payment } from '@/server/models/payment';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { Student } from '@/server/models/student';
import { Subject } from '@/server/models/subject';
import { zip } from '@/server/zip';

type Doc = Record<string, unknown>;
type Table = { name: string; model: Model<never>; columns: string[]; rows?: (doc: Doc) => unknown[][] };

const text = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(text).join('; ');
  return String(value);
};

const table = (name: string, model: unknown, columns: string[]): Table => ({ name, model: model as Model<never>, columns });

// Medical details, Aadhaar numbers, bank details, PAN and salary are not in the export: they have their own audited
// reads, and a file on someone's laptop is not one.
const TABLES: Table[] = [
  table('academic-years', AcademicYear, ['_id', 'label', 'startDate', 'endDate', 'status']),
  table('classes', Class, ['_id', 'academicYearId', 'name', 'order']),
  table('sections', Section, ['_id', 'academicYearId', 'classId', 'name', 'displayName', 'classTeacherId', 'capacity', 'room']),
  table('subjects', Subject, ['_id', 'name', 'code', 'type', 'isOptional']),
  table('students', Student, ['_id', 'admissionNo', 'firstName', 'lastName', 'dob', 'gender', 'category', 'status', 'primaryGuardianId', 'leftOn', 'leavingReason', 'tcNo']),
  table('guardians', Guardian, ['_id', 'name', 'relation', 'phone', 'email', 'occupation', 'studentIds']),
  table('enrollments', Enrollment, ['_id', 'studentId', 'academicYearId', 'classId', 'sectionId', 'rollNo', 'status', 'optionalSubjectIds']),
  table('staff', Staff, ['_id', 'employeeNo', 'name', 'dob', 'gender', 'phone', 'email', 'designation', 'department', 'type', 'joinedOn', 'status']),
  table('staff-attendance', StaffAttendance, ['staffId', 'date', 'status', 'source']),
  table('leave-requests', LeaveRequest, ['_id', 'requesterId', 'leaveTypeCode', 'from', 'to', 'halfDay', 'status', 'reason']),
  {
    ...table('attendance', AttendanceRecord, ['sectionId', 'date', 'mode', 'period', 'studentId', 'status']),
    rows: (doc) =>
      ((doc.entries as Doc[]) ?? []).map((entry) => [doc.sectionId, doc.date, doc.mode, doc.period, entry.studentId, entry.status]),
  },
  table('invoices', Invoice, ['_id', 'invoiceNo', 'studentId', 'academicYearId', 'installmentLabel', 'dueDate', 'status', 'lateFeeMinor', 'totalMinor', 'paidMinor', 'balanceMinor']),
  table('payments', Payment, ['_id', 'receiptNo', 'studentId', 'amountMinor', 'advanceMinor', 'method', 'status', 'reference', 'createdAt']),
  table('exams', Exam, ['_id', 'academicYearId', 'name', 'type', 'status', 'classIds']),
  table('exam-papers', ExamSchedule, ['_id', 'examId', 'classId', 'subjectId', 'date', 'maxMarks', 'passMarks', 'status']),
  table('marks', Mark, ['examScheduleId', 'studentId', 'sectionId', 'total', 'isAbsent', 'grade']),
  table('announcements', Announcement, ['_id', 'title', 'body', 'kind', 'status', 'publishAt', 'expiresAt']),
];

// A cell starting with = + - or @ would run as a formula in a spreadsheet, so it is made plain text.
const cell = (value: unknown) => {
  const raw = text(value);
  const safe = typeof value === 'string' && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

// ponytail: built in memory in the request, fine for a school of a few thousand students. Stream it from a background
// job when it no longer fits.
/** Every table of the school as a CSV file in one ZIP, so the school can take its data away or move it. */
export async function exportSchool(ctx: RequestContext) {
  const counts: Record<string, number> = {};
  const files = [];
  for (const { name, model, columns, rows } of TABLES) {
    const lines = [columns.map(cell).join(',')];
    for await (const doc of model.find({ schoolId: ctx.schoolId } as never).lean().cursor()) {
      const record = doc as unknown as Doc;
      for (const row of rows ? rows(record) : [columns.map((column) => record[column])]) lines.push(row.map(cell).join(','));
    }
    counts[name] = lines.length - 1;
    files.push({ name: `${name}.csv`, data: Buffer.from(`﻿${lines.join('\r\n')}\r\n`) });
  }
  return { bytes: zip(files), counts };
}
