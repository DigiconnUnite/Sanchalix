import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { env } from '@/lib/env';
import { connectDb } from '@/server/db/connect';
import { sendMessages } from '@/server/messaging/send';
import { OtpChallenge } from '@/server/models/outboundMessage';
import { Session } from '@/server/models/session';
import { User } from '@/server/models/user';
import { hashPassword } from './service';

const MINUTE = 60_000;
const RESET_TTL = 30 * MINUTE;
const OTP_TTL = 5 * MINUTE;
const OTP_RESEND_AFTER = MINUTE;
const OTP_ATTEMPTS = 5;
// OTP sign-in is for families. Staff hold wider access and sign in with a password (and two-step verification).
const OTP_ROLES = ['parent', 'student'] as const;

const Phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'auth.otp.phoneInvalid')
  .transform((digits) => `+91${digits}`);
export const RequestReset = z.object({ email: z.string().trim().toLowerCase().pipe(z.email('auth.signIn.emailInvalid')) });
export const ResetPassword = z
  .object({
    token: z.string().min(20, 'auth.reset.invalid').max(200, 'auth.reset.invalid'),
    next: z.string().min(10, 'auth.password.tooShort').max(256, 'auth.password.tooLong'),
    confirm: z.string(),
  })
  .refine(({ next, confirm }) => next === confirm, { path: ['confirm'], message: 'auth.password.mismatch' });
export const RequestOtp = z.object({ phone: Phone });
export const VerifyOtp = z.object({ phone: Phone, code: z.string().trim().regex(/^\d{6}$/, 'auth.otp.codeInvalid') });

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
// Six digits are guessable offline from a plain hash, so the code is keyed with the server's secret.
const codeHash = (phone: string, code: string) => createHmac('sha256', env.AUTH_SECRET).update(`${phone}:${code}`).digest('hex');
const schoolOf = <R extends { schoolId?: unknown }>(user: { roles: R[] }) => user.roles.find((role) => role.schoolId);

/**
 * Emails a single-use reset link that works for 30 minutes. Nothing is returned either way, so the form can't be
 * used to find out which emails have accounts.
 */
export async function requestPasswordReset(email: string, text: (link: string) => { subject: string; body: string }) {
  await connectDb();
  const user = await User.findOne({ email, status: 'active' }).select('roles').lean();
  const assignment = user && schoolOf(user);
  if (!user || !assignment?.schoolId) return;
  const token = randomBytes(32).toString('base64url');
  await User.updateOne(
    { _id: user._id },
    { passwordReset: { tokenHash: digest(token), expiresAt: new Date(Date.now() + RESET_TTL) } },
  );
  await sendMessages([
    {
      schoolId: assignment.schoolId,
      channel: 'email',
      to: email,
      template: 'passwordReset',
      ...text(`${env.APP_URL}/reset-password?token=${token}`),
    },
  ]);
}

export async function resetPassword(token: string, next: string) {
  await connectDb();
  const passwordHash = await hashPassword(next);
  // The token is matched and removed in one step, so a link can't be used twice even by two requests at once.
  const user = await User.findOneAndUpdate(
    { 'passwordReset.tokenHash': digest(token), 'passwordReset.expiresAt': { $gt: new Date() }, status: 'active' },
    { $set: { passwordHash, failedLoginCount: 0 }, $unset: { passwordReset: 1, lockedUntil: 1 } },
  )
    .select('roles')
    .lean();
  const assignment = user && schoolOf(user);
  if (!user || !assignment?.schoolId) throw new AppError('VALIDATION', 'auth.reset.invalid');
  await Session.deleteMany({ userId: user._id });
  return { userId: user._id, role: assignment.role, schoolId: assignment.schoolId };
}

const otpUser = (phone: string) =>
  User.findOne({ phone, status: 'active', roles: { $elemMatch: { role: { $in: OTP_ROLES } } } })
    .select('roles visualMode')
    .lean();

/** Texts a 6-digit code that works for 5 minutes. A number with no account gets the same answer and no message. */
export async function requestOtp(phone: string, text: (code: string) => string) {
  await connectDb();
  const recent = await OtpChallenge.exists({
    phone,
    purpose: 'login',
    sentAt: { $gt: new Date(Date.now() - OTP_RESEND_AFTER) },
  });
  if (recent) throw new AppError('RATE_LIMITED', 'auth.otp.wait');
  const user = await otpUser(phone);
  const assignment = user && schoolOf(user);
  if (!user || !assignment?.schoolId) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await OtpChallenge.deleteMany({ phone, purpose: 'login' });
  await OtpChallenge.create({ phone, purpose: 'login', codeHash: codeHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL) });
  await sendMessages([{ schoolId: assignment.schoolId, channel: 'sms', to: phone, template: 'otp', body: text(code) }]);
}

export async function verifyOtp(phone: string, code: string) {
  await connectDb();
  // Counting the attempt is part of finding the challenge, so parallel guesses can't each get a free try.
  const challenge = await OtpChallenge.findOneAndUpdate(
    { phone, purpose: 'login', expiresAt: { $gt: new Date() }, attempts: { $lt: OTP_ATTEMPTS } },
    { $inc: { attempts: 1 } },
  ).lean();
  const expected = Buffer.from(challenge?.codeHash ?? '', 'hex');
  const given = Buffer.from(codeHash(phone, code), 'hex');
  if (!challenge || expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new AppError('UNAUTHENTICATED', 'auth.otp.wrong');
  }
  await OtpChallenge.deleteMany({ phone, purpose: 'login' });
  const user = await otpUser(phone);
  const assignment = user && schoolOf(user);
  if (!user || !assignment?.schoolId) throw new AppError('UNAUTHENTICATED', 'auth.otp.wrong');
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  return { userId: user._id, role: assignment.role, schoolId: assignment.schoolId, visualMode: user.visualMode };
}
