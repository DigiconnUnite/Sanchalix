import { forbidden } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getContext } from '@/server/auth/context';
import { can, type Permission, type RoleKey } from '@/server/auth/permissions';

export async function pageContext(permission?: Permission) {
  const ctx = await getContext();
  if (!ctx) return redirect({ href: '/signin', locale: await getLocale() });
  if (permission && !can(ctx.role, permission)) forbidden();
  return ctx;
}

const HOME_LABEL: Partial<Record<RoleKey, 'today' | 'home'>> = { teacher: 'today', student: 'today', parent: 'home' };

export const homeLabel = (role: RoleKey) => HOME_LABEL[role] ?? 'dashboard';
