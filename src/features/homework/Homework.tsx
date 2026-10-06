'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import Multiselect from '@cloudscape-design/components/multiselect';
import Pagination from '@cloudscape-design/components/pagination';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { createHomework, deleteHomework } from '@/server/modules/homework/actions';
import type { HomeworkRow } from '@/server/modules/homework/schemas';
import { AttachFile, AttachmentLinks } from './Attachments';

const LIST = '/homework';
const NEW = '/homework/new';
type Option = { id: string; name: string };
type Data = { rows: HomeworkRow[]; page: number; nextCursor: string | null; prevCursor: string | null };
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function HomeworkTable({
  data,
  canCreate,
  created,
}: {
  data: Data | null;
  canCreate: boolean;
  created: string | null;
}) {
  const t = useTranslations('homework');
  const router = useRouter();
  const pathname = usePathname();
  const [removing, setRemoving] = useState<HomeworkRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const feedback = result ?? (created ? { type: 'success' as const, text: t('created', { title: created }) } : null);
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

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const response = await deleteHomework(removing.id);
    setBusy(false);
    setRemoving(null);
    setResult(
      response.ok
        ? { type: 'success', text: t('deleted', { title: response.data.title }) }
        : { type: 'error', text: response.error.message },
    );
    router.replace(pathname);
    router.refresh();
  }

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
            <Header variant="h1" actions={canCreate && addButton(true)}>
              {t('title')}
            </Header>
            {feedback && (
              <Alert
                type={feedback.type}
                dismissible
                dismissAriaLabel={t('dismiss')}
                onDismiss={() => {
                  setResult(null);
                  router.replace(pathname);
                }}
              >
                {feedback.text}
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
        empty={
          <EmptyState
            icon="homework"
            heading={t('empty.heading')}
            body={t(canCreate ? 'empty.bodyTeacher' : 'empty.body')}
            action={canCreate && addButton(false)}
          />
        }
        columnDefinitions={[
          {
            id: 'title',
            header: t('columns.title'),
            isRowHeader: true,
            cell: (row) => (
              <>
                <Box fontWeight="bold">{row.title}</Box>
                {row.instructions && <Box color="text-body-secondary">{row.instructions}</Box>}
                <AttachmentLinks homeworkId={row.id} files={row.attachments} />
              </>
            ),
          },
          { id: 'subject', header: t('columns.subject'), cell: (row) => row.subject },
          { id: 'sections', header: t('columns.sections'), cell: (row) => row.sections },
          { id: 'teacher', header: t('columns.teacher'), cell: (row) => row.teacher },
          {
            id: 'dueOn',
            header: t('columns.dueOn'),
            cell: (row) => (
              <StatusIndicator type={row.isPastDue ? 'stopped' : 'pending'}>
                {t(row.isPastDue ? 'wasDue' : 'due', { date: day(row.dueOn) })}
              </StatusIndicator>
            ),
          },
          {
            id: 'actions',
            header: t('columns.actions'),
            cell: (row) =>
              row.isMine && (
                <SpaceBetween direction="horizontal" size="s">
                  {row.attachments.length < 3 && <AttachFile homeworkId={row.id} title={row.title} />}
                  <Button
                    variant="inline-link"
                    ariaLabel={t('deleteLabel', { title: row.title })}
                    onClick={() => setRemoving(row)}
                  >
                    {t('delete')}
                  </Button>
                </SpaceBetween>
              ),
          },
        ]}
      />
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

export function HomeworkForm({ sections, subjects }: { sections: Option[]; subjects: Option[] }) {
  const t = useTranslations('homework');
  const router = useRouter();
  const [values, setValues] = useState({ title: '', instructions: '', subjectId: '', dueOn: '' });
  const [sectionIds, setSectionIds] = useState<string[]>(sections.length === 1 ? sections.map(({ id }) => id) : []);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = error?.fieldErrors ?? {};
  const options = (items: Option[]) => items.map(({ id, name }) => ({ value: id, label: name }));
  const blocked = sections.length === 0 ? t('form.noSections') : subjects.length === 0 ? t('form.noSubjects') : null;

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await createHomework({ ...values, sectionIds });
    if (result.ok) return router.push(`${LIST}?created=${encodeURIComponent(result.data.title)}`);
    setError(result.error);
    setBusy(false);
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
              <Button variant="primary" loading={busy} disabled={Boolean(blocked)}>
                {t('form.submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {blocked && <Alert type="warning">{blocked}</Alert>}
            <Container>
              <SpaceBetween size="l">
                <FormField label={t('form.name')} errorText={errors.title}>
                  <Input
                    value={values.title}
                    autoComplete={false}
                    onChange={({ detail }) => setValues({ ...values, title: detail.value })}
                  />
                </FormField>
                <FormField label={t('columns.subject')} errorText={errors.subjectId}>
                  <Select
                    placeholder={t('form.subjectPlaceholder')}
                    selectedOption={options(subjects).find((option) => option.value === values.subjectId) ?? null}
                    options={options(subjects)}
                    onChange={({ detail }) => setValues({ ...values, subjectId: detail.selectedOption.value ?? '' })}
                  />
                </FormField>
                <FormField label={t('columns.sections')} errorText={errors.sectionIds}>
                  <Multiselect
                    placeholder={t('form.sectionsPlaceholder')}
                    selectedOptions={options(sections).filter((option) => sectionIds.includes(option.value))}
                    options={options(sections)}
                    onChange={({ detail }) => setSectionIds(detail.selectedOptions.map((option) => option.value ?? ''))}
                  />
                </FormField>
                <FormField label={t('columns.dueOn')} errorText={errors.dueOn} constraintText={t('form.dateHint')}>
                  <DatePicker
                    value={values.dueOn}
                    placeholder="YYYY/MM/DD"
                    onChange={({ detail }) => setValues({ ...values, dueOn: detail.value })}
                  />
                </FormField>
                <FormField
                  label={
                    <>
                      {t('form.instructions')} - <i>{t('optional')}</i>
                    </>
                  }
                  errorText={errors.instructions}
                >
                  <Textarea
                    value={values.instructions}
                    rows={4}
                    onChange={({ detail }) => setValues({ ...values, instructions: detail.value })}
                  />
                </FormField>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
