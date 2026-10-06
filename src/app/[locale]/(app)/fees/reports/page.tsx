import { getTranslations } from 'next-intl/server';
import { CollectionReport } from '@/features/fees/CollectionReport';
import { getCollectionReport } from '@/server/modules/fees/reports';
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
  const report = await getCollectionReport(
    ctx,
    typeof from === 'string' ? from : undefined,
    typeof to === 'string' ? to : undefined,
  );
  return <CollectionReport key={`${report.from}:${report.to}`} report={report} />;
}
