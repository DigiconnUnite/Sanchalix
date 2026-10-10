'use client';

import Cards from '@cloudscape-design/components/cards';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { ExportButton } from '@/components/ExportButton';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { useIsMobile } from '@/lib/useIsMobile';
import type { CounterMethod, PaymentRow } from '@/server/modules/fees/schemas';

const PAGE_SIZES = [10, 25, 50, 100];
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

type Data = { rows: PaymentRow[]; page: number; nextCursor: string | null; prevCursor: string | null };

export function PaymentsTable({ pageSize, data }: { pageSize: number; data: Data | null }) {
  const t = useTranslations('fees.payments');
  const tMethod = useTranslations('fees.counter.methods');
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
  const receiptLink = (payment: PaymentRow) => (
    <AppLink href={`/fees/payments/${payment.id}`}>{payment.receiptNo}</AppLink>
  );

  const fields: { id: string; header: string; content: (payment: PaymentRow) => ReactNode }[] = [
    { id: 'receiptNo', header: t('columns.receiptNo'), content: receiptLink },
    { id: 'date', header: t('columns.date'), content: (payment) => dateTime.format(new Date(payment.collectedAt)) },
    { id: 'student', header: t('columns.student'), content: (payment) => payment.studentName },
    { id: 'admissionNo', header: t('columns.admissionNo'), content: (payment) => payment.admissionNo },
    {
      id: 'method',
      header: t('columns.method'),
      content: (payment) => (tMethod.has(payment.method) ? tMethod(payment.method as CounterMethod) : payment.method),
    },
    { id: 'amount', header: t('columns.amount'), content: (payment) => formatMoney(payment.amountMinor) },
  ];

  const shared = {
    trackBy: 'id',
    items: rows,
    loading: !data,
    loadingText: t('loading'),
    stickyHeader: true,
    header: (
      <Header variant="h2" actions={<ExportButton kind="payments" />}>
        {t('title')}
      </Header>
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
    empty: <EmptyState icon="receipt" heading={t('empty.heading')} body={t('empty.body')} />,
  };

  if (isMobile) {
    return <Cards {...shared} variant="container" cardDefinition={{ header: receiptLink, sections: fields.slice(1) }} />;
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
        isRowHeader: id === 'receiptNo',
      }))}
    />
  );
}
