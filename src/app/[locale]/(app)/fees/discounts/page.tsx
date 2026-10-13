import { getTranslations } from 'next-intl/server';
import { FeeDiscounts } from '@/features/fees/FeeDiscounts';
import { can } from '@/server/auth/permissions';
import { getDiscountRules } from '@/server/modules/fees/discounts';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('fees.discounts');
  return { title: t('title') };
}

export default async function FeeDiscountsPage() {
  const ctx = await pageContext('fees.discount.read');
  return (
    <FeeDiscounts
      rules={await getDiscountRules(ctx)}
      canEdit={can(ctx.role, 'fees.discount.update')}
      canApprove={can(ctx.role, 'fees.discount.approve')}
    />
  );
}
