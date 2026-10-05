import { getTranslations } from 'next-intl/server';
import { Promotion } from '@/features/promotion/Promotion';
import { getPromotionSheet, getPromotionState } from '@/server/modules/promotion/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('promotion');
  return { title: t('title') };
}

export default async function PromotionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('sis.enrollment.update');
  const [state, { section }] = await Promise.all([getPromotionState(ctx), searchParams]);
  const sectionId = state.next && state.sections.find(({ id }) => id === section)?.id;
  const sheet = sectionId ? await getPromotionSheet(ctx, sectionId) : null;
  return <Promotion key={`${state.next?.label}:${sheet?.section.id}:${state.remaining}`} state={state} sheet={sheet} />;
}
