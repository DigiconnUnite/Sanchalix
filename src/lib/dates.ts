/** Today's calendar date (`YYYY-MM-DD`) in the given IANA time zone. */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** The instant a calendar date begins in the given time zone (for time zones without a DST change that day). */
export function startOfDayIn(timeZone: string, date: string) {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  const wallClock = new Date(utcMidnight.toLocaleString('en-US', { timeZone }));
  const utcWallClock = new Date(utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utcMidnight.getTime() - (wallClock.getTime() - utcWallClock.getTime()));
}

/** The calendar date `days` days before `date`. */
export const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** Day of the week of a calendar date, 0 (Sunday) to 6 (Saturday). */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The first day on or after `date` that is a working day and not a holiday. Gives up after a year of closed days. */
export function nextWorkingDay(date: string, holidays: ReadonlySet<string>, workingDays: readonly number[]) {
  let day = date;
  for (let step = 0; step < 366; step += 1) {
    if (workingDays.includes(weekdayOf(day)) && !holidays.has(day)) return day;
    day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return date;
}
