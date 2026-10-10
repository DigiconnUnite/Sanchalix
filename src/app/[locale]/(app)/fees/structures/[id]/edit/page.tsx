import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FeeStructureForm } from '@/features/fees/FeeStructureForm';
import { listClasses } from '@/server/modules/academics/queries';
import { getDraftFeeStructure, listFeeHeads } from '@/server/modules/fees/queries';
import { pageContext } from '../../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.structures.form');
  return { title: t('editTitle') };
}

export default async function EditFeeStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('fees.structure.update');
  const [classes, heads, draft] = await Promise.all([
    listClasses(ctx),
    listFeeHeads(ctx),
    getDraftFeeStructure(ctx, (await params).id),
  ]);
  if (!draft) notFound();
  return <FeeStructureForm classes={classes} heads={heads} draft={draft} />;
}
