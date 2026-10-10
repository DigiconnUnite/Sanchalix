import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TransferCertificateView } from '@/features/sis/TransferCertificateView';
import { getTransferCertificate } from '@/server/modules/sis/queries';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.students.certificate');
  return { title: t('title') };
}

export default async function TransferCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext('sis.certificate.create');
  const certificate = await getTransferCertificate(ctx, (await params).id);
  if (!certificate) notFound();
  return <TransferCertificateView certificate={certificate} />;
}
