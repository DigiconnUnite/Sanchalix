import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDb } from '@/server/db/connect';
import { User } from '@/server/models/user';
import { hashPassword, verifyCredentials } from './service';

const EMAIL = 'meena@school.example';
const PASSWORD = 'correct horse battery';
const schoolId = new Types.ObjectId();
let passwordHash: string;

beforeAll(async () => {
  await connectDb();
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await User.deleteMany({ email: EMAIL });
  await User.create({
    name: 'Meena Joshi',
    email: EMAIL,
    passwordHash,
    roles: [{ role: 'school_admin', schoolId, scope: 'school' }],
    status: 'active',
  });
});

afterAll(() => mongoose.disconnect());

it('returns the active role assignment for the right password', async () => {
  const result = await verifyCredentials(EMAIL, PASSWORD);
  expect(result.role).toBe('school_admin');
  expect(result.schoolId.equals(schoolId)).toBe(true);
});

it('gives the same error for a wrong password and an unknown email', async () => {
  await expect(verifyCredentials(EMAIL, 'wrong')).rejects.toMatchObject({ messageKey: 'auth.signIn.invalid' });
  await expect(verifyCredentials('nobody@school.example', PASSWORD)).rejects.toMatchObject({
    messageKey: 'auth.signIn.invalid',
  });
});

it('rejects a disabled user', async () => {
  await User.updateOne({ email: EMAIL }, { status: 'disabled' });
  await expect(verifyCredentials(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('locks the account after 10 failed attempts, even for the right password', async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await expect(verifyCredentials(EMAIL, 'wrong')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  }
  await expect(verifyCredentials(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
});

it('unlocks once the lock has expired and resets the failure count', async () => {
  await User.updateOne({ email: EMAIL }, { failedLoginCount: 4, lockedUntil: new Date(Date.now() - 1000) });
  await verifyCredentials(EMAIL, PASSWORD);
  const user = await User.findOne({ email: EMAIL }).lean();
  expect(user?.failedLoginCount).toBe(0);
  expect(user?.lockedUntil).toBeUndefined();
});
