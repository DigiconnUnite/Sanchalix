import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StaffProfileView } from '@/features/hr/Staff';
import { can } from '@/server/auth/permissions';
import { getStaffProfile } from '@/server/modules/hr/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr');
  return { title: t('title') };
}

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('hr.staff.read');
  const member = await getStaffProfile(ctx, (await params).id);
  if (!member) notFound();
  return <StaffProfileView member={member} canEdit={can(ctx.role, 'hr.staff.update')} />;
}
