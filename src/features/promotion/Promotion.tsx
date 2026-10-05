'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
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
import { closeAcademicYear, createAcademicYear, promoteStudents } from '@/server/modules/promotion/actions';
import type { PromotionSheet, PromotionState } from '@/server/modules/promotion/service';

type Failure = { message: string; fieldErrors?: Record<string, string> };
type Feedback = { type: 'success' | 'error'; text: string };

export function Promotion({ state, sheet }: { state: PromotionState; sheet: PromotionSheet | null }) {
  const t = useTranslations('promotion');
  const router = useRouter();
  const pathname = usePathname();
  const [year, setYear] = useState(state.suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [closing, setClosing] = useState(false);

  // "promote:<sectionId>", "detain:<sectionId>", "graduate" or "leave" per student.
  const options = sheet
    ? [
        ...sheet.promoteTo.map(({ id, name }) => ({ value: `promote:${id}`, label: t('to.promote', { section: name }) })),
        ...sheet.detainIn.map(({ id, name }) => ({ value: `detain:${id}`, label: t('to.detain', { section: name }) })),
        ...(sheet.promoteTo.length === 0 ? [{ value: 'graduate', label: t('to.graduate') }] : []),
        { value: 'leave', label: t('to.leave') },
      ]
    : [];
  const sameLetter = sheet?.promoteTo.find(({ name }) => name.split('-').at(-1) === sheet.section.name.split('-').at(-1));
  const fallback = sameLetter ? `promote:${sameLetter.id}` : (options[0]?.value ?? 'leave');
  const [choices, setChoices] = useState(() => new Map(sheet?.students.map(({ id }) => [id, fallback])));

  if (!state.current) {
    return (
      <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
        <EmptyState icon="academicYear" heading={t('noYear.heading')} body={t('noYear.body')} />
      </ContentLayout>
    );
  }

  async function createYear() {
    setBusy(true);
    setError(null);
    const result = await createAcademicYear(year);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setFeedback({ type: 'success', text: t('yearCreated', result.data) });
    router.refresh();
  }

  async function promote() {
    if (!sheet) return;
    setBusy(true);
    const result = await promoteStudents({
      sectionId: sheet.section.id,
      decisions: sheet.students.map(({ id }) => {
        const [action, toSectionId] = (choices.get(id) ?? fallback).split(':');
        return { studentId: id, action, ...(toSectionId && { toSectionId }) };
      }),
    });
    setBusy(false);
    setFeedback(
      result.ok
        ? { type: 'success', text: t('promoted', result.data) }
        : { type: 'error', text: result.error.message },
    );
    if (result.ok) router.replace(pathname);
    router.refresh();
  }

  async function close() {
    setBusy(true);
    const result = await closeAcademicYear();
    setBusy(false);
    setClosing(false);
    setFeedback(
      result.ok ? { type: 'success', text: t('closed', result.data) } : { type: 'error', text: result.error.message },
    );
    router.refresh();
  }

  const sectionOptions = state.sections
    .filter((section) => section.students > 0)
    .map(({ id, name, students }) => ({ value: id, label: name, description: t('studentCount', { count: students }) }));
  const dateField = (field: 'startDate' | 'endDate') => (
    <FormField label={t(`year.${field}`)} errorText={error?.fieldErrors?.[field]}>
      <DatePicker
        value={year[field]}
        placeholder="YYYY/MM/DD"
        onChange={({ detail }) => setYear({ ...year, [field]: detail.value })}
      />
    </FormField>
  );
  const alert = feedback && (
    <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
      {feedback.text}
    </Alert>
  );

  if (!state.next) {
    return (
      <ContentLayout header={<Header variant="h1" description={t('description')}>{t('title')}</Header>}>
        <SpaceBetween size="l">
          {alert}
          <Container
            header={
              <Header variant="h2" description={t('year.description', { current: state.current.label })}>
                {t('year.title')}
              </Header>
            }
          >
            <SpaceBetween size="l">
              {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
              <ColumnLayout columns={3}>
                <FormField label={t('year.label')} constraintText={t('year.labelHint')} errorText={error?.fieldErrors?.label}>
                  <Input
                    value={year.label}
                    autoComplete={false}
                    onChange={({ detail }) => setYear({ ...year, label: detail.value })}
                  />
                </FormField>
                {dateField('startDate')}
                {dateField('endDate')}
              </ColumnLayout>
              <Button variant="primary" loading={busy} onClick={() => void createYear()}>
                {t('year.submit')}
              </Button>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={t('fromTo', { current: state.current.label, next: state.next.label })}
          actions={
            <Button disabled={state.remaining > 0} onClick={() => setClosing(true)}>
              {t('close.action', { current: state.current.label })}
            </Button>
          }
        >
          {t('title')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {alert}
        <Alert type="info">
          {state.remaining > 0 ? t('remaining', { count: state.remaining }) : t('allDone', { next: state.next.label })}
        </Alert>
        <Table
          variant="container"
          stickyHeader
          trackBy="id"
          items={sheet?.students ?? []}
          header={
            <Header
              variant="h2"
              counter={sheet ? `(${sheet.students.length})` : ''}
              actions={
                sheet &&
                sheet.students.length > 0 && (
                  <Button variant="primary" loading={busy} onClick={() => void promote()}>
                    {t('submit', { count: sheet.students.length })}
                  </Button>
                )
              }
            >
              {sheet ? t('sheetTitle', { section: sheet.section.name }) : t('choose.title')}
            </Header>
          }
          filter={
            <Select
              inlineLabelText={t('section')}
              placeholder={t('sectionPlaceholder')}
              selectedOption={sectionOptions.find((option) => option.value === sheet?.section.id) ?? null}
              options={sectionOptions}
              empty={t('noSections')}
              onChange={({ detail }) => router.replace(`${pathname}?section=${detail.selectedOption.value ?? ''}`)}
            />
          }
          empty={
            <EmptyState
              icon="promote"
              heading={t(sheet ? 'sheetEmpty.heading' : 'choose.heading')}
              body={t(sheet ? 'sheetEmpty.body' : 'choose.body')}
            />
          }
          columnDefinitions={[
            { id: 'rollNo', header: t('columns.rollNo'), cell: (student) => student.rollNo, width: 110 },
            { id: 'name', header: t('columns.name'), cell: (student) => student.name, isRowHeader: true },
            {
              id: 'decision',
              header: t('columns.decision'),
              cell: (student) => (
                <Select
                  ariaLabel={t('decisionFor', { name: student.name })}
                  selectedOption={options.find((option) => option.value === (choices.get(student.id) ?? fallback)) ?? null}
                  options={options}
                  expandToViewport
                  onChange={({ detail }) =>
                    setChoices((current) => new Map(current).set(student.id, detail.selectedOption.value ?? fallback))
                  }
                />
              ),
            },
          ]}
        />
      </SpaceBetween>
      <Modal
        visible={closing}
        header={t('close.title', { current: state.current.label })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setClosing(false)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setClosing(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void close()}>
                {t('close.confirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('close.body', { current: state.current.label, next: state.next.label })}
      </Modal>
    </ContentLayout>
  );
}
