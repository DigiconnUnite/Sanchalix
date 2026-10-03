import 'server-only';
import { z } from 'zod';

export const ClassInput = z.object({
  name: z.string().trim().min(1, 'academics.classes.errors.className').max(40, 'academics.classes.errors.className'),
  order: z.coerce
    .number('academics.classes.errors.order')
    .int('academics.classes.errors.order')
    .min(1, 'academics.classes.errors.order')
    .max(20, 'academics.classes.errors.order'),
});
export type ClassInput = z.infer<typeof ClassInput>;

export const SectionInput = z.object({
  classId: z.string().regex(/^[0-9a-f]{24}$/, 'academics.classes.errors.class'),
  name: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,4}$/, 'academics.classes.errors.sectionName'),
  capacity: z.coerce
    .number('academics.classes.errors.capacity')
    .int('academics.classes.errors.capacity')
    .min(1, 'academics.classes.errors.capacity')
    .max(200, 'academics.classes.errors.capacity'),
  room: z.string().trim().max(20, 'academics.classes.errors.room').default(''),
});
export type SectionInput = z.infer<typeof SectionInput>;

export type SectionRow = {
  id: string;
  className: string;
  name: string;
  strength: number;
  capacity: number;
  room: string | null;
};
