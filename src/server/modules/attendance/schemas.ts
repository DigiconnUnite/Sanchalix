import 'server-only';
import { z } from 'zod';

const Id = z.string().regex(/^[0-9a-f]{24}$/, 'attendance.errors.section');

export const MARKABLE_STATUSES = ['present', 'absent', 'late', 'half_day', 'leave'] as const;
export type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

export const SubmitAttendance = z
  .object({
  sectionId: Id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'attendance.errors.date'),
  mode: z.enum(['daily', 'period']),
  period: z.number().int().min(1).max(12).optional(),
  entries: z
    .array(
      z.object({
        studentId: Id,
        status: z.enum(MARKABLE_STATUSES),
        note: z.string().trim().max(200, 'attendance.errors.note').optional(),
      }),
    )
    .min(1, 'attendance.errors.roster'),
  idempotencyKey: z.uuid(),
  })
  .refine(({ mode, period }) => (mode === 'period') === (period !== undefined), {
    path: ['period'],
    message: 'attendance.errors.noPeriod',
  });
export type SubmitAttendance = z.infer<typeof SubmitAttendance>;

/** A change to a day that was already submitted, by someone allowed to correct the register, with the reason. */
export const CorrectAttendance = SubmitAttendance.and(
  z.object({ reason: z.string().trim().min(5, 'attendance.errors.reason').max(200, 'attendance.errors.reason') }),
);

export type AttendanceSummary = Record<MarkableStatus, number>;

export type AttendanceSheet = {
  section: { id: string; name: string };
  date: string;
  today: string;
  /** Why the sheet can't be changed, or `open` when it can. */
  state: 'open' | 'future' | 'nonWorking' | 'holiday' | 'locked' | 'noPeriod';
  /** The period this sheet is for, or null for the whole day. */
  period: number | null;
  /** Periods of this section on this date that the user may take attendance for. */
  periods: { number: number; time: string; subject: string }[];
  canDaily: boolean;
  /** True when this user is correcting a day that would otherwise be locked. A reason is then required. */
  correcting: boolean;
  holidayName: string | null;
  submitted: boolean;
  edited: boolean;
  students: { id: string; name: string; rollNo: number; status: MarkableStatus }[];
};

export type AttendanceRegister = {
  section: { id: string; name: string };
  month: string;
  /** The period shown, or null for whole-day attendance. */
  period: number | null;
  /** Periods this section has on its timetable, on any day. */
  periods: number[];
  days: { date: string; day: number; kind: 'working' | 'holiday' | 'nonWorking'; taken: boolean }[];
  students: {
    id: string;
    name: string;
    rollNo: number;
    marks: Record<string, MarkableStatus>;
    present: number;
    absent: number;
    percent: number | null;
  }[];
};
