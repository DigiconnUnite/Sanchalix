import 'server-only';
import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import type { Permission } from '@/server/auth/permissions';
import { addDocument, type DocumentOwner, MAX_BYTES, readDocument } from './documents';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422 };
const WRITE: Record<DocumentOwner, Permission> = { student: 'sis.student.update', admission: 'sis.admission.update' };

// Uploads come here, not through a Server Action: an action's body is capped at 1 MB and a scan is often larger.
export const uploadDocument =
  (owner: DocumentOwner) =>
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const t = await getTranslations();
    try {
      const ctx = await requirePermission(WRITE[owner]);
      // Refused from the declared length first, so a huge upload is not read into memory to be rejected.
      if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES + 100_000) {
        throw new AppError('VALIDATION', 'sis.documents.errors.size');
      }
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new AppError('VALIDATION', 'sis.documents.errors.file');
      const document = await addDocument(
        ctx,
        (await params).id,
        { type: String(form.get('type') ?? ''), fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
        owner,
      );
      await audit(ctx, 'sis.document.create', { type: owner, id: document.ownerId }, {
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
  };

export const downloadDocument =
  (owner: DocumentOwner) =>
  async (_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) => {
    try {
      const ctx = await requirePermission('sis.document.read');
      const { id, documentId } = await params;
      const document = await readDocument(ctx, id, documentId, owner);
      // A child's documents (Aadhaar, medical) are sensitive, so every time one is opened is on the record.
      await audit(ctx, 'sis.document.read', { type: owner, id: document.ownerId }, {
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
  };
