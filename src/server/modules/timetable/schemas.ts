import 'server-only';
import { z } from 'zod';
import { SUBJECT_TYPES } from '@/server/models/subject';

const E = 'academics.timetable.errors';
const Id = (key: string) => z.string().regex(/^[0-9a-f]{24}$/, `${E}.${key}`);

export const SubjectInput = z.object({
  name: z.string().trim().min(1, `${E}.subjectName`).max(60, `${E}.subjectName`),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, `${E}.subjectCode`),
  type: z.enum(SUBJECT_TYPES, `${E}.subjectType`),
});
export type SubjectInput = z.infer<typeof SubjectInput>;

const Cell = z.object({
  sectionId: Id('section'),
  day: z.number().int().min(1).max(6),
  period: z.number().int().min(1).max(12),
});
export const ClearSlot = Cell;
export const SlotInput = Cell.extend({ subjectId: Id('subject'), teacherId: Id('teacher') });
export type SlotInput = z.infer<typeof SlotInput>;
export type ClearSlot = z.infer<typeof ClearSlot>;

export type Period = { number: number; start: string; end: string };
export type SubjectRow = { id: string; name: string; code: string; type: (typeof SUBJECT_TYPES)[number] };
export type TimetableCell = { subjectId: string; subject: string; teacherId: string; teacher: string };
export type Timetable = { periods: Period[]; cells: Record<string, TimetableCell> };
export type TeacherPeriod = Period & { section: string; subject: string };
