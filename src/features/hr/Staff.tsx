'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Pagination from '@cloudscape-design/components/pagination';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { useCrumb } from '@/components/Crumb';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatPhone } from '@/lib/phone';
import { useIsMobile } from '@/lib/useIsMobile';
import { createStaff, updateStaff } from '@/server/modules/hr/actions';
import type { StaffMember, StaffProfile, StaffRow } from '@/server/modules/hr/schemas';

const LIST = '/staff';
const NEW = '/staff/new';
const PAGE_SIZES = [10, 25, 50, 100];
const TYPES = ['teaching', 'non_teaching'];
const STATUSES = ['active', 'on_leave', 'resigned', 'terminated'];
const STATUS_TYPE: Record<StaffRow['status'], StatusIndicatorProps.Type> = {
  active: 'success',
  on_leave: 'info',
  resigned: 'stopped',
  terminated: 'stopped',
};

type Data = { rows: StaffRow[]; page: number; nextCursor: string | null; prevCursor: string | null };

export function StaffTable({
  pageSize,
  canCreate,
  created,
  updated,
  data,
}: {
  pageSize: number;
  canCreate: boolean;
  created: string | null;
  updated: string | null;
  data: Data | null;
}) {
  const t = useTranslations('hr');
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params}`);
  };

  const rows = data?.rows ?? [];
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

  const fields: { id: string; header: string; content: (member: StaffRow) => ReactNode }[] = [
    {
      id: 'name',
      header: t('columns.name'),
      content: (member) => <AppLink href={`${LIST}/${member.id}`}>{member.name}</AppLink>,
    },
    { id: 'employeeNo', header: t('columns.employeeNo'), content: (member) => member.employeeNo },
    { id: 'designation', header: t('columns.designation'), content: (member) => member.designation },
    { id: 'type', header: t('columns.type'), content: (member) => t(`type.${member.type}`) },
    { id: 'phone', header: t('columns.phone'), content: (member) => formatPhone(member.phone) },
    {
      id: 'status',
      header: t('columns.status'),
      content: (member) => (
        <StatusIndicator type={STATUS_TYPE[member.status]}>{t(`status.${member.status}`)}</StatusIndicator>
      ),
    },
  ];

  const shared = {
    trackBy: 'id',
    items: rows,
    loading: !data,
    loadingText: t('loading'),
    stickyHeader: true,
    header: (
      <SpaceBetween size="m">
        <Header variant="h2" actions={canCreate && addButton(true)}>
          {t('title')}
        </Header>
        {(created ?? updated) && (
          <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => router.replace(pathname)}>
            {created ? t('created', { name: created }) : t('updated', { name: updated ?? '' })}
          </Alert>
        )}
      </SpaceBetween>
    ),
    pagination: (
      <Pagination
        currentPageIndex={page}
        pagesCount={data?.nextCursor ? page + 1 : page}
        openEnd={Boolean(data?.nextCursor)}
        disabled={!data}
        onChange={({ detail }) => {
          if (!data) return;
          // Cursors only step one page at a time, so any earlier page other than the first steps back by one.
          const target = detail.currentPageIndex;
          setParams({ cursor: target === 1 ? null : target > page ? data.nextCursor : data.prevCursor });
        }}
      />
    ),
    preferences: (
      <CollectionPreferences
        preferences={{ pageSize }}
        pageSizePreference={{
          options: PAGE_SIZES.map((value) => ({ value, label: t('pageSize', { count: value }) })),
        }}
        onConfirm={({ detail }) => setParams({ pageSize: String(detail.pageSize ?? pageSize), cursor: null })}
      />
    ),
    empty: (
      <EmptyState
        icon="staff"
        heading={t('empty.heading')}
        body={t('empty.body')}
        action={canCreate && addButton(false)}
      />
    ),
  };

  if (isMobile) {
    return (
      <Cards
        {...shared}
        variant="container"
        cardDefinition={{ header: (member) => fields[0]?.content(member), sections: fields.slice(1) }}
      />
    );
  }
  return (
    <Table
      {...shared}
      variant="container"
      resizableColumns
      enableKeyboardNavigation
      renderAriaLive={() => t('showing', { count: rows.length })}
      columnDefinitions={fields.map(({ id, header, content }) => ({
        id,
        header,
        cell: content,
        isRowHeader: id === 'name',
      }))}
    />
  );
}

const EMPTY = {
  name: '',
  designation: '',
  department: '',
  type: '',
  phone: '',
  email: '',
  joinedOn: '',
  status: 'active',
};
type Field = keyof typeof EMPTY;

export function StaffForm({ member }: { member?: StaffMember }) {
  const t = useTranslations('hr');
  useCrumb(member?.name);
  const router = useRouter();
  const [values, setValues] = useState(member ?? EMPTY);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = error?.fieldErrors ?? {};
  const change = (field: Field, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const typeOptions = TYPES.map((value) => ({ value, label: t(`type.${value}`) }));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = member ? await updateStaff(values) : await createStaff(values);
    if (result.ok) {
      return router.push(`${LIST}?${member ? 'updated' : 'created'}=${encodeURIComponent(result.data.name)}`);
    }
    setError(result.error);
    setBusy(false);
  }

  const optional = (label: string): ReactNode => (
    <>
      {label} - <i>{t('optional')}</i>
    </>
  );
  const text = (field: Field, label: ReactNode, props: Partial<InputProps> = {}, hint?: string) => (
    <FormField label={label} errorText={errors[field]} constraintText={hint}>
      <Input {...props} value={values[field]} onChange={({ detail }) => change(field, detail.value)} />
    </FormField>
  );

  return (
    <ContentLayout
      header={<Header variant="h1">{member ? t('form.editTitle', { name: member.name }) : t('form.title')}</Header>}
    >
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
                {member ? t('form.save') : t('add')}
              </Button>
            </SpaceBetween>
          }
        >
          <Container>
            <ColumnLayout columns={2}>
              {text('name', t('form.name'), { autoComplete: false })}
              {text('designation', t('form.designation'), { autoComplete: false }, t('form.designationHint'))}
              <FormField label={t('form.type')} errorText={errors.type}>
                <Select
                  selectedOption={typeOptions.find((option) => option.value === values.type) ?? null}
                  options={typeOptions}
                  onChange={({ detail }) => change('type', detail.selectedOption.value ?? '')}
                />
              </FormField>
              {text('department', optional(t('form.department')), { autoComplete: false })}
              {text('phone', t('form.phone'), { inputMode: 'tel', autoComplete: false }, t('form.phoneHint'))}
              {text('email', optional(t('form.email')), { type: 'email', inputMode: 'email', autoComplete: false })}
              <FormField label={t('form.joinedOn')} errorText={errors.joinedOn} constraintText={t('form.dateHint')}>
                <DatePicker
                  value={values.joinedOn}
                  placeholder="YYYY/MM/DD"
                  onChange={({ detail }) => change('joinedOn', detail.value)}
                />
              </FormField>
              {member && (
                <FormField label={t('columns.status')} errorText={errors.status}>
                  <Select
                    selectedOption={{ value: values.status, label: t(`status.${values.status}`) }}
                    options={STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
                    onChange={({ detail }) => change('status', detail.selectedOption.value ?? 'active')}
                  />
                </FormField>
              )}
            </ColumnLayout>
          </Container>
        </Form>
      </form>
    </ContentLayout>
  );
}

const NONE = '—';
const day = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

export function StaffProfileView({ member, canEdit }: { member: StaffProfile; canEdit: boolean }) {
  const t = useTranslations('hr');
  const tLeave = useTranslations('hr.leave');
  const router = useRouter();
  useCrumb(member.name);
  const editHref = `${LIST}/${member.id}/edit`;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={`${member.designation} · ${member.employeeNo}`}
          actions={
            canEdit && (
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
            )
          }
        >
          {member.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">{t('profile.details')}</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              {
                label: t('columns.status'),
                value: <StatusIndicator type={STATUS_TYPE[member.status]}>{t(`status.${member.status}`)}</StatusIndicator>,
              },
              { label: t('columns.type'), value: t(`type.${member.type}`) },
              { label: t('form.department'), value: member.department ?? NONE },
              { label: t('columns.phone'), value: formatPhone(member.phone) },
              { label: t('form.email'), value: member.email ?? NONE },
              { label: t('form.joinedOn'), value: day.format(new Date(`${member.joinedOn}T00:00:00Z`)) },
              {
                label: t('profile.account'),
                value: (
                  <StatusIndicator type={member.hasAccount ? 'success' : 'stopped'}>
                    {t(member.hasAccount ? 'profile.hasAccount' : 'profile.noAccount')}
                  </StatusIndicator>
                ),
              },
              { label: t('profile.classTeacherOf'), value: member.classTeacherOf.join(', ') || NONE },
            ]}
          />
        </Container>
        <Table
          variant="container"
          trackBy="subject"
          items={member.teaches}
          header={
            <Header variant="h2" counter={`(${member.teaches.length})`} description={t('profile.teachingHint')}>
              {t('profile.teaching')}
            </Header>
          }
          empty={
            <EmptyState icon="timetable" heading={t('profile.noTeaching.heading')} body={t('profile.noTeaching.body')} />
          }
          columnDefinitions={[
            { id: 'subject', header: t('profile.subject'), cell: (row) => row.subject, isRowHeader: true },
            { id: 'sections', header: t('profile.sections'), cell: (row) => row.sections },
            { id: 'periods', header: t('profile.periods'), cell: (row) => row.periods },
          ]}
        />
        <Container header={<Header variant="h2">{t('profile.leave')}</Header>}>
          <KeyValuePairs
            columns={3}
            items={member.leave.map((balance) => ({
              label: tLeave(`type.${balance.type}`),
              value: tLeave('balance', { left: balance.left, quota: balance.quota }),
            }))}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
