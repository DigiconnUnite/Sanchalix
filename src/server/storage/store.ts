import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ponytail: files live on the server's own disk, in .data/uploads, which is fine for one machine in development.
// When the S3 keys arrive, put and get the same keys there instead; nothing else stores or reads a file.
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

export async function putFile(key: string, bytes: Uint8Array) {
  const file = locate(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export const getFile = async (key: string) => readFile(locate(key));
export const removeFile = async (key: string) => rm(locate(key), { force: true });
