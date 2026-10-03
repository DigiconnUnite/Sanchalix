import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { StudentsTable } from '@/features/sis/StudentsTable';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { countStudents, listStudents } from '@/server/modules/sis/queries';
import { ListStudents } from '@/server/modules/sis/schemas';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.students');
  return { title: t('title') };
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('sis.student.read');
  const query = ListStudents.parse(await searchParams);
  const canCreate = can(ctx.role, 'sis.student.create');

  return (
    <Suspense
      key={JSON.stringify(query)}
      fallback={<StudentsTable status={query.status} pageSize={query.pageSize} canCreate={canCreate} data={null} />}
    >
      <Students ctx={ctx} query={query} canCreate={canCreate} />
    </Suspense>
  );
}

async function Students({
  ctx,
  query,
  canCreate,
}: {
  ctx: RequestContext;
  query: ListStudents;
  canCreate: boolean;
}) {
  const [list, total] = await Promise.all([listStudents(ctx, query), countStudents(ctx, query.status)]);
  return (
    <StudentsTable status={query.status} pageSize={query.pageSize} canCreate={canCreate} data={{ ...list, total }} />
  );
}
