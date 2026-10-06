'use client';

import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import Pagination from '@cloudscape-design/components/pagination';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { applyLeave, cancelLeave, decideLeave } from '@/server/modules/hr/actions';
import type { LeaveBalance, LeaveRow } from '@/server/modules/hr/leave';

const LIST = '/leave';
const NEW = '/leave/new';
const NONE = '—';
const TYPES = ['CL', 'SL', 'EL', 'LOP'];
const FILTERS = ['all', 'pending', 'approved', 'rejected', 'cancelled'];
const STATUS_TYPE: Record<LeaveRow['status'], StatusIndicatorProps.Type> = {
  pending: 'pending',
  approved: 'success',
  rejected: 'error',
  cancelled: 'stopped',
};
type Data = { rows: LeaveRow[]; page: number; nextCursor: string | null; prevCursor: string | null };
type Pending = { row: LeaveRow; action: 'approved' | 'rejected' | 'cancel' };
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function LeaveTable({
  status,
  canApply,
  canApprove,
  applied,
  balances,
  data,
}: {
  balances: LeaveBalance[];
  status: string;
  canApply: boolean;
  canApprove: boolean;
  applied: boolean;
  data: Data | null;
}) {
  const t = useTranslations('hr.leave');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<Pending | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const feedback = result ?? (applied ? { type: 'success' as const, text: t('applied') } : null);
  const page = data?.page ?? 1;
  const filterOptions = FILTERS.map((value) => ({ value, label: t(`filter.${value}`) }));
  const go = (cursor: string | null, next = status) => {
    const params = new URLSearchParams({ ...(next !== 'all' && { status: next }), ...(cursor && { cursor }) });
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  };
  const applyButton = (primary: boolean) => (
    <Button
      {...(primary && { variant: 'primary' as const })}
      href={NEW}
      onFollow={(event) => {
        event.preventDefault();
        router.push(NEW);
      }}
    >
      {t('apply')}
    </Button>
  );

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    const { row, action } = pending;
    const response =
      action === 'cancel' ? await cancelLeave(row.id) : await decideLeave({ id: row.id, decision: action, comment });
    setBusy(false);
    setPending(null);
    setComment('');
    setResult(
      response.ok
        ? { type: 'success', text: t(`done.${action}`, { name: row.staffName }) }
        : { type: 'error', text: response.error.message },
    );
    router.refresh();
  }

  const action = (row: LeaveRow, kind: Pending['action']) => (
    <Button
      variant="inline-link"
      ariaLabel={t(`actionLabel.${kind}`, { name: row.staffName, from: day(row.from) })}
      onClick={() => setPending({ row, action: kind })}
    >
      {t(`action.${kind}`)}
    </Button>
  );

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        enableKeyboardNavigation
        trackBy="id"
        items={data?.rows ?? []}
        loading={!data}
        loadingText={t('loading')}
        header={
          <SpaceBetween size="m">
            <Header variant="h1" description={t(canApprove ? 'descriptionApprover' : 'description')} actions={canApply && applyButton(true)}>
              {t('title')}
            </Header>
            {balances.length > 0 && (
              <KeyValuePairs
                columns={3}
                items={balances.map((balance) => ({
                  label: t(`type.${balance.type}`),
                  value: t('balance', { left: balance.left, quota: balance.quota }),
                  ...(balance.pending > 0 && { info: <Badge color="blue">{t('pendingDays', { count: balance.pending })}</Badge> }),
                }))}
              />
            )}
            {feedback && (
              <Alert
                type={feedback.type}
                dismissible
                dismissAriaLabel={t('dismiss')}
                onDismiss={() => {
                  setResult(null);
                  go(null);
                }}
              >
                {feedback.text}
              </Alert>
            )}
          </SpaceBetween>
        }
        filter={
          <Select
            inlineLabelText={t('filter.label')}
            selectedOption={filterOptions.find((option) => option.value === status) ?? null}
            options={filterOptions}
            onChange={({ detail }) => go(null, detail.selectedOption.value ?? 'all')}
          />
        }
        pagination={
          <Pagination
            currentPageIndex={page}
            pagesCount={data?.nextCursor ? page + 1 : page}
            openEnd={Boolean(data?.nextCursor)}
            disabled={!data}
            onChange={({ detail }) => {
              if (!data) return;
              go(detail.currentPageIndex === 1 ? null : detail.currentPageIndex > page ? data.nextCursor : data.prevCursor);
            }}
          />
        }
        empty={
          status === 'all' ? (
            <EmptyState
              icon="leave"
              heading={t('empty.heading')}
              body={t(canApply ? 'empty.bodyStaff' : 'empty.body')}
              action={canApply && applyButton(false)}
            />
          ) : (
            <EmptyState
              icon="search"
              heading={t('noMatches.heading')}
              body={t('noMatches.body')}
              action={<Button onClick={() => go(null, 'all')}>{t('noMatches.clear')}</Button>}
            />
          )
        }
        columnDefinitions={[
          { id: 'staff', header: t('columns.staff'), cell: (row) => row.staffName, isRowHeader: true },
          { id: 'type', header: t('columns.type'), cell: (row) => t(`type.${row.type}`) },
          {
            id: 'dates',
            header: t('columns.dates'),
            cell: (row) => (row.from === row.to ? day(row.from) : `${day(row.from)} – ${day(row.to)}`),
          },
          { id: 'days', header: t('columns.days'), cell: (row) => (row.halfDay ? t('halfDay') : t('days', { count: row.days })) },
          { id: 'reason', header: t('columns.reason'), cell: (row) => row.reason },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`status.${row.status}`)}</StatusIndicator>,
          },
          { id: 'comment', header: t('columns.comment'), cell: (row) => row.comment ?? NONE },
          {
            id: 'actions',
            header: t('columns.actions'),
            cell: (row) =>
              row.status === 'pending' && (
                <SpaceBetween direction="horizontal" size="s">
                  {canApprove && !row.isMine && action(row, 'approved')}
                  {canApprove && !row.isMine && action(row, 'rejected')}
                  {row.isMine && action(row, 'cancel')}
                </SpaceBetween>
              ),
          },
        ]}
      />
      <Modal
        visible={Boolean(pending)}
        header={pending ? t(`confirm.${pending.action}`, { name: pending.row.staffName }) : ''}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setPending(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setPending(null)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void confirm()}>
                {pending ? t(`action.${pending.action}`) : ''}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {pending?.action === 'cancel' ? (
          t('cancelBody')
        ) : (
          <FormField
            label={
              <>
                {t('columns.comment')} - <i>{t('optional')}</i>
              </>
            }
            description={t('commentHint')}
          >
            <Textarea value={comment} rows={3} onChange={({ detail }) => setComment(detail.value)} />
          </FormField>
        )}
      </Modal>
    </>
  );
}

