import 'server-only';
import { z } from 'zod';

const Id = z.string().regex(/^[0-9a-f]{24}$/, 'attendance.errors.section');

export const MARKABLE_STATUSES = ['present', 'absent', 'late', 'half_day', 'leave'] as const;
export type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

export const SubmitAttendance = z.object({
  sectionId: Id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'attendance.errors.date'),
  mode: z.literal('daily'),
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
});
export type SubmitAttendance = z.infer<typeof SubmitAttendance>;

export type AttendanceSummary = Record<MarkableStatus, number>;

export type AttendanceSheet = {
  section: { id: string; name: string };
  date: string;
  today: string;
  /** Why the sheet can't be changed, or `open` when it can. */
  state: 'open' | 'future' | 'nonWorking' | 'holiday' | 'locked';
  holidayName: string | null;
  submitted: boolean;
  edited: boolean;
  students: { id: string; name: string; rollNo: number; status: MarkableStatus }[];
};

export type AttendanceRegister = {
  section: { id: string; name: string };
  month: string;
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
