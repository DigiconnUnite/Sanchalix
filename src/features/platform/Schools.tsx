'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
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
import { AppLink } from '@/components/AppLink';
import { useCrumb } from '@/components/Crumb';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { TemporaryPassword } from '@/features/users/Users';
import { usePathname, useRouter } from '@/i18n/navigation';
import { createSchool, resetSchoolAdminPassword, setSchoolStatus } from '@/server/modules/platform/actions';
import type { SchoolDetail, SchoolRow } from '@/server/modules/platform/service';

const LIST = '/platform/schools';
const NEW = `${LIST}/new`;
const BOARDS = ['CBSE', 'ICSE', 'STATE', 'IB', 'IGCSE', 'OTHER'];
const PLANS = ['starter', 'growth', 'enterprise'];
const STATUS_TYPE: Record<SchoolRow['status'], StatusIndicatorProps.Type> = {
  onboarding: 'pending',
  active: 'success',
  suspended: 'stopped',
};
type Data = { rows: SchoolRow[]; page: number; nextCursor: string | null; prevCursor: string | null };
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function SchoolsTable({ data }: { data: Data | null }) {
  const t = useTranslations('platform.schools');
  const router = useRouter();
  const pathname = usePathname();
  const page = data?.page ?? 1;

  return (
    <Table
      variant="container"
      stickyHeader
      enableKeyboardNavigation
      trackBy="id"
      items={data?.rows ?? []}
      loading={!data}
      loadingText={t('loading')}
      header={
        <Header
          variant="h2"
          counter={data ? `(${data.rows.length}${data.nextCursor ? '+' : ''})` : undefined}
          description={t('description')}
          actions={
            <Button
              variant="primary"
              iconSvg={svg('add')}
              href={NEW}
              onFollow={(event) => {
                event.preventDefault();
                router.push(NEW);
              }}
            >
              {t('add')}
            </Button>
          }
        >
          {t('title')}
        </Header>
      }
      pagination={
        <Pagination
          currentPageIndex={page}
          pagesCount={data?.nextCursor ? page + 1 : page}
          openEnd={Boolean(data?.nextCursor)}
          disabled={!data}
          onChange={({ detail }) => {
            if (!data) return;
            const cursor = detail.currentPageIndex > page ? data.nextCursor : data.prevCursor;
            router.replace(detail.currentPageIndex === 1 || !cursor ? pathname : `${pathname}?cursor=${cursor}`);
          }}
        />
      }
      empty={<EmptyState icon="school" heading={t('empty.heading')} body={t('empty.body')} />}
      columnDefinitions={[
        {
          id: 'name',
          header: t('columns.name'),
          cell: (row) => <AppLink href={`${LIST}/${row.id}`}>{row.name}</AppLink>,
          isRowHeader: true,
        },
        { id: 'code', header: t('columns.code'), cell: (row) => row.code },
        { id: 'board', header: t('columns.board'), cell: (row) => row.board },
        { id: 'city', header: t('columns.city'), cell: (row) => row.city },
        {
          id: 'status',
          header: t('columns.status'),
          cell: (row) => <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`status.${row.status}`)}</StatusIndicator>,
        },
        { id: 'students', header: t('columns.students'), cell: (row) => row.students },
        { id: 'created', header: t('columns.created'), cell: (row) => date.format(new Date(row.createdAt)) },
      ]}
    />
  );
}

const BLANK = {
  name: '',
  code: '',
  board: '',
  plan: '',
  address: { line1: '', city: '', state: '', pincode: '' },
  admin: { name: '', email: '' },
};

