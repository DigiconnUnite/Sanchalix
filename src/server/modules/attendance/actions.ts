'use server';

import 'server-only';
import { Types } from 'mongoose';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/server/auth/context';
import { logger } from '@/server/logger';
import { sendAbsenceAlerts } from '@/server/messaging/alerts';
import { getSchoolBrand } from '@/server/platform/queries';
import { CorrectAttendance, SubmitAttendance } from './schemas';
import { submitAttendance as submit } from './service';

export async function correctAttendance(input: unknown) {
  return withAction('attendance.record.update', async () => {
    const ctx = await requirePermission('attendance.record.update');
    const { reason, ...data } = CorrectAttendance.parse(input);
    const { recordId, sectionName, summary, before } = await submit(ctx, data, true);
    await audit(ctx, 'attendance.record.correct', { type: 'attendanceRecord', id: new Types.ObjectId(String(recordId)) }, {
      ...(before && { before }),
      after: { date: data.date, ...(data.period && { period: data.period }), ...summary },
      reason,
    });
    return { sectionName, summary, edited: true };
  });
}

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
    // Guardians of absent students are told once the day's attendance is in. A failed alert never undoes the sheet.
    if (data.mode === 'daily') {
      const t = await getTranslations('outbound');
      const school = await getSchoolBrand(ctx.schoolId);
      await sendAbsenceAlerts(ctx, data.sectionId, data.date, ({ student }) =>
        t('absence', { school: school.name, student, date: data.date }),
      ).catch((error: unknown) => logger.error({ err: error }, 'absence alerts failed'));
    }
    return { sectionName, summary, edited: Boolean(before) };
  });
}
