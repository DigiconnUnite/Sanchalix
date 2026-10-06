'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { svg } from '@/components/icons';
import { signInWithPassword } from '@/server/auth/actions';

export function SignInForm({ google, notice }: { google: boolean; notice: 'failed' | 'noAccount' | null }) {
  const t = useTranslations('auth.signIn');
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
    <form action={formAction}>
      <Form
        header={<Header variant="h1">{t('title')}</Header>}
        errorText={error?.message}
        actions={
          <Button variant="primary" loading={pending || Boolean(state?.ok)} iconSvg={svg('signIn')}>
            {t('submit')}
          </Button>
        }
      >
        <Container>
          <SpaceBetween size="m">
            <FormField label={t('email')} errorText={error?.fieldErrors?.email}>
              <Input
                ref={emailRef}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                spellcheck={false}
                autoFocus
                value={email}
                onChange={({ detail }) => setEmail(detail.value)}
              />
            </FormField>
            <FormField label={t('password')} errorText={error?.fieldErrors?.password}>
              <Input
                ref={passwordRef}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={({ detail }) => setPassword(detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Container>
        {notice && (
          <Box margin={{ top: 'm' }}>
            <Alert type="error">{t(`google.${notice}`)}</Alert>
          </Box>
        )}
        {google && (
          <Box margin={{ top: 'm' }}>
            <Button href="/api/auth/google" formAction="none" fullWidth>
              {t('google.button')}
            </Button>
          </Box>
        )}
        <Box margin={{ top: 'm' }}>
          <SpaceBetween direction="horizontal" size="l">
            <AppLink href="/forgot-password">{t('forgot')}</AppLink>
            <AppLink href="/signin/otp">{t('useCode')}</AppLink>
          </SpaceBetween>
        </Box>
      </Form>
    </form>
  );
}
