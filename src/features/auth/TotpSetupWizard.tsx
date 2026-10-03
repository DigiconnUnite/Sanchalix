'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Wizard from '@cloudscape-design/components/wizard';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { svg } from '@/components/icons';
import { completeTotpSetup, confirmTotp, signOut } from '@/server/auth/actions';

const CODES_STEP = 2;

export function TotpSetupWizard({ qrCode, secret }: { qrCode: string; secret: string }) {
  const t = useTranslations('auth.totp');
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
    }
    return result.ok ? result.data : null;
  }

  async function confirm() {
    const data = await run(() => confirmTotp(code));
    if (!data) return;
    setRecoveryCodes(data.recoveryCodes);
    setStep(CODES_STEP);
    setBusy(false);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([recoveryCodes.join('\n')], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vidyawan-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h1" description={t('setup.intro')}>
        {t('setup.title')}
      </Header>
      <Wizard
        activeStepIndex={step}
        isLoadingNextStep={busy}
        submitButtonText={t('setup.finish')}
        i18nStrings={{
          stepNumberLabel: (number) => t('setup.step', { number }),
          collapsedStepsLabel: (number, total) => t('setup.stepOf', { number, total }),
          navigationAriaLabel: t('setup.steps'),
          cancelButton: t('cancel'),
          previousButton: t('setup.previous'),
          nextButton: t('setup.next'),
        }}
        onCancel={() => void signOut()}
        onSubmit={() => void run(completeTotpSetup)}
        onNavigate={({ detail }) => {
          // Once the codes are shown 2FA is already on, so there is no step to go back to.
          if (step === CODES_STEP) return;
          if (detail.requestedStepIndex === CODES_STEP) void confirm();
          else setStep(detail.requestedStepIndex);
        }}
        steps={[
          {
            title: t('setup.scan.title'),
            description: t('setup.scan.description'),
            content: (
              <Container>
                <SpaceBetween size="m">
                  <Image src={qrCode} alt={t('setup.scan.qrAlt')} width={200} height={200} unoptimized />
                  <FormField label={t('setup.scan.manualKey')}>
                    <CopyToClipboard
                      variant="inline"
                      textToCopy={secret}
                      copyButtonAriaLabel={t('setup.scan.copyKey')}
                      copySuccessText={t('setup.scan.copied')}
                      copyErrorText={t('setup.scan.copyFailed')}
                    />
                  </FormField>
                </SpaceBetween>
              </Container>
            ),
          },
          {
            title: t('setup.enter.title'),
            description: t('setup.enter.description'),
            content: (
              <Container>
                <FormField label={t('code')} errorText={error}>
                  <Input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    autoFocus
                    value={code}
                    onChange={({ detail }) => setCode(detail.value)}
                    onKeyDown={({ detail }) => {
                      if (detail.key === 'Enter') void confirm();
                    }}
                  />
                </FormField>
              </Container>
            ),
          },
          {
            title: t('setup.codes.title'),
            content: (
              <Container>
                <SpaceBetween size="m">
                  <Alert type="warning">{t('setup.codes.warning')}</Alert>
                  {error && <Alert type="error">{error}</Alert>}
                  <ColumnLayout columns={2}>
                    {recoveryCodes.map((recoveryCode) => (
                      <Box key={recoveryCode} variant="code">
                        {recoveryCode}
                      </Box>
                    ))}
                  </ColumnLayout>
                  <SpaceBetween direction="horizontal" size="xs">
                    <CopyToClipboard
                      textToCopy={recoveryCodes.join('\n')}
                      copyButtonText={t('setup.codes.copy')}
                      copySuccessText={t('setup.codes.copied')}
                      copyErrorText={t('setup.codes.copyFailed')}
                    />
                    <Button iconSvg={svg('download')} onClick={download}>
                      {t('setup.codes.download')}
                    </Button>
                  </SpaceBetween>
                </SpaceBetween>
              </Container>
            ),
          },
        ]}
      />
    </SpaceBetween>
  );
}
