import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AnnouncementView } from '@/features/comms/Announcements';
import { getAnnouncement } from '@/server/modules/comms/service';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('comms.announcements');
  return { title: t('title') };
}

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('comms.announcement.read');
  const announcement = await getAnnouncement(ctx, (await params).id);
  if (!announcement) notFound();
  return <AnnouncementView announcement={announcement} />;
}
