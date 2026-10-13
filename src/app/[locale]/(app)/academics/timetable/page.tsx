import { getTranslations } from 'next-intl/server';
import { TimetableGrid } from '@/features/academics/Timetable';
import { can } from '@/server/auth/permissions';
import { getSectionSubjectIds, listCurrentSections } from '@/server/modules/academics/queries';
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
  const [timetable, subjects, teachers, classSubjects] = await Promise.all([
    getTimetable(ctx, sectionId ?? ''),
    canEdit ? listSubjects(ctx) : [],
    canEdit ? listTeachers(ctx) : [],
    canEdit ? getSectionSubjectIds(ctx, sectionId) : null,
  ]);

  return (
    <TimetableGrid
      key={sectionId}
      sections={sections}
      sectionId={sectionId}
      timetable={timetable}
      subjects={classSubjects ? subjects.filter((subject) => classSubjects.includes(subject.id)) : subjects}
      teachers={teachers}
      canEdit={canEdit}
    />
  );
}
