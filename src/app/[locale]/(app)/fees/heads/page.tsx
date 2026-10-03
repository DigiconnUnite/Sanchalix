import { getTranslations } from 'next-intl/server';
import { FeeHeadsTable } from '@/features/fees/FeeHeads';
import { can } from '@/server/auth/permissions';
import { listFeeHeads } from '@/server/modules/fees/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.heads');
  return { title: t('title') };
}

export default async function FeeHeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.structure.read');
  const { created } = await searchParams;
  return (
    <FeeHeadsTable
      heads={await listFeeHeads(ctx)}
      canEdit={can(ctx.role, 'fees.structure.update')}
      created={typeof created === 'string' ? created.slice(0, 60) : null}
    />
  );
}
