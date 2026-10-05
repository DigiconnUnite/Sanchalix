'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { createPortalAccount as create, PortalAccountInput } from './service';

export async function createPortalAccount(input: unknown) {
  return withAction('users.user.create', async () => {
    const ctx = await requirePermission('users.user.create');
    const data = PortalAccountInput.parse(input);
    const account = await create(ctx, data);
    await audit(ctx, 'users.user.create', { type: 'user', id: account.id }, {
      after: { role: data.guardianId ? 'parent' : 'student', studentId: data.studentId },
    });
    return { name: account.name, email: account.email, password: account.password };
  });
}
