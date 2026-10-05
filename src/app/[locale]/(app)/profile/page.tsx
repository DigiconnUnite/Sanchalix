import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/features/auth/ProfileView';
import { parseDensity } from '@/lib/visualMode';
import { User } from '@/server/models/user';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('auth.profile');
  return { title: t('title') };
}

export default async function ProfilePage() {
  const ctx = await pageContext();
  const [t, user] = await Promise.all([
    getTranslations('shell.roles'),
    User.findById(ctx.userId).select('email density').lean(),
  ]);
  return (
    <ProfileView
      name={ctx.name}
      roleLabel={t(ctx.role)}
      email={user?.email ?? null}
      density={parseDensity(user?.density ?? undefined)}
    />
  );
}
