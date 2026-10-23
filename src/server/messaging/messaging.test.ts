import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { requestOtp, requestPasswordReset, resetPassword, verifyOtp } from '@/server/auth/recovery';
import { hashPassword, verifyPassword } from '@/server/auth/service';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Invoice } from '@/server/models/invoice';
import { OtpChallenge, OutboundMessage } from '@/server/models/outboundMessage';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Session } from '@/server/models/session';
import { User } from '@/server/models/user';
import { StudentInput } from '@/server/modules/sis/schemas';
import { createStudent } from '@/server/modules/sis/service';
import { sendAbsenceAlerts, sendDuesReminders } from './alerts';
import { quietUntil } from './quietHours';
import { listOutbox, releaseHeldMessages, sendMessages } from './send';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' };
const stamp = Date.now();
let ctx: RequestContext;
let other: RequestContext;
let sectionId: Types.ObjectId;
const students: Types.ObjectId[] = [];

async function seedSchool(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: code,
    code,
    board: 'CBSE',
    address: { ...ADDRESS, country: 'IN' },
  });
  const year = await AcademicYear.create({
    schoolId: school._id,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const section = await Section.create({
    schoolId: school._id,
    branchId: new Types.ObjectId(),
    academicYearId: year._id,
    classId: new Types.ObjectId(),
    name: 'A',
    displayName: '4-A',
  });
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Office',
    role: 'school_admin',
    scope: 'school',
    schoolId: school._id,
  };
  return { context, section };
}

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(''));
  await connectDb();
  await Promise.all([OutboundMessage, OtpChallenge, User, Invoice, AttendanceRecord].map((model) => model.init()));
  const code = stamp.toString(36).slice(-5).toUpperCase();
  const ours = await seedSchool(`N${code}`);
  ctx = ours.context;
  sectionId = ours.section._id;
  other = (await seedSchool(`P${code}`)).context;
  for (const [firstName, phone] of [
    ['Ria', '9600000001'],
    ['Sam', '9600000002'],
  ] as const) {
    const created = await createStudent(
      ctx,
      StudentInput.parse({
        firstName,
        lastName: 'Bose',
        dob: '2016-03-01',
        gender: 'female',
        sectionId: String(sectionId),
        guardians: [{ name: `Parent of ${firstName}`, relation: 'mother', phone, email: '' }],
        address: ADDRESS,
      }),
    );
    students.push(created.id);
  }
});

afterAll(() => mongoose.disconnect());

it('sends a message with a dedupe key once per school', async () => {
  const message = { schoolId: ctx.schoolId, channel: 'sms' as const, to: '+919600000009', template: 'dues', body: 'Hello' };
  expect(await sendMessages([{ ...message, dedupeKey: 'k1' }, { ...message, dedupeKey: 'k2' }])).toBe(2);
  expect(await sendMessages([{ ...message, dedupeKey: 'k1' }, { ...message, dedupeKey: 'k3' }])).toBe(1);
  expect(await sendMessages([{ ...message, schoolId: other.schoolId, dedupeKey: 'k1' }])).toBe(1);
  expect(await listOutbox(ctx)).toHaveLength(3);
  expect(await listOutbox(other)).toHaveLength(1);
});

it('alerts the guardian of each absent student once a day', async () => {
  const [ria, sam] = students;
  await AttendanceRecord.create({
    schoolId: ctx.schoolId,
    branchId: new Types.ObjectId(),
    academicYearId: new Types.ObjectId(),
    sectionId,
    date: '2026-09-01',
    mode: 'daily',
    period: null,
    entries: [
      { studentId: ria, status: 'absent', source: 'manual', at: new Date() },
      { studentId: sam, status: 'present', source: 'manual', at: new Date() },
    ],
    submittedAt: new Date(),
    idempotencyKey: `test-${stamp}`,
  });
  const text = ({ student }: { student: string }) => `${student} was absent`;
  expect(await sendAbsenceAlerts(other, String(sectionId), '2026-09-01', text)).toBe(0);
  expect(await sendAbsenceAlerts(ctx, String(sectionId), '2026-09-01', text)).toBe(1);
  expect(await sendAbsenceAlerts(ctx, String(sectionId), '2026-09-01', text)).toBe(0);
  expect((await listOutbox(ctx))[0]).toMatchObject({ to: '+919600000001', template: 'absence', body: 'Ria Bose was absent' });
});

