'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useCrumb } from '@/components/Crumb';
import { svg } from '@/components/icons';
import { usePrintInLightMode } from '@/lib/usePrintInLightMode';

const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'UTC' });

/** Today's QR code for the entrance, large enough to scan from a phone held at arm's length, and printable. */
export function CheckInCode({ image, day }: { image: string; day: string }) {
  const t = useTranslations('hr.checkIn.code');
  useCrumb(t('title'));
  usePrintInLightMode();

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={t('description')}
          actions={
            <div className="vw-no-print">
              <Button variant="primary" iconSvg={svg('print')} onClick={() => window.print()}>
                {t('print')}
              </Button>
            </div>
          }
        >
          {t('title')}
        </Header>
      }
    >
      <Container>
        <SpaceBetween size="m" alignItems="center">
          {/* The picture is the code itself, so its alternative text says what it is for. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={t('alt')} width={360} height={360} />
          <Box variant="h2">{t('scan')}</Box>
          <Box color="text-body-secondary">{date.format(new Date(`${day}T00:00:00Z`))}</Box>
          <Box color="text-body-secondary" fontSize="body-s">
            {t('daily')}
          </Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
