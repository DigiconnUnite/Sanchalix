'use client';

import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { signOut, verifyTotp } from '@/server/auth/actions';

export function TotpChallengeForm() {
  const t = useTranslations('auth.totp');
  const [state, formAction, pending] = useActionState(verifyTotp, null);
  const [code, setCode] = useState('');
  const codeRef = useRef<InputProps.Ref>(null);
  const error = state && !state.ok ? state.error : null;

  useEffect(() => {
    if (error) codeRef.current?.focus();
  }, [error]);

  return (
    <form action={formAction}>
      <Form
        header={
          <Header variant="h1" description={t('challenge.description')}>
            {t('challenge.title')}
          </Header>
        }
        errorText={error?.message}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" onClick={() => void signOut()}>
              {t('cancel')}
            </Button>
            <Button variant="primary" loading={pending || Boolean(state?.ok)}>
              {t('challenge.submit')}
            </Button>
          </SpaceBetween>
        }
      >
        <Container>
          <FormField label={t('code')} constraintText={t('challenge.recoveryHint')}>
            <Input
              ref={codeRef}
              name="code"
              autoComplete="one-time-code"
              spellcheck={false}
              autoFocus
              value={code}
              onChange={({ detail }) => setCode(detail.value)}
            />
          </FormField>
        </Container>
      </Form>
    </form>
  );
}
