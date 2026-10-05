'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { closeYear, createNextYear, NextYearInput, PromoteSection, promoteSection } from './service';

export async function createAcademicYear(input: unknown) {
  return withAction('settings.academicYear.create', async () => {
    const ctx = await requirePermission('sis.enrollment.update');
    const data = NextYearInput.parse(input);
    const year = await createNextYear(ctx, data);
    await audit(ctx, 'settings.academicYear.create', { type: 'academicYear', id: year.id }, {
      after: { ...data, classes: year.classes, sections: year.sections },
    });
    return { label: year.label, classes: year.classes, sections: year.sections };
  });
}

export async function promoteStudents(input: unknown) {
  return withAction('sis.enrollment.update', async () => {
    const ctx = await requirePermission('sis.enrollment.update');
    const data = PromoteSection.parse(input);
    const { sectionId, ...result } = await promoteSection(ctx, data);
    await audit(ctx, 'sis.enrollment.promote', { type: 'section', id: sectionId }, { after: result });
    return result;
  });
}

export async function closeAcademicYear() {
  return withAction('settings.academicYear.close', async () => {
    const ctx = await requirePermission('sis.enrollment.update');
    const year = await closeYear(ctx);
    await audit(ctx, 'settings.academicYear.close', { type: 'academicYear', id: year.id }, {
      before: { current: year.closed },
      after: { current: year.current },
    });
    return { closed: year.closed, current: year.current };
  });
}
