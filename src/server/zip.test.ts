import { inflateRawSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { zip } from './zip';

it('writes a ZIP whose entries can be found and inflated again', () => {
  const files = [
    { name: 'students.csv', data: Buffer.from('name\r\nRia ₹\r\n'.repeat(50)) },
    { name: 'empty.csv', data: Buffer.alloc(0) },
  ];
  const bytes = zip(files);
  expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
  expect(bytes.readUInt16LE(bytes.length - 22 + 10)).toBe(2);
  const centralAt = bytes.readUInt32LE(bytes.length - 22 + 16);
  let at = centralAt;
  for (const file of files) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    expect(bytes.subarray(at + 46, at + 46 + nameLength).toString()).toBe(file.name);
    const start = local + 30 + nameLength;
    const packedLength = bytes.readUInt32LE(local + 18);
    expect(size).toBe(file.data.length);
    expect(inflateRawSync(bytes.subarray(start, start + packedLength)).equals(file.data)).toBe(true);
    at += 46 + nameLength;
  }
});
