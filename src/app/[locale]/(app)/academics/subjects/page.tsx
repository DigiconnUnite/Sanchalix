import SpaceBetween from '@cloudscape-design/components/space-between';
import { getTranslations } from 'next-intl/server';
import { ClassSubjects, SubjectsTable } from '@/features/academics/Timetable';
import { can } from '@/server/auth/permissions';
import { listClasses } from '@/server/modules/academics/queries';
import { listSubjects } from '@/server/modules/timetable/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('academics.subjects');
  return { title: t('title') };
}

export default async function SubjectsPage() {
  const ctx = await pageContext('academics.class.read');
  const [subjects, classes] = await Promise.all([listSubjects(ctx), listClasses(ctx)]);
  const canCreate = can(ctx.role, 'academics.class.create');
  return (
    <SpaceBetween size="l">
      <SubjectsTable subjects={subjects} canCreate={canCreate} />
      <ClassSubjects classes={classes} subjects={subjects} canEdit={canCreate} />
    </SpaceBetween>
  );
}
