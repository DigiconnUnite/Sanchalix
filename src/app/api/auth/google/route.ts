import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { GOOGLE_COOKIE, googleConfig } from '@/server/auth/google';

const random = () => randomBytes(32).toString('base64url');

/** Starts Google sign-in: the state, nonce and PKCE verifier wait in a short-lived cookie for the callback to check. */
export async function GET() {
  const config = googleConfig();
  if (!config) return Response.redirect(`${env.APP_URL}/signin`);

  const [state, nonce, verifier] = [random(), random(), random()];
  (await cookies()).set(GOOGLE_COOKIE, JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 600,
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return Response.redirect(url);
}
