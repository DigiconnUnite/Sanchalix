import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AdmissionView } from '@/features/admissions/Admissions';
import { can } from '@/server/auth/permissions';
import { getAdmission } from '@/server/modules/admissions/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('admissions');
  return { title: t('title') };
}

export default async function AdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('sis.admission.read');
  const admission = await getAdmission(ctx, (await params).id);
  if (!admission) notFound();
  return <AdmissionView key={admission.status} admission={admission} canEdit={can(ctx.role, 'sis.admission.update')} />;
}
