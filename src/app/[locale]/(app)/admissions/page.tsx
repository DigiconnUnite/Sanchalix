import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AdmissionsTable } from '@/features/admissions/Admissions';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { ListAdmissions } from '@/server/modules/admissions/schemas';
import { listAdmissions } from '@/server/modules/admissions/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('admissions');
  return { title: t('title') };
}

type Shared = { status: string; canEdit: boolean; created: string | null };

export default async function AdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('sis.admission.read');
  const params = await searchParams;
  const query = ListAdmissions.parse(params);
  const shared: Shared = {
    status: query.status,
    canEdit: can(ctx.role, 'sis.admission.update'),
    created: typeof params.created === 'string' ? params.created.slice(0, 30) : null,
  };
  return (
    <Suspense key={JSON.stringify(query)} fallback={<AdmissionsTable {...shared} data={null} />}>
      <AdmissionsList ctx={ctx} query={query} shared={shared} />
    </Suspense>
  );
}

async function AdmissionsList({ ctx, query, shared }: { ctx: RequestContext; query: ListAdmissions; shared: Shared }) {
  return <AdmissionsTable {...shared} data={await listAdmissions(ctx, query)} />;
}
