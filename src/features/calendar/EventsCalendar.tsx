'use client';

import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import SegmentedControl from '@cloudscape-design/components/segmented-control';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { deleteEvent, upsertEvent } from '@/server/modules/calendar/actions';
import type { CalendarItem } from '@/server/modules/calendar/events';

const TYPES = ['academic', 'exam', 'ptm', 'sports', 'cultural', 'other'];
const BLANK = { title: '', type: 'academic', start: '', end: '' };
const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const date = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Week = { first: string; days: (string | null)[] };

/** The month as rows of seven days, Monday first. A day outside the month is null. */
function monthWeeks(month: string): Week[] {
  const [year, number] = month.split('-').map(Number);
  const length = new Date(Date.UTC(year ?? 0, number ?? 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year ?? 0, (number ?? 1) - 1, 1)).getUTCDay() + 6) % 7;
  const days = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ];
  const weeks: Week[] = [];
  for (let at = 0; at < days.length; at += 7) {
    const row = days.slice(at, at + 7);
    while (row.length < 7) row.push(null);
    weeks.push({ first: row.find(Boolean) ?? `${month}-${at}`, days: row });
  }
  return weeks;
}

export function EventsCalendar({
  month,
  today,
  previous,
  next,
  items,
  view,
  canEdit,
}: {
  month: string;
  today: string;
  previous: string;
  next: string;
  items: CalendarItem[];
  view: 'month' | 'list';
  canEdit: boolean;
}) {
  const t = useTranslations('calendar.events');
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CalendarItem | null>(null);
  const [values, setValues] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const typeOptions = TYPES.map((value) => ({ value, label: t(`type.${value}`) }));
  const go = (to: string, shown = view) => router.replace(`${pathname}?month=${to}&view=${shown}`);
  const openEdit = (item: CalendarItem) => {
    setError(null);
    setEditingId(item.id);
    setValues({ title: item.title, type: item.type, start: item.start, end: item.end });
    setAdding(true);
  };
  const addButton = (primary: boolean) => (
    <Button
      {...(primary && { variant: 'primary' as const })}
      onClick={() => {
        setError(null);
        setEditingId(null);
        setValues(BLANK);
        setAdding(true);
      }}
    >
      {t('add')}
    </Button>
  );

  async function save() {
    setBusy(true);
    setError(null);
    const response = await upsertEvent({ ...values, end: values.end || values.start, ...(editingId && { id: editingId }) });
    setBusy(false);
    if (!response.ok) return setError(response.error);
    setAdding(false);
    setValues(BLANK);
    setResult({ type: 'success', text: t(response.data.updated ? 'updated' : 'added', { title: response.data.title }) });
    router.refresh();
  }

  async function remove() {
    if (!removing?.id) return;
    setBusy(true);
    const response = await deleteEvent(removing.id);
    setBusy(false);
    setRemoving(null);
    setResult(
      response.ok
        ? { type: 'success', text: t('deleted', { title: response.data.title }) }
        : { type: 'error', text: response.error.message },
    );
    router.refresh();
  }

  const dateField = (field: 'start' | 'end', hint?: string) => (
    <FormField label={t(`form.${field}`)} constraintText={hint} errorText={error?.fieldErrors?.[field]}>
      <DatePicker
        value={values[field]}
        placeholder="YYYY/MM/DD"
        onChange={({ detail }) => setValues({ ...values, [field]: detail.value })}
      />
    </FormField>
  );

  const weeks = monthWeeks(month);
  const cell = (date: string | null) => {
    if (!date) return null;
    const own = items.filter((item) => item.start <= date && item.end >= date);
    return (
      <SpaceBetween size="xxxs">
        <Box fontWeight="bold" color={date === today ? 'text-status-info' : 'inherit'}>
          {Number(date.slice(8))}
          {date === today && ` · ${t('today')}`}
        </Box>
        {own.map((item) =>
          canEdit && item.id ? (
            <Button
              key={item.id}
              variant="inline-link"
              ariaLabel={t('editLabel', { title: item.title })}
              onClick={() => openEdit(item)}
            >
              {item.title}
            </Button>
          ) : (
            <Box key={`${item.start}-${item.title}`} fontSize="body-s">
              {item.title}
            </Box>
          ),
        )}
      </SpaceBetween>
    );
  };

  const header = (
    <SpaceBetween size="m">
      <Header
        variant="h2"
        description={t('description')}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <SegmentedControl
            selectedId={view}
            label={t('view.label')}
            options={[
              { id: 'month', text: t('view.month') },
              { id: 'list', text: t('view.list') },
            ]}
            onChange={({ detail }) => go(month, detail.selectedId === 'list' ? 'list' : 'month')}
          />
          <Button ariaLabel={t('previousLabel')} onClick={() => go(previous)}>
              {t('previous')}
            </Button>
            <Button ariaLabel={t('nextLabel')} onClick={() => go(next)}>
              {t('next')}
            </Button>
            {canEdit && addButton(true)}
          </SpaceBetween>
        }
      >
        {monthName.format(new Date(`${month}-01T00:00:00Z`))}
      </Header>
      {result && (
        <Alert type={result.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setResult(null)}>
          {result.text}
        </Alert>
      )}
    </SpaceBetween>
  );

  return (
    <>
      {view === 'month' ? (
        <Table
          variant="container"
          trackBy="first"
          items={weeks}
          header={header}
          columnDefinitions={WEEKDAYS.map((weekday, index) => ({
            id: weekday,
            header: t(`weekdays.${weekday}`),
            cell: (week: Week) => cell(week.days[index] ?? null),
          }))}
        />
      ) : (
        <Table
          variant="container"
          stickyHeader
          trackBy={(item) => item.id ?? `${item.type}-${item.start}-${item.title}`}
          items={items}
          header={header}
          empty={
            <EmptyState
              icon="event"
              heading={t('empty.heading')}
              body={t('empty.body')}
              action={canEdit && addButton(false)}
            />
          }
          columnDefinitions={[
            {
              id: 'when',
              header: t('columns.when'),
              cell: (item) => (
                <SpaceBetween direction="horizontal" size="xs">
                  {item.start === item.end ? day(item.start) : `${day(item.start)} – ${day(item.end)}`}
                  {item.start <= today && item.end >= today && <Badge color="blue">{t('today')}</Badge>}
                </SpaceBetween>
              ),
            },
            { id: 'title', header: t('columns.title'), cell: (item) => item.title, isRowHeader: true },
            { id: 'type', header: t('columns.type'), cell: (item) => t(`type.${item.type}`) },
            ...(canEdit
              ? [
                  {
                    id: 'actions',
                    header: t('columns.actions'),
                    cell: (item: CalendarItem) =>
                      item.id && (
                        <SpaceBetween direction="horizontal" size="s">
                          <Button
                            variant="inline-link"
                            ariaLabel={t('editLabel', { title: item.title })}
                            onClick={() => {
                              setError(null);
                              setEditingId(item.id);
                              setValues({ title: item.title, type: item.type, start: item.start, end: item.end });
                              setAdding(true);
                            }}
                          >
                            {t('edit')}
                          </Button>
                          <Button
                            variant="inline-link"
                            ariaLabel={t('deleteLabel', { title: item.title })}
                            onClick={() => setRemoving(item)}
                          >
                            {t('delete')}
                          </Button>
                        </SpaceBetween>
                      ),
                  },
                ]
              : []),
          ]}
        />
      )}
      <Modal
        visible={adding}
        header={t(editingId ? 'editTitle' : 'add')}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setAdding(false)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setAdding(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                {t(editingId ? 'saveChanges' : 'save')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          <FormField label={t('columns.title')} errorText={error?.fieldErrors?.title}>
            <Input
              value={values.title}
              autoComplete={false}
              onChange={({ detail }) => setValues({ ...values, title: detail.value })}
            />
          </FormField>
          <FormField label={t('columns.type')} errorText={error?.fieldErrors?.type}>
            <Select
              selectedOption={typeOptions.find((option) => option.value === values.type) ?? null}
              options={typeOptions}
              onChange={({ detail }) => setValues({ ...values, type: detail.selectedOption.value ?? 'other' })}
            />
          </FormField>
          {dateField('start')}
          {dateField('end', t('form.endHint'))}
        </SpaceBetween>
      </Modal>
      <Modal
        visible={Boolean(removing)}
        header={t('deleteTitle', { title: removing?.title ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setRemoving(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setRemoving(null)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void remove()}>
                {t('deleteConfirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('deleteBody')}
      </Modal>
    </>
  );
}