it('reminds each family with an overdue balance once a day', async () => {
  // Raw inserts: only the fields the reminder reads, not a full invoice.
  await Invoice.collection.insertMany(
    [
      { studentId: students[1], balanceMinor: 250000, dueDate: '2026-01-10', status: 'issued' },
      { studentId: students[1], balanceMinor: 100000, dueDate: '2026-02-10', status: 'partially_paid' },
      { studentId: students[0], balanceMinor: 500000, dueDate: '2999-01-10', status: 'issued' },
    ].map((invoice, index) => ({
      ...invoice,
      invoiceNo: `T-${index}`,
      installmentId: new Types.ObjectId(),
      schoolId: ctx.schoolId,
      deletedAt: null,
    })),
  );
  const text = ({ student, amount }: { student: string; amount: string }) => `${student} owes ${amount}`;
  expect(await sendDuesReminders(ctx, text)).toEqual({ sent: 1, families: 1 });
  expect(await sendDuesReminders(ctx, text)).toEqual({ sent: 0, families: 1 });
  expect((await listOutbox(ctx))[0]?.body).toBe('Sam Bose owes ₹3,500');
  expect(await sendDuesReminders(other, text)).toEqual({ sent: 0, families: 0 });
});

it('resets a password with a single-use link that expires', async () => {
  const email = `reset.${stamp}@example.com`;
  const user = await User.create({
    name: 'Reset Me',
    email,
    passwordHash: await hashPassword('Old-password-1'),
    roles: [{ role: 'teacher', schoolId: ctx.schoolId, scope: 'assigned' }],
    status: 'active',
  });
  await Session.create({
    sessionToken: `reset-${stamp}`,
    userId: user._id,
    activeRole: 'teacher',
    activeSchoolId: ctx.schoolId,
    expires: new Date(Date.now() + 60_000),
  });
  const links: string[] = [];
  const text = (link: string) => (links.push(link), { subject: 'Reset', body: link });

  await requestPasswordReset(`nobody.${stamp}@example.com`, text);
  expect(links).toHaveLength(0);
  await requestPasswordReset(email, text);
  const token = new URL(links[0] ?? '').searchParams.get('token') ?? '';
  expect(token.length).toBeGreaterThan(30);
  expect((await User.findById(user._id).select('+passwordReset.tokenHash').lean())?.passwordReset?.tokenHash).not.toBe(token);

  await expect(resetPassword(`${token}x`, 'New-password-1')).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(await resetPassword(token, 'New-password-1')).toMatchObject({ role: 'teacher' });
  const stored = await User.findById(user._id).select('+passwordHash').lean();
  expect(await verifyPassword(stored?.passwordHash ?? '', 'New-password-1')).toBe(true);
  expect(await Session.countDocuments({ userId: user._id })).toBe(0);
  await expect(resetPassword(token, 'Another-password-1')).rejects.toMatchObject({ code: 'VALIDATION' });

  await requestPasswordReset(email, text);
  await User.updateOne({ _id: user._id }, { 'passwordReset.expiresAt': new Date(Date.now() - 1000) });
  const expired = new URL(links[1] ?? '').searchParams.get('token') ?? '';
  await expect(resetPassword(expired, 'Late-password-1')).rejects.toMatchObject({ code: 'VALIDATION' });
});

