'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCrumb } from '@/components/Crumb';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { createCheckout, payTestOrder } from '@/server/modules/fees/actions';
import type { OrderView } from '@/server/modules/fees/online';

const STATUS_TYPE: Record<OrderView['status'], StatusIndicatorProps.Type> = {
  created: 'pending',
  paid: 'success',
  failed: 'error',
  expired: 'stopped',
};

export function PayOnlineButton({ studentId, invoiceIds }: { studentId: string; invoiceIds: string[] }) {
  const t = useTranslations('fees.online');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await createCheckout({ studentId, invoiceIds });
    if (result.ok) return router.push(`/pay/${result.data.orderId}`);
    setBusy(false);
    setError(result.error.message);
  }

  return (
    <SpaceBetween direction="horizontal" size="xs" alignItems="center">
      {error && <StatusIndicator type="error">{error}</StatusIndicator>}
      <Button variant="primary" iconSvg={svg('onlinePayment')} loading={busy} onClick={() => void start()}>
        {t('payAll')}
      </Button>
    </SpaceBetween>
  );
}

export function OrderPage({ order }: { order: OrderView }) {
  const t = useTranslations('fees.online');
  const router = useRouter();
  const [busy, setBusy] = useState<'captured' | 'failed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = formatMoney(order.amountMinor);
  useCrumb(t('crumb'));

  async function pay(outcome: 'captured' | 'failed') {
    setBusy(outcome);
    setError(null);
    const result = await payTestOrder({ orderId: order.orderId, outcome });
    setBusy(null);
    if (!result.ok) setError(result.error.message);
    router.refresh();
  }

  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      <SpaceBetween size="l">
        {error && <Alert type="error">{error}</Alert>}
        {order.status === 'paid' && (
          <Alert type="success" header={t('paidTitle', { amount })}>
            {order.receiptNo ? t('paidBody', { receiptNo: order.receiptNo }) : t('paidPending')}
          </Alert>
        )}
        {order.status === 'failed' && <Alert type="error">{t('failedBody')}</Alert>}
        {order.status === 'expired' && <Alert type="warning">{t('expiredBody')}</Alert>}
        <Container header={<Header variant="h2">{t('summary')}</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              { label: t('student'), value: order.studentName },
              { label: t('for'), value: order.installments.join(', ') },
              { label: t('amount'), value: <Box variant="awsui-value-large">{amount}</Box> },
              {
                label: t('status'),
                value: <StatusIndicator type={STATUS_TYPE[order.status]}>{t(`statuses.${order.status}`)}</StatusIndicator>,
              },
            ]}
          />
        </Container>
        {order.status === 'created' && order.provider === 'dev' && (
          <Container header={<Header variant="h2">{t('test.title')}</Header>}>
            <SpaceBetween size="m">
              <Alert type="info">{t('test.body')}</Alert>
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="primary"
                  loading={busy === 'captured'}
                  disabled={busy === 'failed'}
                  onClick={() => void pay('captured')}
                >
                  {t('test.pay', { amount })}
                </Button>
                <Button loading={busy === 'failed'} disabled={busy === 'captured'} onClick={() => void pay('failed')}>
                  {t('test.fail')}
                </Button>
              </SpaceBetween>
            </SpaceBetween>
          </Container>
        )}
        <Button
          href="/"
          onFollow={(event) => {
            event.preventDefault();
            router.push('/');
          }}
        >
          {t('back')}
        </Button>
      </SpaceBetween>
    </ContentLayout>
  );
}
