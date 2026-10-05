'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { createUser as create, resetUserPassword as reset, setUserStatus as setStatus } from './service';
import { UserId, UserInput, UserStatus } from './service';

export async function createUser(input: unknown) {
  return withAction('users.user.create', async () => {
    const ctx = await requirePermission('users.user.create');
    const data = UserInput.parse(input);
    const user = await create(ctx, data);
    await audit(ctx, 'users.user.create', { type: 'user', id: user.id }, {
      after: { role: data.role, staffId: data.staffId ?? null },
    });
    return { name: user.name, email: user.email, password: user.password };
  });
}

export async function setUserStatus(input: unknown) {
  return withAction('users.user.update', async () => {
    const ctx = await requirePermission('users.user.update');
    const { id, status } = UserStatus.parse(input);
    const user = await setStatus(ctx, id, status);
    await audit(ctx, 'users.user.update', { type: 'user', id: user.id }, {
      before: { status: user.before },
      after: { status },
    });
    return { name: user.name, status };
  });
}

export async function resetUserPassword(input: unknown) {
  return withAction('users.user.resetPassword', async () => {
    const ctx = await requirePermission('users.user.update');
    const user = await reset(ctx, UserId.parse(input));
    await audit(ctx, 'users.user.resetPassword', { type: 'user', id: user.id });
    return { name: user.name, password: user.password };
  });
}
