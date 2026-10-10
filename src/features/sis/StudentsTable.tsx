'use client';

import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { ExportButton } from '@/components/ExportButton';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatPhone } from '@/lib/phone';
import { useIsMobile } from '@/lib/useIsMobile';
import type { StudentRow, StudentStatus } from '@/server/modules/sis/schemas';
import { STATUS_TYPE } from './studentStatus';

const STATUSES = Object.keys(STATUS_TYPE) as StudentStatus[];
const PAGE_SIZES = [10, 25, 50, 100];
const COUNT_CAP = 10_000;
const NONE = '—';

type Data = {
  rows: StudentRow[];
  total: number;
  page: number;
  nextCursor: string | null;
  prevCursor: string | null;
};

export function StudentsTable({
  status,
  pageSize,
  canCreate,
  data,
}: {
  canCreate: boolean;
  status: StudentStatus;
  pageSize: number;
  data: Data | null;
}) {
  const t = useTranslations('sis.students');
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
  const numbers = new Intl.NumberFormat('en-IN');
  const counter = data
    ? `(${data.total > COUNT_CAP ? `${numbers.format(COUNT_CAP)}+` : numbers.format(data.total)})`
    : '';

  const fields: { id: string; header: string; content: (student: StudentRow) => ReactNode }[] = [
    {
      id: 'name',
      header: t('columns.name'),
      content: (s) => <AppLink href={`/students/${s.id}`}>{s.name}</AppLink>,
    },
    { id: 'admissionNo', header: t('columns.admissionNo'), content: (s) => s.admissionNo },
    { id: 'classSection', header: t('columns.classSection'), content: (s) => s.classSection ?? NONE },
    { id: 'rollNo', header: t('columns.rollNo'), content: (s) => s.rollNo ?? NONE },
    { id: 'guardian', header: t('columns.guardian'), content: (s) => s.guardianName ?? NONE },
    {
      id: 'phone',
      header: t('columns.phone'),
      content: (s) => (s.guardianPhone ? formatPhone(s.guardianPhone) : NONE),
    },
    {
      id: 'status',
      header: t('columns.status'),
      content: (s) => <StatusIndicator type={STATUS_TYPE[s.status]}>{t(`status.${s.status}`)}</StatusIndicator>,
    },
  ];

  const shared = {
    trackBy: 'id',
    stickyHeader: true,
    items: rows,
    loading: !data,
    loadingText: t('loading'),
    header: (
      <Header
        variant="h2"
        counter={counter}
        actions={
          canCreate && (
            <SpaceBetween direction="horizontal" size="xs">
              <ExportButton kind="students" />
              <Button
                href="/students/import"
                iconSvg={svg('import')}
                onFollow={(event) => {
                  event.preventDefault();
                  router.push('/students/import');
                }}
              >
                {t('import')}
              </Button>
              <Button
                variant="primary"
                href="/students/new"
                onFollow={(event) => {
                  event.preventDefault();
                  router.push('/students/new');
                }}
              >
                {t('add')}
              </Button>
            </SpaceBetween>
          )
        }
      >
        {t('title')}
      </Header>
    ),
    filter: (
      <Select
        inlineLabelText={t('filter.status')}
        selectedOption={{ value: status, label: t(`status.${status}`) }}
        options={STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
        onChange={({ detail }) => setParams({ status: detail.selectedOption.value ?? null, cursor: null })}
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
        onConfirm={({ detail }) =>
          setParams({ pageSize: String(detail.pageSize ?? pageSize), cursor: null })
        }
      />
    ),
    empty:
      status === 'active' && page === 1 ? (
        <EmptyState icon="students" heading={t('empty.heading')} body={t('empty.body')} />
      ) : (
        <EmptyState
          icon="students"
          heading={t('noMatches.heading')}
          body={t('noMatches.body')}
          action={
            <Button onClick={() => setParams({ status: null, cursor: null })}>{t('noMatches.clear')}</Button>
          }
        />
      ),
  };

  if (isMobile) {
    return (
      <Cards
        {...shared}
        variant="container"
        cardDefinition={{
          header: (student) => <AppLink href={`/students/${student.id}`}>{student.name}</AppLink>,
          sections: fields.slice(1),
        }}
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
        isRowHeader: id === 'name',
      }))}
    />
  );
}
