import { expect, it } from 'vitest';
import { nextWorkingDay, startOfDayIn, todayIn, weekdayOf } from './dates';

it('gives the calendar date in the school’s time zone, not in UTC', () => {
  const lateEveningUtc = new Date('2026-10-05T20:00:00Z');
  expect(todayIn('Asia/Kolkata', lateEveningUtc)).toBe('2026-10-06');
  expect(todayIn('UTC', lateEveningUtc)).toBe('2026-10-05');
});

it('finds the instant a day starts in a time zone', () => {
  expect(startOfDayIn('Asia/Kolkata', '2026-10-05').toISOString()).toBe('2026-10-04T18:30:00.000Z');
  expect(startOfDayIn('UTC', '2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
  expect(startOfDayIn('America/New_York', '2026-01-15').toISOString()).toBe('2026-01-15T05:00:00.000Z');
});

it('knows the weekday of a calendar date', () => {
  expect(weekdayOf('2026-10-04')).toBe(0);
  expect(weekdayOf('2026-10-05')).toBe(1);
});

it('moves a date past holidays and closed days to the next working day', () => {
  const monToSat = [1, 2, 3, 4, 5, 6];
  expect(nextWorkingDay('2026-10-12', new Set(), monToSat)).toBe('2026-10-12');
  expect(nextWorkingDay('2026-10-11', new Set(), monToSat)).toBe('2026-10-12');
  expect(nextWorkingDay('2026-10-12', new Set(['2026-10-12', '2026-10-13']), monToSat)).toBe('2026-10-14');
  expect(nextWorkingDay('2026-10-10', new Set(['2026-10-12']), [1, 2, 3, 4, 5])).toBe('2026-10-13');
});
