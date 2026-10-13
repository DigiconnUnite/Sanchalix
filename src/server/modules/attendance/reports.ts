import 'server-only';
import { Types } from 'mongoose';
import { daysBefore } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Student } from '@/server/models/student';
import { getSchoolCalendar, listAttendanceSections } from './queries';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const LOW_LIMIT = 100;
/** Boards ask for 75% attendance to sit the exams, so that is the line the report draws. */
export const ELIGIBILITY_PERCENT = 75;

export type AttendanceReport = {
  from: string;
  to: string;
  percent: number | null;
  sections: { id: string; name: string; days: number; students: number; percent: number; low: number }[];
  low: { id: string; name: string; admissionNo: string; section: string; days: number; absent: number; percent: number }[];
  lowTotal: number;
};

const percentOf = (score: number, days: number) => Math.round((score / days) * 1000) / 10;

/**
 * Daily attendance between two dates (the last 30 days by default) for the sections this person may see: each
 * section's average, and the students under the eligibility line, lowest first. A half day counts as half present
 * and a late arrival as present, the same as the register.
 */
export async function getAttendanceReport(
  ctx: RequestContext,
  requestedFrom: string | undefined,
  requestedTo: string | undefined,
): Promise<AttendanceReport> {
  const { schoolId } = ctx;
  const [{ today }, sections] = await Promise.all([getSchoolCalendar(ctx), listAttendanceSections(ctx, 'any')]);
  const valid = (date: string | undefined) => (date && DAY.test(date) && !Number.isNaN(Date.parse(date)) ? date : null);
  const asked = valid(requestedTo) ?? today;
  const to = asked > today ? today : asked;
  const wanted = valid(requestedFrom) ?? daysBefore(to, 29);
  // A reversed or very long range is pulled back, so the report always answers and never scans years of registers.
  const earliest = daysBefore(to, MAX_DAYS - 1);
  const from = wanted > to ? to : wanted < earliest ? earliest : wanted;

  const match = {
    schoolId,
    deletedAt: null,
    mode: 'daily',
    sectionId: { $in: sections.map((section) => new Types.ObjectId(section.id)) },
    date: { $gte: from, $lte: to },
  };
  const [perStudent, perSection] = await Promise.all([
    AttendanceRecord.aggregate<{ _id: { section: Types.ObjectId; student: Types.ObjectId }; days: number; score: number; absent: number }>([
      { $match: match },
      { $unwind: '$entries' },
      { $match: { 'entries.status': { $ne: 'holiday' } } },
      {
        $group: {
          _id: { section: '$sectionId', student: '$entries.studentId' },
          days: { $sum: 1 },
          score: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $in: ['$entries.status', ['present', 'late']] }, then: 1 },
                  { case: { $eq: ['$entries.status', 'half_day'] }, then: 0.5 },
                ],
                default: 0,
              },
            },
          },
          absent: { $sum: { $cond: [{ $eq: ['$entries.status', 'absent'] }, 1, 0] } },
        },
      },
    ]),
    AttendanceRecord.aggregate<{ _id: Types.ObjectId; days: number }>([
      { $match: match },
      { $group: { _id: '$sectionId', days: { $sum: 1 } } },
    ]),
  ]);

  const rows = perStudent.map((row) => ({ ...row, percent: percentOf(row.score, row.days) }));
  const lowRows = rows.filter((row) => row.percent < ELIGIBILITY_PERCENT).sort((a, b) => a.percent - b.percent);
  const shown = lowRows.slice(0, LOW_LIMIT);
  const students = await Student.find({ schoolId, _id: { $in: shown.map((row) => row._id.student) } })
    .select('firstName lastName admissionNo')
    .lean();
  const studentOf = new Map(students.map((student) => [String(student._id), student]));
  const nameOf = new Map(sections.map((section) => [section.id, section.name]));
  const [score, days] = [rows.reduce((sum, row) => sum + row.score, 0), rows.reduce((sum, row) => sum + row.days, 0)];

  return {
    from,
    to,
    percent: days > 0 ? percentOf(score, days) : null,
    sections: sections.flatMap((section) => {
      const own = rows.filter((row) => String(row._id.section) === section.id);
      const taken = own.reduce((sum, row) => sum + row.days, 0);
      return taken > 0
        ? [
            {
              ...section,
              days: perSection.find((row) => String(row._id) === section.id)?.days ?? 0,
              students: own.length,
              percent: percentOf(own.reduce((sum, row) => sum + row.score, 0), taken),
              low: own.filter((row) => row.percent < ELIGIBILITY_PERCENT).length,
            },
          ]
        : [];
    }),
    low: shown.flatMap((row) => {
      const student = studentOf.get(String(row._id.student));
      return student
        ? [
            {
              id: String(student._id),
              name: `${student.firstName} ${student.lastName ?? ''}`.trim(),
              admissionNo: student.admissionNo,
              section: nameOf.get(String(row._id.section)) ?? '',
              days: row.days,
              absent: row.absent,
              percent: row.percent,
            },
          ]
        : [];
    }),
    lowTotal: lowRows.length,
  };
}
