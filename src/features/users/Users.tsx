'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
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
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { createUser, resetUserPassword, setUserStatus } from '@/server/modules/users/actions';
import type { UserRow } from '@/server/modules/users/service';

const LIST = '/users';
const NEW = '/users/new';
const NONE = '—';
const ROLES = ['teacher', 'accountant', 'principal', 'school_admin', 'librarian', 'transport_manager'];
const STATUS_TYPE: Record<UserRow['status'], StatusIndicatorProps.Type> = {
  invited: 'pending',
  active: 'success',
  locked: 'warning',
  disabled: 'stopped',
};
type Data = { rows: UserRow[]; page: number; nextCursor: string | null; prevCursor: string | null };
type Pending = { row: UserRow; action: 'reset' | 'disable' | 'enable' };
type Credentials = { name: string; email?: string; password: string };
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

/** The one moment a temporary password is visible. It is not stored anywhere it can be read back. */
export function TemporaryPassword({ name, email, password }: Credentials) {
  const t = useTranslations('users.password');
  return (
    <Alert type="success" header={t('header', { name })}>
      <SpaceBetween size="s">
        <Box>{t('body')}</Box>
        <KeyValuePairs
          columns={2}
          items={[
            ...(email ? [{ label: t('email'), value: email }] : []),
            {
              label: t('password'),
              value: (
                <CopyToClipboard
                  variant="inline"
                  textToCopy={password}
                  copyButtonAriaLabel={t('copy')}
                  copySuccessText={t('copied')}
                  copyErrorText={t('copyFailed')}
                />
              ),
            },
          ]}
        />
      </SpaceBetween>
    </Alert>
  );
}

export function UsersTable({ data, canEdit }: { data: Data | null; canEdit: boolean }) {
  const t = useTranslations('users');
  const tRole = useTranslations('shell.roles');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const page = data?.page ?? 1;
  const addButton = (primary: boolean) => (
    <Button
      {...(primary && { variant: 'primary' as const })}
      href={NEW}
      onFollow={(event) => {
        event.preventDefault();
        router.push(NEW);
      }}
    >
      {t('add')}
    </Button>
  );

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setCredentials(null);
    setResult(null);
    const { row, action } = pending;
    if (action === 'reset') {
      const response = await resetUserPassword(row.id);
      if (response.ok) setCredentials(response.data);
      else setResult({ type: 'error', text: response.error.message });
    } else {
      const response = await setUserStatus({ id: row.id, status: action === 'disable' ? 'disabled' : 'active' });
      setResult(
        response.ok
          ? { type: 'success', text: t(`done.${action}`, { name: row.name }) }
          : { type: 'error', text: response.error.message },
      );
    }
    setBusy(false);
    setPending(null);
    router.refresh();
  }

  const action = (row: UserRow, kind: Pending['action']) => (
    <Button
      variant="inline-link"
      ariaLabel={t(`actionLabel.${kind}`, { name: row.name })}
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
            <Header variant="h1" description={t('description')} actions={canEdit && addButton(true)}>
              {t('title')}
            </Header>
            {credentials && <TemporaryPassword {...credentials} />}
            {result && (
              <Alert type={result.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setResult(null)}>
                {result.text}
              </Alert>
            )}
          </SpaceBetween>
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
        empty={<EmptyState icon="users" heading={t('empty.heading')} body={t('empty.body')} />}
        columnDefinitions={[
          { id: 'name', header: t('columns.name'), cell: (row) => row.name, isRowHeader: true },
          { id: 'email', header: t('columns.email'), cell: (row) => row.email ?? NONE },
          { id: 'role', header: t('columns.role'), cell: (row) => tRole(row.role) },
          { id: 'staff', header: t('columns.staff'), cell: (row) => row.staffName ?? NONE },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`status.${row.status}`)}</StatusIndicator>,
          },
          {
            id: 'lastLogin',
            header: t('columns.lastLogin'),
            cell: (row) => (row.lastLoginAt ? dateTime.format(new Date(row.lastLoginAt)) : t('never')),
          },
          ...(canEdit
            ? [
                {
                  id: 'actions',
                  header: t('columns.actions'),
                  cell: (row: UserRow) =>
                    !row.isSelf && (
                      <SpaceBetween direction="horizontal" size="s">
                        {row.status !== 'disabled' && action(row, 'reset')}
                        {action(row, row.status === 'disabled' ? 'enable' : 'disable')}
                      </SpaceBetween>
                    ),
                },
              ]
            : []),
        ]}
      />
      <Modal
        visible={Boolean(pending)}
        header={pending ? t(`confirm.${pending.action}`, { name: pending.row.name }) : ''}
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
        {pending ? t(`confirmBody.${pending.action}`) : ''}
      </Modal>
    </>
  );
}

type StaffOption = { id: string; name: string; label: string; email: string; teaching: boolean };

export function UserForm({ staff }: { staff: StaffOption[] }) {
  const t = useTranslations('users');
  const tRole = useTranslations('shell.roles');
  const router = useRouter();
  const [values, setValues] = useState({ name: '', email: '', role: '', staffId: '' });
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Credentials | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = error?.fieldErrors ?? {};
  const roleOptions = ROLES.map((value) => ({ value, label: tRole(value) }));
  const staffOptions = [
    { value: '', label: t('form.noStaff') },
    ...staff.map(({ id, label }) => ({ value: id, label })),
  ];

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  function chooseStaff(id: string) {
    const member = staff.find((candidate) => candidate.id === id);
    setValues((current) => ({
      ...current,
      staffId: id,
      ...(member && {
        name: current.name || member.name,
        email: current.email || member.email,
        role: current.role || (member.teaching ? 'teacher' : ''),
      }),
    }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createUser(values);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCreated(result.data);
  }

  if (created) {
    return (
      <ContentLayout header={<Header variant="h1">{t('form.title')}</Header>}>
        <SpaceBetween size="l">
          <TemporaryPassword {...created} />
          <Button variant="primary" onClick={() => router.push(LIST)}>
            {t('form.done')}
          </Button>
        </SpaceBetween>
      </ContentLayout>
    );
  }

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
              <FormField label={t('form.staff')} description={t('form.staffHint')} errorText={errors.staffId}>
                <Select
                  selectedOption={staffOptions.find((option) => option.value === values.staffId) ?? null}
                  options={staffOptions}
                  onChange={({ detail }) => chooseStaff(detail.selectedOption.value ?? '')}
                />
              </FormField>
              <FormField label={t('columns.name')} errorText={errors.name}>
                <Input
                  value={values.name}
                  autoComplete={false}
                  onChange={({ detail }) => setValues({ ...values, name: detail.value })}
                />
              </FormField>
              <FormField label={t('columns.email')} constraintText={t('form.emailHint')} errorText={errors.email}>
                <Input
                  type="email"
                  inputMode="email"
                  value={values.email}
                  autoComplete={false}
                  onChange={({ detail }) => setValues({ ...values, email: detail.value })}
                />
              </FormField>
              <FormField label={t('columns.role')} errorText={errors.role}>
                <Select
                  placeholder={t('form.rolePlaceholder')}
                  selectedOption={roleOptions.find((option) => option.value === values.role) ?? null}
                  options={roleOptions}
                  onChange={({ detail }) => setValues({ ...values, role: detail.selectedOption.value ?? '' })}
                />
              </FormField>
            </SpaceBetween>
          </Container>
        </Form>
      </form>
    </ContentLayout>
  );
}
