import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, expect, it, vi } from 'vitest';
import { getFile, putFile, removeFile } from './store';

const key = `${'a'.repeat(24)}/${'b'.repeat(24)}/${'c'.repeat(8)}-cccc-cccc-cccc-${'c'.repeat(12)}.pdf`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('keeps files in the S3 bucket under the same key when one is set, and nowhere else', async () => {
  vi.stubEnv('S3_BUCKET_DOCUMENTS', 'test-bucket');
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const sent: unknown[] = [];
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    sent.push(command);
    if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => bytes } };
    return {};
  });

  await putFile(key, bytes);
  expect(Array.from(await getFile(key))).toEqual(Array.from(bytes));
  await removeFile(key);

  const [put, get, del] = sent;
  expect(put).toBeInstanceOf(PutObjectCommand);
  expect((put as PutObjectCommand).input).toMatchObject({ Bucket: 'test-bucket', Key: key, ContentType: 'application/pdf', ServerSideEncryption: 'AES256' });
  expect((get as GetObjectCommand).input).toMatchObject({ Bucket: 'test-bucket', Key: key });
  expect(del).toBeInstanceOf(DeleteObjectCommand);
});

it('refuses to fall back to the server disk in production, and to a key that is not ours', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  await expect(putFile(key, new Uint8Array([1]))).rejects.toThrow('S3_BUCKET_DOCUMENTS');
  await expect(getFile('../../etc/passwd')).rejects.toThrow('Invalid storage key');
});
