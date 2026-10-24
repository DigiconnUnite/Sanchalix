import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDb } from '@/server/db/connect';
import { AuditLog } from '@/server/models/auditLog';
import { User } from '@/server/models/user';
import { School } from '@/server/models/school';
import { hashPassword, listOtherSchools, verifyCredentials } from './service';

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
  expect(result.schoolId?.equals(schoolId)).toBe(true);
});

it('gives the same error for a wrong password and an unknown email', async () => {
  await expect(verifyCredentials(EMAIL, 'wrong')).rejects.toMatchObject({ messageKey: 'auth.signIn.invalid' });
  await expect(verifyCredentials('nobody@school.example', PASSWORD)).rejects.toMatchObject({
    messageKey: 'auth.signIn.invalid',
  });
});

it('writes a failed sign-in to the audit log of the person’s school, and the lock too', async () => {
  const user = await User.findOne({ email: EMAIL }).orFail().lean();
  const schoolId = user.roles[0]?.schoolId ?? new Types.ObjectId();
  const count = (action: string) => AuditLog.countDocuments({ schoolId, actorId: user._id, action });
  const failed = await count('auth.signIn.failed');
  await expect(verifyCredentials(EMAIL, 'wrong-password-1', { ip: '203.0.113.9', userAgent: 'test' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(await count('auth.signIn.failed')).toBe(failed + 1);
  expect(await AuditLog.findOne({ schoolId, actorId: user._id, action: 'auth.signIn.failed' }).sort({ at: -1 }).lean()).toMatchObject({ ip: '203.0.113.9' });
});

it('lists the other schools a person works in, and none that are suspended or are the current one', async () => {
  const user = await User.findOne({ email: EMAIL }).orFail().lean();
  const home = user.roles[0]?.schoolId ?? new Types.ObjectId();
  const mk = (name: string, status: 'active' | 'suspended') =>
    School.create({ organizationId: new Types.ObjectId(), name, code: `S${Math.random().toString(36).slice(2, 7).toUpperCase()}`, board: 'CBSE', status, address: { line1: '1 Road', city: 'Bhopal', state: 'MP', pincode: '462001', country: 'IN' } });
  const [open, closed] = [await mk('Open School', 'active'), await mk('Closed School', 'suspended')];
  await User.updateOne({ _id: user._id }, { $push: { roles: [{ role: 'accountant', schoolId: open._id, scope: 'school' }, { role: 'teacher', schoolId: closed._id, scope: 'assigned' }] } });
  expect(await listOtherSchools(user._id, home)).toEqual([{ id: String(open._id), name: 'Open School', role: 'accountant' }]);
  expect(await listOtherSchools(user._id, open._id)).toEqual([]);
  await User.updateOne({ _id: user._id }, { $set: { roles: user.roles } });
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

it('signs platform staff in without a school, and not before their password is right', async () => {
  const email = `platform-${Date.now()}@sanchalix.example`;
  await User.create({
    name: 'Platform',
    email,
    passwordHash,
    roles: [{ role: 'super_admin', scope: 'platform' }],
    status: 'active',
  });
  expect(await verifyCredentials(email, PASSWORD)).toMatchObject({ role: 'super_admin', schoolId: null });
  await expect(verifyCredentials(email, 'wrong-password-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});
