'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import Pagination from '@cloudscape-design/components/pagination';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { useCrumb } from '@/components/Crumb';
import { EmptyState } from '@/components/EmptyState';
import { StudentDocuments } from '@/features/sis/StudentDocuments';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatPhone } from '@/lib/phone';
import { acceptAdmission, createAdmission, moveAdmission } from '@/server/modules/admissions/actions';
import type { AdmissionDetail, AdmissionRow, AdmissionStatus } from '@/server/modules/admissions/schemas';

const LIST = '/admissions';
const FINAL = ['accepted', 'rejected', 'withdrawn'];
const NEW = '/admissions/new';
const NONE = '—';
const FILTERS = ['open', 'enquiry', 'applied', 'documents_pending', 'assessment', 'offered', 'accepted', 'rejected', 'withdrawn'];
const STATUS_TYPE: Record<AdmissionStatus, StatusIndicatorProps.Type> = {
  enquiry: 'pending',
  applied: 'pending',
  documents_pending: 'warning',
  assessment: 'in-progress',
  offered: 'info',
  accepted: 'success',
  rejected: 'stopped',
  withdrawn: 'stopped',
};
type Option = { id: string; name: string };
type Failure = { message: string; fieldErrors?: Record<string, string> };
type Data = { rows: AdmissionRow[]; page: number; nextCursor: string | null; prevCursor: string | null };
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

export function AdmissionsTable({
  status,
  canEdit,
  created,
  data,
}: {
  status: string;
  canEdit: boolean;
  created: string | null;
  data: Data | null;
}) {
  const t = useTranslations('admissions');
  const router = useRouter();
  const pathname = usePathname();
  const page = data?.page ?? 1;
  const filterOptions = FILTERS.map((value) => ({ value, label: t(`filter.${value}`) }));
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
  const go = (cursor: string | null, next = status) => {
    const params = new URLSearchParams({ ...(next !== 'open' && { status: next }), ...(cursor && { cursor }) });
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  };

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
        <SpaceBetween size="m">
          <Header variant="h2" actions={canEdit && addButton(true)}>
            {t('title')}
          </Header>
          {created && (
            <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => go(null)}>
              {t('created', { applicationNo: created })}
            </Alert>
          )}
        </SpaceBetween>
      }
      filter={
        <Select
          inlineLabelText={t('filter.label')}
          selectedOption={filterOptions.find((option) => option.value === status) ?? null}
          options={filterOptions}
          onChange={({ detail }) => go(null, detail.selectedOption.value ?? 'open')}
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
        status === 'open' ? (
          <EmptyState
            icon="admissions"
            heading={t('empty.heading')}
            body={t('empty.body')}
            action={canEdit && addButton(false)}
          />
        ) : (
          <EmptyState
            icon="search"
            heading={t('noMatches.heading')}
            body={t('noMatches.body')}
            action={<Button onClick={() => go(null, 'open')}>{t('noMatches.clear')}</Button>}
          />
        )
      }
      columnDefinitions={[
        {
          id: 'applicationNo',
          header: t('columns.applicationNo'),
          isRowHeader: true,
          cell: (row) => <AppLink href={`${LIST}/${row.id}`}>{row.applicationNo}</AppLink>,
        },
        { id: 'name', header: t('columns.name'), cell: (row) => row.name },
        { id: 'classSought', header: t('columns.classSought'), cell: (row) => row.classSought },
        { id: 'guardian', header: t('columns.guardian'), cell: (row) => row.guardianName },
        { id: 'phone', header: t('columns.phone'), cell: (row) => formatPhone(row.guardianPhone) },
        {
          id: 'status',
          header: t('columns.status'),
          cell: (row) => <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`status.${row.status}`)}</StatusIndicator>,
        },
        { id: 'appliedOn', header: t('columns.appliedOn'), cell: (row) => date.format(new Date(row.appliedOn)) },
      ]}
    />
  );
}

const EMPTY = {
  firstName: '',
  lastName: '',
  dob: '',
  gender: '',
  classId: '',
  previousSchool: '',
  source: 'walk_in',
  guardianName: '',
  relation: '',
  phone: '',
  email: '',
};
type Field = keyof typeof EMPTY;
const GENDERS = ['female', 'male', 'other', 'undisclosed'];
const RELATIONS = ['mother', 'father', 'guardian', 'other'];
const SOURCES = ['walk_in', 'website', 'referral', 'campaign'];

