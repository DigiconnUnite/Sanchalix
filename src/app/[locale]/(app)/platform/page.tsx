import ColumnLayout from '@cloudscape-design/components/column-layout';
import { getTranslations } from 'next-intl/server';
import { KpiTile } from '@/components/KpiTile';
import { getPlatformSummary } from '@/server/modules/platform/service';
import { platformContext } from './platformContext';

export async function generateMetadata() {
  const t = await getTranslations('platform.home');
  return { title: t('title') };
}

export default async function PlatformHomePage() {
  await platformContext('platform.school.read');
  const [t, summary] = await Promise.all([getTranslations('platform.home'), getPlatformSummary()]);
  const schools = '/platform/schools';
  return (
    <ColumnLayout columns={3}>
      <KpiTile title={t('active')} value={String(summary.schools.active)} href={schools} description={t('activeNote')} />
      <KpiTile title={t('onboarding')} value={String(summary.schools.onboarding)} href={schools} description={t('onboardingNote')} />
      <KpiTile title={t('suspended')} value={String(summary.schools.suspended)} href={schools} description={t('suspendedNote')} />
      <KpiTile title={t('students')} value={String(summary.students)} href={schools} description={t('studentsNote')} />
      <KpiTile title={t('staff')} value={String(summary.staff)} href={schools} description={t('staffNote')} />
      <KpiTile title={t('users')} value={String(summary.users)} href={schools} description={t('usersNote')} />
    </ColumnLayout>
  );
}
