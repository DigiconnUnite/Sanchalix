import { getTranslations } from 'next-intl/server';
import { LeaveForm } from '@/features/hr/Leave';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.leave.form');
  return { title: t('title') };
}

export default async function NewLeavePage() {
  await pageContext('hr.leave.create');
  return <LeaveForm />;
}
