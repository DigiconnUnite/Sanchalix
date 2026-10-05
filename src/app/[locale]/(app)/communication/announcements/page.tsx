import { getTranslations } from 'next-intl/server';
import { AnnouncementsTable } from '@/features/comms/Announcements';
import { can } from '@/server/auth/permissions';
import { listAnnouncements } from '@/server/modules/comms/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('comms.announcements');
  return { title: t('title') };
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('comms.announcement.read');
  const { published, recipients } = await searchParams;
  return (
    <AnnouncementsTable
      announcements={await listAnnouncements(ctx)}
      canCreate={can(ctx.role, 'comms.announcement.create')}
      published={typeof published === 'string' ? published.slice(0, 120) : null}
      recipients={Number(recipients) || 0}
    />
  );
}
