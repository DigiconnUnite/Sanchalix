'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { AlertTimeInput, LeaveQuotasInput, saveAlertTime, PeriodsInput, QuietHoursInput, saveLeaveQuotas, saveQuietHours, savePeriods, saveTerms, SchoolInput, TermsInput, updateSchool } from './service';

export async function updateSchoolSettings(input: unknown) {
  return withAction('settings.school.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const data = SchoolInput.parse(input);
    const school = await updateSchool(ctx, data);
    await audit(ctx, 'settings.school.update', { type: 'school', id: ctx.schoolId }, {
      before: school.before,
      after: { name: data.name, workingDays: data.workingDays, shiftDueDates: data.shiftDueDates },
    });
    return { name: school.name };
  });
}

export async function updateAlertTime(input: unknown) {
  return withAction('settings.alertTime.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const data = AlertTimeInput.parse(input);
    const { before } = await saveAlertTime(ctx, data);
    await audit(ctx, 'settings.alertTime.update', { type: 'school', id: ctx.schoolId }, {
      before: { absenceAlertTime: before },
      after: data,
    });
    return data;
  });
}

export async function updateLeaveQuotas(input: unknown) {
  return withAction('settings.leaveQuotas.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const quotas = LeaveQuotasInput.parse(input);
    const { before } = await saveLeaveQuotas(ctx, quotas);
    await audit(ctx, 'settings.leaveQuotas.update', { type: 'school', id: ctx.schoolId }, { before, after: quotas });
    return quotas;
  });
}

export async function updateQuietHours(input: unknown) {
  return withAction('settings.quietHours.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const quiet = QuietHoursInput.parse(input);
    const { before } = await saveQuietHours(ctx, quiet);
    await audit(ctx, 'settings.quietHours.update', { type: 'school', id: ctx.schoolId }, {
      before: before ? { start: before.start, end: before.end } : {},
      after: quiet,
    });
    return quiet;
  });
}

export async function updateTerms(input: unknown) {
  return withAction('settings.terms.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const terms = TermsInput.parse(input);
    const saved = await saveTerms(ctx, terms);
    await audit(ctx, 'settings.terms.update', { type: 'academicYear', id: saved.id }, {
      before: { count: saved.before },
      after: { terms },
    });
    return { count: saved.count };
  });
}

export async function updatePeriods(input: unknown) {
  return withAction('settings.periods.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const periods = PeriodsInput.parse(input);
    const saved = await savePeriods(ctx, periods);
    await audit(ctx, 'settings.periods.update', { type: 'periodDefinition', id: saved.id }, { after: { periods } });
    return { count: saved.count };
  });
}
