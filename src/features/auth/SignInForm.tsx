'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { signInWithPassword } from '@/server/auth/actions';
import { AuthCard, AuthDivider } from './AuthCard';

export function SignInForm({ google, notice }: { google: boolean; notice: 'failed' | 'noAccount' | null }) {
  const t = useTranslations('auth.signIn');
  const router = useRouter();
  const [state, formAction, pending] = useActionState(signInWithPassword, null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailRef = useRef<InputProps.Ref>(null);
  const passwordRef = useRef<InputProps.Ref>(null);
  const error = state && !state.ok ? state.error : null;

  useEffect(() => {
    if (!error) return;
    if (error.fieldErrors?.email) emailRef.current?.focus();
    else passwordRef.current?.focus();
  }, [error]);

  return (
    <AuthCard title={t('title')} description={t('description')}>
      <form action={formAction}>
        <SpaceBetween size="l">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          {notice && <Alert type="error">{t(`google.${notice}`)}</Alert>}
          <FormField label={t('email')} errorText={error?.fieldErrors?.email} stretch>
            <Input
              ref={emailRef}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              spellcheck={false}
              autoFocus
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={({ detail }) => setEmail(detail.value)}
            />
          </FormField>
          <SpaceBetween size="xs">
            <FormField label={t('password')} errorText={error?.fieldErrors?.password} stretch>
              <Input
                ref={passwordRef}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={({ detail }) => setPassword(detail.value)}
              />
            </FormField>
            <Box textAlign="right">
              <AppLink href="/forgot-password" fontSize="body-s">
                {t('forgot')}
              </AppLink>
            </Box>
          </SpaceBetween>
          <Button variant="primary" fullWidth loading={pending || Boolean(state?.ok)} iconSvg={svg('signIn')}>
            {t('submit')}
          </Button>
          <AuthDivider />
          <SpaceBetween size="s">
            <Button
              fullWidth
              formAction="none"
              iconSvg={svg('phone')}
              href="/signin/otp"
              onFollow={(event) => {
                event.preventDefault();
                router.push('/signin/otp');
              }}
            >
              {t('useCode')}
            </Button>
            {google && (
              <Button fullWidth formAction="none" href="/api/auth/google">
                {t('google.button')}
              </Button>
            )}
          </SpaceBetween>
        </SpaceBetween>
      </form>
    </AuthCard>
  );
}
