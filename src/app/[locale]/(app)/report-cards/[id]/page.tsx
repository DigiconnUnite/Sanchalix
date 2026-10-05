import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ReportCardView } from '@/features/exams/ReportCards';
import { getReportCard } from '@/server/modules/exams/reportCards';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('exams.reportCards');
  return { title: t('title') };
}

export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  // No single permission fits: staff need exams.reportCard.read, families only need the card to be theirs.
  const ctx = await pageContext();
  const card = await getReportCard(ctx, (await params).id);
  if (!card) notFound();
  return <ReportCardView card={card} />;
}
