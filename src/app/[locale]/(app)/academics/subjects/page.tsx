import { getTranslations } from 'next-intl/server';
import { SubjectsTable } from '@/features/academics/Timetable';
import { can } from '@/server/auth/permissions';
import { listSubjects } from '@/server/modules/timetable/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('academics.subjects');
  return { title: t('title') };
}

export default async function SubjectsPage() {
  const ctx = await pageContext('academics.class.read');
  return <SubjectsTable subjects={await listSubjects(ctx)} canCreate={can(ctx.role, 'academics.class.create')} />;
}
