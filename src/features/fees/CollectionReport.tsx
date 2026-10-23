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
import type { BillingReport, CollectionReport as Report } from '@/server/modules/fees/reports';

const date = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function CollectionReport({ report, billing }: { report: Report; billing: BillingReport | null }) {
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
        {billing && (
          <>
            <Container
              header={
                <Header variant="h2" description={t('billing.description', { year: billing.year })}>
                  {t('billing.title')}
                </Header>
              }
            >
              <ColumnLayout columns={4} variant="text-grid">
                {total(t('billing.billed'), formatMoney(billing.billedMinor), t('billing.billedNote'))}
                {total(t('billing.concessions'), formatMoney(billing.concessionsMinor))}
                {total(t('billing.lateFees'), formatMoney(billing.lateFeesMinor))}
                {total(t('billing.carried'), formatMoney(billing.carriedForwardMinor), t('billing.carriedNote'))}
              </ColumnLayout>
            </Container>
            <ColumnLayout columns={2}>
              <Table
                variant="container"
                trackBy="name"
                items={billing.byHead}
                header={<Header variant="h3">{t('billing.byHead')}</Header>}
                empty={<EmptyState icon="financeReports" heading={t('billing.empty.heading')} body={t('billing.empty.body')} />}
                columnDefinitions={[
                  { id: 'name', header: t('billing.feeHead'), isRowHeader: true, cell: (row) => row.name },
                  { id: 'amount', header: t('amount'), cell: (row) => formatMoney(row.billedMinor) },
                ]}
              />
              <Table
                variant="container"
                trackBy="name"
                items={billing.concessions}
                header={<Header variant="h3">{t('billing.byConcession')}</Header>}
                empty={<EmptyState icon="concession" heading={t('billing.noConcessions.heading')} body={t('billing.noConcessions.body')} />}
                columnDefinitions={[
                  { id: 'name', header: t('billing.discount'), isRowHeader: true, cell: (row) => row.name },
                  { id: 'students', header: t('billing.students'), cell: (row) => row.students },
                  { id: 'amount', header: t('amount'), cell: (row) => formatMoney(row.amountMinor) },
                ]}
              />
            </ColumnLayout>
            <Table
              variant="container"
              trackBy="name"
              items={billing.outstandingByClass}
              header={<Header variant="h3">{t('billing.byClass')}</Header>}
              empty={<EmptyState icon="success" heading={t('billing.noDues.heading')} body={t('billing.noDues.body')} />}
              columnDefinitions={[
                { id: 'name', header: t('billing.class'), isRowHeader: true, cell: (row) => row.name },
                { id: 'students', header: t('billing.students'), cell: (row) => row.students },
                { id: 'amount', header: t('outstanding'), cell: (row) => formatMoney(row.dueMinor) },
              ]}
            />
          </>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
