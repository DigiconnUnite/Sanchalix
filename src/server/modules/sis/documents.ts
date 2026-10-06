import 'server-only';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { Student } from '@/server/models/student';
import { detectFileKind, getFile, MAX_FILE_BYTES, putFile, removeFile, safeFileName } from '@/server/storage/store';

const E = 'sis.documents.errors';
export const DOCUMENT_TYPES = [
  'birth_certificate',
  'transfer_certificate_prev',
  'aadhaar',
  'photo',
  'report_card_prev',
  'medical',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const MAX_BYTES = MAX_FILE_BYTES;


export type DocumentRow = {
  id: string;
  type: DocumentType;
  fileName: string;
  size: number;
  verified: boolean;
};

const scopeOf = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});
const valid = (id: string) => Types.ObjectId.isValid(id);

export async function listDocuments(ctx: RequestContext, studentId: string): Promise<DocumentRow[]> {
  const student = valid(studentId)
    ? await Student.findOne({ ...scopeOf(ctx), _id: studentId }).select('documents').lean()
    : null;
  return (student?.documents ?? []).map((document) => ({
    id: String(document._id),
    type: document.type as DocumentType,
    fileName: document.fileName,
    size: document.size,
    verified: Boolean(document.verifiedAt),
  }));
}

export async function addDocument(
  ctx: RequestContext,
  studentId: string,
  input: { type: string; fileName: string; bytes: Uint8Array },
) {
  if (!DOCUMENT_TYPES.includes(input.type as DocumentType)) throw new AppError('VALIDATION', `${E}.type`);
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) throw new AppError('VALIDATION', `${E}.size`);
  const kind = detectFileKind(input.bytes);
  if (!kind) throw new AppError('VALIDATION', `${E}.kind`);
  if (!valid(studentId) || !(await Student.exists({ ...scopeOf(ctx), _id: studentId }))) {
    throw new AppError('NOT_FOUND', `${E}.notFound`);
  }

  const id = new Types.ObjectId();
  const key = `${ctx.schoolId.toString()}/${studentId}/${randomUUID()}.${kind.ext}`;
  await putFile(key, input.bytes);
  const fileName = safeFileName(input.fileName, kind.ext);
  await Student.updateOne(
    { ...scopeOf(ctx), _id: studentId },
    {
      $push: { documents: { _id: id, type: input.type, key, fileName, mime: kind.mime, size: input.bytes.length } },
      updatedBy: ctx.userId,
    },
  );
  return { id, studentId: new Types.ObjectId(studentId), type: input.type, fileName };
}

async function find(ctx: RequestContext, studentId: string, documentId: string) {
  const student =
    valid(studentId) && valid(documentId)
      ? await Student.findOne({ ...scopeOf(ctx), _id: studentId, 'documents._id': documentId })
          .select('documents')
          .lean()
      : null;
  const document = student?.documents.find((candidate) => String(candidate._id) === documentId);
  if (!student || !document) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { studentId: student._id, document };
}

export async function readDocument(ctx: RequestContext, studentId: string, documentId: string) {
  const { studentId: id, document } = await find(ctx, studentId, documentId);
  return {
    studentId: id,
    id: document._id,
    type: document.type,
    fileName: document.fileName,
    mime: document.mime,
    bytes: await getFile(document.key),
  };
}

export async function verifyDocument(ctx: RequestContext, studentId: string, documentId: string) {
  const { studentId: id, document } = await find(ctx, studentId, documentId);
  await Student.updateOne(
    { ...scopeOf(ctx), _id: id, 'documents._id': document._id },
    { $set: { 'documents.$.verifiedBy': ctx.userId, 'documents.$.verifiedAt': new Date() } },
  );
  return { id: document._id, studentId: id, type: document.type };
}

export async function removeDocument(ctx: RequestContext, studentId: string, documentId: string) {
  const { studentId: id, document } = await find(ctx, studentId, documentId);
  await Student.updateOne(
    { ...scopeOf(ctx), _id: id },
    { $pull: { documents: { _id: document._id } }, updatedBy: ctx.userId },
  );
  await removeFile(document.key);
  return { id: document._id, studentId: id, type: document.type, fileName: document.fileName };
}
