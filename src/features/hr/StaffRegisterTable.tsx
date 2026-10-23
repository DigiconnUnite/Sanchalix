'use client';

import Box, { type BoxProps } from '@cloudscape-design/components/box';
import Cards from '@cloudscape-design/components/cards';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import { ExportButton } from '@/components/ExportButton';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useIsMobile } from '@/lib/useIsMobile';
import type { StaffMark } from '@/server/modules/hr/staffAttendance';
import type { StaffRegister } from '@/server/modules/hr/staffRegister';

type Member = StaffRegister['staff'][number];

// A letter with a status colour, never colour alone; the legend above the table spells each letter out.
const MARKS: Record<StaffMark, { letter: string; color: BoxProps.Color }> = {
  present: { letter: 'P', color: 'text-status-success' },
  absent: { letter: 'A', color: 'text-status-error' },
  half_day: { letter: '½', color: 'text-status-warning' },
  leave: { letter: 'Lv', color: 'text-status-info' },
};
const NONE = '—';

export function StaffRegisterTable({ register }: { register: StaffRegister }) {
  const t = useTranslations('hr.register');
  const tStatus = useTranslations('hr.attendance.status');
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const shared = {
    trackBy: 'id',
    items: register.staff,
    header: (
      <SpaceBetween size="m">
        <Header
          variant="h1"
          counter={`(${register.staff.length})`}
          actions={<ExportButton href={`/api/v1/staff-attendance/register?month=${register.month}`} label={t('exportLabel')} />}
        >
          {t('title')}
        </Header>
        <FormField label={t('month')} constraintText={t('monthConstraint')}>
          <DatePicker
            granularity="month"
            value={register.month}
            placeholder="YYYY/MM"
            isDateEnabled={(date) => date <= new Date()}
            onChange={({ detail }) => {
              if (/^\d{4}-\d{2}$/.test(detail.value)) router.replace(`${pathname}?month=${detail.value}`);
            }}
          />
        </FormField>
        <Box color="text-body-secondary">{t('legend')}</Box>
      </SpaceBetween>
    ),
    empty: <EmptyState icon="staff" heading={t('empty.heading')} body={t('empty.body')} />,
  };

  if (isMobile) {
    return (
      <Cards
        {...shared}
        variant="container"
        cardDefinition={{
          header: (member) => member.name,
          sections: [
            { id: 'present', header: t('columns.present'), content: (member) => member.present },
            { id: 'absent', header: t('columns.absent'), content: (member) => member.absent },
            { id: 'leave', header: t('columns.leave'), content: (member) => member.leave },
          ],
        }}
      />
    );
  }

  const dayColumns: TableProps.ColumnDefinition<Member>[] = register.days.map(({ date, day, kind }) => ({
    id: date,
    header: String(day),
    width: 48,
    cell: (member) => {
      const mark = member.marks[date];
      if (mark) {
        return (
          <Box color={MARKS[mark].color} fontWeight="bold">
            <span title={tStatus(mark)}>{MARKS[mark].letter}</span>
          </Box>
        );
      }
      return kind === 'holiday' ? <span title={t('holiday')}>H</span> : kind === 'nonWorking' ? NONE : '';
    },
  }));

  return (
    <Table
      {...shared}
      variant="container"
      stickyHeader
      stickyColumns={{ first: 2 }}
      enableKeyboardNavigation
      columnDefinitions={[
        { id: 'employeeNo', header: t('columns.employeeNo'), cell: (member) => member.employeeNo, width: 110 },
        { id: 'name', header: t('columns.name'), cell: (member) => member.name, isRowHeader: true, width: 180 },
        ...dayColumns,
        { id: 'present', header: t('columns.present'), cell: (member) => member.present, width: 100 },
        { id: 'absent', header: t('columns.absent'), cell: (member) => member.absent, width: 100 },
        { id: 'leave', header: t('columns.leave'), cell: (member) => member.leave, width: 100 },
      ]}
    />
  );
}
