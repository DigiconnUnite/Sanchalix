import { getTranslations } from 'next-intl/server';
import { HolidaysTable } from '@/features/calendar/HolidaysTable';
import { can } from '@/server/auth/permissions';
import { listHolidays } from '@/server/modules/calendar/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('calendar.holidays');
  return { title: t('title') };
}

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('calendar.holiday.read');
  const { created, affected } = await searchParams;
  return (
    <HolidaysTable
      holidays={await listHolidays(ctx)}
      canEdit={can(ctx.role, 'calendar.holiday.update')}
      created={typeof created === 'string' ? created.slice(0, 80) : null}
      affected={Number(affected) || 0}
    />
  );
}
