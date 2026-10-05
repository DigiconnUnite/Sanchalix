import { getTranslations } from 'next-intl/server';
import { ImportStudents } from '@/features/sis/ImportStudents';
import { listCurrentSections } from '@/server/modules/academics/queries';
import { IMPORT_COLUMNS } from '@/server/modules/sis/importService';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.import');
  return { title: t('title') };
}

export default async function ImportStudentsPage() {
  const ctx = await pageContext('sis.student.import');
  const sections = await listCurrentSections(ctx);
  return <ImportStudents columns={IMPORT_COLUMNS} sections={sections.map(({ name }) => name)} />;
}