export function SchoolForm() {
  const t = useTranslations('platform.form');
  const tSchools = useTranslations('platform.schools');
  const router = useRouter();
  const [values, setValues] = useState(BLANK);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; adminEmail: string; password: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = error?.fieldErrors ?? {};
  const options = (values: string[], label: (value: string) => string) => values.map((value) => ({ value, label: label(value) }));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createSchool(values);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCreated(result.data);
  }

  const address = (key: keyof typeof BLANK.address, label: string, inputMode?: 'numeric') => (
    <FormField label={label} errorText={errors[`address.${key}`]}>
      <Input
        value={values.address[key]}
        {...(inputMode && { inputMode })}
        autoComplete={false}
        onChange={({ detail }) => setValues({ ...values, address: { ...values.address, [key]: detail.value } })}
      />
    </FormField>
  );

  if (created) {
    return (
      <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
        <SpaceBetween size="l">
          <Alert type="success" header={t('created', { name: created.name })}>
            {t('createdBody', { email: created.adminEmail })}
          </Alert>
          <TemporaryPassword name={created.adminEmail} password={created.password} />
          <Button variant="primary" onClick={() => router.push(`${LIST}/${created.id}`)}>
            {t('open')}
          </Button>
        </SpaceBetween>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout header={<Header variant="h1" description={t('description')}>{t('title')}</Header>}>
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
                {t('submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">{t('school')}</Header>}>
              <SpaceBetween size="l">
                <FormField label={t('name')} errorText={errors.name}>
                  <Input value={values.name} autoComplete={false} onChange={({ detail }) => setValues({ ...values, name: detail.value })} />
                </FormField>
                <ColumnLayout columns={3}>
                  <FormField label={t('code')} constraintText={t('codeHint')} errorText={errors.code}>
                    <Input
                      value={values.code}
                      autoComplete={false}
                      onChange={({ detail }) => setValues({ ...values, code: detail.value.toUpperCase() })}
                    />
                  </FormField>
                  <FormField label={t('board')} errorText={errors.board}>
                    <Select
                      placeholder={t('choose')}
                      selectedOption={values.board ? { value: values.board, label: values.board } : null}
                      options={options(BOARDS, (value) => value)}
                      onChange={({ detail }) => setValues({ ...values, board: detail.selectedOption.value ?? '' })}
                    />
                  </FormField>
                  <FormField label={t('plan')} errorText={errors.plan}>
                    <Select
                      placeholder={t('choose')}
                      selectedOption={values.plan ? { value: values.plan, label: tSchools(`plan.${values.plan}`) } : null}
                      options={options(PLANS, (value) => tSchools(`plan.${value}`))}
                      onChange={({ detail }) => setValues({ ...values, plan: detail.selectedOption.value ?? '' })}
                    />
                  </FormField>
                </ColumnLayout>
                {address('line1', t('line1'))}
                <ColumnLayout columns={3}>
                  {address('city', t('city'))}
                  {address('state', t('state'))}
                  {address('pincode', t('pincode'), 'numeric')}
                </ColumnLayout>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" description={t('adminHint')}>{t('admin')}</Header>}>
              <ColumnLayout columns={2}>
                <FormField label={t('adminName')} errorText={errors['admin.name']}>
                  <Input
                    value={values.admin.name}
                    autoComplete={false}
                    onChange={({ detail }) => setValues({ ...values, admin: { ...values.admin, name: detail.value } })}
                  />
                </FormField>
                <FormField label={t('adminEmail')} errorText={errors['admin.email']}>
                  <Input
                    type="email"
                    inputMode="email"
                    value={values.admin.email}
                    autoComplete={false}
                    onChange={({ detail }) => setValues({ ...values, admin: { ...values.admin, email: detail.value } })}
                  />
                </FormField>
              </ColumnLayout>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}

type Pending = { type: 'status'; status: 'active' | 'suspended' } | { type: 'password'; id: string; name: string };

export function SchoolView({ school }: { school: SchoolDetail }) {
  const t = useTranslations('platform.schools');
  const tView = useTranslations('platform.view');
  const router = useRouter();
  useCrumb(school.name);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; password: string } | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const suspending = pending?.type === 'status' && pending.status === 'suspended';

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setResult(null);
    setCredentials(null);
    if (pending.type === 'status') {
      const response = await setSchoolStatus({ id: school.id, status: pending.status, reason });
      setResult(
        response.ok
          ? { type: 'success', text: tView(`done.${pending.status}`, { name: school.name }) }
          : { type: 'error', text: response.error.message },
      );
    } else {
      const response = await resetSchoolAdminPassword({ schoolId: school.id, userId: pending.id });
      if (response.ok) setCredentials(response.data);
      else setResult({ type: 'error', text: response.error.message });
    }
    setBusy(false);
    setPending(null);
    setReason('');
    router.refresh();
  }

  const statusAction =
    school.status === 'onboarding' ? (
      <Button variant="primary" iconSvg={svg('success')} onClick={() => setPending({ type: 'status', status: 'active' })}>
        {tView('goLive')}
      </Button>
    ) : school.status === 'active' ? (
      <Button onClick={() => setPending({ type: 'status', status: 'suspended' })}>{tView('suspend')}</Button>
    ) : (
      <Button variant="primary" onClick={() => setPending({ type: 'status', status: 'active' })}>
        {tView('reactivate')}
      </Button>
    );

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={`${school.code} · ${school.board} · ${school.city}, ${school.state}`}
          actions={statusAction}
        >
          {school.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {result && (
          <Alert type={result.type} dismissible dismissAriaLabel={tView('dismiss')} onDismiss={() => setResult(null)}>
            {result.text}
          </Alert>
        )}
        {school.status === 'suspended' && <Alert type="warning">{tView('suspendedNote')}</Alert>}
        {school.status === 'onboarding' && <Alert type="info">{tView('onboardingNote')}</Alert>}
        {credentials && <TemporaryPassword name={credentials.name} password={credentials.password} />}
        <Container header={<Header variant="h2">{tView('overview')}</Header>}>
          <KeyValuePairs
            columns={4}
            items={[
              {
                label: t('columns.status'),
                value: <StatusIndicator type={STATUS_TYPE[school.status]}>{t(`status.${school.status}`)}</StatusIndicator>,
              },
              { label: tView('plan'), value: t(`plan.${school.plan}`) },
              { label: tView('organization'), value: school.organization },
              { label: t('columns.created'), value: date.format(new Date(school.createdAt)) },
              { label: t('columns.students'), value: school.students },
              { label: tView('staff'), value: school.staff },
              { label: tView('users'), value: school.users },
            ]}
          />
        </Container>
        <Table
          variant="container"
          trackBy="id"
          items={school.admins}
          header={<Header variant="h2" description={tView('adminsHint')}>{tView('admins')}</Header>}
          empty={<EmptyState icon="users" heading={tView('noAdmins.heading')} body={tView('noAdmins.body')} />}
          columnDefinitions={[
            { id: 'name', header: tView('adminName'), cell: (admin) => admin.name, isRowHeader: true },
            { id: 'email', header: tView('adminEmail'), cell: (admin) => admin.email ?? '—' },
            { id: 'status', header: t('columns.status'), cell: (admin) => tView(`adminStatus.${admin.status}`) },
            {
              id: 'last',
              header: tView('lastSignIn'),
              cell: (admin) => (admin.lastLoginAt ? dateTime.format(new Date(admin.lastLoginAt)) : tView('never')),
            },
            {
              id: 'actions',
              header: tView('actions'),
              cell: (admin) => (
                <Button
                  variant="inline-link"
                  ariaLabel={tView('passwordLabel', { name: admin.name })}
                  onClick={() => setPending({ type: 'password', id: admin.id, name: admin.name })}
                >
                  {tView('password')}
                </Button>
              ),
            },
          ]}
        />
      </SpaceBetween>
      <Modal
        visible={Boolean(pending)}
        header={
          pending?.type === 'password'
            ? tView('confirm.password', { name: pending.name })
            : pending
              ? tView(`confirm.${pending.status}`, { name: school.name })
              : ''
        }
        closeAriaLabel={tView('cancel')}
        onDismiss={() => setPending(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setPending(null)}>
                {tView('cancel')}
              </Button>
              <Button variant="primary" loading={busy} disabled={suspending && reason.trim().length < 3} onClick={() => void confirm()}>
                {pending?.type === 'password' ? tView('password') : pending ? tView(`action.${pending.status}`) : ''}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {pending?.type === 'password' ? (
          tView('confirmBody.password')
        ) : suspending ? (
          <SpaceBetween size="m">
            <Box>{tView('confirmBody.suspended')}</Box>
            <FormField label={tView('reason')} constraintText={tView('reasonHint')}>
              <Textarea value={reason} rows={3} onChange={({ detail }) => setReason(detail.value)} />
            </FormField>
          </SpaceBetween>
        ) : (
          pending && tView('confirmBody.active')
        )}
      </Modal>
    </ContentLayout>
  );
}
