import { getTranslations } from 'next-intl/server';
import { AnnouncementForm } from '@/features/comms/Announcements';
import { listCurrentSections } from '@/server/modules/academics/queries';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('comms.announcements.form');
  return { title: t('title') };
}

export default async function NewAnnouncementPage() {
  const ctx = await pageContext('comms.announcement.create');
  return <AnnouncementForm sections={await listCurrentSections(ctx)} />;
}
