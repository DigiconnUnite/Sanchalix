import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { OrderPage } from '@/features/fees/OnlinePayment';
import { getOrder } from '@/server/modules/fees/online';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.online');
  return { title: t('title') };
}

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const ctx = await pageContext('portal.self.read');
  const order = await getOrder(ctx, (await params).orderId);
  if (!order) notFound();
  return <OrderPage key={order.status} order={order} />;
}
