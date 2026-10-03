'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { HolidayId, HolidayInput } from './schemas';
import { addHoliday, removeHoliday } from './service';

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
