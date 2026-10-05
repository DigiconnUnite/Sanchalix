import { getTranslations } from 'next-intl/server';
import { ExamsTable } from '@/features/exams/Exams';
import { can } from '@/server/auth/permissions';
import { listClasses } from '@/server/modules/academics/queries';
import { listExams } from '@/server/modules/exams/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('exams');
  return { title: t('title') };
}

export default async function ExamsPage() {
  const ctx = await pageContext('exams.exam.read');
  const canEdit = can(ctx.role, 'exams.exam.update');
  const [exams, classes] = await Promise.all([listExams(ctx), canEdit ? listClasses(ctx) : []]);
  return <ExamsTable exams={exams} classes={classes} canEdit={canEdit} />;
}
