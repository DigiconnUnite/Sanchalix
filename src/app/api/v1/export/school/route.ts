import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { exportSchool } from '@/server/modules/settings/exportAll';

const STATUS = { UNAUTHENTICATED: 401, FORBIDDEN: 403 } as const;

export async function GET() {
  try {
    const ctx = await requirePermission('settings.export');
    const { bytes, counts } = await exportSchool(ctx);
    await audit(ctx, 'data.export', { type: 'school', id: ctx.schoolId }, { after: { kind: 'school', counts } });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="school-export-${new Date().toISOString().slice(0, 10)}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AppError && (error.code === 'UNAUTHENTICATED' || error.code === 'FORBIDDEN')) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] });
    }
    throw error;
  }
}
