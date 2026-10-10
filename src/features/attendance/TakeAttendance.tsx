'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { correctAttendance, submitAttendance } from '@/server/modules/attendance/actions';
import type { AttendanceSheet, AttendanceSummary, MarkableStatus } from '@/server/modules/attendance/schemas';

const STATUSES: MarkableStatus[] = ['present', 'absent', 'late', 'half_day', 'leave'];

type Feedback = { type: 'success' | 'error'; text: string };

export function TakeAttendance({
  sections,
  sheet,
  canSubmit,
}: {
  sections: { id: string; name: string }[];
  sheet: AttendanceSheet;
  canSubmit: boolean;
}) {
  const t = useTranslations('attendance.take');
  const router = useRouter();
  const pathname = usePathname();
  const [marks, setMarks] = useState(() => new Map(sheet.students.map((student) => [student.id, student.status])));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const editable = sheet.state === 'open' && (sheet.correcting || canSubmit);
  const [reason, setReason] = useState('');
  const summary = Object.fromEntries(STATUSES.map((status) => [status, 0])) as AttendanceSummary;
  for (const status of marks.values()) summary[status] += 1;
  const registerHref = `/attendance/register?section=${sheet.section.id}&month=${sheet.date.slice(0, 7)}`;
  const open = (section: string, date: string, period: number | null = sheet.period) =>
    router.replace(`${pathname}?section=${section}&date=${date}${period ? `&period=${period}` : ''}`);
  const periodOptions = [
    ...(sheet.canDaily ? [{ value: '', label: t('wholeDay') }] : []),
    ...sheet.periods.map(({ number, time, subject }) => ({
      value: String(number),
      label: t('periodOption', { number, time, subject }),
    })),
  ];

  async function submit() {
    setBusy(true);
    setFeedback(null);
    const save = sheet.correcting ? correctAttendance : submitAttendance;
    const result = await save({
      ...(sheet.correcting && { reason }),
      sectionId: sheet.section.id,
      date: sheet.date,
      mode: sheet.period ? 'period' : 'daily',
      ...(sheet.period && { period: sheet.period }),
      entries: sheet.students.map(({ id }) => ({ studentId: id, status: marks.get(id) ?? 'present' })),
      idempotencyKey,
    });
    setBusy(false);
    if (!result.ok) return setFeedback({ type: 'error', text: result.error.message });

    const { sectionName, summary: saved, edited } = result.data;
    setFeedback({
      type: 'success',
      text: t(edited ? 'updated' : 'submitted', { section: sectionName, present: saved.present, absent: saved.absent }),
    });
    setIdempotencyKey(crypto.randomUUID());
    router.refresh();
  }

  const notice =
    sheet.state !== 'open'
      ? t(`state.${sheet.state}`, { name: sheet.holidayName ?? '' })
      : sheet.correcting
        ? t('correctingNote')
        : !canSubmit
        ? t(sheet.submitted ? 'readOnly' : 'notSubmitted', { section: sheet.section.name })
        : sheet.submitted
          ? t('alreadySubmitted', { section: sheet.section.name })
          : null;
  const hidesRoster = ['future', 'nonWorking', 'holiday', 'noPeriod'].includes(sheet.state);

  return (
    <Table
      variant="container"
      stickyHeader
      enableKeyboardNavigation
      trackBy="id"
      items={hidesRoster ? [] : sheet.students}
      header={
        <SpaceBetween size="m">
          <Header
            variant="h2"
            counter={hidesRoster ? '' : `(${sheet.students.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                {sheet.canDaily && (
                  <Button
                    href={registerHref}
                    onFollow={(event) => {
                      event.preventDefault();
                      router.push(registerHref);
                    }}
                  >
                    {t('openRegister')}
                  </Button>
                )}
                {editable && sheet.students.length > 0 && (
                  <>
                    <Button onClick={() => setMarks(new Map(sheet.students.map(({ id }) => [id, 'present'])))}>
                      {t('markAllPresent')}
                    </Button>
                    <Button
                      variant="primary"
                      iconSvg={svg('attendance')}
                      loading={busy}
                      disabled={sheet.correcting && reason.trim().length < 5}
                      onClick={() => void submit()}
                    >
                      {t(sheet.correcting ? 'correct' : sheet.submitted ? 'update' : 'submit')}
                    </Button>
                  </>
                )}
              </SpaceBetween>
            }
          >
            {t('title')}
          </Header>
          <SpaceBetween direction="horizontal" size="l">
            <FormField label={t('section')}>
              <Select
                selectedOption={{ value: sheet.section.id, label: sheet.section.name }}
                options={sections.map(({ id, name }) => ({ value: id, label: name }))}
                onChange={({ detail }) => open(detail.selectedOption.value ?? sheet.section.id, sheet.date, null)}
              />
            </FormField>
            {sheet.periods.length > 0 && (
              <FormField label={t('period')}>
                <Select
                  selectedOption={periodOptions.find((option) => option.value === String(sheet.period ?? '')) ?? null}
                  options={periodOptions}
                  onChange={({ detail }) =>
                    open(sheet.section.id, sheet.date, Number(detail.selectedOption.value) || null)
                  }
                />
              </FormField>
            )}
            <FormField label={t('date')} constraintText={t('dateConstraint')}>
              <DatePicker
                value={sheet.date}
                placeholder="YYYY/MM/DD"
                isDateEnabled={(date) => date <= new Date()}
                onChange={({ detail }) => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(detail.value)) open(sheet.section.id, detail.value, null);
                }}
              />
            </FormField>
          </SpaceBetween>
          {sheet.correcting && (
            <FormField label={t('reason')} description={t('reasonHint')}>
              <Textarea value={reason} rows={2} onChange={({ detail }) => setReason(detail.value)} />
            </FormField>
          )}
          {feedback && (
            <Alert
              type={feedback.type}
              dismissible
              dismissAriaLabel={t('dismiss')}
              onDismiss={() => setFeedback(null)}
            >
              {feedback.text}
            </Alert>
          )}
          {notice && !feedback && (
            <Alert type="info">
              {notice}
              {sheet.edited && ` ${t('edited')}`}
            </Alert>
          )}
          {!hidesRoster && sheet.students.length > 0 && (
            <Box variant="strong">
              <span aria-live="polite">{t('summary', summary)}</span>
            </Box>
          )}
        </SpaceBetween>
      }
      empty={
        hidesRoster ? null : (
          <EmptyState
            icon="attendance"
            heading={t('empty.heading', { section: sheet.section.name })}
            body={t('empty.body')}
          />
        )
      }
      columnDefinitions={[
        { id: 'rollNo', header: t('columns.rollNo'), cell: (student) => student.rollNo, width: 110 },
        { id: 'name', header: t('columns.name'), cell: (student) => student.name, isRowHeader: true },
        {
          id: 'status',
          header: t('columns.status'),
          cell: (student) => (
            <SegmentedControl
              label={t('statusFor', { name: student.name })}
              selectedId={marks.get(student.id) ?? 'present'}
              options={STATUSES.map((id) => ({ id, text: t(`status.${id}`), disabled: !editable }))}
              onChange={({ detail }) =>
                setMarks((current) => new Map(current).set(student.id, detail.selectedId as MarkableStatus))
              }
            />
          ),
        },
      ]}
    />
  );
}
