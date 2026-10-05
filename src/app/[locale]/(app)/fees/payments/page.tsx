import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PaymentsTable } from '@/features/fees/PaymentsTable';
import type { RequestContext } from '@/server/auth/context';
import { listPayments } from '@/server/modules/fees/queries';
import { ListPayments } from '@/server/modules/fees/schemas';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.payments');
  return { title: t('title') };
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.payment.read');
  const query = ListPayments.parse(await searchParams);
  return (
    <Suspense key={JSON.stringify(query)} fallback={<PaymentsTable pageSize={query.pageSize} data={null} />}>
      <Payments ctx={ctx} query={query} />
    </Suspense>
  );
}

async function Payments({ ctx, query }: { ctx: RequestContext; query: ListPayments }) {
  return <PaymentsTable pageSize={query.pageSize} data={await listPayments(ctx, query)} />;
}
