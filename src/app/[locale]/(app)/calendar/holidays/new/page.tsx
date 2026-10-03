import { getTranslations } from 'next-intl/server';
import { HolidayForm } from '@/features/calendar/HolidayForm';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('calendar.holidays.form');
  return { title: t('title') };
}

export default async function NewHolidayPage() {
  await pageContext('calendar.holiday.update');
  return <HolidayForm />;
}
