import { getTranslations } from 'next-intl/server';
import { TimetableGrid } from '@/features/academics/Timetable';
import { can } from '@/server/auth/permissions';
import { listCurrentSections } from '@/server/modules/academics/queries';
import { listTeachers } from '@/server/modules/hr/service';
import { getTimetable, listSubjects } from '@/server/modules/timetable/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('academics.timetable');
  return { title: t('title') };
}

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('academics.timetable.read');
  const { section } = await searchParams;
  const sections = await listCurrentSections(ctx);
  const sectionId = sections.find(({ id }) => id === section)?.id ?? null;
  const canEdit = can(ctx.role, 'academics.timetable.update');
  const [timetable, subjects, teachers] = await Promise.all([
    getTimetable(ctx, sectionId ?? ''),
    canEdit ? listSubjects(ctx) : [],
    canEdit ? listTeachers(ctx) : [],
  ]);

  return (
    <TimetableGrid
      key={sectionId}
      sections={sections}
      sectionId={sectionId}
      timetable={timetable}
      subjects={subjects}
      teachers={teachers}
      canEdit={canEdit}
    />
  );
}