it('signs a parent in with a phone code, and nobody else', async () => {
  const phone = `+9195${String(stamp).slice(-8)}`;
  const staffPhone = `+9194${String(stamp).slice(-8)}`;
  await User.create([
    { name: 'A Parent', phone, roles: [{ role: 'parent', schoolId: ctx.schoolId, scope: 'ward' }], status: 'active' },
    { name: 'A Teacher', phone: staffPhone, roles: [{ role: 'teacher', schoolId: ctx.schoolId, scope: 'assigned' }], status: 'active' },
  ]);
  const codes: string[] = [];
  const text = (code: string) => (codes.push(code), code);

  await requestOtp(staffPhone, text);
  await requestOtp('+919000000000', text);
  expect(codes).toHaveLength(0);

  await requestOtp(phone, text);
  expect(codes[0]).toMatch(/^\d{6}$/);
  await expect(requestOtp(phone, text)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  expect((await OtpChallenge.findOne({ phone }).lean())?.codeHash).not.toContain(codes[0]);

  const wrong = codes[0] === '000000' ? '000001' : '000000';
  await expect(verifyOtp(phone, wrong)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(await verifyOtp(phone, codes[0] ?? '')).toMatchObject({ role: 'parent' });
  await expect(verifyOtp(phone, codes[0] ?? '')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

  // Five wrong guesses use the code up: the right one no longer works.
  await OtpChallenge.updateMany({ phone }, { sentAt: new Date(0) });
  await requestOtp(phone, text);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(verifyOtp(phone, wrong)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  }
  await expect(verifyOtp(phone, codes[1] ?? '')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('works out when quiet hours end, including a window that runs past midnight', () => {
  const quiet = { start: '21:00', end: '07:00' };
  const at = (iso: string) => quietUntil('Asia/Kolkata', quiet, new Date(iso))?.toISOString() ?? null;
  expect(at('2026-10-10T08:30:00Z')).toBeNull();
  // 21:30 the evening before, 01:30 and 03:30 after midnight: all wait for 07:00 on the 11th (01:30 UTC).
  expect(at('2026-10-10T16:00:00Z')).toBe('2026-10-11T01:30:00.000Z');
  expect(at('2026-10-10T20:00:00Z')).toBe('2026-10-11T01:30:00.000Z');
  expect(at('2026-10-10T22:00:00Z')).toBe('2026-10-11T01:30:00.000Z');
  expect(at('2026-10-11T01:30:00Z')).toBeNull();
  expect(quietUntil('Asia/Kolkata', { start: '09:00', end: '09:00' }, new Date('2026-10-10T04:00:00Z'))).toBeNull();
});

it('holds a text that is not urgent through quiet hours, sends urgent ones and emails at once, and releases the rest later', async () => {
  await School.updateOne({ _id: ctx.schoolId }, { 'settings.quietHours': { start: '00:00', end: '23:59' } });
  const to = `+9197${String(stamp).slice(-8)}`;
  const base = { schoolId: ctx.schoolId, to, body: 'hello' };
  await sendMessages([
    { ...base, channel: 'sms', template: 'dues', dedupeKey: `q1:${stamp}` },
    { ...base, channel: 'sms', template: 'otp', urgent: true, dedupeKey: `q2:${stamp}` },
    { ...base, channel: 'email', template: 'invite', dedupeKey: `q3:${stamp}` },
  ]);
  const status = async (key: string) => (await OutboundMessage.findOne({ schoolId: ctx.schoolId, dedupeKey: `${key}:${stamp}` }).lean())?.status;
  expect([await status('q1'), await status('q2'), await status('q3')]).toEqual(['held', 'sent', 'sent']);

  expect(await releaseHeldMessages(ctx.schoolId)).toBe(0);
  await OutboundMessage.updateOne({ schoolId: ctx.schoolId, dedupeKey: `q1:${stamp}` }, { sendAfter: new Date(Date.now() - 1000) });
  expect(await releaseHeldMessages(other.schoolId)).toBe(0);
  expect(await releaseHeldMessages(ctx.schoolId)).toBe(1);
  expect(await releaseHeldMessages(ctx.schoolId)).toBe(0);
  expect(await status('q1')).toBe('sent');
  await School.updateOne({ _id: ctx.schoolId }, { 'settings.quietHours': { start: '21:00', end: '07:00' } });
});

it('waits for the alert time, and drops the alert for a child marked present again', async () => {
  const [ria, sam] = students;
  const date = '2099-01-05';
  const doc = await AttendanceRecord.create({
    schoolId: ctx.schoolId,
    branchId: new Types.ObjectId(),
    academicYearId: new Types.ObjectId(),
    sectionId,
    date,
    mode: 'daily',
    period: null,
    entries: [ria, sam].map((studentId) => ({ studentId, status: 'absent', source: 'manual', at: new Date() })),
    submittedAt: new Date(),
    idempotencyKey: `wait-${stamp}`,
  });
  const text = ({ student }: { student: string }) => `${student} was absent`;
  expect(await sendAbsenceAlerts(ctx, String(sectionId), date, text)).toBe(2);
  const held = await OutboundMessage.find({ schoolId: ctx.schoolId, template: 'absence', status: 'held', 'recheck.date': date }).lean();
  expect(held).toHaveLength(2);
  expect(await releaseHeldMessages(ctx.schoolId)).toBe(0);

  await AttendanceRecord.updateOne({ schoolId: ctx.schoolId, _id: doc._id }, { 'entries.0.status': 'present' });
  await OutboundMessage.updateMany({ schoolId: ctx.schoolId, 'recheck.date': date }, { sendAfter: new Date(Date.now() - 1000) });
  expect(await releaseHeldMessages(ctx.schoolId)).toBe(1);
  const left = await OutboundMessage.find({ schoolId: ctx.schoolId, 'recheck.date': date }).lean();
  expect(left.map((message) => message.status).sort()).toEqual(['sent', 'skipped']);
});
