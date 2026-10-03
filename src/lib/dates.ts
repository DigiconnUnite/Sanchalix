/** Today's calendar date (`YYYY-MM-DD`) in the given IANA time zone. */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Day of the week of a calendar date, 0 (Sunday) to 6 (Saturday). */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
