'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { useTranslations } from 'next-intl';
import { svg } from '@/components/icons';

export default function ErrorState({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations('states.error');
  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      <Alert
        type="error"
        header={t('header')}
        action={
          <Button iconSvg={svg('refresh')} onClick={retry}>
            {t('retry')}
          </Button>
        }
      >
        {t('body')}
        {error.digest && <Box variant="small">{t('reference', { id: error.digest })}</Box>}
      </Alert>
    </ContentLayout>
  );
}
