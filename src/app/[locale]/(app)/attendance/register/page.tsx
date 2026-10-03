import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';
import { AttendanceRegisterTable } from '@/features/attendance/AttendanceRegisterTable';
import { getRegister, listAttendanceSections } from '@/server/modules/attendance/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('attendance.register');
  return { title: t('title') };
}

export default async function AttendanceRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('attendance.record.read');
  const [t, tTake, sections, { section, month }] = await Promise.all([
    getTranslations('attendance.register'),
    getTranslations('attendance.take'),
    listAttendanceSections(ctx),
    searchParams,
  ]);

  const sectionId = typeof section === 'string' ? section : sections[0]?.id;
  if (!sectionId) {
    return (
      <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
        <EmptyState icon="attendance" heading={tTake('noSections.heading')} body={tTake('noSections.body')} />
      </ContentLayout>
    );
  }

  const register = await getRegister(ctx, sectionId, typeof month === 'string' ? month : undefined);
  if (!register) notFound();
  return <AttendanceRegisterTable sections={sections} register={register} />;
}
