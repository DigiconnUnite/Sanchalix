import 'server-only';
import { z } from 'zod';

export const HolidayInput = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'calendar.holidays.errors.date')
    .refine((date) => !Number.isNaN(Date.parse(date)), 'calendar.holidays.errors.date'),
  name: z.string().trim().min(1, 'calendar.holidays.errors.name').max(80, 'calendar.holidays.errors.name'),
});
export type HolidayInput = z.infer<typeof HolidayInput>;

export const HolidayId = z.string().regex(/^[0-9a-f]{24}$/);

export type HolidayRow = { id: string; date: string; name: string };
