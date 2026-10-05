import 'server-only';
import { z } from 'zod';
import { DENSITIES, VISUAL_MODES } from '@/lib/visualMode';

export const SetVisualMode = z.enum(VISUAL_MODES);
export const SetDensity = z.enum(DENSITIES);

export const ChangePassword = z
  .object({
    current: z.string().min(1, 'auth.password.currentRequired').max(256, 'auth.password.wrongCurrent'),
    next: z.string().min(10, 'auth.password.tooShort').max(256, 'auth.password.tooLong'),
    confirm: z.string(),
  })
  .refine(({ next, confirm }) => next === confirm, { path: ['confirm'], message: 'auth.password.mismatch' })
  .refine(({ current, next }) => current !== next, { path: ['next'], message: 'auth.password.same' });

export const TotpCode = z.string('auth.totp.codeRequired').trim().min(6, 'auth.totp.codeRequired').max(20, 'auth.totp.wrongCode');

export const SignIn = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('auth.signIn.emailInvalid')),
  password: z.string().min(1, 'auth.signIn.passwordRequired').max(256, 'auth.signIn.invalid'),
});
