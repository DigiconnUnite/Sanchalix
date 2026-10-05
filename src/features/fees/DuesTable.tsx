'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { useIsMobile } from '@/lib/useIsMobile';
import type { Ageing, DueRow } from '@/server/modules/fees/schemas';

const AGEING: Ageing[] = ['all', '1-15', '16-30', '31-60', '60+'];
const PAGE_SIZES = [10, 25, 50, 100];
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

type Data = {
  rows: DueRow[];
  page: number;
  nextCursor: string | null;
  prevCursor: string | null;
  outstandingMinor: number;
  count: number;
};

export function DuesTable({
  ageing,
  pageSize,
  canCollect,
  data,
}: {
  ageing: Ageing;
  pageSize: number;
  canCollect: boolean;
  data: Data | null;
}) {
  const t = useTranslations('fees.dues');
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
  const studentCell = (due: DueRow) =>
    canCollect ? <AppLink href={`/fees/counter?student=${due.studentId}`}>{due.studentName}</AppLink> : due.studentName;

  const fields: { id: string; header: string; content: (due: DueRow) => ReactNode }[] = [
    { id: 'student', header: t('columns.student'), content: studentCell },
    { id: 'admissionNo', header: t('columns.admissionNo'), content: (due) => due.admissionNo },
    { id: 'invoiceNo', header: t('columns.invoiceNo'), content: (due) => due.invoiceNo },
    { id: 'installment', header: t('columns.installment'), content: (due) => due.installment },
    {
      id: 'dueDate',
      header: t('columns.dueDate'),
      content: (due) => dateFormat.format(new Date(`${due.dueDate}T00:00:00Z`)),
    },
    { id: 'overdue', header: t('columns.overdue'), content: (due) => t('days', { count: due.daysOverdue }) },
    { id: 'balance', header: t('columns.balance'), content: (due) => formatMoney(due.balanceMinor) },
  ];

  const shared = {
    trackBy: 'id',
    items: rows,
    loading: !data,
    loadingText: t('loading'),
    stickyHeader: true,
    header: (
      <SpaceBetween size="m">
        <Header
          variant="h1"
          counter={data ? `(${data.count})` : ''}
          description={canCollect && t('hint')}
        >
          {t('title')}
        </Header>
        {data && (
          <Box variant="awsui-key-label">
            {t('outstanding')}
            <Box variant="awsui-value-large">{formatMoney(data.outstandingMinor)}</Box>
          </Box>
        )}
      </SpaceBetween>
    ),
    filter: (
      <SegmentedControl
        label={t('ageing')}
        selectedId={ageing}
        options={AGEING.map((id) => ({ id, text: t(`bands.${id}`) }))}
        onChange={({ detail }) =>
          setParams({ ageing: detail.selectedId === 'all' ? null : detail.selectedId, cursor: null })
        }
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
    empty:
      ageing === 'all' ? (
        <EmptyState icon="success" heading={t('empty.heading')} body={t('empty.body')} />
      ) : (
        <EmptyState
          icon="dues"
          heading={t('noMatches.heading')}
          body={t('noMatches.body')}
          action={<Button onClick={() => setParams({ ageing: null, cursor: null })}>{t('noMatches.clear')}</Button>}
        />
      ),
  };

  if (isMobile) {
    return <Cards {...shared} variant="container" cardDefinition={{ header: studentCell, sections: fields.slice(1) }} />;
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
        isRowHeader: id === 'student',
      }))}
    />
  );
}
