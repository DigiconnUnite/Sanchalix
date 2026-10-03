import { getTranslations } from 'next-intl/server';
import { FeeStructureForm } from '@/features/fees/FeeStructureForm';
import { listClasses } from '@/server/modules/academics/queries';
import { listFeeHeads } from '@/server/modules/fees/queries';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.structures.form');
  return { title: t('title') };
}

export default async function NewFeeStructurePage() {
  const ctx = await pageContext('fees.structure.update');
  const [classes, heads] = await Promise.all([listClasses(ctx), listFeeHeads(ctx)]);
  return <FeeStructureForm classes={classes} heads={heads} />;
}
