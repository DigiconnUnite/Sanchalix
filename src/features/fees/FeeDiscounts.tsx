'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import type { ActionResult } from '@/lib/appError';
import {
  decideStudentDiscount,
  requestStudentDiscount,
  saveAutomaticDiscounts,
  saveLateFeeRule,
  withdrawStudentDiscount,
} from '@/server/modules/fees/actions';
import type { DiscountRules } from '@/server/modules/fees/discounts';

type Row = DiscountRules['students'][number];
type Feedback = { type: 'success' | 'error'; text: string };
type Errors = Record<string, string>;
const STATUS_TYPE: Record<Row['status'], StatusIndicatorProps.Type> = {
  pending: 'pending',
  approved: 'success',
  rejected: 'stopped',
  withdrawn: 'stopped',
};
const BLANK = { admissionNo: '', name: '', type: 'percent', value: '', reason: '' };

export function FeeDiscounts({ rules, canEdit, canApprove }: { rules: DiscountRules; canEdit: boolean; canApprove: boolean }) {
  const t = useTranslations('fees.discounts');
  const router = useRouter();
  const [automatic, setAutomatic] = useState({
    siblingPercent: String(rules.siblingPercent),
    staffWardPercent: String(rules.staffWardPercent),
  });
  const [lateFee, setLateFee] = useState({
    amountMinor: String(rules.lateFee.amountMinor / 100),
    graceDays: String(rules.lateFee.graceDays),
  });
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<Row | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const typeOptions = (['percent', 'fixed'] as const).map((value) => ({ value, label: t(`students.form.${value}`) }));

  async function run<T>(key: string, action: () => Promise<ActionResult<T>>, done: (data: T) => string) {
    setBusy(key);
    setErrors({});
    setFeedback(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      if (result.error.fieldErrors) return setErrors(result.error.fieldErrors);
      return setFeedback({ type: 'error', text: result.error.message });
    }
    setDraft(null);
    setWithdrawing(null);
    setFeedback({ type: 'success', text: done(result.data) });
    router.refresh();
  }

  const number = (
    label: string,
    hint: string,
    value: string,
    error: string | undefined,
    onChange: (value: string) => void,
    inputMode: 'numeric' | 'decimal' = 'numeric',
  ) => (
    <FormField label={label} constraintText={hint} errorText={error}>
      <Input
        value={value}
        inputMode={inputMode}
        autoComplete={false}
        readOnly={!canEdit}
        onChange={({ detail }) => onChange(detail.value)}
      />
    </FormField>
  );
  const save = (key: string, onClick: () => void) =>
    canEdit && (
      <Button loading={busy === key} onClick={onClick}>
        {t('save')}
      </Button>
    );
  const decide = (row: Row, decision: 'approved' | 'rejected') => (
    <Button
      variant="inline-link"
      loading={busy === `${decision}:${row.id}`}
      ariaLabel={t(decision === 'approved' ? 'students.approveLabel' : 'students.rejectLabel', {
        name: row.name,
        student: row.student,
      })}
      onClick={() =>
        void run(
          `${decision}:${row.id}`,
          () => decideStudentDiscount({ id: row.id, decision }),
          (data) =>
            data.decision === 'approved'
              ? t('students.approved', { name: data.name, count: data.invoices })
              : t('students.rejected', { name: data.name }),
        )
      }
    >
      {t(decision === 'approved' ? 'students.approve' : 'students.reject')}
    </Button>
  );

  return (
    <SpaceBetween size="l">
      {feedback && (
        <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}
      {!canEdit && <Alert type="info">{t('readOnly')}</Alert>}
      <Container
        header={
          <Header
            variant="h2"
            description={t('automatic.description')}
            actions={save('automatic', () =>
              void run('automatic', () => saveAutomaticDiscounts(automatic), () => t('automatic.saved')),
            )}
          >
            {t('automatic.title')}
          </Header>
        }
      >
        <ColumnLayout columns={2}>
          {number(t('automatic.sibling'), t('automatic.siblingHint'), automatic.siblingPercent, errors.siblingPercent, (value) =>
            setAutomatic({ ...automatic, siblingPercent: value }),
          )}
          {number(
            t('automatic.staffWard'),
            t('automatic.staffWardHint'),
            automatic.staffWardPercent,
            errors.staffWardPercent,
            (value) => setAutomatic({ ...automatic, staffWardPercent: value }),
          )}
        </ColumnLayout>
      </Container>
      <Container
        header={
          <Header
            variant="h2"
            description={t('lateFee.description')}
            actions={save('lateFee', () => void run('lateFee', () => saveLateFeeRule(lateFee), () => t('lateFee.saved')))}
          >
            {t('lateFee.title')}
          </Header>
        }
      >
        <ColumnLayout columns={2}>
          {number(
            t('lateFee.amount'),
            t('lateFee.amountHint'),
            lateFee.amountMinor,
            errors.amountMinor,
            (value) => setLateFee({ ...lateFee, amountMinor: value }),
            'decimal',
          )}
          {number(t('lateFee.graceDays'), t('lateFee.graceDaysHint'), lateFee.graceDays, errors.graceDays, (value) =>
            setLateFee({ ...lateFee, graceDays: value }),
          )}
        </ColumnLayout>
      </Container>
      <Table
        variant="container"
        trackBy="id"
        items={rules.students}
        header={
          <Header
            variant="h2"
            counter={`(${rules.students.length})`}
            description={t('students.description')}
            actions={
              canEdit && (
                <Button
                  variant="primary"
                  iconSvg={svg('concession')}
                  onClick={() => {
                    setErrors({});
                    setDraft(BLANK);
                  }}
                >
                  {t('students.add')}
                </Button>
              )
            }
          >
            {t('students.title')}
          </Header>
        }
        empty={<EmptyState icon="concession" heading={t('students.empty.heading')} body={t('students.empty.body')} />}
        columnDefinitions={[
          {
            id: 'student',
            header: t('students.columns.student'),
            cell: (row) => `${row.student} (${row.admissionNo})`,
            isRowHeader: true,
          },
          { id: 'name', header: t('students.columns.name'), cell: (row) => row.name },
          {
            id: 'value',
            header: t('students.columns.value'),
            cell: (row) =>
              row.type === 'percent'
                ? t('students.percentOff', { value: row.value })
                : t('students.amountOff', { amount: formatMoney(row.value) }),
          },
          { id: 'reason', header: t('students.columns.reason'), cell: (row) => row.reason },
          {
            id: 'status',
            header: t('students.columns.status'),
            cell: (row) => <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`students.status.${row.status}`)}</StatusIndicator>,
          },
          ...(canApprove
            ? [
                {
                  id: 'actions',
                  header: t('students.columns.actions'),
                  cell: (row: Row) =>
                    row.status === 'pending' ? (
                      <SpaceBetween direction="horizontal" size="s">
                        {decide(row, 'approved')}
                        {decide(row, 'rejected')}
                      </SpaceBetween>
                    ) : (
                      row.status === 'approved' && (
                        <Button
                          variant="inline-link"
                          ariaLabel={t('students.withdrawLabel', { name: row.name, student: row.student })}
                          onClick={() => setWithdrawing(row)}
                        >
                          {t('students.withdraw')}
                        </Button>
                      )
                    ),
                },
              ]
            : []),
        ]}
      />
      <Modal
        visible={withdrawing !== null}
        header={t('students.withdrawTitle', { name: withdrawing?.name ?? '', student: withdrawing?.student ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setWithdrawing(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setWithdrawing(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                loading={busy === 'withdraw'}
                onClick={() =>
                  withdrawing &&
                  void run(
                    'withdraw',
                    () => withdrawStudentDiscount(withdrawing.id),
                    (data) => t('students.withdrawn', { name: data.name, count: data.invoices }),
                  )
                }
              >
                {t('students.withdraw')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('students.withdrawBody')}
      </Modal>
      <Modal
        visible={draft !== null}
        header={t('students.add')}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setDraft(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDraft(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                loading={busy === 'request'}
                onClick={() =>
                  draft &&
                  void run('request', () => requestStudentDiscount(draft), (data) => t('students.requested', { student: data.student }))
                }
              >
                {t('students.form.submit')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {draft && (
          <SpaceBetween size="m">
            {feedback?.type === 'error' && <Alert type="error">{feedback.text}</Alert>}
            <FormField
              label={t('students.form.admissionNo')}
              constraintText={t('students.form.admissionNoHint')}
              errorText={errors.admissionNo}
            >
              <Input
                value={draft.admissionNo}
                autoComplete={false}
                onChange={({ detail }) => setDraft({ ...draft, admissionNo: detail.value })}
              />
            </FormField>
            <FormField label={t('students.form.name')} constraintText={t('students.form.nameHint')} errorText={errors.name}>
              <Input value={draft.name} autoComplete={false} onChange={({ detail }) => setDraft({ ...draft, name: detail.value })} />
            </FormField>
            <FormField label={t('students.form.type')} errorText={errors.type}>
              <Select
                selectedOption={typeOptions.find((option) => option.value === draft.type) ?? null}
                options={typeOptions}
                onChange={({ detail }) => setDraft({ ...draft, type: detail.selectedOption.value ?? 'percent', value: '' })}
              />
            </FormField>
            <FormField
              label={t(draft.type === 'percent' ? 'students.form.valuePercent' : 'students.form.valueFixed')}
              errorText={errors.value}
            >
              <Input
                value={draft.value}
                inputMode={draft.type === 'percent' ? 'numeric' : 'decimal'}
                autoComplete={false}
                onChange={({ detail }) => setDraft({ ...draft, value: detail.value })}
              />
            </FormField>
            <FormField label={t('students.form.reason')} constraintText={t('students.form.reasonHint')} errorText={errors.reason}>
              <Textarea value={draft.reason} rows={3} onChange={({ detail }) => setDraft({ ...draft, reason: detail.value })} />
            </FormField>
          </SpaceBetween>
        )}
      </Modal>
    </SpaceBetween>
  );
}
