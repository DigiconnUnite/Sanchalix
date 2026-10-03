import 'server-only';
import { z } from 'zod';
import { VISUAL_MODES } from '@/lib/visualMode';

export const SetVisualMode = z.enum(VISUAL_MODES);

export const TotpCode = z.string('auth.totp.codeRequired').trim().min(6, 'auth.totp.codeRequired').max(20, 'auth.totp.wrongCode');

export const SignIn = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('auth.signIn.emailInvalid')),
  password: z.string().min(1, 'auth.signIn.passwordRequired').max(256, 'auth.signIn.invalid'),
});
