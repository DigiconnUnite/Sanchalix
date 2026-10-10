import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { csvResponse } from '@/server/csv';
import { getRegister } from '@/server/modules/attendance/queries';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403 };
const LETTER: Record<string, string> = { present: 'P', absent: 'A', late: 'L', half_day: 'H', leave: 'LV' };

/** One section's month as a spreadsheet: a row per student, a column per day. */
export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('attendance.record.read');
    const params = new URL(request.url).searchParams;
    const register = await getRegister(
      ctx,
      params.get('section') ?? '',
      params.get('month') ?? undefined,
      Number(params.get('period')) || undefined,
    );
    if (!register) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const t = await getTranslations('attendance.register.columns');

    const rows = [
      [t('rollNo'), t('name'), ...register.days.map(({ day }) => day), t('present'), t('absent'), t('percent')],
      ...register.students.map((student) => [
        student.rollNo,
        student.name,
        ...register.days.map(({ date }) => LETTER[student.marks[date] ?? ''] ?? ''),
        student.present,
        student.absent,
        student.percent,
      ]),
    ];
    await audit(ctx, 'data.export', { type: 'school', id: ctx.schoolId }, {
      after: { kind: 'register', section: register.section.name, month: register.month, rows: register.students.length },
    });
    const suffix = register.period ? `-period-${register.period}` : '';
    return csvResponse(`register-${register.section.name}-${register.month}${suffix}.csv`, rows);
  } catch (error) {
    if (error instanceof AppError && STATUS[error.code]) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] ?? 400 });
    }
    throw error;
  }
}
