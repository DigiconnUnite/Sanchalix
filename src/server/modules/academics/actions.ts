'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { AssignClassTeacher, ClassInput, SectionInput } from './schemas';
import { assignClassTeacher as assign, createClass, createSection } from './service';

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

export async function assignClassTeacher(input: unknown) {
  return withAction('academics.section.update', async () => {
    const ctx = await requirePermission('academics.class.create');
    const { sectionId, staffId } = AssignClassTeacher.parse(input);
    const section = await assign(ctx, sectionId, staffId);
    await audit(ctx, 'academics.section.update', { type: 'section', id: section.id }, {
      before: { classTeacherId: section.previousTeacherId ? String(section.previousTeacherId) : null },
      after: { classTeacherId: staffId },
    });
    return { name: section.name, teacherName: section.teacherName };
  });
}
