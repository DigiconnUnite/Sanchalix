'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { PeriodsInput, savePeriods, saveTerms, SchoolInput, TermsInput, updateSchool } from './service';

export async function updateSchoolSettings(input: unknown) {
  return withAction('settings.school.update', async () => {
    const ctx = await requirePermission('settings.school.update');
    const data = SchoolInput.parse(input);
    const school = await updateSchool(ctx, data);
    await audit(ctx, 'settings.school.update', { type: 'school', id: ctx.schoolId }, {
      before: school.before,
      after: { name: data.name, workingDays: data.workingDays },
    });
    return { name: school.name };
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
