import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Student } from '@/server/models/student';
import { getFile } from '@/server/storage/store';
import { addDocument, listDocuments, MAX_BYTES, readDocument, removeDocument, verifyDocument } from './documents';

const person = (schoolId: Types.ObjectId): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Office',
  role: 'school_admin',
  scope: 'school',
  schoolId,
});
const ctx = person(new Types.ObjectId());
const other = person(new Types.ObjectId());
const studentId = new Types.ObjectId();
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

beforeAll(async () => {
  await connectDb();
  // A raw insert: only the fields a document needs, not a full admission.
  await Student.collection.insertOne({ _id: studentId, schoolId: ctx.schoolId, firstName: 'Ria', documents: [], deletedAt: null });
});

afterAll(() => mongoose.disconnect());

it('stores only real PDFs and images, under a key the server made', async () => {
  const id = String(studentId);
  const upload = (bytes: Uint8Array, type = 'birth_certificate', fileName = '../../etc/birth cert.pdf') =>
    addDocument(ctx, id, { type, fileName, bytes });

  await expect(upload(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(upload(new Uint8Array(MAX_BYTES + 1))).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(upload(pdf, 'passport')).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(addDocument(other, id, { type: 'other', fileName: 'a.pdf', bytes: pdf })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });

  const saved = await upload(pdf);
  expect(saved.fileName).toBe('.._.._etc_birth cert.pdf');
  expect(await listDocuments(ctx, id)).toMatchObject([{ type: 'birth_certificate', size: pdf.length, verified: false }]);
  expect(await listDocuments(other, id)).toEqual([]);
  const stored = await Student.findOne({ schoolId: ctx.schoolId, _id: studentId }).lean();
  expect(stored?.documents[0]?.key).toMatch(new RegExp(`^${String(ctx.schoolId)}/${id}/[0-9a-f-]{36}\\.pdf$`));
});

it('reads, verifies and deletes a document only inside its school', async () => {
  const id = String(studentId);
  const [document] = await listDocuments(ctx, id);
  const documentId = document?.id ?? '';

  await expect(readDocument(other, id, documentId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const read = await readDocument(ctx, id, documentId);
  expect(read.mime).toBe('application/pdf');
  expect(new Uint8Array(read.bytes)).toEqual(pdf);

  await expect(verifyDocument(other, id, documentId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await verifyDocument(ctx, id, documentId);
  expect((await listDocuments(ctx, id))[0]?.verified).toBe(true);

  const key = (await Student.findOne({ schoolId: ctx.schoolId, _id: studentId }).lean())?.documents[0]?.key ?? '';
  await expect(removeDocument(other, id, documentId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await removeDocument(ctx, id, documentId);
  expect(await listDocuments(ctx, id)).toEqual([]);
  await expect(getFile(key)).rejects.toThrow();
  await expect(getFile('../outside.pdf')).rejects.toThrow('Invalid storage key');
});
