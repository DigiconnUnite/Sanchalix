import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MarksSheet } from '@/features/exams/Exams';
import { AppError } from '@/lib/appError';
import { can } from '@/server/auth/permissions';
import { listHistory } from '@/server/modules/audit/history';
import { getMarksSheet } from '@/server/modules/exams/service';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('exams');
  return { title: t('title') };
}

export default async function MarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('exams.exam.read');
  const [{ id }, { paper, section }] = await Promise.all([params, searchParams]);
  const sheet = await getMarksSheet(
    ctx,
    typeof paper === 'string' ? paper : '',
    typeof section === 'string' ? section : undefined,
  ).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!sheet || sheet.exam.id !== id) notFound();
  const history = can(ctx.role, 'audit.log.read') ? await listHistory(ctx, 'examSchedule', sheet.paper.id) : null;
  return <MarksSheet key={`${sheet.paper.id}:${sheet.section?.id}:${sheet.paper.locked}`} sheet={sheet} history={history} />;
}
