import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { HomeworkTable } from '@/features/homework/Homework';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { ListHomework } from '@/server/modules/homework/schemas';
import { listHomework } from '@/server/modules/homework/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('homework');
  return { title: t('title') };
}

type Shared = { canCreate: boolean; created: string | null };

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('homework.assignment.read');
  const params = await searchParams;
  const query = ListHomework.parse(params);
  const shared: Shared = {
    canCreate: can(ctx.role, 'homework.assignment.create'),
    created: typeof params.created === 'string' ? params.created.slice(0, 120) : null,
  };
  return (
    <Suspense key={JSON.stringify(query)} fallback={<HomeworkTable {...shared} data={null} />}>
      <HomeworkList ctx={ctx} query={query} shared={shared} />
    </Suspense>
  );
}

async function HomeworkList({ ctx, query, shared }: { ctx: RequestContext; query: ListHomework; shared: Shared }) {
  return <HomeworkTable {...shared} data={await listHomework(ctx, query)} />;
}
