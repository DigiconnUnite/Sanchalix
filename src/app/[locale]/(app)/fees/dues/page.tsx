import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DuesTable } from '@/features/fees/DuesTable';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { listDues } from '@/server/modules/fees/queries';
import { ListDues } from '@/server/modules/fees/schemas';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.dues');
  return { title: t('title') };
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.invoice.read');
  const query = ListDues.parse(await searchParams);
  const canCollect = can(ctx.role, 'fees.payment.create');
  return (
    <Suspense
      key={JSON.stringify(query)}
      fallback={<DuesTable ageing={query.ageing} pageSize={query.pageSize} canCollect={canCollect} data={null} />}
    >
      <Dues ctx={ctx} query={query} canCollect={canCollect} />
    </Suspense>
  );
}

async function Dues({ ctx, query, canCollect }: { ctx: RequestContext; query: ListDues; canCollect: boolean }) {
  return (
    <DuesTable
      ageing={query.ageing}
      pageSize={query.pageSize}
      canCollect={canCollect}
      data={await listDues(ctx, query)}
    />
  );
}
