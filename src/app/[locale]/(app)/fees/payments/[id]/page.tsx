import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ReceiptView } from '@/features/fees/ReceiptView';
import { getReceipt } from '@/server/modules/fees/queries';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.receipt');
  return { title: t('receiptNo') };
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('fees.payment.read');
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const receipt = await getReceipt(ctx, id);
  if (!receipt) notFound();
  return <ReceiptView receipt={receipt} created={created === '1'} />;
}
