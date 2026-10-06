'use client';

import BarChart from '@cloudscape-design/components/bar-chart';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import LineChart from '@cloudscape-design/components/line-chart';
import PieChart from '@cloudscape-design/components/pie-chart';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import type { IconKey } from '@/components/icons';
import { formatMoney } from '@/lib/money';
import type { AGEING_BANDS } from '@/server/modules/dashboard/queries';

const HEIGHT = 220;
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const day = (value: string) => shortDate.format(new Date(`${value}T00:00:00Z`));
const compact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const compactMoney = (minor: number) => compact.format(minor / 100);
const percent = (value: number) => `${value}%`;

type Row = { label: string; value: string; href?: string };

function ChartCard({
  title,
  description,
  link,
  icon,
  emptyBody,
  columns,
  rows,
  children,
}: {
  title: string;
  description: string;
  link: { href: string; text: string };
  icon: IconKey;
  emptyBody: string;
  columns: [string, string];
  rows: Row[];
  children: ReactNode;
}) {
  const t = useTranslations('dashboard.charts');
  const [asTable, setAsTable] = useState(false);
  return (
    <Container
      fitHeight
      header={
        <Header
          variant="h2"
          description={description}
          actions={
            <SpaceBetween direction="horizontal" size="m" alignItems="center">
              {rows.length > 0 && (
                <Button variant="inline-link" onClick={() => setAsTable(!asTable)}>
                  {t(asTable ? 'viewChart' : 'viewTable')}
                </Button>
              )}
              <AppLink href={link.href}>{link.text}</AppLink>
            </SpaceBetween>
          }
        >
          {title}
        </Header>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={icon} heading={t('emptyHeading')} body={emptyBody} />
      ) : asTable ? (
        <Table
          variant="embedded"
          trackBy="label"
          ariaLabels={{ tableLabel: title }}
          items={rows}
          columnDefinitions={[
            {
              id: 'label',
              header: columns[0],
              isRowHeader: true,
              cell: (row) => (row.href ? <AppLink href={row.href}>{row.label}</AppLink> : row.label),
            },
            { id: 'value', header: columns[1], cell: (row) => row.value },
          ]}
        />
      ) : (
        children
      )}
    </Container>
  );
}

export function AttendanceTrendChart({ days }: { days: { date: string; percent: number }[] }) {
  const t = useTranslations('dashboard.charts.attendance');
  return (
    <ChartCard
      title={t('title')}
      description={t('description')}
      link={{ href: '/attendance/register', text: t('link') }}
      icon="attendance"
      emptyBody={t('empty')}
      columns={[t('date'), t('percent')]}
      rows={days.map((entry) => ({ label: day(entry.date), value: percent(entry.percent) }))}
    >
      <LineChart
        series={[
          {
            title: t('percent'),
            type: 'line',
            data: days.map((entry) => ({ x: entry.date, y: entry.percent })),
            valueFormatter: percent,
          },
        ]}
        xScaleType="categorical"
        xDomain={days.map((entry) => entry.date)}
        yDomain={[0, 100]}
        i18nStrings={{ xTickFormatter: day, yTickFormatter: percent }}
        ariaLabel={t('title')}
        ariaDescription={t('description')}
        height={HEIGHT}
        hideFilter
        hideLegend
      />
    </ChartCard>
  );
}

export function CollectionChart({ days }: { days: { date: string; amountMinor: number }[] }) {
  const t = useTranslations('dashboard.charts.collection');
  const collected = days.some((entry) => entry.amountMinor > 0);
  return (
    <ChartCard
      title={t('title')}
      description={t('description')}
      link={{ href: '/fees/reports', text: t('link') }}
      icon="financeReports"
      emptyBody={t('empty')}
      columns={[t('date'), t('amount')]}
      rows={collected ? days.map((entry) => ({ label: day(entry.date), value: formatMoney(entry.amountMinor) })) : []}
    >
      <BarChart
        series={[
          {
            title: t('amount'),
            type: 'bar',
            data: days.map((entry) => ({ x: entry.date, y: entry.amountMinor })),
            valueFormatter: (value) => formatMoney(value),
          },
        ]}
        xScaleType="categorical"
        xDomain={days.map((entry) => entry.date)}
        i18nStrings={{ xTickFormatter: day, yTickFormatter: compactMoney }}
        ariaLabel={t('title')}
        ariaDescription={t('description')}
        height={HEIGHT}
        hideFilter
        hideLegend
      />
    </ChartCard>
  );
}

export function MethodChart({ methods }: { methods: { method: string; amountMinor: number; receipts: number }[] }) {
  const t = useTranslations('dashboard.charts.methods');
  const tMethod = useTranslations('fees.counter.methods');
  const data = methods.map((entry) => ({
    title: tMethod.has(entry.method) ? tMethod(entry.method as 'cash') : entry.method,
    value: entry.amountMinor,
    receipts: entry.receipts,
  }));
  return (
    <ChartCard
      title={t('title')}
      description={t('description')}
      link={{ href: '/fees/reports', text: t('link') }}
      icon="financeReports"
      emptyBody={t('empty')}
      columns={[t('method'), t('amount')]}
      rows={data.map((entry) => ({ label: entry.title, value: formatMoney(entry.value) }))}
    >
      <PieChart
        variant="donut"
        size="medium"
        data={data}
        innerMetricValue={compactMoney(data.reduce((sum, entry) => sum + entry.value, 0))}
        innerMetricDescription={t('total')}
        segmentDescription={(entry, sum) => percent(Math.round((entry.value / sum) * 100))}
        detailPopoverContent={(entry) => [
          { key: t('amount'), value: formatMoney(entry.value) },
          { key: t('receipts'), value: entry.receipts },
        ]}
        ariaLabel={t('title')}
        ariaDescription={t('description')}
        hideFilter
      />
    </ChartCard>
  );
}

export function AgeingChart({
  bands,
}: {
  bands: { band: (typeof AGEING_BANDS)[number]; amountMinor: number; invoices: number }[];
}) {
  const t = useTranslations('dashboard.charts.ageing');
  const tBand = useTranslations('fees.dues.bands');
  const overdue = bands.some((entry) => entry.invoices > 0);
  return (
    <ChartCard
      title={t('title')}
      description={t('description')}
      link={{ href: '/fees/dues', text: t('link') }}
      icon="dues"
      emptyBody={t('empty')}
      columns={[t('band'), t('amount')]}
      rows={
        overdue
          ? bands.map((entry) => ({
              label: tBand(entry.band),
              value: t('value', { amount: formatMoney(entry.amountMinor), count: entry.invoices }),
              href: `/fees/dues?ageing=${encodeURIComponent(entry.band)}`,
            }))
          : []
      }
    >
      <BarChart
        series={[
          {
            title: t('amount'),
            type: 'bar',
            data: bands.map((entry) => ({ x: tBand(entry.band), y: entry.amountMinor })),
            valueFormatter: (value) => formatMoney(value),
          },
        ]}
        xScaleType="categorical"
        xDomain={bands.map((entry) => tBand(entry.band))}
        i18nStrings={{ yTickFormatter: compactMoney }}
        ariaLabel={t('title')}
        ariaDescription={t('description')}
        height={HEIGHT}
        hideFilter
        hideLegend
      />
    </ChartCard>
  );
}
