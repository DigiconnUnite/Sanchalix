import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { readDocument } from '@/server/modules/sis/documents';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const ctx = await requirePermission('sis.document.read');
    const { id, documentId } = await params;
    const document = await readDocument(ctx, id, documentId);
    // A child's documents (Aadhaar, medical) are sensitive, so every time one is opened is on the record.
    await audit(ctx, 'sis.document.read', { type: 'student', id: document.studentId }, {
      after: { documentId: String(document.id), type: document.type },
    });
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        'Content-Type': document.mime,
        'Content-Disposition': `attachment; filename="${document.fileName.replaceAll('"', '')}"`,
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
