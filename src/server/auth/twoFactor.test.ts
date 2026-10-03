import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { totpCode } from '@/lib/totp';
import { connectDb } from '@/server/db/connect';
import { User } from '@/server/models/user';
import { confirmTotpSetup, getTotpSetup, verifyTotpChallenge } from './twoFactor';

let userId: Types.ObjectId;

beforeAll(() => connectDb());

beforeEach(async () => {
  const user = await User.create({
    name: 'Ramesh Gupta',
    email: `ramesh-${new Types.ObjectId().toString()}@school.example`,
    roles: [{ role: 'accountant', schoolId: new Types.ObjectId(), scope: 'school' }],
    status: 'active',
  });
  userId = user._id;
});

afterAll(() => mongoose.disconnect());

async function enrol() {
  const setup = await getTotpSetup(userId);
  if (!setup) throw new Error('expected a setup');
  const recoveryCodes = await confirmTotpSetup(userId, totpCode(setup.secret));
  return { secret: setup.secret, recoveryCodes };
}

it('keeps the same secret across reloads and stores it encrypted', async () => {
  const first = await getTotpSetup(userId);
  const second = await getTotpSetup(userId);
  expect(second?.secret).toBe(first?.secret);
  const stored = await User.findById(userId).select('+totp.secret').lean();
  expect(stored?.totp?.secret).not.toContain(first?.secret);
});

it('does not enable 2FA for a wrong setup code', async () => {
  await getTotpSetup(userId);
  await expect(confirmTotpSetup(userId, '000000')).rejects.toMatchObject({ messageKey: 'auth.totp.wrongCode' });
  expect((await User.findById(userId).lean())?.totp?.enabledAt).toBeUndefined();
});

it('enables 2FA with 10 recovery codes, then offers no further setup', async () => {
  const { recoveryCodes } = await enrol();
  expect(new Set(recoveryCodes).size).toBe(10);
  expect(await getTotpSetup(userId)).toBeNull();
});

it('accepts the current code and rejects a wrong one', async () => {
  const { secret } = await enrol();
  expect(await verifyTotpChallenge(userId, totpCode(secret))).toBe('totp');
  await expect(verifyTotpChallenge(userId, '000000')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('accepts each recovery code only once', async () => {
  const { recoveryCodes } = await enrol();
  const code = recoveryCodes[0] ?? '';
  expect(await verifyTotpChallenge(userId, code.toUpperCase())).toBe('recoveryCode');
  await expect(verifyTotpChallenge(userId, code)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('locks the account after 10 wrong codes, even for the right one', async () => {
  const { secret } = await enrol();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await expect(verifyTotpChallenge(userId, '000000')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  }
  await expect(verifyTotpChallenge(userId, totpCode(secret))).rejects.toMatchObject({ code: 'RATE_LIMITED' });
});
