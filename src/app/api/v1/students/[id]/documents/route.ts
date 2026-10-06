import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { addDocument, MAX_BYTES } from '@/server/modules/sis/documents';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422 };

// Uploads come here, not through a Server Action: an action's body is capped at 1 MB and a scan is often larger.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  try {
    const ctx = await requirePermission('sis.student.update');
    // Refused from the declared length first, so a huge upload is not read into memory to be rejected.
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES + 100_000) {
      throw new AppError('VALIDATION', 'sis.documents.errors.size');
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION', 'sis.documents.errors.file');
    const document = await addDocument(ctx, (await params).id, {
      type: String(form.get('type') ?? ''),
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    await audit(ctx, 'sis.document.create', { type: 'student', id: document.studentId }, {
      after: { documentId: String(document.id), type: document.type },
    });
    return Response.json({ ok: true, data: { fileName: document.fileName } });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(
        { ok: false, error: { code: error.code, message: t(error.messageKey, error.details) } },
        { status: STATUS[error.code] ?? 400 },
      );
    }
    throw error;
  }
}
