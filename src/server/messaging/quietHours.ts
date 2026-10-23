import { startOfDayIn, todayIn } from '@/lib/dates';

export type QuietHours = { start: string; end: string };

/** The moment `time` (HH:mm) is on `date`, in the school's time zone. */
export const atTime = (timezone: string, date: string, time: string) =>
  new Date(startOfDayIn(timezone, date).getTime() + minutes(time) * 60_000);

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * When a text sent at `now` may go out: null if it may go straight away, or the moment quiet hours end. The window
 * can run past midnight (21:00 to 07:00).
 */
export function quietUntil(timezone: string, quiet: QuietHours, now = new Date()): Date | null {
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
    .replace('.', ':');
  const [at, start, end] = [minutes(local), minutes(quiet.start), minutes(quiet.end)];
  if (start === end) return null;
  const inside = start < end ? at >= start && at < end : at >= start || at < end;
  if (!inside) return null;
  // Past midnight, the end is tomorrow; before midnight in a window that started today, it is today's.
  const endsToday = start < end || at < end;
  const day = todayIn(timezone, endsToday ? now : new Date(now.getTime() + 86_400_000));
  return new Date(startOfDayIn(timezone, day).getTime() + end * 60_000);
}
