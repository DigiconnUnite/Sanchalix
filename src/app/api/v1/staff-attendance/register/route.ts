import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { fileFormat, tableResponse } from '@/server/csv';
import { getStaffRegister } from '@/server/modules/hr/staffRegister';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403 };
const LETTER = { present: 'P', absent: 'A', half_day: 'H', leave: 'LV' } as const;

/** One month of staff attendance as a spreadsheet: a row per staff member, a column per day. */
export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('hr.attendance.read');
    const params = new URL(request.url).searchParams;
    const register = await getStaffRegister(ctx, params.get('month') ?? undefined);
    const t = await getTranslations('hr.register.columns');
    const rows = [
      [t('employeeNo'), t('name'), ...register.days.map(({ day }) => day), t('present'), t('absent'), t('leave')],
      ...register.staff.map((member) => [
        member.employeeNo,
        member.name,
        ...register.days.map(({ date }) => LETTER[member.marks[date] as keyof typeof LETTER] ?? ''),
        member.present,
        member.absent,
        member.leave,
      ]),
    ];
    const format = fileFormat(params.get('format'));
    await audit(ctx, 'data.export', { type: 'school', id: ctx.schoolId }, {
      after: { kind: 'staffRegister', format, month: register.month, rows: register.staff.length },
    });
    return await tableResponse(format, `staff-register-${register.month}`, rows);
  } catch (error) {
    if (error instanceof AppError && STATUS[error.code]) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] ?? 400 });
    }
    throw error;
  }
}
