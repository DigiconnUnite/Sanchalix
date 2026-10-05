'use server';

import 'server-only';
import { Types } from 'mongoose';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { SubmitAttendance } from './schemas';
import { submitAttendance as submit } from './service';

export async function submitAttendance(input: unknown) {
  return withAction('attendance.record.create', async () => {
    const ctx = await requirePermission('attendance.record.create');
    const data = SubmitAttendance.parse(input);
    const { recordId, sectionName, summary, before } = await submit(ctx, data);
    await audit(
      ctx,
      before ? 'attendance.record.update' : 'attendance.record.create',
      { type: 'attendanceRecord', id: new Types.ObjectId(String(recordId)) },
      { ...(before && { before }), after: { date: data.date, ...(data.period && { period: data.period }), ...summary } },
    );
    return { sectionName, summary, edited: Boolean(before) };
  });
}
