'use client';

import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import Select from '@cloudscape-design/components/select';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { useIsMobile } from '@/lib/useIsMobile';
import type { InvoiceRow, InvoiceStatus } from '@/server/modules/fees/schemas';

const STATUS_TYPE: Record<InvoiceStatus, StatusIndicatorProps.Type> = {
  draft: 'pending',
  issued: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'error',
  void: 'stopped',
};
const STATUSES = Object.keys(STATUS_TYPE) as InvoiceStatus[];
const PAGE_SIZES = [10, 25, 50, 100];
const ALL = 'all';
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

type Data = { rows: InvoiceRow[]; page: number; nextCursor: string | null; prevCursor: string | null };

export function InvoicesTable({
  status,
  pageSize,
  data,
}: {
  status: InvoiceStatus | null;
  pageSize: number;
  data: Data | null;
}) {
  const t = useTranslations('fees.invoices');
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params}`);
  };

  const rows = data?.rows ?? [];
  const page = data?.page ?? 1;
  const statusOptions = [
    { value: ALL, label: t('filter.all') },
    ...STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
  ];

  const fields: { id: string; header: string; content: (invoice: InvoiceRow) => ReactNode }[] = [
    { id: 'invoiceNo', header: t('columns.invoiceNo'), content: (invoice) => invoice.invoiceNo },
    { id: 'student', header: t('columns.student'), content: (invoice) => invoice.studentName },
    { id: 'admissionNo', header: t('columns.admissionNo'), content: (invoice) => invoice.admissionNo },
    { id: 'installment', header: t('columns.installment'), content: (invoice) => invoice.installment },
    {
      id: 'dueDate',
      header: t('columns.dueDate'),
      content: (invoice) => dateFormat.format(new Date(`${invoice.dueDate}T00:00:00Z`)),
    },
    { id: 'total', header: t('columns.total'), content: (invoice) => formatMoney(invoice.totalMinor) },
    { id: 'balance', header: t('columns.balance'), content: (invoice) => formatMoney(invoice.balanceMinor) },
    {
      id: 'status',
      header: t('columns.status'),
      content: (invoice) => (
        <StatusIndicator type={STATUS_TYPE[invoice.status]}>{t(`status.${invoice.status}`)}</StatusIndicator>
      ),
    },
  ];

  const shared = {
    trackBy: 'id',
    items: rows,
    loading: !data,
    loadingText: t('loading'),
    stickyHeader: true,
    header: <Header variant="h2">{t('title')}</Header>,
    filter: (
      <Select
        inlineLabelText={t('filter.status')}
        selectedOption={statusOptions.find((option) => option.value === (status ?? ALL)) ?? null}
        options={statusOptions}
        onChange={({ detail }) => {
          const value = detail.selectedOption.value;
          setParams({ status: !value || value === ALL ? null : value, cursor: null });
        }}
      />
    ),
    pagination: (
      <Pagination
        currentPageIndex={page}
        pagesCount={data?.nextCursor ? page + 1 : page}
        openEnd={Boolean(data?.nextCursor)}
        disabled={!data}
        onChange={({ detail }) => {
          if (!data) return;
          // Cursors only step one page at a time, so any earlier page other than the first steps back by one.
          const target = detail.currentPageIndex;
          setParams({ cursor: target === 1 ? null : target > page ? data.nextCursor : data.prevCursor });
        }}
      />
    ),
    preferences: (
      <CollectionPreferences
        preferences={{ pageSize }}
        pageSizePreference={{
          options: PAGE_SIZES.map((value) => ({ value, label: t('pageSize', { count: value }) })),
        }}
        onConfirm={({ detail }) => setParams({ pageSize: String(detail.pageSize ?? pageSize), cursor: null })}
      />
    ),
    empty: status ? (
      <EmptyState
        icon="invoice"
        heading={t('noMatches.heading')}
        body={t('noMatches.body')}
        action={<Button onClick={() => setParams({ status: null, cursor: null })}>{t('noMatches.clear')}</Button>}
      />
    ) : (
      <EmptyState icon="invoice" heading={t('empty.heading')} body={t('empty.body')} />
    ),
  };

  if (isMobile) {
    return (
      <Cards
        {...shared}
        variant="container"
        cardDefinition={{ header: (invoice) => invoice.invoiceNo, sections: fields.slice(1) }}
      />
    );
  }
  return (
    <Table
      {...shared}
      variant="container"
      resizableColumns
      enableKeyboardNavigation
      renderAriaLive={() => t('showing', { count: rows.length })}
      columnDefinitions={fields.map(({ id, header, content }) => ({
        id,
        header,
        cell: content,
        isRowHeader: id === 'invoiceNo',
      }))}
    />
  );
}