export function AdmissionForm({ classes }: { classes: Option[] }) {
  const t = useTranslations('admissions');
  const tStudent = useTranslations('sis.students');
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = error?.fieldErrors ?? {};
  const change = (field: Field, value: string) => setValues((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const { guardianName, relation, phone, email, ...applicant } = values;
    const result = await createAdmission({ ...applicant, guardian: { name: guardianName, relation, phone, email } });
    if (result.ok) return router.push(`${LIST}?created=${encodeURIComponent(result.data.applicationNo)}`);
    setError(result.error);
    setBusy(false);
  }

  const optional = (label: string): ReactNode => (
    <>
      {label} - <i>{tStudent('form.optional')}</i>
    </>
  );
  const text = (field: Field, path: string, label: ReactNode, props: Partial<InputProps> = {}, hint?: string) => (
    <FormField label={label} errorText={errors[path]} constraintText={hint}>
      <Input {...props} value={values[field]} onChange={({ detail }) => change(field, detail.value)} />
    </FormField>
  );
  const select = (field: Field, path: string, label: string, options: { value: string; label: string }[]) => (
    <FormField label={label} errorText={errors[path]}>
      <Select
        selectedOption={options.find((option) => option.value === values[field]) ?? null}
        options={options}
        onChange={({ detail }) => change(field, detail.selectedOption.value ?? '')}
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
              <Button variant="primary" loading={busy} disabled={classes.length === 0}>
                {t('form.submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {classes.length === 0 && <Alert type="warning">{t('form.noClasses')}</Alert>}
            <Container header={<Header variant="h2">{t('form.applicant')}</Header>}>
              <ColumnLayout columns={2}>
                {text('firstName', 'firstName', tStudent('form.firstName'), { autoComplete: false })}
                {text('lastName', 'lastName', tStudent('form.lastName'), { autoComplete: false })}
                <FormField
                  label={tStudent('form.dob')}
                  errorText={errors.dob}
                  constraintText={tStudent('form.dobConstraint')}
                >
                  <DatePicker
                    value={values.dob}
                    placeholder="YYYY/MM/DD"
                    isDateEnabled={(day) => day <= new Date()}
                    onChange={({ detail }) => change('dob', detail.value)}
                  />
                </FormField>
                {select(
                  'gender',
                  'gender',
                  tStudent('form.gender'),
                  GENDERS.map((value) => ({ value, label: tStudent(`gender.${value}`) })),
                )}
                {select(
                  'classId',
                  'classId',
                  t('columns.classSought'),
                  classes.map(({ id, name }) => ({ value: id, label: name })),
                )}
                {text('previousSchool', 'previousSchool', optional(t('form.previousSchool')), { autoComplete: false })}
                {select(
                  'source',
                  'source',
                  t('form.source'),
                  SOURCES.map((value) => ({ value, label: t(`source.${value}`) })),
                )}
              </ColumnLayout>
            </Container>
            <Container header={<Header variant="h2">{tStudent('form.guardian')}</Header>}>
              <ColumnLayout columns={2}>
                {text('guardianName', 'guardian.name', tStudent('form.guardianName'), { autoComplete: 'name' })}
                {select(
                  'relation',
                  'guardian.relation',
                  tStudent('form.relation'),
                  RELATIONS.map((value) => ({ value, label: tStudent(`relation.${value}`) })),
                )}
                {text(
                  'phone',
                  'guardian.phone',
                  tStudent('form.phone'),
                  { inputMode: 'tel', autoComplete: 'tel-national' },
                  tStudent('form.phoneConstraint'),
                )}
                {text('email', 'guardian.email', optional(tStudent('form.email')), {
                  type: 'email',
                  inputMode: 'email',
                  autoComplete: 'email',
                })}
              </ColumnLayout>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}

const ADDRESS = { line1: '', city: '', state: '', pincode: '' };

export function AdmissionView({
  admission,
  canEdit,
  canReadDocuments,
}: {
  admission: AdmissionDetail;
  canEdit: boolean;
  canReadDocuments: boolean;
}) {
  const t = useTranslations('admissions');
  const tDocument = useTranslations('sis.documents.type');
  const missing = admission.missingDocuments;
  const inProgress = !FINAL.includes(admission.status);
  useCrumb(admission.name);
  const tStudent = useTranslations('sis.students');
  const router = useRouter();
  const [target, setTarget] = useState<AdmissionStatus | null>(null);
  const [note, setNote] = useState('');
  const [sectionId, setSectionId] = useState(admission.sections.length === 1 ? (admission.sections[0]?.id ?? '') : '');
  const [address, setAddress] = useState(ADDRESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const forward = admission.next.find((status) => status !== 'rejected' && status !== 'withdrawn' && status !== 'documents_pending')
    ?? admission.next.find((status) => status === 'documents_pending');
  const others = admission.next.filter((status) => status !== forward);
  const accepting = target === 'accepted';
  const sectionOptions = admission.sections.map(({ id, name }) => ({ value: id, label: name }));

  function open(status: AdmissionStatus) {
    setError(null);
    setNote('');
    setTarget(status);
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);
    const result = accepting
      ? await acceptAdmission({ id: admission.id, sectionId, address })
      : await moveAdmission({ id: admission.id, to: target, note });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if ('studentId' in result.data) return router.push(`/students/${result.data.studentId}?notice=added`);
    setDone(t('moved', { status: t(`status.${target}`) }));
    setTarget(null);
    router.refresh();
  }

  const addressField = (field: keyof typeof ADDRESS, props: Partial<InputProps> = {}) => (
    <FormField label={tStudent(`form.${field}`)} errorText={error?.fieldErrors?.[`address.${field}`]}>
      <Input
        {...props}
        value={address[field]}
        onChange={({ detail }) => setAddress({ ...address, [field]: detail.value })}
      />
    </FormField>
  );

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={admission.applicationNo}
          actions={
            canEdit && (
              <SpaceBetween direction="horizontal" size="xs">
                {others.map((status) => (
                  <Button key={status} onClick={() => open(status)}>
                    {t(`move.${status}`)}
                  </Button>
                ))}
                {admission.status === 'offered' ? (
                  <Button
                    variant="primary"
                    disabled={missing.length > 0}
                    disabledReason={t('documents.verifyFirst', { count: missing.length })}
                    onClick={() => open('accepted')}
                  >
                    {t('move.accepted')}
                  </Button>
                ) : (
                  forward && (
                    <Button variant="primary" onClick={() => open(forward)}>
                      {t(`move.${forward}`)}
                    </Button>
                  )
                )}
              </SpaceBetween>
            )
          }
        >
          {admission.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {done && (
          <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setDone(null)}>
            {done}
          </Alert>
        )}
        <Container header={<Header variant="h2">{t('view.application')}</Header>}>
          <KeyValuePairs
            columns={3}
            items={[
              {
                label: t('columns.status'),
                value: (
                  <StatusIndicator type={STATUS_TYPE[admission.status]}>{t(`status.${admission.status}`)}</StatusIndicator>
                ),
              },
              { label: t('columns.classSought'), value: admission.classSought || NONE },
              { label: tStudent('form.dob'), value: date.format(new Date(`${admission.dob}T00:00:00+05:30`)) },
              { label: tStudent('form.gender'), value: tStudent(`gender.${admission.gender}`) },
              { label: t('form.previousSchool'), value: admission.previousSchool ?? NONE },
              { label: t('form.source'), value: t(`source.${admission.source}`) },
              {
                label: tStudent('form.guardian'),
                value: `${admission.guardianName} (${tStudent(`relation.${admission.guardianRelation}`)})`,
              },
              { label: t('columns.phone'), value: formatPhone(admission.guardianPhone) },
              { label: tStudent('form.email'), value: admission.guardianEmail ?? NONE },
              ...(admission.studentId
                ? [
                    {
                      label: t('view.student'),
                      value: <AppLink href={`/students/${admission.studentId}`}>{t('view.openStudent')}</AppLink>,
                    },
                  ]
                : []),
            ]}
          />
        </Container>
        {inProgress && missing.length > 0 && (
          <Alert type="info" header={t('documents.missingTitle', { count: missing.length })}>
            {t('documents.missingBody', { list: missing.map((type) => tDocument(type)).join(', ') })}
          </Alert>
        )}
        {canReadDocuments && (inProgress || admission.documents.length > 0) && (
          <StudentDocuments
            admission
            studentId={admission.id}
            documents={admission.documents}
            canEdit={canEdit && inProgress}
          />
        )}
        <Table
          variant="container"
          trackBy="at"
          items={admission.history}
          header={<Header variant="h2">{t('view.history')}</Header>}
          columnDefinitions={[
            { id: 'at', header: t('view.when'), cell: (entry) => dateTime.format(new Date(entry.at)), isRowHeader: true },
            {
              id: 'to',
              header: t('view.stage'),
              cell: (entry) => t(`status.${entry.to as AdmissionStatus}`),
            },
            { id: 'note', header: t('view.note'), cell: (entry) => entry.note ?? NONE },
          ]}
        />
      </SpaceBetween>
      <Modal
        visible={Boolean(target)}
        header={target ? t(`confirm.${target}`, { name: admission.name }) : ''}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setTarget(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setTarget(null)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} disabled={accepting && !sectionId} onClick={() => void confirm()}>
                {target ? t(`move.${target}`) : ''}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && <Alert type="error">{error.message}</Alert>}
          {accepting ? (
            <>
              <Box>{t('accept.body')}</Box>
              {admission.sections.length === 0 && <Alert type="warning">{t('accept.noSections')}</Alert>}
              <FormField label={tStudent('form.section')} errorText={error?.fieldErrors?.sectionId}>
                <Select
                  placeholder={tStudent('form.sectionPlaceholder')}
                  selectedOption={sectionOptions.find((option) => option.value === sectionId) ?? null}
                  options={sectionOptions}
                  onChange={({ detail }) => setSectionId(detail.selectedOption.value ?? '')}
                />
              </FormField>
              {addressField('line1', { autoComplete: 'street-address' })}
              {addressField('city', { autoComplete: 'address-level2' })}
              {addressField('state', { autoComplete: 'address-level1' })}
              {addressField('pincode', { inputMode: 'numeric', autoComplete: 'postal-code' })}
            </>
          ) : (
            <FormField
              label={
                <>
                  {t('view.note')} - <i>{tStudent('form.optional')}</i>
                </>
              }
              errorText={error?.fieldErrors?.note}
            >
              <Textarea value={note} rows={3} onChange={({ detail }) => setNote(detail.value)} />
            </FormField>
          )}
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}
