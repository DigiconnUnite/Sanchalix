import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { AppError } from '@/lib/appError';
import { env } from '@/lib/env';
import { audit } from '@/server/audit';
import { findGoogleUser, GOOGLE_COOKIE, googleConfig, readGoogleIdentity } from '@/server/auth/google';
import { createSession, setModeCookie } from '@/server/auth/session';
import { logger } from '@/server/logger';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const back = (reason: 'failed' | 'noAccount') => Response.redirect(`${env.APP_URL}/signin?google=${reason}`);

export async function GET(request: Request) {
  const config = googleConfig();
  if (!config) return Response.redirect(`${env.APP_URL}/signin`);

  const store = await cookies();
  const saved = store.get(GOOGLE_COOKIE)?.value;
  store.delete({ name: GOOGLE_COOKIE, path: '/api/auth/google' });
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  try {
    const { state, nonce, verifier } = JSON.parse(saved ?? '{}') as Record<string, string | undefined>;
    // The state proves this browser started the sign-in; without it the code could be one an attacker planted.
    if (!code || !state || !nonce || !verifier || !same(state, params.get('state') ?? '')) {
      throw new AppError('UNAUTHENTICATED', 'auth.google.failed');
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const tokens = (await response.json()) as { id_token?: string };
    if (!response.ok || !tokens.id_token) throw new AppError('UNAUTHENTICATED', 'auth.google.failed');

    const { email } = readGoogleIdentity(tokens.id_token, { clientId: config.clientId, nonce });
    const { userId, role, schoolId, visualMode, needsTotp } = await findGoogleUser(email);
    await createSession(userId, role, schoolId, needsTotp);
    await setModeCookie(visualMode);
    if (!needsTotp) await audit({ userId, role, schoolId }, 'auth.signIn.google', { type: 'user', id: userId });
    return Response.redirect(`${env.APP_URL}${needsTotp ? '/signin/2fa' : '/'}`);
  } catch (error) {
    if (error instanceof AppError) return back(error.messageKey === 'auth.google.noAccount' ? 'noAccount' : 'failed');
    logger.error({ err: error }, 'google sign-in failed');
    return back('failed');
  }
}
