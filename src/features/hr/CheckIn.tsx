'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCrumb } from '@/components/Crumb';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { checkIn } from '@/server/modules/hr/actions';

const time = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' });

/** What a staff member sees after scanning the code at the entrance. */
export function CheckIn({ token }: { token: string | null }) {
  const t = useTranslations('hr.checkIn');
  const router = useRouter();
  useCrumb(t('title'));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ at: string; already: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!token) return;
    setBusy(true);
    setError(null);
    const result = await checkIn({ token });
    setBusy(false);
    if (result.ok) setDone({ at: result.data.at, already: result.data.already });
    else setError(result.error.message);
  }

  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      <Container>
        <SpaceBetween size="l">
          {!token && <Alert type="warning">{t('noCode')}</Alert>}
          {error && <Alert type="error">{error}</Alert>}
          {done ? (
            <Alert type="success" header={t(done.already ? 'alreadyTitle' : 'doneTitle')}>
              {t('doneBody', { time: time.format(new Date(done.at)) })}
            </Alert>
          ) : (
            <Box>{t('body')}</Box>
          )}
          {done ? (
            <Button
              href="/"
              onFollow={(event) => {
                event.preventDefault();
                router.push('/');
              }}
            >
              {t('home')}
            </Button>
          ) : (
            <Button variant="primary" iconSvg={svg('attendance')} loading={busy} disabled={!token} onClick={() => void run()}>
              {t('button')}
            </Button>
          )}
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
