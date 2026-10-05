import { getTranslations } from 'next-intl/server';
import { NotificationsTable } from '@/features/comms/NotificationsTable';
import { listNotifications } from '@/server/modules/comms/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('comms.notifications');
  return { title: t('title') };
}

export default async function NotificationsPage() {
  const ctx = await pageContext();
  return <NotificationsTable notifications={await listNotifications(ctx)} />;
}
