'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { ClassInput, SectionInput } from './schemas';
import { createClass, createSection } from './service';

export async function upsertClass(input: unknown) {
  return withAction('academics.class.create', async () => {
    const ctx = await requirePermission('academics.class.create');
    const data = ClassInput.parse(input);
    const created = await createClass(ctx, data);
    await audit(ctx, 'academics.class.create', { type: 'class', id: created.id }, { after: data });
    return { id: String(created.id), name: created.name };
  });
}

export async function upsertSection(input: unknown) {
  return withAction('academics.section.create', async () => {
    const ctx = await requirePermission('academics.class.create');
    const data = SectionInput.parse(input);
    const created = await createSection(ctx, data);
    await audit(ctx, 'academics.section.create', { type: 'section', id: created.id }, { after: data });
    return { id: String(created.id), name: created.name };
  });
}
