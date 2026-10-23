import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// With S3_BUCKET_DOCUMENTS set, files go to that bucket under the same keys. Without it they live on the server's own
// disk, in .data/uploads, which is only right for one development machine, so production refuses to start storing.
const ROOT = path.resolve(process.cwd(), '.data', 'uploads');

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// What a file really is, read from its first bytes. The browser's stated type and the file name are not trusted.
const KINDS = [
  { mime: 'application/pdf', ext: 'pdf', matches: (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { mime: 'image/jpeg', ext: 'jpg', matches: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', matches: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b: Uint8Array) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
] as const;

/** The file's type if it is one we keep (PDF, JPEG, PNG, WebP) and within the size limit, otherwise null. */
export const detectFileKind = (bytes: Uint8Array) =>
  bytes.length > 0 && bytes.length <= MAX_FILE_BYTES ? (KINDS.find((kind) => kind.matches(bytes)) ?? null) : null;

/** A name that is safe to show and to offer on download. */
export const safeFileName = (name: string, ext: string) => name.replace(/[^\w.\- ]+/g, '_').slice(-100) || `file.${ext}`;

/** Keys are made by the server (`school/student/uuid.ext`), never taken from a file name, so a path can't escape the root. */
function locate(key: string) {
  if (!/^[0-9a-f]{24}\/[0-9a-f]{24}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(key)) throw new Error('Invalid storage key');
  return path.join(ROOT, key);
}

let client: S3Client | undefined;

function bucket() {
  const name = process.env.S3_BUCKET_DOCUMENTS;
  if (!name && process.env.NODE_ENV === 'production') throw new Error('S3_BUCKET_DOCUMENTS is not set');
  if (name) client ??= new S3Client({});
  return name ? { name, s3: client as S3Client } : null;
}

export async function putFile(key: string, bytes: Uint8Array) {
  const file = locate(key);
  const remote = bucket();
  if (remote) {
    await remote.s3.send(
      new PutObjectCommand({ Bucket: remote.name, Key: key, Body: bytes, ContentType: KINDS.find((kind) => kind.ext === key.split('.').pop())?.mime, ServerSideEncryption: 'AES256' }),
    );
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export async function getFile(key: string) {
  const file = locate(key);
  const remote = bucket();
  if (!remote) return readFile(file);
  const { Body } = await remote.s3.send(new GetObjectCommand({ Bucket: remote.name, Key: key }));
  if (!Body) throw new Error('Empty storage object');
  return Buffer.from(await Body.transformToByteArray());
}

export async function removeFile(key: string) {
  const file = locate(key);
  const remote = bucket();
  if (remote) await remote.s3.send(new DeleteObjectCommand({ Bucket: remote.name, Key: key }));
  else await rm(file, { force: true });
}
