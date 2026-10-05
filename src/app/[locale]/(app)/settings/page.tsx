import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Settings } from '@/features/settings/Settings';
import { getSettings } from '@/server/modules/settings/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('settings.school.update');
  const [settings, { tab }] = await Promise.all([getSettings(ctx), searchParams]);
  if (!settings) notFound();
  return <Settings settings={settings} tab={typeof tab === 'string' ? tab : 'school'} />;
}
