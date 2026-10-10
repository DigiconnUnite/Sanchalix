import { getTranslations } from 'next-intl/server';
import { FeeStructuresTable } from '@/features/fees/FeeStructuresTable';
import { can } from '@/server/auth/permissions';
import { listFeeStructures } from '@/server/modules/fees/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.structures');
  return { title: t('title') };
}

export default async function FeeStructuresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.structure.read');
  const { created, updated } = await searchParams;
  return (
    <FeeStructuresTable
      structures={await listFeeStructures(ctx)}
      canEdit={can(ctx.role, 'fees.structure.update')}
      canApprove={can(ctx.role, 'fees.structure.approve')}
      created={typeof created === 'string' ? created.slice(0, 80) : null}
      updated={typeof updated === 'string' ? updated.slice(0, 80) : null}
    />
  );
}
