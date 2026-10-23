'use server';

import 'server-only';
import { getTranslations } from 'next-intl/server';
import { type ActionResult, AppError } from '@/lib/appError';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { Guardian } from '@/server/models/guardian';
import { User } from '@/server/models/user';
import { getContext, getPendingSession } from './context';
import { DENSITY_COOKIE } from '@/lib/visualMode';
import { Session } from '@/server/models/session';
import {
  requestOtp,
  RequestOtp,
  requestPasswordReset as requestReset,
  RequestReset,
  resetPassword as reset,
  ResetPassword,
  verifyOtp,
  VerifyOtp,
} from './recovery';
import { env } from '@/lib/env';
import { platformAudit } from '@/server/platform/audit';
import { ROLE_KEYS, type RoleKey, TOTP_REQUIRED_ROLES } from './permissions';
import { headers } from 'next/headers';
import { enforceLimit } from '@/server/rateLimit';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ChangePassword, SetDensity, SetVisualMode, SignIn, TotpCode } from './schemas';
import { isBreached } from './breached';
import { hashPassword, listOtherSchools, verifyCredentials, verifyPassword } from './service';
import { createSession, destroySession, readSession, setModeCookie } from './session';
import { confirmTotpSetup, verifyTotpChallenge } from './twoFactor';

const USER = 'user';

export async function signInWithPassword(_previous: ActionResult<void> | null, formData: FormData) {
  return withAction('auth.signInWithPassword', async () => {
    const input = SignIn.parse(Object.fromEntries(formData));
    await enforceLimit('signIn', 30, 600);
    const requestHeaders = await headers();
    const { userId, role, schoolId, visualMode, needsTotp } = await verifyCredentials(input.email, input.password, {
      ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent')?.slice(0, 256) ?? null,
    });
    await createSession(userId, role, schoolId, needsTotp);
    await setModeCookie(visualMode);
    if (!needsTotp) await auditSignIn({ userId, role, schoolId }, 'auth.signIn');
  });
}

type Actor = { userId: Types.ObjectId; role: RoleKey; schoolId: Types.ObjectId | null };

// Platform staff belong to no school, so their sign-ins go to the platform audit log.
async function auditSignIn(actor: Actor, action: string) {
  if (actor.schoolId) await audit({ ...actor, schoolId: actor.schoolId }, action, { type: USER, id: actor.userId });
  else await platformAudit(actor.userId, action, { type: USER, id: actor.userId });
}

async function requirePendingSession(): Promise<Actor> {
  const session = await getPendingSession();
  if (!session) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
  return { userId: session.userId, role: session.activeRole, schoolId: session.activeSchoolId ?? null };
}

// The pending session is replaced, not upgraded, so the token changes when the user gains access.
async function completeSignIn(actor: Awaited<ReturnType<typeof requirePendingSession>>, action: string) {
  await destroySession();
  await createSession(actor.userId, actor.role, actor.schoolId);
  await auditSignIn(actor, action);
}

export async function verifyTotp(_previous: ActionResult<void> | null, formData: FormData) {
  return withAction('auth.verifyTotp', async () => {
    const actor = await requirePendingSession();
    const method = await verifyTotpChallenge(actor.userId, TotpCode.parse(formData.get('code')));
    await User.updateOne({ _id: actor.userId }, { failedLoginCount: 0 });
    await completeSignIn(actor, method === 'totp' ? 'auth.signIn' : 'auth.signIn.recoveryCode');
  });
}

export async function confirmTotp(code: unknown) {
  return withAction('auth.confirmTotp', async () => {
    const actor = await requirePendingSession();
    const recoveryCodes = await confirmTotpSetup(actor.userId, TotpCode.parse(code));
    await auditSignIn(actor, 'auth.totp.enable');
    return { recoveryCodes };
  });
}