export function LeaveForm() {
  const t = useTranslations('hr.leave');
  const router = useRouter();
  const [values, setValues] = useState({ leaveTypeCode: '', from: '', to: '', reason: '' });
  const [halfDay, setHalfDay] = useState(false);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = error?.fieldErrors ?? {};
  const typeOptions = TYPES.map((value) => ({ value, label: t(`type.${value}`) }));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await applyLeave({ ...values, to: halfDay ? values.from : values.to, halfDay });
    if (result.ok) return router.push(`${LIST}?applied=1`);
    setError(result.error);
    setBusy(false);
  }

  const dateField = (field: 'from' | 'to') => (
    <FormField label={t(`form.${field}`)} errorText={errors[field]} constraintText={t('form.dateHint')}>
      <DatePicker
        value={values[field]}
        placeholder="YYYY/MM/DD"
        onChange={({ detail }) => setValues({ ...values, [field]: detail.value })}
      />
    </FormField>
  );

  return (
    <ContentLayout header={<Header variant="h1">{t('form.title')}</Header>}>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Form
          errorText={error?.message}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button formAction="none" onClick={() => router.push(LIST)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy}>
                {t('form.submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <Container>
            <SpaceBetween size="l">
              <FormField label={t('columns.type')} errorText={errors.leaveTypeCode}>
                <Select
                  placeholder={t('form.typePlaceholder')}
                  selectedOption={typeOptions.find((option) => option.value === values.leaveTypeCode) ?? null}
                  options={typeOptions}
                  onChange={({ detail }) => setValues({ ...values, leaveTypeCode: detail.selectedOption.value ?? '' })}
                />
              </FormField>
              {dateField('from')}
              <FormField errorText={errors.halfDay}>
                <Checkbox checked={halfDay} onChange={({ detail }) => setHalfDay(detail.checked)}>
                  {t('form.halfDay')}
                </Checkbox>
              </FormField>
              {!halfDay && dateField('to')}
              <FormField label={t('columns.reason')} errorText={errors.reason}>
                <Textarea
                  value={values.reason}
                  rows={3}
                  onChange={({ detail }) => setValues({ ...values, reason: detail.value })}
                />
              </FormField>
            </SpaceBetween>
          </Container>
        </Form>
      </form>
    </ContentLayout>
  );
}
