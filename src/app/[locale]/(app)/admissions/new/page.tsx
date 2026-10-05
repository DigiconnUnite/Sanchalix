import { getTranslations } from 'next-intl/server';
import { AdmissionForm } from '@/features/admissions/Admissions';
import { listClasses } from '@/server/modules/academics/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('admissions.form');
  return { title: t('title') };
}

export default async function NewAdmissionPage() {
  const ctx = await pageContext('sis.admission.update');
  return <AdmissionForm classes={await listClasses(ctx)} />;
}
