import { getTranslations } from 'next-intl/server';
import { StaffRegisterTable } from '@/features/hr/StaffRegisterTable';
import { getStaffRegister } from '@/server/modules/hr/staffRegister';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.register');
  return { title: t('title') };
}

export default async function StaffRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('hr.attendance.read');
  const { month } = await searchParams;
  return <StaffRegisterTable register={await getStaffRegister(ctx, typeof month === 'string' ? month : undefined)} />;
}
