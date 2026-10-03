import { getTranslations } from 'next-intl/server';
import { SectionForm } from '@/features/academics/AcademicsForm';
import { listClasses } from '@/server/modules/academics/queries';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('academics.classes.sectionForm');
  return { title: t('title') };
}

export default async function NewSectionPage() {
  const ctx = await pageContext('academics.class.create');
  return <SectionForm classes={await listClasses(ctx)} />;
}
