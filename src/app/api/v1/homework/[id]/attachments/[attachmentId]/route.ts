import { AppError } from '@/lib/appError';
import { getContext } from '@/server/auth/context';
import { readAttachment } from '@/server/modules/homework/service';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, NOT_FOUND: 404 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    // No single permission fits: staff see homework by role, families by their child's section. The service decides.
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const { id, attachmentId } = await params;
    const file = await readAttachment(ctx, id, attachmentId);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename="${file.fileName.replaceAll('"', '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] ?? 400 });
    }
    throw error;
  }
}
