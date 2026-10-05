'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { HomeworkId, HomeworkInput } from './schemas';
import { createHomework as create, deleteHomework as remove } from './service';

export async function createHomework(input: unknown) {
  return withAction('homework.assignment.create', async () => {
    const ctx = await requirePermission('homework.assignment.create');
    const data = HomeworkInput.parse(input);
    const homework = await create(ctx, data);
    await audit(ctx, 'homework.assignment.create', { type: 'homework', id: homework.id }, {
      after: { title: data.title, sections: data.sectionIds.length, dueOn: data.dueOn },
    });
    return { title: homework.title };
  });
}

export async function deleteHomework(input: unknown) {
  return withAction('homework.assignment.delete', async () => {
    const ctx = await requirePermission('homework.assignment.create');
    const homework = await remove(ctx, HomeworkId.parse(input));
    await audit(ctx, 'homework.assignment.delete', { type: 'homework', id: homework.id }, {
      before: { title: homework.title },
    });
    return { title: homework.title };
  });
}
