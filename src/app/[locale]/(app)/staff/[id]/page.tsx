import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StaffProfileView } from '@/features/hr/Staff';
import { can } from '@/server/auth/permissions';
import { listHistory } from '@/server/modules/audit/history';
import { getStaffProfile } from '@/server/modules/hr/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr');
  return { title: t('title') };
}

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('hr.staff.read');
  const { id } = await params;
  const member = await getStaffProfile(ctx, id);
  if (!member) notFound();
  const history = can(ctx.role, 'audit.log.read') ? await listHistory(ctx, 'staff', id) : null;
  return <StaffProfileView member={member} history={history} canEdit={can(ctx.role, 'hr.staff.update')} />;
}
