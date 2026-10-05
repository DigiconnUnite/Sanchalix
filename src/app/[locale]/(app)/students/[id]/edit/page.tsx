import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StudentForm } from '@/features/sis/StudentForm';
import { getStudent } from '@/server/modules/sis/queries';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.students.form');
  return { title: t('editMeta') };
}

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('sis.student.update');
  const student = await getStudent(ctx, (await params).id);
  if (!student) notFound();
  return <StudentForm sections={[]} student={student} />;
}
