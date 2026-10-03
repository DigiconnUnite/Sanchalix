import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StudentProfileView } from '@/features/sis/StudentProfileView';
import { can } from '@/server/auth/permissions';
import { getStudent, listStudentHistory } from '@/server/modules/sis/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.students');
  return { title: t('title') };
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('sis.student.read');
  const [{ id }, { tab, added }] = await Promise.all([params, searchParams]);
  const student = await getStudent(ctx, id);
  if (!student) notFound();
  const history = can(ctx.role, 'audit.log.read') ? await listStudentHistory(ctx, id) : null;

  return (
    <StudentProfileView
      student={student}
      history={history}
      tab={typeof tab === 'string' ? tab : 'overview'}
      added={added === '1'}
    />
  );
}
