import 'server-only';
import { AppError } from '@/lib/appError';
import { env } from '@/lib/env';
import { connectDb } from '@/server/db/connect';
import { School } from '@/server/models/school';
import { User } from '@/server/models/user';
import { TOTP_REQUIRED_ROLES } from './permissions';

export const GOOGLE_COOKIE = 'vw.oauth';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
// Google sign-in is for staff. Families sign in with a phone code or a password.
const FAMILY = ['parent', 'student'];

/** Present only when both keys are set, so the button and the routes switch on together. */
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret
    ? { clientId, clientSecret, redirectUri: `${env.APP_URL}/api/auth/google/callback` }
    : null;
}

/**
 * Reads who signed in from Google's ID token. The token comes straight from Google's token endpoint over TLS, so
 * its claims are checked here but its signature is not re-verified (Google's guidance for the code flow).
 */
export function readGoogleIdentity(idToken: string, expected: { clientId: string; nonce: string }, now = Date.now()) {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'auth.google.failed');
  }
  const valid =
    ISSUERS.includes(String(claims.iss)) &&
    claims.aud === expected.clientId &&
    claims.nonce === expected.nonce &&
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > now &&
    claims.email_verified === true &&
    typeof claims.email === 'string';
  if (!valid) throw new AppError('UNAUTHENTICATED', 'auth.google.failed');
  return { email: String(claims.email).toLowerCase() };
}

/** The staff account for a Google address. A school that lists allowed Google domains accepts only those. */
export async function findGoogleUser(email: string) {
  await connectDb();
  const user = await User.findOne({ email, status: 'active' }).select('roles visualMode totp.enabledAt').lean();
  const assignment = user?.roles.find((role) => role.schoolId);
  if (!user || !assignment?.schoolId || FAMILY.includes(assignment.role)) {
    throw new AppError('UNAUTHENTICATED', 'auth.google.noAccount');
  }
  const school = await School.findById(assignment.schoolId).select('integrations.allowedGoogleDomains').lean();
  const allowed = school?.integrations?.allowedGoogleDomains ?? [];
  if (allowed.length > 0 && !allowed.includes(email.split('@')[1] ?? '')) {
    throw new AppError('UNAUTHENTICATED', 'auth.google.noAccount');
  }
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), failedLoginCount: 0 } });
  return {
    userId: user._id,
    role: assignment.role,
    schoolId: assignment.schoolId,
    visualMode: user.visualMode,
    // Signing in with Google doesn't skip two-step verification for the roles that must have it.
    needsTotp:
      env.TWO_FACTOR_ENABLED === 'true' &&
      (TOTP_REQUIRED_ROLES.includes(assignment.role) || Boolean(user.totp?.enabledAt)),
  };
}
