import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { addAttachment } from '@/server/modules/homework/service';
import { MAX_FILE_BYTES } from '@/server/storage/store';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422 };

// A route, not a Server Action: an action's body is capped at 1 MB and a worksheet scan is often larger.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations();
  try {
    const ctx = await requirePermission('homework.assignment.create');
    if (Number(request.headers.get('content-length') ?? 0) > MAX_FILE_BYTES + 100_000) {
      throw new AppError('VALIDATION', 'homework.errors.file');
    }
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION', 'homework.errors.file');
    const saved = await addAttachment(ctx, (await params).id, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    await audit(ctx, 'homework.attachment.create', { type: 'homework', id: saved.id }, { after: { fileName: saved.fileName } });
    return Response.json({ ok: true, data: { fileName: saved.fileName } });
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
