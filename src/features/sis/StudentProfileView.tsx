'use client';

import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import Select from '@cloudscape-design/components/select';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Tabs from '@cloudscape-design/components/tabs';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { PortalAccounts } from '@/features/portal/Portal';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import type { PortalAccountRow } from '@/server/modules/portal/service';
import { transferStudent, withdrawStudent } from '@/server/modules/sis/actions';
import type { HistoryEntry, StudentAttendance, StudentFees, StudentProfile } from '@/server/modules/sis/schemas';
import { STATUS_TYPE } from './studentStatus';

const NONE = '—';

const MARK_TYPE: Record<string, StatusIndicatorProps.Type> = {
  present: 'success',
  absent: 'error',
  late: 'warning',
  half_day: 'warning',
  leave: 'info',
  holiday: 'stopped',
};

const INVOICE_TYPE: Record<string, StatusIndicatorProps.Type> = {
  draft: 'pending',
  issued: 'pending',
  partially_paid: 'in-progress',
  paid: 'success',
  overdue: 'error',
  void: 'stopped',
};

export function StudentProfileView({
  student,
  attendance,
  fees,
  history,
  tab,
  notice,
  canEdit,
  sections,
  accounts,
}: {
  sections: { id: string; name: string }[];
  accounts: PortalAccountRow[] | null;
  student: StudentProfile;
  attendance: StudentAttendance | null;
  fees: StudentFees | null;
  history: HistoryEntry[] | null;
  tab: string;
  notice: 'added' | 'updated' | 'withdrawn' | 'transferred' | null;
  canEdit: boolean;
}) {
  const t = useTranslations('sis.students');
  const tMark = useTranslations('attendance.take.status');
  const tInvoice = useTranslations('fees.invoices');
  const tPayment = useTranslations('fees.payments.columns');
  const tMethod = useTranslations('fees.counter.methods');
  const router = useRouter();
  const pathname = usePathname();
  const [withdrawing, setWithdrawing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [sectionId, setSectionId] = useState('');
  const sectionOptions = sections.map(({ id, name }) => ({ value: id, label: name }));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
  const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));
  const dateTime = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const actionLabel = (action: string) => {
    const key = `profile.history.actions.${action.replaceAll('.', '_')}`;
    return t.has(key) ? t(key) : action;
  };
  const label = (translate: { has: (key: string) => boolean; (key: string): string }, key: string) =>
    translate.has(key) ? translate(key) : key;
  const editHref = `${pathname}/edit`;

  async function withdraw() {
    setBusy(true);
    setError(null);
    const result = await withdrawStudent({ id: student.id, reason });
    setBusy(false);
    if (!result.ok) return setError(result.error.fieldErrors?.reason ?? result.error.message);
    setWithdrawing(false);
    router.replace(`${pathname}?notice=withdrawn`);
    router.refresh();
  }

  async function transfer() {
    setBusy(true);
    setError(null);
    const result = await transferStudent({ id: student.id, sectionId });
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    setMoving(false);
    router.replace(`${pathname}?notice=transferred`);
    router.refresh();
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={
            student.classSection &&
            t('profile.description', { classSection: student.classSection, rollNo: student.rollNo ?? NONE })
          }
          actions={
            canEdit && (
              <SpaceBetween direction="horizontal" size="xs">
                {student.status === 'active' && (
                  <ButtonDropdown
                    items={[
                      { id: 'transfer', text: t('profile.transfer.action'), iconSvg: svg('transfer') },
                      { id: 'withdraw', text: t('profile.withdraw.action') },
                    ]}
                    onItemClick={({ detail }) => {
                      setError(null);
                      if (detail.id === 'transfer') setMoving(true);
                      else setWithdrawing(true);
                    }}
                  >
                    {t('profile.actions')}
                  </ButtonDropdown>
                )}
                <Button
                  iconSvg={svg('edit')}
                  href={editHref}
                  onFollow={(event) => {
                    event.preventDefault();
                    router.push(editHref);
                  }}
                >
                  {t('profile.edit')}
                </Button>
              </SpaceBetween>
            )
          }
        >
          {student.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {notice && (
          <Alert
            type="success"
            dismissible
            dismissAriaLabel={t('profile.dismiss')}
            onDismiss={() => router.replace(pathname)}
          >
            {t(`profile.${notice}`, { name: student.name, admissionNo: student.admissionNo })}
          </Alert>
        )}
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => router.replace(`${pathname}?tab=${detail.activeTabId}`)}
          tabs={[
            {
              id: 'overview',
              label: t('profile.tabs.overview'),
              content: (
                <Container>
                  <KeyValuePairs
                    columns={3}
                    items={[
                      {
                        label: t('columns.admissionNo'),
                        value: (
                          <CopyToClipboard
                            variant="inline"
                            textToCopy={student.admissionNo}
                            copyButtonAriaLabel={t('profile.copyAdmissionNo', { admissionNo: student.admissionNo })}
                            copySuccessText={t('profile.copied')}
                            copyErrorText={t('profile.copyFailed')}
                          />
                        ),
                      },
                      {
                        label: t('columns.status'),
                        value: (
                          <StatusIndicator type={STATUS_TYPE[student.status]}>
                            {t(`status.${student.status}`)}
                          </StatusIndicator>
                        ),
                      },
                      { label: t('columns.classSection'), value: student.classSection ?? NONE },
                      { label: t('profile.dob'), value: day(student.dob) },
                      { label: t('profile.gender'), value: t(`gender.${student.gender}`) },
                      { label: t('profile.bloodGroup'), value: student.bloodGroup ?? NONE },
                      { label: t('profile.address'), value: student.address ?? NONE },
                    ]}
                  />
                </Container>
              ),
            },
            {
              id: 'guardians',
              label: t('profile.tabs.guardians'),
              content: (
                <Table
                  trackBy="id"
                  items={student.guardians}
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: t('columns.name'),
                      isRowHeader: true,
                      cell: (guardian) => (
                        <SpaceBetween direction="horizontal" size="xs">
                          {guardian.name}
                          {guardian.isPrimary && <Badge>{t('profile.primary')}</Badge>}
                        </SpaceBetween>
                      ),
                    },
                    { id: 'relation', header: t('profile.relation'), cell: (g) => t(`relation.${g.relation}`) },
                    {
                      id: 'phone',
                      header: t('columns.phone'),
                      cell: (g) => <Link href={`tel:${g.phone}`}>{formatPhone(g.phone)}</Link>,
                    },
                    { id: 'email', header: t('profile.email'), cell: (g) => g.email ?? NONE },
                  ]}
                />
              ),
            },
            ...(attendance
              ? [
                  {
                    id: 'attendance',
                    label: t('profile.tabs.attendance'),
                    content: (
                      <SpaceBetween size="l">
                        <Container header={<Header variant="h2">{t('profile.attendance.heading')}</Header>}>
                          <KeyValuePairs
                            columns={3}
                            items={[
                              {
                                label: t('profile.attendance.percent'),
                                value: attendance.percent === null ? NONE : `${attendance.percent}%`,
                              },
                              { label: t('profile.attendance.present'), value: attendance.present },
                              { label: t('profile.attendance.absent'), value: attendance.absent },
                            ]}
                          />
                        </Container>
                        {attendance.bySubject.length > 0 && (
                          <Table
                            variant="container"
                            trackBy="subject"
                            items={attendance.bySubject}
                            header={<Header variant="h2">{t('profile.attendance.bySubject')}</Header>}
                            columnDefinitions={[
                              { id: 'subject', header: t('profile.attendance.subject'), cell: (row) => row.subject, isRowHeader: true },
                              {
                                id: 'attended',
                                header: t('profile.attendance.periods'),
                                cell: (row) => t('profile.attendance.attended', { attended: row.attended, total: row.total }),
                              },
                              { id: 'percent', header: t('profile.attendance.percent'), cell: (row) => `${row.percent}%` },
                            ]}
                          />
                        )}
                        <Table
                          variant="container"
                          trackBy="date"
                          items={attendance.days}
                          header={<Header variant="h2">{t('profile.attendance.daily')}</Header>}
                          empty={
                            <EmptyState
                              icon="attendance"
                              heading={t('profile.attendance.emptyHeading')}
                              body={t('profile.attendance.emptyBody')}
                            />
                          }
                          columnDefinitions={[
                            {
                              id: 'date',
                              header: t('profile.attendance.date'),
                              isRowHeader: true,
                              cell: (entry) => day(entry.date),
                            },
                            {
                              id: 'status',
                              header: t('columns.status'),
                              cell: (entry) => (
                                <StatusIndicator type={MARK_TYPE[entry.status] ?? 'info'}>
                                  {label(tMark, entry.status)}
                                </StatusIndicator>
                              ),
                            },
                          ]}
                        />
                      </SpaceBetween>
                    ),
                  },
                ]
              : []),
            ...(fees
              ? [
                  {
                    id: 'fees',
                    label: t('profile.tabs.fees'),
                    content: (
                      <SpaceBetween size="l">
                        <Container>
                          <Box variant="awsui-key-label">{t('profile.fees.due')}</Box>
                          <Box variant="awsui-value-large">{formatMoney(fees.dueMinor)}</Box>
                        </Container>
                        <Table
                          variant="container"
                          trackBy="id"
                          items={fees.invoices}
                          header={<Header variant="h2">{t('profile.fees.invoices')}</Header>}
                          empty={
                            <EmptyState
                              icon="invoice"
                              heading={t('profile.fees.noInvoicesHeading')}
                              body={t('profile.fees.noInvoicesBody')}
                            />
                          }
                          columnDefinitions={[
                            {
                              id: 'invoiceNo',
                              header: tInvoice('columns.invoiceNo'),
                              isRowHeader: true,
                              cell: (invoice) => invoice.invoiceNo,
                            },
                            {
                              id: 'installment',
                              header: t('profile.fees.installment'),
                              cell: (invoice) => invoice.installment,
                            },
                            { id: 'dueDate', header: tInvoice('columns.dueDate'), cell: (invoice) => day(invoice.dueDate) },
                            {
                              id: 'total',
                              header: tInvoice('columns.total'),
                              cell: (invoice) => formatMoney(invoice.totalMinor),
                            },
                            {
                              id: 'balance',
                              header: tInvoice('columns.balance'),
                              cell: (invoice) => formatMoney(invoice.balanceMinor),
                            },
                            {
                              id: 'status',
                              header: t('columns.status'),
                              cell: (invoice) => (
                                <StatusIndicator type={INVOICE_TYPE[invoice.status] ?? 'info'}>
                                  {label(tInvoice, `status.${invoice.status}`)}
                                </StatusIndicator>
                              ),
                            },
                          ]}
                        />
                        <Table
                          variant="container"
                          trackBy="id"
                          items={fees.payments}
                          header={<Header variant="h2">{t('profile.fees.payments')}</Header>}
                          empty={
                            <EmptyState
                              icon="receipt"
                              heading={t('profile.fees.noPaymentsHeading')}
                              body={t('profile.fees.noPaymentsBody')}
                            />
                          }
                          columnDefinitions={[
                            {
                              id: 'receiptNo',
                              header: tPayment('receiptNo'),
                              isRowHeader: true,
                              cell: (payment) => (
                                <AppLink href={`/fees/payments/${payment.id}`}>{payment.receiptNo}</AppLink>
                              ),
                            },
                            {
                              id: 'date',
                              header: tPayment('date'),
                              cell: (payment) => dateTime.format(new Date(payment.collectedAt)),
                            },
                            { id: 'method', header: tPayment('method'), cell: (payment) => label(tMethod, payment.method) },
                            {
                              id: 'amount',
                              header: tPayment('amount'),
                              cell: (payment) => formatMoney(payment.amountMinor),
                            },
                          ]}
                        />
                      </SpaceBetween>
                    ),
                  },
                ]
              : []),
            ...(accounts
              ? [
                  {
                    id: 'portal',
                    label: t('profile.tabs.portal'),
                    content: <PortalAccounts studentId={student.id} accounts={accounts} />,
                  },
                ]
              : []),
            ...(history
              ? [
                  {
                    id: 'history',
                    label: t('profile.tabs.history'),
                    content: (
                      <Table
                        trackBy="id"
                        items={history}
                        empty={
                          <EmptyState
                            icon="auditLog"
                            heading={t('profile.history.emptyHeading')}
                            body={t('profile.history.emptyBody')}
                          />
                        }
                        columnDefinitions={[
                          {
                            id: 'at',
                            header: t('profile.history.when'),
                            cell: (entry) => dateTime.format(new Date(entry.at)),
                          },
                          { id: 'actor', header: t('profile.history.who'), cell: (entry) => entry.actor },
                          { id: 'action', header: t('profile.history.what'), cell: (entry) => actionLabel(entry.action) },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SpaceBetween>
      <Modal
        visible={moving}
        onDismiss={() => setMoving(false)}
        header={t('profile.transfer.title', { name: student.name })}
        closeAriaLabel={t('profile.withdraw.cancel')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setMoving(false)}>
                {t('profile.withdraw.cancel')}
              </Button>
              <Button variant="primary" loading={busy} disabled={!sectionId} onClick={() => void transfer()}>
                {t('profile.transfer.confirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>{t('profile.transfer.body')}</Box>
          <FormField label={t('profile.transfer.section')} errorText={moving ? error : null}>
            <Select
              placeholder={t('form.sectionPlaceholder')}
              selectedOption={sectionOptions.find((option) => option.value === sectionId) ?? null}
              options={sectionOptions}
              onChange={({ detail }) => setSectionId(detail.selectedOption.value ?? '')}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
      <Modal
        visible={withdrawing}
        onDismiss={() => setWithdrawing(false)}
        header={t('profile.withdraw.title', { name: student.name })}
        closeAriaLabel={t('profile.withdraw.cancel')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setWithdrawing(false)}>
                {t('profile.withdraw.cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void withdraw()}>
                {t('profile.withdraw.confirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>{t('profile.withdraw.body')}</Box>
          <FormField label={t('profile.withdraw.reason')} errorText={error}>
            <Textarea value={reason} rows={3} onChange={({ detail }) => setReason(detail.value)} />
          </FormField>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}
