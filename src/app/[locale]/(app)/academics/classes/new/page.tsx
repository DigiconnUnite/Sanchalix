import { getTranslations } from 'next-intl/server';
import { ClassForm } from '@/features/academics/AcademicsForm';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('academics.classes.classForm');
  return { title: t('title') };
}

export default async function NewClassPage() {
  await pageContext('academics.class.create');
  return <ClassForm />;
}
