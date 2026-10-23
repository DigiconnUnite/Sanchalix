import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SchoolView } from '@/features/platform/Schools';
import { getSchool } from '@/server/modules/platform/service';
import { platformContext } from '../../platformContext';

export async function generateMetadata() {
  const t = await getTranslations('platform.schools');
  return { title: t('title') };
}

export default async function SchoolPage({ params }: { params: Promise<{ id: string }> }) {
  await platformContext('platform.school.read');
  const school = await getSchool((await params).id);
  if (!school) notFound();
  return <SchoolView school={school} />;
}
