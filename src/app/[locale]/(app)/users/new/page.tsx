import { getTranslations } from 'next-intl/server';
import { UserForm } from '@/features/users/Users';
import { listUnlinkedStaff } from '@/server/modules/users/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('users.form');
  return { title: t('title') };
}

export default async function NewUserPage() {
  const ctx = await pageContext('users.user.create');
  return <UserForm staff={await listUnlinkedStaff(ctx)} />;
}
