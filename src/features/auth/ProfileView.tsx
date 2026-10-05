'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import RadioGroup from '@cloudscape-design/components/radio-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { applyDensity, Density as CloudscapeDensity } from '@cloudscape-design/global-styles';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DENSITIES, type Density } from '@/lib/visualMode';
import { changePassword, setDensity } from '@/server/auth/actions';

const BLANK = { current: '', next: '', confirm: '' };

export function ProfileView({
  name,
  roleLabel,
  email,
  density: initialDensity,
}: {
  name: string;
  roleLabel: string;
  email: string | null;
  density: Density;
}) {
  const t = useTranslations('auth.profile');
  const [density, setChosenDensity] = useState(initialDensity);
  const [values, setValues] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [changed, setChanged] = useState(false);

  function chooseDensity(value: Density) {
    setChosenDensity(value);
    applyDensity(value === 'compact' ? CloudscapeDensity.Compact : CloudscapeDensity.Comfortable);
    void setDensity(value);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setChanged(false);
    const result = await changePassword(values);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setValues(BLANK);
    setChanged(true);
  }

  const password = (field: keyof typeof BLANK, autoComplete: 'current-password' | 'new-password', hint?: string) => (
    <FormField label={t(`password.${field}`)} errorText={error?.fieldErrors?.[field]} constraintText={hint}>
      <Input
        type="password"
        autoComplete={autoComplete}
        value={values[field]}
        onChange={({ detail }) => setValues({ ...values, [field]: detail.value })}
      />
    </FormField>
  );

  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">{t('account')}</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: t('name'), value: name },
              { label: t('role'), value: roleLabel },
              { label: t('email'), value: email ?? '—' },
            ]}
          />
        </Container>
        <Container header={<Header variant="h2">{t('display')}</Header>}>
          <FormField label={t('density.label')} description={t('density.description')}>
            <RadioGroup
              value={density}
              items={DENSITIES.map((value) => ({
                value,
                label: t(`density.${value}`),
                description: t(`density.${value}Hint`),
              }))}
              onChange={({ detail }) => chooseDensity(detail.value as Density)}
            />
          </FormField>
        </Container>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Form
            errorText={error && !error.fieldErrors ? error.message : null}
            actions={
              <Button variant="primary" loading={busy}>
                {t('password.submit')}
              </Button>
            }
          >
            <Container header={<Header variant="h2">{t('password.title')}</Header>}>
              <SpaceBetween size="l">
                {changed && <Alert type="success">{t('password.changed')}</Alert>}
                {password('current', 'current-password')}
                {password('next', 'new-password', t('password.hint'))}
                {password('confirm', 'new-password')}
              </SpaceBetween>
            </Container>
          </Form>
        </form>
      </SpaceBetween>
    </ContentLayout>
  );
}
