import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StaffForm } from '@/features/hr/Staff';
import { getStaffMember } from '@/server/modules/hr/service';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.form');
  return { title: t('editMeta') };
}

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('hr.staff.update');
  const member = await getStaffMember(ctx, (await params).id);
  if (!member) notFound();
  return <StaffForm member={member} />;
}
