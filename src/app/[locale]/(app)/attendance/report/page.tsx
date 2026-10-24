import { getTranslations } from 'next-intl/server';
import { AttendanceReport } from '@/features/attendance/AttendanceReport';
import { can } from '@/server/auth/permissions';
import { ELIGIBILITY_PERCENT, getAttendanceReport } from '@/server/modules/attendance/reports';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('attendance.report');
  return { title: t('title') };
}

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('attendance.record.read');
  const { from, to } = await searchParams;
  const report = await getAttendanceReport(
    ctx,
    typeof from === 'string' ? from : undefined,
    typeof to === 'string' ? to : undefined,
  );
  return (
    <AttendanceReport
      key={`${report.from}:${report.to}`}
      report={report}
      line={ELIGIBILITY_PERCENT}
      canOpenStudents={can(ctx.role, 'sis.student.read')}
    />
  );
}
