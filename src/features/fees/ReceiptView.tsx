'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useCrumb } from '@/components/Crumb';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { usePrintInLightMode } from '@/lib/usePrintInLightMode';
import type { CounterMethod, Receipt } from '@/server/modules/fees/schemas';

const COUNTER = '/fees/counter';
const NONE = '—';
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function ReceiptView({ receipt, created }: { receipt: Receipt; created: boolean }) {
  const t = useTranslations('fees.receipt');
  useCrumb(receipt.receiptNo);
  const tMethod = useTranslations('fees.counter.methods');
  const router = useRouter();
  const amount = formatMoney(receipt.amountMinor);

  usePrintInLightMode();

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={receipt.schoolName}
          actions={
            <div className="vw-no-print">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                href={COUNTER}
                onFollow={(event) => {
                  event.preventDefault();
                  router.push(COUNTER);
                }}
              >
                {t('another')}
              </Button>
              <Button
                href={`/api/v1/payments/${receipt.id}/receipt`}
                target="_blank"
                iconSvg={svg('download')}
                ariaLabel={t('pdfLabel', { receiptNo: receipt.receiptNo })}
              >
                {t('pdfButton')}
              </Button>
              <Button
                variant="primary"
                iconSvg={svg('print')}
                ariaLabel={t('printLabel', { receiptNo: receipt.receiptNo })}
                onClick={() => window.print()}
              >
                {t('print')}
              </Button>
            </SpaceBetween>
            </div>
          }
        >
          {t('title', { receiptNo: receipt.receiptNo })}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {created && (
          <div className="vw-no-print">
            <Alert type="success">{t('created', { receiptNo: receipt.receiptNo, amount })}</Alert>
          </div>
        )}
        <Container>
          <KeyValuePairs
            columns={3}
            items={[
              { label: t('receiptNo'), value: receipt.receiptNo },
              { label: t('date'), value: dateTime.format(new Date(receipt.collectedAt)) },
              { label: t('amount'), value: amount },
              { label: t('student'), value: receipt.studentName },
              { label: t('admissionNo'), value: receipt.admissionNo },
              { label: t('class'), value: receipt.classSection ?? NONE },
              { label: t('method'), value: tMethod.has(receipt.method) ? tMethod(receipt.method as CounterMethod) : receipt.method },
              { label: t('reference'), value: receipt.reference ?? NONE },
              { label: t('bankName'), value: receipt.bankName ?? NONE },
              { label: t('collectedBy'), value: receipt.collectedBy },
              { label: t('note'), value: receipt.note ?? NONE },
            ]}
          />
        </Container>
        <Table
          variant="container"
          trackBy="invoiceNo"
          items={receipt.allocations}
          header={<Header variant="h2">{t('allocations')}</Header>}
          columnDefinitions={[
            { id: 'invoiceNo', header: t('columns.invoiceNo'), cell: (line) => line.invoiceNo, isRowHeader: true },
            { id: 'installment', header: t('columns.installment'), cell: (line) => line.installment },
            { id: 'amount', header: t('columns.amount'), cell: (line) => formatMoney(line.amountMinor) },
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
