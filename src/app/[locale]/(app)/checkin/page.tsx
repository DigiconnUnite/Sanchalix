import { getTranslations } from 'next-intl/server';
import { CheckIn } from '@/features/hr/CheckIn';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.checkIn');
  return { title: t('title') };
}

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await pageContext('hr.checkin.create');
  const { s } = await searchParams;
  return <CheckIn token={typeof s === 'string' ? s : null} />;
}
