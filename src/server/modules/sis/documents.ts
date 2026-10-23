import 'server-only';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { Admission } from '@/server/models/admission';
import { Staff } from '@/server/models/staff';
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
export const STAFF_DOCUMENT_TYPES = ['qualification', 'id_proof', 'appointment_letter', 'experience_letter', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number] | (typeof STAFF_DOCUMENT_TYPES)[number];
const typesOf = (owner: DocumentOwner): readonly string[] => (owner === 'staff' ? STAFF_DOCUMENT_TYPES : DOCUMENT_TYPES);
export const MAX_BYTES = MAX_FILE_BYTES;

/** An applicant's documents are kept on the application until they are admitted, then move to the student. */
export type DocumentOwner = 'student' | 'admission' | 'staff';
// The models keep the same `documents`, `branchId` and `updatedBy` fields, which is all that is touched here.
const MODELS = { student: Student, admission: Admission, staff: Staff };
const modelOf = (owner: DocumentOwner) => MODELS[owner] as unknown as typeof Student;

type Stored = { _id: unknown; type: string; fileName: string; size: number; verifiedAt?: Date | null };
export const toDocumentRows = (documents: Stored[]): DocumentRow[] =>
  documents.map((document) => ({
    id: String(document._id),
    type: document.type as DocumentType,
    fileName: document.fileName,
    size: document.size,
    verified: Boolean(document.verifiedAt),
  }));

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

export async function listDocuments(
  ctx: RequestContext,
  studentId: string,
  owner: DocumentOwner = 'student',
): Promise<DocumentRow[]> {
  const student = valid(studentId)
    ? await modelOf(owner).findOne({ ...scopeOf(ctx), _id: studentId }).select('documents').lean()
    : null;
  return toDocumentRows(student?.documents ?? []);
}

export async function addDocument(
  ctx: RequestContext,
  studentId: string,
  input: { type: string; fileName: string; bytes: Uint8Array },
  owner: DocumentOwner = 'student',
) {
  const Owner = modelOf(owner);
  if (!typesOf(owner).includes(input.type)) throw new AppError('VALIDATION', `${E}.type`);
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) throw new AppError('VALIDATION', `${E}.size`);
  const kind = detectFileKind(input.bytes);
  if (!kind) throw new AppError('VALIDATION', `${E}.kind`);
  if (!valid(studentId) || !(await Owner.exists({ ...scopeOf(ctx), _id: studentId }))) {
    throw new AppError('NOT_FOUND', `${E}.notFound`);
  }

  const id = new Types.ObjectId();
  const key = `${ctx.schoolId.toString()}/${studentId}/${randomUUID()}.${kind.ext}`;
  await putFile(key, input.bytes);
  const fileName = safeFileName(input.fileName, kind.ext);
  await Owner.updateOne(
    { ...scopeOf(ctx), _id: studentId },
    {
      $push: { documents: { _id: id, type: input.type, key, fileName, mime: kind.mime, size: input.bytes.length } },
      updatedBy: ctx.userId,
    },
  );
  return { id, ownerId: new Types.ObjectId(studentId), type: input.type, fileName };
}

async function find(ctx: RequestContext, studentId: string, documentId: string, owner: DocumentOwner) {
  const student =
    valid(studentId) && valid(documentId)
      ? await modelOf(owner).findOne({ ...scopeOf(ctx), _id: studentId, 'documents._id': documentId })
          .select('documents')
          .lean()
      : null;
  const document = student?.documents.find((candidate) => String(candidate._id) === documentId);
  if (!student || !document) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { ownerId: student._id, document };
}

export async function readDocument(
  ctx: RequestContext,
  studentId: string,
  documentId: string,
  owner: DocumentOwner = 'student',
) {
  const { ownerId: id, document } = await find(ctx, studentId, documentId, owner);
  return {
    ownerId: id,
    id: document._id,
    type: document.type,
    fileName: document.fileName,
    mime: document.mime,
    bytes: await getFile(document.key),
  };
}

export async function verifyDocument(
  ctx: RequestContext,
  studentId: string,
  documentId: string,
  owner: DocumentOwner = 'student',
) {
  const { ownerId: id, document } = await find(ctx, studentId, documentId, owner);
  await modelOf(owner).updateOne(
    { ...scopeOf(ctx), _id: id, 'documents._id': document._id },
    { $set: { 'documents.$.verifiedBy': ctx.userId, 'documents.$.verifiedAt': new Date() } },
  );
  return { id: document._id, ownerId: id, type: document.type };
}

export async function removeDocument(
  ctx: RequestContext,
  studentId: string,
  documentId: string,
  owner: DocumentOwner = 'student',
) {
  const { ownerId: id, document } = await find(ctx, studentId, documentId, owner);
  await modelOf(owner).updateOne(
    { ...scopeOf(ctx), _id: id },
    { $pull: { documents: { _id: document._id } }, updatedBy: ctx.userId },
  );
  await removeFile(document.key);
  return { id: document._id, ownerId: id, type: document.type, fileName: document.fileName };
}
