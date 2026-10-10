'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Box from '@cloudscape-design/components/box';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/appError';
import { AuthCard } from './AuthCard';
import { requestOtpCode, requestPasswordReset, resetPassword, signInWithOtp } from '@/server/auth/actions';

type Failure = { message: string; fieldErrors?: Record<string, string> };

function AuthForm({
  title,
  description,
  submit,
  run,
  footer,
  children,
}: {
  title: string;
  description?: string;
  submit: string;
  run: () => Promise<ActionResult<unknown>>;
  footer?: ReactNode;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const result = await run();
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <AuthCard title={title} {...(description && { description })}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <SpaceBetween size="l">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          {children(error?.fieldErrors ?? {})}
          <Button variant="primary" fullWidth loading={busy}>
            {submit}
          </Button>
          {footer && <Box textAlign="center">{footer}</Box>}
        </SpaceBetween>
      </form>
    </AuthCard>
  );
}

const backToSignIn = (label: string) => <AppLink href="/signin">{label}</AppLink>;

export function ForgotPasswordForm() {
  const t = useTranslations('auth.reset');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <AuthCard title={t('forgotTitle')}>
        <SpaceBetween size="l">
          <Alert type="success" header={t('sentTitle')}>
            {t('sentBody', { email })}
          </Alert>
          <Box textAlign="center">{backToSignIn(t('back'))}</Box>
        </SpaceBetween>
      </AuthCard>
    );
  }
  return (
    <AuthForm
      title={t('forgotTitle')}
      description={t('forgotBody')}
      submit={t('send')}
      footer={backToSignIn(t('back'))}
      run={async () => {
        const result = await requestPasswordReset({ email });
        if (result.ok) setSent(true);
        return result;
      }}
    >
      {(errors) => (
        <FormField label={t('email')} errorText={errors.email}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={({ detail }) => setEmail(detail.value)}
          />
        </FormField>
      )}
    </AuthForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth.reset');
  const tPassword = useTranslations('auth.profile.password');
  const [values, setValues] = useState({ next: '', confirm: '' });
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthCard title={t('resetTitle')}>
        <SpaceBetween size="l">
          <Alert type="success" header={t('doneTitle')}>
            {t('doneBody')}
          </Alert>
          <Box textAlign="center">{backToSignIn(t('signIn'))}</Box>
        </SpaceBetween>
      </AuthCard>
    );
  }
  const field = (name: 'next' | 'confirm', errors: Record<string, string>, hint?: string) => (
    <FormField label={tPassword(name)} errorText={errors[name]} constraintText={hint}>
      <Input
        type="password"
        autoComplete="new-password"
        value={values[name]}
        onChange={({ detail }) => setValues({ ...values, [name]: detail.value })}
      />
    </FormField>
  );
  return (
    <AuthForm
      title={t('resetTitle')}
      submit={t('save')}
      footer={backToSignIn(t('back'))}
      run={async () => {
        const result = await resetPassword({ token, ...values });
        if (result.ok) setDone(true);
        return result;
      }}
    >
      {(errors) => (
        <>
          {errors.token && <Alert type="error">{errors.token}</Alert>}
          {field('next', errors, tPassword('hint'))}
          {field('confirm', errors)}
        </>
      )}
    </AuthForm>
  );
}

export function OtpSignInForm({ next }: { next: string }) {
  const t = useTranslations('auth.otp');
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!sentTo) {
    return (
      <AuthForm
        title={t('title')}
        description={t('body')}
        submit={t('send')}
        footer={backToSignIn(t('usePassword'))}
        run={async () => {
          const result = await requestOtpCode({ phone });
          if (result.ok) setSentTo(phone);
          return result;
        }}
      >
        {(errors) => (
          <FormField label={t('phone')} constraintText={t('phoneHint')} errorText={errors.phone}>
            <Input
              type="text"
              inputMode="tel"
              autoComplete="tel-national"
              autoFocus
              value={phone}
              onChange={({ detail }) => setPhone(detail.value)}
            />
          </FormField>
        )}
      </AuthForm>
    );
  }
  return (
    <AuthForm
      title={t('codeTitle')}
      description={t('codeBody', { phone: sentTo })}
      submit={t('verify')}
      footer={
        <Button
          variant="inline-link"
          onClick={() => {
            setCode('');
            setSentTo(null);
          }}
        >
          {t('change')}
        </Button>
      }
      run={async () => {
        const result = await signInWithOtp({ phone: sentTo, code });
        if (result.ok) router.replace(next);
        return result;
      }}
    >
      {(errors) => (
        <FormField label={t('code')} errorText={errors.code}>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={({ detail }) => setCode(detail.value)}
          />
        </FormField>
      )}
    </AuthForm>
  );
}