export async function completeTotpSetup() {
  return withAction('auth.completeTotpSetup', async () => {
    const actor = await requirePendingSession();
    const user = await User.findById(actor.userId).select('totp.enabledAt').lean();
    if (!user?.totp?.enabledAt) throw new AppError('FORBIDDEN', 'errors.forbidden');
    await completeSignIn(actor, 'auth.signIn');
  });
}

export async function signOut() {
  return withAction('auth.signOut', destroySession);
}

const SwitchRole = z.enum(ROLE_KEYS);

export async function requestPasswordReset(input: unknown) {
  return withAction('auth.requestPasswordReset', async () => {
    const { email } = RequestReset.parse(input);
    await enforceLimit('passwordReset', 8, 900);
    const t = await getTranslations('outbound.passwordReset');
    await requestReset(email, (link) => ({ subject: t('subject'), body: t('body', { link }) }));
  });
}

export async function resetPassword(input: unknown) {
  return withAction('auth.resetPassword', async () => {
    const { token, next } = ResetPassword.parse(input);
    const actor = await reset(token, next);
    await audit(actor, 'auth.password.reset', { type: USER, id: actor.userId });
  });
}

export async function requestOtpCode(input: unknown) {
  return withAction('auth.requestOtp', async () => {
    const { phone } = RequestOtp.parse(input);
    await enforceLimit('otp', 8, 900);
    const t = await getTranslations('outbound');
    await requestOtp(phone, (code) => t('otp', { code }));
  });
}

export async function signInWithOtp(input: unknown) {
  return withAction('auth.signInWithOtp', async () => {
    const { phone, code } = VerifyOtp.parse(input);
    const { userId, role, schoolId, visualMode } = await verifyOtp(phone, code);
    await createSession(userId, role, schoolId);
    await setModeCookie(visualMode);
    await audit({ userId, role, schoolId }, 'auth.signIn.otp', { type: USER, id: userId });
  });
}

/** Changes which of the user's roles in this school is active. The session is replaced, not edited. */
export async function switchRole(input: unknown) {
  return withAction('auth.switchRole', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const role = SwitchRole.parse(input);
    const user = await User.findById(ctx.userId).select('roles').lean();
    const held = user?.roles.some((assignment) => assignment.role === role && assignment.schoolId?.equals(ctx.schoolId));
    if (!held || role === ctx.role) throw new AppError('FORBIDDEN', 'errors.forbidden');
    // Moving up to a role that needs two-step verification asks for the code again.
    const needsTotp =
      env.TWO_FACTOR_ENABLED === 'true' && TOTP_REQUIRED_ROLES.includes(role) && !TOTP_REQUIRED_ROLES.includes(ctx.role);
    await destroySession();
    await createSession(ctx.userId, role, ctx.schoolId, needsTotp);
    await audit({ ...ctx, role }, 'auth.role.switch', { type: USER, id: ctx.userId }, {
      before: { role: ctx.role },
      after: { role },
    });
  });
}

const AnnouncementCopy = z.object({ channel: z.enum(['email', 'sms']), enabled: z.boolean() });

/** Whether announcements are also sent to this person by email or text. They always appear in the app. */
export async function setAnnouncementCopy(input: unknown) {
  return withAction('auth.setAnnouncementCopy', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const { channel, enabled } = AnnouncementCopy.parse(input);
    await User.updateOne({ _id: ctx.userId }, { $pull: { notificationPrefs: { channel, category: 'announcements' } } });
    await User.updateOne({ _id: ctx.userId }, { $push: { notificationPrefs: { channel, category: 'announcements', enabled } } });
    await audit(ctx, 'auth.announcementCopy.update', { type: USER, id: ctx.userId }, { after: { channel, enabled } });
    return { channel, enabled };
  });
}

const FeeTexts = z.object({ enabled: z.boolean() });

