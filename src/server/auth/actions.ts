'use server';

import 'server-only';
import { getTranslations } from 'next-intl/server';
import { type ActionResult, AppError } from '@/lib/appError';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
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
import { ROLE_KEYS, TOTP_REQUIRED_ROLES } from './permissions';
import { z } from 'zod';
import { ChangePassword, SetDensity, SetVisualMode, SignIn, TotpCode } from './schemas';
import { hashPassword, verifyCredentials, verifyPassword } from './service';
import { createSession, destroySession, readSession, setModeCookie } from './session';
import { confirmTotpSetup, verifyTotpChallenge } from './twoFactor';

const USER = 'user';

export async function signInWithPassword(_previous: ActionResult<void> | null, formData: FormData) {
  return withAction('auth.signInWithPassword', async () => {
    const input = SignIn.parse(Object.fromEntries(formData));
    const { userId, role, schoolId, visualMode, needsTotp } = await verifyCredentials(input.email, input.password);
    await createSession(userId, role, schoolId, needsTotp);
    await setModeCookie(visualMode);
    if (!needsTotp) await audit({ userId, role, schoolId }, 'auth.signIn', { type: USER, id: userId });
  });
}

async function requirePendingSession() {
  const session = await getPendingSession();
  if (!session?.activeSchoolId) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
  return { userId: session.userId, role: session.activeRole, schoolId: session.activeSchoolId };
}

// The pending session is replaced, not upgraded, so the token changes when the user gains access.
async function completeSignIn(actor: Awaited<ReturnType<typeof requirePendingSession>>, action: string) {
  await destroySession();
  await createSession(actor.userId, actor.role, actor.schoolId);
  await audit(actor, action, { type: USER, id: actor.userId });
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
    await audit(actor, 'auth.totp.enable', { type: USER, id: actor.userId });
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
