'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { svg } from '@/components/icons';
import { sendDuesReminders } from '@/server/modules/fees/actions';

export function DuesReminders() {
  const t = useTranslations('fees.dues.reminders');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function send() {
    setBusy(true);
    const response = await sendDuesReminders();
    setBusy(false);
    setResult(
      response.ok
        ? { type: 'success', text: t('sent', response.data) }
        : { type: 'error', text: response.error.message },
    );
  }

  const close = () => {
    setOpen(false);
    setResult(null);
  };

  return (
    <>
      <Button iconSvg={svg('sms')} onClick={() => setOpen(true)}>
        {t('action')}
      </Button>
      <Modal
        visible={open}
        header={t('title')}
        closeAriaLabel={t('close')}
        onDismiss={close}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={close}>
                {t('close')}
              </Button>
              {!result && (
                <Button variant="primary" loading={busy} onClick={() => void send()}>
                  {t('confirm')}
                </Button>
              )}
            </SpaceBetween>
          </Box>
        }
      >
        {result ? <Alert type={result.type}>{result.text}</Alert> : t('body')}
      </Modal>
    </>
  );
}
