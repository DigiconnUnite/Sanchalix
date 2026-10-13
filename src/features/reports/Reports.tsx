'use client';

import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import type { IconKey } from '@/components/icons';
import type { AdmissionsReport, StaffReport } from '@/server/modules/reports/service';

type Row = { key: string; label: ReactNode; count: number };

export function Reports({
  admissions,
  staff,
  links,
}: {
  /** Undefined when the person may not see it; null when there is no academic year to report on. */
  admissions?: AdmissionsReport | null;
  staff?: StaffReport;
  links: { href: string; text: string }[];
}) {
  const t = useTranslations('reports');
  const tAdmissions = useTranslations('admissions');
  const tStaff = useTranslations('hr');

  const total = (label: string, value: number, note?: string) => (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="awsui-value-large">{value}</Box>
      {note && <Box color="text-body-secondary">{note}</Box>}
    </div>
  );
  const counts = (title: string, first: string, rows: Row[], icon: IconKey) => (
    <Table
      variant="container"
      trackBy="key"
      items={rows}
      header={<Header variant="h3">{title}</Header>}
      empty={<EmptyState icon={icon} heading={t('empty.heading')} body={t('empty.body')} />}
      columnDefinitions={[
        { id: 'label', header: first, cell: (row) => row.label, isRowHeader: true },
        { id: 'count', header: t('count'), cell: (row) => row.count },
      ]}
    />
  );

  return (
    <SpaceBetween size="xl">
      {links.length > 0 && (
        <Container header={<Header variant="h2">{t('more')}</Header>}>
          <SpaceBetween direction="horizontal" size="l">
            {links.map(({ href, text }) => (
              <AppLink key={href} href={href}>
                {text}
              </AppLink>
            ))}
          </SpaceBetween>
        </Container>
      )}
      {admissions !== undefined && (
        <SpaceBetween size="l">
          <Header variant="h2" description={admissions ? t('admissions.description', { year: admissions.year }) : undefined}>
            {t('admissions.title')}
          </Header>
          {admissions ? (
            <>
              <Container>
                <ColumnLayout columns={3} variant="text-grid">
                  {total(t('admissions.total'), admissions.total)}
                  {total(
                    t('admissions.admitted'),
                    admissions.byStage.find((row) => row.key === 'accepted')?.count ?? 0,
                  )}
                  {total(
                    t('admissions.open'),
                    admissions.byStage
                      .filter((row) => !['accepted', 'rejected', 'withdrawn'].includes(row.key))
                      .reduce((sum, row) => sum + row.count, 0),
                    t('admissions.openNote'),
                  )}
                </ColumnLayout>
              </Container>
              <ColumnLayout columns={2}>
                {counts(
                  t('admissions.byStage'),
                  t('admissions.stage'),
                  admissions.byStage.map((row) => ({
                    key: row.key,
                    count: row.count,
                    label: <AppLink href={`/admissions?status=${row.key}`}>{tAdmissions(`status.${row.key}`)}</AppLink>,
                  })),
                  'admissions',
                )}
                {counts(
                  t('admissions.bySource'),
                  t('admissions.source'),
                  admissions.bySource.map((row) => ({ ...row, label: tAdmissions(`source.${row.key}`) })),
                  'admissions',
                )}
              </ColumnLayout>
              <Table
                variant="container"
                trackBy="name"
                items={admissions.byClass}
                header={<Header variant="h3">{t('admissions.byClass')}</Header>}
                empty={<EmptyState icon="admissions" heading={t('empty.heading')} body={t('empty.body')} />}
                columnDefinitions={[
                  { id: 'name', header: t('admissions.class'), cell: (row) => row.name, isRowHeader: true },
                  { id: 'total', header: t('admissions.applications'), cell: (row) => row.total },
                  { id: 'admitted', header: t('admissions.admitted'), cell: (row) => row.admitted },
                ]}
              />
            </>
          ) : (
            <Container>
              <EmptyState icon="academicYear" heading={t('noYear.heading')} body={t('noYear.body')} />
            </Container>
          )}
        </SpaceBetween>
      )}
      {staff && (
        <SpaceBetween size="l">
          <Header variant="h2" description={t('staff.description')}>
            {t('staff.title')}
          </Header>
          <Container>
            <ColumnLayout columns={3} variant="text-grid">
              {total(t('staff.total'), staff.total, t('staff.totalNote'))}
              {total(t('staff.teaching'), staff.byType.find((row) => row.key === 'teaching')?.count ?? 0)}
              {total(t('staff.withAccount'), staff.withAccount, t('staff.withAccountNote', { total: staff.total }))}
            </ColumnLayout>
          </Container>
          <ColumnLayout columns={2}>
            {counts(
              t('staff.byStatus'),
              t('staff.status'),
              staff.byStatus.map((row) => ({ ...row, label: tStaff(`status.${row.key}`) })),
              'staff',
            )}
            {counts(
              t('staff.byDepartment'),
              t('staff.department'),
              staff.byDepartment.map((row) => ({
                key: row.name ?? '',
                count: row.count,
                label: row.name ?? t('staff.noDepartment'),
              })),
              'staff',
            )}
          </ColumnLayout>
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
