'use client';

import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { AuditRow } from '@/server/modules/platform/service';

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const NONE = '—';

export function PlatformAuditTable({ data }: { data: { rows: AuditRow[]; nextCursor: string | null } | null }) {
  const t = useTranslations('platform.audit');
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Table
      variant="container"
      stickyHeader
      enableKeyboardNavigation
      trackBy="id"
      items={data?.rows ?? []}
      loading={!data}
      loadingText={t('loading')}
      header={
        <Header variant="h2" description={t('description')}>
          {t('title')}
        </Header>
      }
      footer={
        data?.nextCursor && (
          <Button onClick={() => router.push(`${pathname}?cursor=${data.nextCursor}`)}>{t('older')}</Button>
        )
      }
      empty={<EmptyState icon="auditLog" heading={t('empty.heading')} body={t('empty.body')} />}
      columnDefinitions={[
        { id: 'at', header: t('columns.when'), cell: (row) => dateTime.format(new Date(row.at)), isRowHeader: true },
        { id: 'actor', header: t('columns.who'), cell: (row) => row.actor || NONE },
        { id: 'action', header: t('columns.what'), cell: (row) => (t.has(`actions.${row.action}`) ? t(`actions.${row.action}`) : row.action) },
        { id: 'school', header: t('columns.school'), cell: (row) => row.school ?? NONE },
        { id: 'reason', header: t('columns.reason'), cell: (row) => row.reason ?? NONE },
      ]}
    />
  );
}
