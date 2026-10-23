import { getTranslations } from 'next-intl/server';
import { CollectionReport } from '@/features/fees/CollectionReport';
import { getBillingReport, getCollectionReport } from '@/server/modules/fees/reports';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.reports');
  return { title: t('title') };
}

export default async function FeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.payment.read');
  const { from, to } = await searchParams;
  const [report, billing] = await Promise.all([
    getCollectionReport(ctx, typeof from === 'string' ? from : undefined, typeof to === 'string' ? to : undefined),
    getBillingReport(ctx),
  ]);
  return <CollectionReport key={`${report.from}:${report.to}`} report={report} billing={billing} />;
}
