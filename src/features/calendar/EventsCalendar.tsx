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

export function EventsCalendar({
  month,
  today,
  previous,
  next,
  items,
  canEdit,
}: {
  month: string;
  today: string;
  previous: string;
  next: string;
  items: CalendarItem[];
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
  const go = (to: string) => router.replace(`${pathname}?month=${to}`);
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

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        trackBy={(item) => item.id ?? `holiday-${item.start}`}
        items={items}
        header={
          <SpaceBetween size="m">
            <Header
              variant="h2"
              description={t('description')}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
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
        }
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
