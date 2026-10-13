'use client';

import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { AttendanceReport as Report } from '@/server/modules/attendance/reports';

const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function AttendanceReport({ report, line, canOpenStudents }: { report: Report; line: number; canOpenStudents: boolean }) {
  const t = useTranslations('attendance.report');
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
  const total = (label: string, value: string, note?: string) => (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="awsui-value-large">{value}</Box>
      {note && <Box color="text-body-secondary">{note}</Box>}
    </div>
  );
  const percent = (value: number) => t('percent', { value });

  return (
    <SpaceBetween size="l">
      <Container>
        <SpaceBetween size="l">
          <SpaceBetween direction="horizontal" size="l">
            {picker('from')}
            {picker('to')}
          </SpaceBetween>
          <ColumnLayout columns={3} variant="text-grid">
            {total(
              t('average'),
              report.percent === null ? '—' : percent(report.percent),
              t('range', { from: day(report.from), to: day(report.to) }),
            )}
            {total(t('sectionsCounted'), String(report.sections.length))}
            {total(t('below'), String(report.lowTotal), t('belowNote', { line }))}
          </ColumnLayout>
        </SpaceBetween>
      </Container>
      <Table
        variant="container"
        trackBy="id"
        items={report.low}
        header={
          <Header variant="h2" counter={`(${report.lowTotal})`} description={t('lowDescription', { line })}>
            {t('lowTitle', { line })}
          </Header>
        }
        footer={
          report.lowTotal > report.low.length && (
            <Box textAlign="center" color="text-body-secondary">
              {t('lowMore', { shown: report.low.length, total: report.lowTotal })}
            </Box>
          )
        }
        empty={<EmptyState icon="success" heading={t('lowEmpty.heading')} body={t('lowEmpty.body', { line })} />}
        columnDefinitions={[
          {
            id: 'name',
            header: t('columns.student'),
            isRowHeader: true,
            cell: (row) => (canOpenStudents ? <AppLink href={`/students/${row.id}?tab=attendance`}>{row.name}</AppLink> : row.name),
          },
          { id: 'admissionNo', header: t('columns.admissionNo'), cell: (row) => row.admissionNo },
          { id: 'section', header: t('columns.section'), cell: (row) => row.section },
          { id: 'days', header: t('columns.days'), cell: (row) => row.days },
          { id: 'absent', header: t('columns.absent'), cell: (row) => row.absent },
          {
            id: 'percent',
            header: t('columns.percent'),
            cell: (row) => <StatusIndicator type="warning">{percent(row.percent)}</StatusIndicator>,
          },
        ]}
      />
      <Table
        variant="container"
        trackBy="id"
        items={report.sections}
        header={
          <Header variant="h2" counter={`(${report.sections.length})`}>
            {t('bySection')}
          </Header>
        }
        empty={<EmptyState icon="attendance" heading={t('empty.heading')} body={t('empty.body')} />}
        columnDefinitions={[
          {
            id: 'name',
            header: t('columns.section'),
            isRowHeader: true,
            cell: (row) => <AppLink href={`/attendance/register?section=${row.id}&month=${report.to.slice(0, 7)}`}>{row.name}</AppLink>,
          },
          { id: 'days', header: t('columns.daysTaken'), cell: (row) => row.days },
          { id: 'students', header: t('columns.students'), cell: (row) => row.students },
          { id: 'percent', header: t('columns.percent'), cell: (row) => percent(row.percent) },
          { id: 'low', header: t('columns.below', { line }), cell: (row) => row.low },
        ]}
      />
    </SpaceBetween>
  );
}
