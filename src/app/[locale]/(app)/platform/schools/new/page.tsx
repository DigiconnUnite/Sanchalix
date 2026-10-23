import { getTranslations } from 'next-intl/server';
import { SchoolForm } from '@/features/platform/Schools';
import { platformContext } from '../../platformContext';

export async function generateMetadata() {
  const t = await getTranslations('platform.form');
  return { title: t('title') };
}

export default async function NewSchoolPage() {
  await platformContext('platform.school.create');
  return <SchoolForm />;
}
