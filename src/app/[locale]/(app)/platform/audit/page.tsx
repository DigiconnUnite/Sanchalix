import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PlatformAuditTable } from '@/features/platform/PlatformAudit';
import { ListAudit, listPlatformAudit } from '@/server/modules/platform/service';
import { platformContext } from '../platformContext';

export async function generateMetadata() {
  const t = await getTranslations('platform.audit');
  return { title: t('title') };
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await platformContext('platform.audit.read');
  const query = ListAudit.parse(await searchParams);
  return (
    <Suspense key={JSON.stringify(query)} fallback={<PlatformAuditTable data={null} />}>
      <Audit cursor={query.cursor} />
    </Suspense>
  );
}

async function Audit({ cursor }: { cursor: string | undefined }) {
  return <PlatformAuditTable data={await listPlatformAudit({ cursor })} />;
}
