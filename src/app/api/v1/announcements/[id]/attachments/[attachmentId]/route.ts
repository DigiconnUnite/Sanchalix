import { AppError } from '@/lib/appError';
import { requirePermission } from '@/server/auth/context';
import { readAnnouncementAttachment } from '@/server/modules/comms/service';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const ctx = await requirePermission('comms.announcement.read');
    const { id, attachmentId } = await params;
    const file = await readAnnouncementAttachment(ctx, id, attachmentId);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename="${file.fileName.replaceAll('"', '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        // A stored file is only ever downloaded: it can't run script or load anything, whatever it contains.
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
