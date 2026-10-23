import { getTranslations } from 'next-intl/server';
import QRCode from 'qrcode';
import { CheckInCode } from '@/features/hr/CheckInCode';
import { getSchoolCalendar } from '@/server/modules/attendance/queries';
import { checkInUrl } from '@/server/modules/hr/checkIn';
import { pageContext } from '../../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('hr.checkIn.code');
  return { title: t('title') };
}

export default async function CheckInCodePage() {
  const ctx = await pageContext('hr.attendance.update');
  const { today } = await getSchoolCalendar(ctx);
  const image = await QRCode.toDataURL(checkInUrl(String(ctx.schoolId), today), { width: 720, margin: 2 });
  return <CheckInCode image={image} day={today} />;
}
