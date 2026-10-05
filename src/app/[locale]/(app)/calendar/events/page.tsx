import { getTranslations } from 'next-intl/server';
import { EventsCalendar } from '@/features/calendar/EventsCalendar';
import { can } from '@/server/auth/permissions';
import { getMonth } from '@/server/modules/calendar/events';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('calendar.events');
  return { title: t('title') };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('calendar.event.read');
  const { month } = await searchParams;
  const calendar = await getMonth(ctx, typeof month === 'string' ? month : undefined);
  return <EventsCalendar key={calendar.month} {...calendar} canEdit={can(ctx.role, 'calendar.event.update')} />;
}
