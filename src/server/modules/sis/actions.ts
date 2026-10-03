'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { StudentInput } from './schemas';
import { createStudent as create } from './service';

export async function createStudent(input: unknown) {
  return withAction('sis.student.create', async () => {
    const ctx = await requirePermission('sis.student.create');
    const data = StudentInput.parse(input);
    const student = await create(ctx, data);
    await audit(ctx, 'sis.student.create', { type: 'student', id: student.id }, {
      after: { admissionNo: student.admissionNo, sectionId: data.sectionId },
    });
    return { id: String(student.id), admissionNo: student.admissionNo, name: student.name };
  });
}
