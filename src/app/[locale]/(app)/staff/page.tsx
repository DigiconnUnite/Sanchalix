import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { StaffTable } from '@/features/hr/Staff';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { ListStaff } from '@/server/modules/hr/schemas';
import { listStaff } from '@/server/modules/hr/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr');
  return { title: t('title') };
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('hr.staff.read');
  const params = await searchParams;
  const query = ListStaff.parse(params);
  const shared = {
    pageSize: query.pageSize,
    canCreate: can(ctx.role, 'hr.staff.create'),
    created: typeof params.created === 'string' ? params.created.slice(0, 120) : null,
    updated: typeof params.updated === 'string' ? params.updated.slice(0, 120) : null,
  };
  return (
    <Suspense key={JSON.stringify(query)} fallback={<StaffTable {...shared} data={null} />}>
      <StaffList ctx={ctx} query={query} shared={shared} />
    </Suspense>
  );
}

async function StaffList({
  ctx,
  query,
  shared,
}: {
  ctx: RequestContext;
  query: ListStaff;
  shared: { pageSize: number; canCreate: boolean; created: string | null; updated: string | null };
}) {
  return <StaffTable {...shared} data={await listStaff(ctx, query)} />;
}
