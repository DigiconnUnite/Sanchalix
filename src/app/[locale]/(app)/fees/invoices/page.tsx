import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { InvoicesTable } from '@/features/fees/InvoicesTable';
import type { RequestContext } from '@/server/auth/context';
import { listInvoices } from '@/server/modules/fees/queries';
import { ListInvoices } from '@/server/modules/fees/schemas';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.invoices');
  return { title: t('title') };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.invoice.read');
  const query = ListInvoices.parse(await searchParams);
  const status = query.status ?? null;

  return (
    <Suspense
      key={JSON.stringify(query)}
      fallback={<InvoicesTable status={status} pageSize={query.pageSize} data={null} />}
    >
      <Invoices ctx={ctx} query={query} />
    </Suspense>
  );
}

async function Invoices({ ctx, query }: { ctx: RequestContext; query: ListInvoices }) {
  return (
    <InvoicesTable status={query.status ?? null} pageSize={query.pageSize} data={await listInvoices(ctx, query)} />
  );
}
