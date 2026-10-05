import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { Event, EVENT_TYPES } from '@/server/models/event';
import { Holiday } from '@/server/models/holiday';
import { School } from '@/server/models/school';

const E = 'calendar.events.errors';
const Day = (key: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.${key}`)
    .refine((date) => !Number.isNaN(Date.parse(date)), `${E}.${key}`);

export const EventInput = z
  .object({
    title: z.string().trim().min(1, `${E}.title`).max(120, `${E}.title`),
    type: z.enum(EVENT_TYPES, `${E}.type`).exclude(['holiday']),
    start: Day('start'),
    end: Day('end'),
  })
  .refine(({ start, end }) => end >= start, { path: ['end'], message: `${E}.endBeforeStart` });
export type EventInput = z.infer<typeof EventInput>;
export const EventId = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);

export type CalendarItem = {
  /** Null for a holiday, which is managed on the Holidays page. */
  id: string | null;
  title: string;
  type: (typeof EVENT_TYPES)[number];
  start: string;
  end: string;
};

const shift = (month: string, by: number) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
};

/** Events and holidays that touch the month (`YYYY-MM`, this month when omitted or invalid), oldest first. */
export async function getMonth(ctx: RequestContext, requested: string | undefined) {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const today = todayIn(school?.timezone ?? 'Asia/Kolkata');
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : today.slice(0, 7);
  const [first, last] = [`${month}-01`, `${month}-31`];
  const [events, holidays] = await Promise.all([
    Event.find({ schoolId, start: { $lte: last }, end: { $gte: first } })
      .select('title type start end')
      .lean(),
    Holiday.find({ schoolId, date: { $gte: first, $lte: last } })
      .select('date name')
      .lean(),
  ]);
  const items: CalendarItem[] = [
    ...events.map((event) => ({
      id: String(event._id),
      title: event.title,
      type: event.type,
      start: event.start,
      end: event.end,
    })),
    ...holidays.map((holiday) => ({
      id: null,
      title: holiday.name,
      type: 'holiday' as const,
      start: holiday.date,
      end: holiday.date,
    })),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return { month, today, previous: shift(month, -1), next: shift(month, 1), items };
}

/** The next few events and holidays from today, for the home pages. */
export async function listUpcoming(ctx: RequestContext, limit = 5): Promise<CalendarItem[]> {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const today = todayIn(school?.timezone ?? 'Asia/Kolkata');
  const [events, holidays] = await Promise.all([
    Event.find({ schoolId, end: { $gte: today } })
      .sort({ start: 1 })
      .limit(limit)
      .select('title type start end')
      .lean(),
    Holiday.find({ schoolId, date: { $gte: today } })
      .sort({ date: 1 })
      .limit(limit)
      .select('date name')
      .lean(),
  ]);
  return [
    ...events.map((event) => ({
      id: String(event._id),
      title: event.title,
      type: event.type,
      start: event.start,
      end: event.end,
    })),
    ...holidays.map((holiday) => ({
      id: null,
      title: holiday.name,
      type: 'holiday' as const,
      start: holiday.date,
      end: holiday.date,
    })),
  ]
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit);
}

export async function addEvent(ctx: RequestContext, input: EventInput) {
  const event = await Event.create({
    schoolId: ctx.schoolId,
    ...input,
    allDay: true,
    audience: { type: 'school' },
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: event._id, title: event.title };
}

export async function removeEvent(ctx: RequestContext, id: string) {
  const event = await Event.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: id },
    { deletedAt: new Date(), updatedBy: ctx.userId },
  )
    .select('title start')
    .lean();
  if (!event) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { id: event._id, title: event.title, start: event.start };
}
