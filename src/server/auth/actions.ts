'use server';

import 'server-only';
import { type ActionResult, AppError } from '@/lib/appError';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { User } from '@/server/models/user';
import { getContext, getPendingSession } from './context';
import { SetVisualMode, SignIn, TotpCode } from './schemas';
import { verifyCredentials } from './service';
import { createSession, destroySession, setModeCookie } from './session';
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

export async function setVisualMode(input: unknown) {
  return withAction('auth.setVisualMode', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const visualMode = SetVisualMode.parse(input);
    await User.updateOne({ _id: ctx.userId }, { visualMode });
    await setModeCookie(visualMode);
  });
}