/** A parent's choice about fee reminder texts. Absence alerts and sign-in codes can't be switched off. */
export async function setFeeTexts(input: unknown) {
  return withAction('auth.setFeeTexts', async () => {
    const ctx = await getContext();
    if (!ctx?.guardianId) throw new AppError('FORBIDDEN', 'errors.forbidden');
    const { enabled } = FeeTexts.parse(input);
    const rest = { schoolId: ctx.schoolId, _id: ctx.guardianId };
    await Guardian.updateOne(rest, { $pull: { notificationPrefs: { channel: 'sms', category: 'fees' } } });
    await Guardian.updateOne(rest, { $push: { notificationPrefs: { channel: 'sms', category: 'fees', enabled } } });
    await audit(ctx, 'auth.feeTexts.update', { type: USER, id: ctx.userId }, { after: { enabled } });
    return { enabled };
  });
}

/** Moves a person who works in more than one school to another of them. The session is replaced, not edited. */
export async function switchSchool(input: unknown) {
  return withAction('auth.switchSchool', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const schoolId = z.string().regex(/^[0-9a-f]{24}$/).parse(input);
    const target = (await listOtherSchools(ctx.userId, ctx.schoolId)).find((school) => school.id === schoolId);
    if (!target) throw new AppError('FORBIDDEN', 'errors.forbidden');
    const needsTotp = env.TWO_FACTOR_ENABLED === 'true' && TOTP_REQUIRED_ROLES.includes(target.role);
    await destroySession();
    await createSession(ctx.userId, target.role, new Types.ObjectId(target.id), needsTotp);
    await audit({ userId: ctx.userId, role: target.role, schoolId: new Types.ObjectId(target.id) }, 'auth.school.switch', { type: USER, id: ctx.userId }, {
      before: { schoolId: String(ctx.schoolId) },
      after: { schoolId: target.id },
    });
  });
}

export async function setDensity(input: unknown) {
  return withAction('auth.setDensity', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const density = SetDensity.parse(input);
    await User.updateOne({ _id: ctx.userId }, { density });
    await setModeCookie(density, DENSITY_COOKIE);
  });
}

export async function changePassword(input: unknown) {
  return withAction('auth.changePassword', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const { current, next } = ChangePassword.parse(input);
    const [user, session] = await Promise.all([
      User.findById(ctx.userId).select('+passwordHash').lean(),
      readSession(),
    ]);
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
      throw new AppError('VALIDATION', 'auth.password.wrongCurrent');
    }
    if (await isBreached(next)) throw new AppError('VALIDATION', 'auth.password.breached');
    await User.updateOne({ _id: ctx.userId }, { passwordHash: await hashPassword(next) });
    // Whoever else holds a session for this account is signed out. This device stays signed in.
    await Session.deleteMany({ userId: ctx.userId, _id: { $ne: session?._id } });
    await audit(ctx, 'auth.password.change', { type: 'user', id: ctx.userId });
  });
}

const SessionId = z.string().regex(/^[0-9a-f]{24}$/);

/** Signs one of your other devices out. The device you are using is signed out with Sign out, not here. */
export async function signOutSession(input: unknown) {
  return withAction('auth.signOutSession', async () => {
    const ctx = await getContext();
    const session = await readSession();
    if (!ctx || !session) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const id = SessionId.parse(input);
    const { deletedCount } = await Session.deleteOne({ userId: ctx.userId, _id: { $eq: id, $ne: session._id } });
    if (deletedCount === 1) await audit(ctx, 'auth.session.signOut', { type: USER, id: ctx.userId });
    return { signedOut: deletedCount === 1 };
  });
}

export async function signOutOtherSessions() {
  return withAction('auth.signOutOthers', async () => {
    const ctx = await getContext();
    const session = await readSession();
    if (!ctx || !session) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const { deletedCount } = await Session.deleteMany({ userId: ctx.userId, _id: { $ne: session._id } });
    await audit(ctx, 'auth.session.signOutOthers', { type: USER, id: ctx.userId }, { after: { count: deletedCount } });
    return { count: deletedCount };
  });
}

export async function setVisualMode(input: unknown) {
  return withAction('auth.setVisualMode', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const visualMode = SetVisualMode.parse(input);
    await User.updateOne({ _id: ctx.userId }, { visualMode });
    await setModeCookie(visualMode);
  });
}
