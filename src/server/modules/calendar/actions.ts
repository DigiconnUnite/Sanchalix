'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { addEvent, EventId, EventInput, removeEvent, updateEvent } from './events';
import { HolidayId, HolidayInput } from './schemas';
import { addHoliday, removeHoliday } from './service';

export async function upsertEvent(input: unknown) {
  return withAction('calendar.event.update', async () => {
    const ctx = await requirePermission('calendar.event.update');
    const data = EventInput.parse(input);
    // With an id the event is changed; without one it is added.
    const id = EventId.optional().parse((input as { id?: unknown } | null)?.id);
    if (id) {
      const event = await updateEvent(ctx, id, data);
      await audit(ctx, 'calendar.event.update', { type: 'event', id: event.id }, { before: event.before, after: data });
      return { title: event.title, updated: true };
    }
    const event = await addEvent(ctx, data);
    await audit(ctx, 'calendar.event.create', { type: 'event', id: event.id }, { after: data });
    return { title: event.title, updated: false };
  });
}

export async function deleteEvent(input: unknown) {
  return withAction('calendar.event.delete', async () => {
    const ctx = await requirePermission('calendar.event.update');
    const event = await removeEvent(ctx, EventId.parse(input));
    await audit(ctx, 'calendar.event.delete', { type: 'event', id: event.id }, {
      before: { title: event.title, start: event.start },
    });
    return { title: event.title };
  });
}

export async function upsertHoliday(input: unknown) {
  return withAction('calendar.holiday.update', async () => {
    const ctx = await requirePermission('calendar.holiday.update');
    const data = HolidayInput.parse(input);
    const holiday = await addHoliday(ctx, data);
    await audit(ctx, 'calendar.holiday.create', { type: 'holiday', id: holiday.id }, { after: data });
    return { name: holiday.name, affectedAttendanceRecords: holiday.affectedAttendanceRecords };
  });
}

export async function deleteHoliday(input: unknown) {
  return withAction('calendar.holiday.delete', async () => {
    const ctx = await requirePermission('calendar.holiday.update');
    const holiday = await removeHoliday(ctx, HolidayId.parse(input));
    await audit(ctx, 'calendar.holiday.delete', { type: 'holiday', id: holiday.id }, {
      before: { date: holiday.date, name: holiday.name },
    });
    return { name: holiday.name };
  });
}
