import { getTranslations } from 'next-intl/server';
import { OutboxTable } from '@/features/comms/OutboxTable';
import { listOutbox } from '@/server/messaging/send';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('outbox');
  return { title: t('title') };
}

export default async function OutboxPage() {
  const ctx = await pageContext('messaging.outbox.read');
  return <OutboxTable messages={await listOutbox(ctx)} />;
}
