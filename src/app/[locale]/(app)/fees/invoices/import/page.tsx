import { getTranslations } from 'next-intl/server';
import { ImportStudents } from '@/features/sis/ImportStudents';
import { OPENING_BALANCE_COLUMNS } from '@/server/modules/fees/openingBalances';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.import.kinds.openingBalances');
  return { title: t('title') };
}

export default async function ImportOpeningBalancesPage() {
  await pageContext('fees.structure.update');
  return <ImportStudents kind="openingBalances" columns={OPENING_BALANCE_COLUMNS} />;
}
