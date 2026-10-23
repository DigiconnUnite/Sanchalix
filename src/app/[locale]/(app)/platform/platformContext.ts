import { forbidden } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getContext, getPlatformContext } from '@/server/auth/context';
import { can, type Permission } from '@/server/auth/permissions';

/** For pages only platform staff may open. A school's own staff are refused; anyone else is sent to sign in. */
export async function platformContext(permission: Permission) {
  const ctx = await getPlatformContext();
  if (!ctx) {
    if (await getContext()) forbidden();
    return redirect({ href: '/signin', locale: await getLocale() });
  }
  if (!can(ctx.role, permission)) forbidden();
  return ctx;
}
