import { getTranslations } from 'next-intl/server';
import { HomeworkForm } from '@/features/homework/Homework';
import { listHomeworkSections } from '@/server/modules/homework/service';
import { listSubjects } from '@/server/modules/timetable/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('homework.form');
  return { title: t('title') };
}

export default async function NewHomeworkPage() {
  const ctx = await pageContext('homework.assignment.create');
  const [sections, subjects] = await Promise.all([listHomeworkSections(ctx), listSubjects(ctx)]);
  return <HomeworkForm sections={sections} subjects={subjects} />;
}
