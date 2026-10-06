import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { connectDb } from '@/server/db/connect';
import { School } from '@/server/models/school';
import { User } from '@/server/models/user';
import { findGoogleUser, readGoogleIdentity } from './google';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
const NOW = Date.parse('2026-10-06T10:00:00Z');
const expected = { clientId: 'client-123', nonce: 'nonce-abc' };
const token = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const good = {
  iss: 'https://accounts.google.com',
  aud: 'client-123',
  nonce: 'nonce-abc',
  exp: NOW / 1000 + 600,
  email: 'Teacher@School.Example',
  email_verified: true,
};
const stamp = Date.now();
let openSchool: Types.ObjectId;
let strictSchool: Types.ObjectId;

beforeAll(async () => {
  await connectDb();
  const school = (code: string, domains: string[]) =>
    School.create({
      organizationId: new Types.ObjectId(),
      name: code,
      code,
      board: 'CBSE',
      address: ADDRESS,
      integrations: { allowedGoogleDomains: domains },
    });
  const code = stamp.toString(36).slice(-5).toUpperCase();
  openSchool = (await school(`R${code}`, []))._id;
  strictSchool = (await school(`S${code}`, ['strict.example']))._id;
  const user = (
    name: string,
    email: string,
    role: 'teacher' | 'parent',
    schoolId: Types.ObjectId,
    status: 'active' | 'disabled' = 'active',
  ) => ({
    name,
    email,
    roles: [{ role, schoolId, scope: role === 'teacher' ? ('assigned' as const) : ('ward' as const) }],
    status,
  });
  await User.create([
    user('Open Teacher', `open.${stamp}@gmail.example`, 'teacher', openSchool),
    user('A Parent', `parent.${stamp}@gmail.example`, 'parent', openSchool),
    user('Disabled', `off.${stamp}@gmail.example`, 'teacher', openSchool, 'disabled'),
    user('Strict Teacher', `in.${stamp}@strict.example`, 'teacher', strictSchool),
    user('Outside Teacher', `out.${stamp}@gmail.example`, 'teacher', strictSchool),
  ]);
});

afterAll(() => mongoose.disconnect());

it('accepts only a current Google token made for this app and this sign-in', () => {
  expect(readGoogleIdentity(token(good), expected, NOW)).toEqual({ email: 'teacher@school.example' });
  const bad: Record<string, unknown>[] = [
    { ...good, aud: 'another-app' },
    { ...good, nonce: 'someone-elses' },
    { ...good, iss: 'https://accounts.evil.example' },
    { ...good, exp: NOW / 1000 - 1 },
    { ...good, email_verified: false },
    { ...good, email: undefined },
  ];
  for (const claims of bad) {
    expect(() => readGoogleIdentity(token(claims), expected, NOW)).toThrow();
  }
  expect(() => readGoogleIdentity('not-a-token', expected, NOW)).toThrow();
});

it('signs in active staff only, and respects a school’s allowed domains', async () => {
  expect(await findGoogleUser(`open.${stamp}@gmail.example`)).toMatchObject({ role: 'teacher', needsTotp: false });
  expect(await findGoogleUser(`in.${stamp}@strict.example`)).toMatchObject({ schoolId: strictSchool });
  for (const email of [
    `parent.${stamp}@gmail.example`,
    `off.${stamp}@gmail.example`,
    `out.${stamp}@gmail.example`,
    `nobody.${stamp}@gmail.example`,
  ]) {
    await expect(findGoogleUser(email)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  }
});
