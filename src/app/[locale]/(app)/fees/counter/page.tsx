import { getTranslations } from 'next-intl/server';
import { FeeCounter } from '@/features/fees/FeeCounter';
import { getCounterStudent } from '@/server/modules/fees/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.counter');
  return { title: t('title') };
}

export default async function FeeCounterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.payment.create');
  const { student } = await searchParams;
  const selected = typeof student === 'string' ? await getCounterStudent(ctx, student) : null;
  return <FeeCounter student={selected} notFound={typeof student === 'string' && !selected} />;
}
