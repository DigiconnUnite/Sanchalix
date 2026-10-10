'use client';

import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import type { CollectionReport as Report } from '@/server/modules/fees/reports';

const date = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function CollectionReport({ report }: { report: Report }) {
  const t = useTranslations('fees.reports');
  const tMethod = useTranslations('fees.counter.methods');
  const router = useRouter();
  const pathname = usePathname();
  const open = (from: string, to: string) => router.replace(`${pathname}?from=${from}&to=${to}`);
  const picker = (field: 'from' | 'to') => (
    <FormField label={t(field)}>
      <DatePicker
        value={report[field]}
        placeholder="YYYY/MM/DD"
        isDateEnabled={(candidate) => candidate <= new Date()}
        onChange={({ detail }) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(detail.value)) return;
          open(field === 'from' ? detail.value : report.from, field === 'to' ? detail.value : report.to);
        }}
      />
    </FormField>
  );
  const empty = <EmptyState icon="financeReports" heading={t('empty.heading')} body={t('empty.body')} />;
  const total = (label: string, value: string, note?: string) => (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="awsui-value-large">{value}</Box>
      {note && <Box color="text-body-secondary">{note}</Box>}
    </div>
  );

  return (
    <ContentLayout>
      <SpaceBetween size="l">
        <Container>
          <SpaceBetween size="l">
            <SpaceBetween direction="horizontal" size="l">
              {picker('from')}
              {picker('to')}
            </SpaceBetween>
            <ColumnLayout columns={3} variant="text-grid">
              {total(t('collected'), formatMoney(report.totalMinor), t('range', { from: day(report.from), to: day(report.to) }))}
              {total(t('receipts'), String(report.receipts))}
              {total(t('outstanding'), formatMoney(report.outstandingMinor), t('outstandingNote'))}
            </ColumnLayout>
          </SpaceBetween>
        </Container>
        <Table
          variant="container"
          trackBy="method"
          items={report.byMethod}
          header={<Header variant="h2">{t('byMethod')}</Header>}
          empty={empty}
          columnDefinitions={[
            {
              id: 'method',
              header: t('method'),
              isRowHeader: true,
              cell: (row) => (tMethod.has(row.method) ? tMethod(row.method as 'cash') : row.method),
            },
            { id: 'receipts', header: t('receipts'), cell: (row) => row.receipts },
            { id: 'amount', header: t('amount'), cell: (row) => formatMoney(row.amountMinor) },
          ]}
        />
        <Table
          variant="container"
          trackBy="date"
          items={report.byDay}
          header={<Header variant="h2">{t('byDay')}</Header>}
          empty={empty}
          columnDefinitions={[
            { id: 'date', header: t('date'), isRowHeader: true, cell: (row) => day(row.date) },
            { id: 'receipts', header: t('receipts'), cell: (row) => row.receipts },
            { id: 'amount', header: t('amount'), cell: (row) => formatMoney(row.amountMinor) },
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
