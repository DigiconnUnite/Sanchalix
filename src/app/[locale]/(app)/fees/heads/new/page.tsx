import { getTranslations } from 'next-intl/server';
import { FeeHeadForm } from '@/features/fees/FeeHeads';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.heads.form');
  return { title: t('title') };
}

export default async function NewFeeHeadPage() {
  await pageContext('fees.structure.update');
  return <FeeHeadForm />;
}
