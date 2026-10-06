'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Results } from '@/features/exams/Results';
import { PayOnlineButton } from '@/features/fees/OnlinePayment';
import { AttachmentLinks } from '@/features/homework/Attachments';
import { TemporaryPassword } from '@/features/users/Users';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { createPortalAccount } from '@/server/modules/portal/actions';
import type { PortalAccountRow, PortalHome as Home } from '@/server/modules/portal/service';

const NONE = '—';
const date = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function PortalHome({
  home,
  title,
  welcome,
  canPay,
}: {
  home: Home;
  title: string;
  welcome: string;
  canPay: boolean;
}) {
  const t = useTranslations('portal');
  const tInvoice = useTranslations('fees.invoices');
  const tEvent = useTranslations('calendar.events.type');
  const router = useRouter();
  const pathname = usePathname();
  const { selected, attendance, fees } = home;
  const childOptions = home.children.map(({ id, name, classSection }) => ({
    value: id,
    label: name,
    ...(classSection && { description: classSection }),
  }));
  const open = fees.invoices.filter((invoice) => invoice.balanceMinor > 0 && invoice.status !== 'void');

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={welcome}
          actions={
            home.children.length > 1 && (
              <Select
                ariaLabel={t('child')}
                selectedOption={childOptions.find((option) => option.value === selected.id) ?? null}
                options={childOptions}
                onChange={({ detail }) => router.replace(`${pathname}?student=${detail.selectedOption.value ?? ''}`)}
              />
            )
          }
        >
          {title}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container
          header={
            <Header
              variant="h2"
              description={t('admissionNo', { admissionNo: selected.admissionNo, classSection: selected.classSection ?? NONE })}
            >
              {selected.name}
            </Header>
          }
        >
          <ColumnLayout columns={3} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">{t('attendance.label')}</Box>
              <Box variant="awsui-value-large">{attendance.percent === null ? NONE : `${attendance.percent}%`}</Box>
              <Box color="text-body-secondary">
                {t('attendance.detail', { present: attendance.present, absent: attendance.absent })}
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('fees.label')}</Box>
              <Box variant="awsui-value-large">{formatMoney(fees.dueMinor)}</Box>
              {fees.dueMinor > 0 ? (
                <StatusIndicator type="warning">{t('fees.open', { count: open.length })}</StatusIndicator>
              ) : (
                <StatusIndicator type="success">{t('fees.clear')}</StatusIndicator>
              )}
            </div>
            <div>
              <Box variant="awsui-key-label">{t('homework.label')}</Box>
              <Box variant="awsui-value-large">{home.homework.length}</Box>
              <Box color="text-body-secondary">{t('homework.detail')}</Box>
            </div>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2">{t('today.title')}</Header>}>
          {home.periods.length === 0 ? (
            <EmptyState icon="timetable" heading={t('today.empty.heading')} body={t('today.empty.body')} />
          ) : (
            <ColumnLayout columns={4} variant="text-grid">
              {home.periods.map((period) => (
                <div key={period.number}>
                  <Box variant="awsui-key-label">{t('today.period', { number: period.number, time: period.time })}</Box>
                  <Box fontWeight="bold">{period.subject}</Box>
                  <Box color="text-body-secondary">{period.teacher}</Box>
                </div>
              ))}
            </ColumnLayout>
          )}
        </Container>

        <Table
          variant="container"
          trackBy="id"
          items={home.homework}
          header={<Header variant="h2">{t('homework.title')}</Header>}
          empty={<EmptyState icon="homework" heading={t('homework.empty.heading')} body={t('homework.empty.body')} />}
          columnDefinitions={[
            {
              id: 'title',
              header: t('homework.columns.title'),
              isRowHeader: true,
              cell: (item) => (
                <>
                  <Box fontWeight="bold">{item.title}</Box>
                  {item.instructions && <Box color="text-body-secondary">{item.instructions}</Box>}
                  <AttachmentLinks homeworkId={item.id} files={item.attachments} />
                </>
              ),
            },
            { id: 'subject', header: t('homework.columns.subject'), cell: (item) => item.subject },
            { id: 'dueOn', header: t('homework.columns.dueOn'), cell: (item) => day(item.dueOn) },
          ]}
        />

        <Table
          variant="container"
          trackBy="id"
          items={open}
          header={
            <Header
              variant="h2"
              actions={
                canPay &&
                open.length > 0 && <PayOnlineButton studentId={selected.id} invoiceIds={open.map(({ id }) => id)} />
              }
            >
              {t('fees.title')}
            </Header>
          }
          empty={<EmptyState icon="fees" heading={t('fees.empty.heading')} body={t('fees.empty.body')} />}
          columnDefinitions={[
            { id: 'installment', header: t('fees.installment'), cell: (invoice) => invoice.installment, isRowHeader: true },
            { id: 'dueDate', header: tInvoice('columns.dueDate'), cell: (invoice) => day(invoice.dueDate) },
            { id: 'balance', header: tInvoice('columns.balance'), cell: (invoice) => formatMoney(invoice.balanceMinor) },
          ]}
        />

        {home.reportCardId && (
          <Alert
            type="info"
            action={
              <Button
                href={`/report-cards/${home.reportCardId}`}
                onFollow={(event) => {
                  event.preventDefault();
                  router.push(`/report-cards/${home.reportCardId}`);
                }}
              >
                {t('reportCard.open')}
              </Button>
            }
          >
            {t('reportCard.ready', { name: selected.name })}
          </Alert>
        )}
        {home.results.length > 0 && <Results results={home.results} />}

        <Container header={<Header variant="h2">{t('upcoming.title')}</Header>}>
          {home.upcoming.length === 0 ? (
            <EmptyState icon="event" heading={t('upcoming.empty.heading')} body={t('upcoming.empty.body')} />
          ) : (
            <SpaceBetween size="s">
              {home.upcoming.map((item) => (
                <div key={`${item.id}-${item.start}-${item.title}`}>
                  <Box fontWeight="bold">{item.title}</Box>
                  <Box color="text-body-secondary">
                    {item.start === item.end ? day(item.start) : `${day(item.start)} – ${day(item.end)}`} ·{' '}
                    {tEvent(item.type)}
                  </Box>
                </div>
              ))}
            </SpaceBetween>
          )}
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function PortalAccounts({ studentId, accounts }: { studentId: string; accounts: PortalAccountRow[] }) {
  const t = useTranslations('portal.accounts');
  const router = useRouter();
  const [target, setTarget] = useState<PortalAccountRow | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  async function create() {
    if (!target) return;
    setBusy(true);
    setError(null);
    const result = await createPortalAccount({
      studentId,
      ...(target.guardianId && { guardianId: target.guardianId }),
      email,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error.fieldErrors?.email ?? result.error.message);
    setCreated(result.data);
    setTarget(null);
    router.refresh();
  }

  return (
    <SpaceBetween size="l">
      {created && <TemporaryPassword {...created} />}
      <Table
        trackBy={(row) => row.guardianId ?? 'student'}
        items={accounts}
        header={<Header variant="h2" description={t('description')}>{t('title')}</Header>}
        columnDefinitions={[
          { id: 'name', header: t('name'), cell: (row) => row.name, isRowHeader: true },
          { id: 'kind', header: t('kind'), cell: (row) => t(row.guardianId ? 'parent' : 'student') },
          {
            id: 'account',
            header: t('account'),
            cell: (row) =>
              row.accountEmail ? (
                <StatusIndicator type="success">{row.accountEmail}</StatusIndicator>
              ) : (
                <StatusIndicator type="stopped">{t('none')}</StatusIndicator>
              ),
          },
          {
            id: 'actions',
            header: t('actions'),
            cell: (row) =>
              !row.accountEmail && (
                <Button
                  variant="inline-link"
                  ariaLabel={t('createLabel', { name: row.name })}
                  onClick={() => {
                    setEmail(row.suggestedEmail);
                    setError(null);
                    setTarget(row);
                  }}
                >
                  {t('create')}
                </Button>
              ),
          },
        ]}
      />
      <Modal
        visible={Boolean(target)}
        header={t('createTitle', { name: target?.name ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setTarget(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setTarget(null)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void create()}>
                {t('create')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Alert type="info">{t('createBody')}</Alert>
          <FormField label={t('email')} constraintText={t('emailHint')} errorText={error}>
            <Input
              type="email"
              inputMode="email"
              value={email}
              autoComplete={false}
              onChange={({ detail }) => setEmail(detail.value)}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}
