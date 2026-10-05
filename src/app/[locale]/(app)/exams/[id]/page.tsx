import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ExamView } from '@/features/exams/Exams';
import { can } from '@/server/auth/permissions';
import { getExam } from '@/server/modules/exams/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('exams');
  return { title: t('title') };
}

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('exams.exam.read');
  const exam = await getExam(ctx, (await params).id);
  if (!exam) notFound();
  return (
    <ExamView
      key={`${exam.schedules.length}:${exam.published}`}
      exam={exam}
      canEdit={can(ctx.role, 'exams.exam.update')}
      canLock={can(ctx.role, 'exams.mark.approve')}
      canPublish={can(ctx.role, 'exams.exam.publish')}
    />
  );
}
