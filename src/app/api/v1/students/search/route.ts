import { AppError } from '@/lib/appError';
import { requirePermission } from '@/server/auth/context';
import { searchStudents } from '@/server/modules/fees/queries';

const STATUS = { UNAUTHENTICATED: 401, FORBIDDEN: 403 } as const;

export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('fees.payment.create');
    const text = new URL(request.url).searchParams.get('q') ?? '';
    return Response.json({ data: await searchStudents(ctx, text.slice(0, 60)) });
  } catch (error) {
    if (error instanceof AppError && (error.code === 'UNAUTHENTICATED' || error.code === 'FORBIDDEN')) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] });
    }
    throw error;
  }
}
