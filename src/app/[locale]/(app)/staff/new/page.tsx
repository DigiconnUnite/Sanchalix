import { getTranslations } from 'next-intl/server';
import { StaffForm } from '@/features/hr/Staff';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.form');
  return { title: t('title') };
}

export default async function NewStaffPage() {
  await pageContext('hr.staff.create');
  return <StaffForm />;
}
