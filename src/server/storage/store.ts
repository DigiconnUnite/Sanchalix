import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ponytail: files live on the server's own disk, in .data/uploads, which is fine for one machine in development.
// When the S3 keys arrive, put and get the same keys there instead; nothing else stores or reads a file.
const ROOT = path.resolve(process.cwd(), '.data', 'uploads');

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
