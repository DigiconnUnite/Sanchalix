'use client';

import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { submitStaffAttendance } from '@/server/modules/hr/actions';
import type { StaffMark, StaffSheet } from '@/server/modules/hr/staffAttendance';

const MARKS: StaffMark[] = ['present', 'absent', 'half_day', 'leave'];

export function StaffAttendance({ sheet, canEdit }: { sheet: StaffSheet; canEdit: boolean }) {
  const t = useTranslations('hr.attendance');
  const tState = useTranslations('attendance.take.state');
  const router = useRouter();
  const pathname = usePathname();
  const [marks, setMarks] = useState(() => new Map(sheet.staff.map((member) => [member.id, member.status])));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const closed = sheet.state !== 'open';
  const editable = canEdit && !closed;
  const count = (mark: StaffMark) => [...marks.values()].filter((status) => status === mark).length;

  async function save() {
    setBusy(true);
    setFeedback(null);
    const result = await submitStaffAttendance({
      date: sheet.date,
      entries: sheet.staff.map(({ id }) => ({ staffId: id, status: marks.get(id) ?? 'present' })),
    });
    setBusy(false);
    setFeedback(
      result.ok ? { type: 'success', text: t('saved', result.data) } : { type: 'error', text: result.error.message },
    );
    if (result.ok) router.refresh();
  }

  return (
    <Table
      variant="container"
      stickyHeader
      enableKeyboardNavigation
      trackBy="id"
      items={closed ? [] : sheet.staff}
      header={
        <SpaceBetween size="m">
          <Header
            variant="h1"
            counter={closed ? '' : `(${sheet.staff.length})`}
            description={t('description')}
            actions={
              editable &&
              sheet.staff.length > 0 && (
                <Button variant="primary" iconSvg={svg('attendance')} loading={busy} onClick={() => void save()}>
                  {t(sheet.saved ? 'update' : 'save')}
                </Button>
              )
            }
          >
            {t('title')}
          </Header>
          <FormField label={t('date')} constraintText={t('dateHint')}>
            <DatePicker
              value={sheet.date}
              placeholder="YYYY/MM/DD"
              isDateEnabled={(date) => date <= new Date()}
              onChange={({ detail }) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(detail.value)) router.replace(`${pathname}?date=${detail.value}`);
              }}
            />
          </FormField>
          {feedback && (
            <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
              {feedback.text}
            </Alert>
          )}
          {!feedback && closed && <Alert type="info">{tState(sheet.state, { name: sheet.holidayName ?? '' })}</Alert>}
          {!feedback && !closed && !sheet.saved && <Alert type="info">{t('notSaved')}</Alert>}
          {!closed && sheet.staff.length > 0 && (
            <Box variant="strong">
              <span aria-live="polite">
                {t('summary', {
                  present: count('present'),
                  absent: count('absent'),
                  halfDay: count('half_day'),
                  leave: count('leave'),
                })}
              </span>
            </Box>
          )}
        </SpaceBetween>
      }
      empty={closed ? null : <EmptyState icon="staff" heading={t('empty.heading')} body={t('empty.body')} />}
      columnDefinitions={[
        { id: 'employeeNo', header: t('columns.employeeNo'), cell: (member) => member.employeeNo, width: 140 },
        {
          id: 'name',
          header: t('columns.name'),
          isRowHeader: true,
          cell: (member) => (
            <SpaceBetween direction="horizontal" size="xs">
              <span>{member.name}</span>
              {member.onApprovedLeave && <Badge color="blue">{t('approvedLeave')}</Badge>}
            </SpaceBetween>
          ),
        },
        {
          id: 'status',
          header: t('columns.status'),
          cell: (member) => (
            <SegmentedControl
              label={t('statusFor', { name: member.name })}
              selectedId={marks.get(member.id) ?? 'present'}
              options={MARKS.map((id) => ({ id, text: t(`status.${id}`), disabled: !editable }))}
              onChange={({ detail }) =>
                setMarks((current) => new Map(current).set(member.id, detail.selectedId as StaffMark))
              }
            />
          ),
        },
      ]}
    />
  );
}
