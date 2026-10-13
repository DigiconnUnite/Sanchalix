import { getTranslations } from 'next-intl/server';
import { ImportStudents } from '@/features/sis/ImportStudents';
import { STAFF_IMPORT_COLUMNS } from '@/server/modules/hr/importService';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.import.kinds.staff');
  return { title: t('title') };
}

export default async function ImportStaffPage() {
  await pageContext('hr.staff.create');
  return <ImportStudents kind="staff" columns={STAFF_IMPORT_COLUMNS} />;
}
