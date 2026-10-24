import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { SchoolsTable } from '@/features/platform/Schools';
import { ListSchools, listSchools } from '@/server/modules/platform/service';
import { platformContext } from '../platformContext';

export async function generateMetadata() {
  const t = await getTranslations('platform.schools');
  return { title: t('title') };
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await platformContext('platform.school.read');
  const query = ListSchools.parse(await searchParams);
  return (
    <Suspense key={JSON.stringify(query)} fallback={<SchoolsTable data={null} />}>
      <Schools query={query} />
    </Suspense>
  );
}

async function Schools({ query }: { query: ListSchools }) {
  return <SchoolsTable data={await listSchools(query)} />;
}
