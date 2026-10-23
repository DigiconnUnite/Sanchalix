import { inflateRawSync } from 'node:zlib';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Student } from '@/server/models/student';
import { Subject } from '@/server/models/subject';
import { exportSchool } from './exportAll';

const schoolId = new Types.ObjectId();
const ctx: RequestContext = { userId: new Types.ObjectId(), name: 'Office', role: 'school_admin', scope: 'school', schoolId };
const other = new Types.ObjectId();

beforeAll(async () => {
  await connectDb();
  const base = { dob: '2015-01-01', gender: 'female', branchId: new Types.ObjectId(), primaryGuardianId: new Types.ObjectId() };
  await Student.collection.insertMany([
    { ...base, schoolId, admissionNo: 'X-1', firstName: 'Ria', lastName: '=SUM(A1)', aadhaarNo: '123412341234', medical: { allergies: ['dust'] }, status: 'active', deletedAt: null },
    { ...base, schoolId: other, admissionNo: 'Y-1', firstName: 'Other', status: 'active', deletedAt: null },
  ]);
  await Subject.collection.insertOne({ schoolId, name: 'Maths', code: 'MAT', type: 'scholastic', isOptional: false, deletedAt: null });
});

afterAll(async () => {
  await Student.collection.deleteMany({ schoolId: { $in: [schoolId, other] } });
  await Subject.collection.deleteMany({ schoolId });
  await mongoose.disconnect();
});

it('exports the school as one CSV per table, with its own rows only and nothing sensitive', async () => {
  const { bytes, counts } = await exportSchool(ctx);
  expect(counts).toMatchObject({ students: 1, subjects: 1, invoices: 0 });

  const entries = new Map<string, string>();
  let at = bytes.readUInt32LE(bytes.length - 22 + 16);
  while (bytes.readUInt32LE(at) === 0x02014b50) {
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString();
    const start = local + 30 + nameLength;
    entries.set(name, inflateRawSync(bytes.subarray(start, start + bytes.readUInt32LE(local + 18))).toString());
    at += 46 + nameLength;
  }
  const students = entries.get('students.csv') ?? '';
  expect(students).toContain('X-1');
  expect(students).toContain("'=SUM(A1)");
  expect(students).not.toContain('Y-1');
  expect(students).not.toContain('123412341234');
  expect(students).not.toContain('dust');
  expect(entries.get('subjects.csv')).toContain('Maths');
  expect(entries.size).toBe(17);
});
