import { getTranslations } from 'next-intl/server';
import { AnnouncementForm } from '@/features/comms/Announcements';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('comms.announcements.form');
  return { title: t('title') };
}

export default async function NewAnnouncementPage() {
  await pageContext('comms.announcement.create');
  return <AnnouncementForm />;
}
