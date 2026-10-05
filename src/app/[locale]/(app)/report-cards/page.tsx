import { getTranslations } from 'next-intl/server';
import { ReportCardsTable } from '@/features/exams/ReportCards';
import { can } from '@/server/auth/permissions';
import { listReportCards } from '@/server/modules/exams/reportCards';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('exams.reportCards');
  return { title: t('title') };
}

export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('exams.reportCard.read');
  const { section } = await searchParams;
  const list = await listReportCards(ctx, typeof section === 'string' ? section : undefined);
  return (
    <ReportCardsTable
      key={list.section?.id}
      list={list}
      canGenerate={can(ctx.role, 'exams.reportCard.create')}
      canPublish={can(ctx.role, 'exams.reportCard.publish')}
      canRemark={can(ctx.role, 'exams.reportCard.update')}
    />
  );
}
