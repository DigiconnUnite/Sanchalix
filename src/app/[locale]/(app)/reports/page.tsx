import { getTranslations } from 'next-intl/server';
import { Reports } from '@/features/reports/Reports';
import { can } from '@/server/auth/permissions';
import { getExamResultsReport } from '@/server/modules/exams/results';
import { getAdmissionsReport, getStaffReport } from '@/server/modules/reports/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('sis.admission.read');
  const seesStaff = can(ctx.role, 'hr.staff.read');
  const { exam } = await searchParams;
  const [t, admissions, staff, results] = await Promise.all([
    getTranslations('reports'),
    getAdmissionsReport(ctx),
    seesStaff ? getStaffReport(ctx) : undefined,
    can(ctx.role, 'exams.exam.read') ? getExamResultsReport(ctx, typeof exam === 'string' ? exam : undefined) : undefined,
  ]);
  const links = [
    ...(can(ctx.role, 'attendance.record.read') ? [{ href: '/attendance/report', text: t('links.attendance') }] : []),
    ...(can(ctx.role, 'fees.payment.read') ? [{ href: '/fees/reports', text: t('links.fees') }] : []),
    ...(can(ctx.role, 'fees.invoice.read') ? [{ href: '/fees/dues', text: t('links.dues') }] : []),
  ];
  return <Reports admissions={admissions} links={links} {...(staff && { staff })} {...(results && { results })} />;
}
