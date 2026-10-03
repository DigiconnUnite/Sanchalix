import { getTranslations } from 'next-intl/server';
import { StudentForm } from '@/features/sis/StudentForm';
import { listCurrentSections } from '@/server/modules/academics/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.students.form');
  return { title: t('title') };
}

export default async function NewStudentPage() {
  const ctx = await pageContext('sis.student.create');
  return <StudentForm sections={await listCurrentSections(ctx)} />;
}
