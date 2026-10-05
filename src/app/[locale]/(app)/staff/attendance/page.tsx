import { getTranslations } from 'next-intl/server';
import { StaffAttendance } from '@/features/hr/StaffAttendance';
import { can } from '@/server/auth/permissions';
import { getStaffSheet } from '@/server/modules/hr/staffAttendance';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.attendance');
  return { title: t('title') };
}

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('hr.attendance.read');
  const { date } = await searchParams;
  const sheet = await getStaffSheet(ctx, typeof date === 'string' ? date : undefined);
  return (
    <StaffAttendance key={`${sheet.date}:${sheet.saved}`} sheet={sheet} canEdit={can(ctx.role, 'hr.attendance.update')} />
  );
}
