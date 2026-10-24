import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { SESSION_COOKIE } from '@/lib/sessionCookie';

const handleLocale = createMiddleware(routing);
const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`);
const PUBLIC_PATH = /^\/(signin|welcome|blog|verify|forgot-password|reset-password)(\/|$)/;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
};

// A convenience redirect only. Authorization is enforced by requirePermission on every page and action.
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const prefix = LOCALE_PREFIX.exec(pathname)?.[0] ?? '';
  const path = pathname.slice(prefix.length) || '/';

  let response: NextResponse;
  if (PUBLIC_PATH.test(path) || request.cookies.has(SESSION_COOKIE)) {
    response = handleLocale(request);
  } else if (path === '/') {
    // A visitor with no session who opens the site sees what Sanchalix is, not a bare sign-in form.
    response = NextResponse.redirect(new URL(`${prefix}/welcome`, request.url));
  } else {
    const signIn = new URL(`${prefix}/signin`, request.url);
    signIn.searchParams.set('next', path + search);
    response = NextResponse.redirect(signIn);
  }

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

export const config = { matcher: '/((?!api|_next|.*\\..*).*)' };
