import ContentLayout from '@cloudscape-design/components/content-layout';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';
import { TakeAttendance } from '@/features/attendance/TakeAttendance';
import { can } from '@/server/auth/permissions';
import { getAttendanceSheet, listAttendanceSections } from '@/server/modules/attendance/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('attendance.take');
  return { title: t('title') };
}

export default async function TakeAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('attendance.record.read');
  const [t, sections, { section, date, period }] = await Promise.all([
    getTranslations('attendance.take'),
    listAttendanceSections(ctx, 'any'),
    searchParams,
  ]);

  const sectionId = typeof section === 'string' ? section : sections[0]?.id;
  if (!sectionId) {
    return (
      <ContentLayout>
        <EmptyState icon="attendance" heading={t('noSections.heading')} body={t('noSections.body')} />
      </ContentLayout>
    );
  }

  const sheet = await getAttendanceSheet(
    ctx,
    sectionId,
    typeof date === 'string' ? date : undefined,
    Number(period) || undefined,
  );
  if (!sheet) notFound();

  return (
    <TakeAttendance
      key={`${sheet.section.id}:${sheet.date}:${sheet.period}:${sheet.submitted}`}
      sections={sections}
      sheet={sheet}
      canSubmit={can(ctx.role, 'attendance.record.create')}
    />
  );
}
