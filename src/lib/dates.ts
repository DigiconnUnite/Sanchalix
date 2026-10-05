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

/** Day of the week of a calendar date, 0 (Sunday) to 6 (Saturday). */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
