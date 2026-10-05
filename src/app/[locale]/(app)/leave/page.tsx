import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LeaveTable } from '@/features/hr/Leave';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { ListLeave, listLeave } from '@/server/modules/hr/leave';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.leave');
  return { title: t('title') };
}

type Shared = { status: string; canApply: boolean; canApprove: boolean; applied: boolean };

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('hr.leave.read');
  const params = await searchParams;
  const query = ListLeave.parse(params);
  const shared: Shared = {
    status: query.status,
    canApply: can(ctx.role, 'hr.leave.create') && Boolean(ctx.staffId),
    canApprove: can(ctx.role, 'hr.leave.approve'),
    applied: params.applied === '1',
  };
  return (
    <Suspense key={JSON.stringify(query)} fallback={<LeaveTable {...shared} data={null} />}>
      <LeaveList ctx={ctx} query={query} shared={shared} />
    </Suspense>
  );
}

async function LeaveList({ ctx, query, shared }: { ctx: RequestContext; query: ListLeave; shared: Shared }) {
  return <LeaveTable {...shared} data={await listLeave(ctx, query)} />;
}
