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
import Toggle from '@cloudscape-design/components/toggle';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { applyDensity, Density as CloudscapeDensity } from '@cloudscape-design/global-styles';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DENSITIES, type Density } from '@/lib/visualMode';
import { useRouter } from '@/i18n/navigation';
import { changePassword, setAnnouncementCopy, setDensity, setFeeTexts, signOutOtherSessions, signOutSession } from '@/server/auth/actions';

const BLANK = { current: '', next: '', confirm: '' };
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
type SessionRow = { id: string; device: string | null; ip: string | null; signedInAt: string; current: boolean };
type Notice = { type: 'success' | 'error'; text: string };

export function ProfileView({
  name,
  roleLabel,
  email,
  density: initialDensity,
  sessions,
  feeTexts: initialFeeTexts,
  announcementCopy,
}: {
  name: string;
  roleLabel: string;
  email: string | null;
  density: Density;
  sessions: SessionRow[];
  /** A parent's fee text setting. Null for everyone who isn't a parent. */
  feeTexts: boolean | null;
  announcementCopy: { channel: 'email' | 'sms'; reachable: boolean; enabled: boolean }[];
}) {
  const t = useTranslations('auth.profile');
  const [density, setChosenDensity] = useState(initialDensity);
  const [values, setValues] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [changed, setChanged] = useState(false);
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [feeTexts, setFeeTextsChoice] = useState(initialFeeTexts);
  const [copy, setCopy] = useState(announcementCopy);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function signOutOne(row: SessionRow) {
    const result = await signOutSession(row.id);
    setNotice(
      result.ok ? { type: 'success', text: t('sessions.signedOutOne') } : { type: 'error', text: result.error.message },
    );
    router.refresh();
  }

  async function signOutOthers() {
    setSigningOut(true);
    const result = await signOutOtherSessions();
    setSigningOut(false);
    setNotice(
      result.ok
        ? { type: 'success', text: t('sessions.signedOut', { count: result.data.count }) }
        : { type: 'error', text: result.error.message },
    );
    router.refresh();
  }

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
        <Container header={<Header variant="h2" description={t('copy.description')}>{t('copy.title')}</Header>}>
          <SpaceBetween size="m">
            {copy.map((item) => (
              <Toggle
                key={item.channel}
                checked={item.enabled && item.reachable}
                disabled={!item.reachable}
                description={item.reachable ? t(`copy.${item.channel}Hint`) : t(`copy.${item.channel}Missing`)}
                onChange={({ detail }) => {
                  setCopy(copy.map((entry) => (entry.channel === item.channel ? { ...entry, enabled: detail.checked } : entry)));
                  void setAnnouncementCopy({ channel: item.channel, enabled: detail.checked });
                }}
              >
                {t(`copy.${item.channel}`)}
              </Toggle>
            ))}
          </SpaceBetween>
        </Container>
        {feeTexts !== null && (
          <Container header={<Header variant="h2" description={t('texts.description')}>{t('texts.title')}</Header>}>
            <SpaceBetween size="m">
              <Toggle
                checked={feeTexts}
                description={t('texts.feeHint')}
                onChange={({ detail }) => {
                  setFeeTextsChoice(detail.checked);
                  void setFeeTexts({ enabled: detail.checked });
                }}
              >
                {t('texts.fee')}
              </Toggle>
              <Toggle checked disabled description={t('texts.alwaysHint')}>
                {t('texts.always')}
              </Toggle>
            </SpaceBetween>
          </Container>
        )}
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
        <Table
          variant="container"
          trackBy="id"
          items={sessions}
          header={
            <SpaceBetween size="m">
              <Header
                variant="h2"
                counter={`(${sessions.length})`}
                description={t('sessions.description')}
                actions={
                  <Button loading={signingOut} disabled={sessions.length < 2} onClick={() => void signOutOthers()}>
                    {t('sessions.signOutOthers')}
                  </Button>
                }
              >
                {t('sessions.title')}
              </Header>
              {notice && (
                <Alert
                  type={notice.type}
                  dismissible
                  dismissAriaLabel={t('sessions.dismiss')}
                  onDismiss={() => setNotice(null)}
                >
                  {notice.text}
                </Alert>
              )}
            </SpaceBetween>
          }
          columnDefinitions={[
            {
              id: 'device',
              header: t('sessions.device'),
              isRowHeader: true,
              cell: (row) => (
                <SpaceBetween direction="horizontal" size="xs">
                  <span>{row.device ?? t('sessions.unknown')}</span>
                  {row.current && <StatusIndicator type="success">{t('sessions.current')}</StatusIndicator>}
                </SpaceBetween>
              ),
            },
            { id: 'ip', header: t('sessions.ip'), cell: (row) => row.ip ?? '—' },
            { id: 'signedIn', header: t('sessions.signedIn'), cell: (row) => dateTime.format(new Date(row.signedInAt)) },
            {
              id: 'actions',
              header: t('sessions.actions'),
              cell: (row) =>
                !row.current && (
                  <Button
                    variant="inline-link"
                    ariaLabel={t('sessions.signOutLabel', { device: row.device ?? t('sessions.unknown') })}
                    onClick={() => void signOutOne(row)}
                  >
                    {t('sessions.signOut')}
                  </Button>
                ),
            },
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
