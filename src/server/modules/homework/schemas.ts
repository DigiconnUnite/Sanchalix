import 'server-only';
import { z } from 'zod';

const E = 'homework.errors';
const Id = (key: string) => z.string().regex(/^[0-9a-f]{24}$/, `${E}.${key}`);

export const HomeworkInput = z.object({
  title: z.string().trim().min(1, `${E}.title`).max(120, `${E}.title`),
  instructions: z.string().trim().max(2000, `${E}.instructions`).default(''),
  subjectId: Id('subject'),
  sectionIds: z.array(Id('sections')).min(1, `${E}.sections`).max(20, `${E}.sections`),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.dueOn`)
    .refine((date) => !Number.isNaN(Date.parse(date)), `${E}.dueOn`),
});
export type HomeworkInput = z.infer<typeof HomeworkInput>;

export const HomeworkId = Id('notFound');

export const ListHomework = z.object({ cursor: z.string().optional().catch(undefined) });
export type ListHomework = z.infer<typeof ListHomework>;

export type HomeworkRow = {
  id: string;
  title: string;
  instructions: string;
  subject: string;
  sections: string;
  teacher: string;
  assignedOn: string;
  dueOn: string;
  isPastDue: boolean;
  isMine: boolean;
  attachments: { id: string; fileName: string }[];
};
