'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
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
import { clearTimetableSlot, upsertSubject, upsertTimetableSlot } from '@/server/modules/timetable/actions';
import type { Period, SubjectRow, Timetable } from '@/server/modules/timetable/schemas';

type Option = { id: string; name: string };
type Failure = { message: string; fieldErrors?: Record<string, string> };
const DAYS = [1, 2, 3, 4, 5, 6];
const TYPES = ['scholastic', 'co_scholastic'];

export function SubjectsTable({ subjects, canCreate }: { subjects: SubjectRow[]; canCreate: boolean }) {
  const t = useTranslations('academics.subjects');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name: '', code: '', type: 'scholastic' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const typeOptions = TYPES.map((value) => ({ value, label: t(`type.${value}`) }));
  const addButton = (primary: boolean) => (
    <Button {...(primary && { variant: 'primary' as const })} onClick={() => setOpen(true)}>
      {t('add')}
    </Button>
  );

  async function save() {
    setBusy(true);
    setError(null);
    const result = await upsertSubject(values);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    setValues({ name: '', code: '', type: 'scholastic' });
    setAdded(result.data.name);
    router.refresh();
  }

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        trackBy="id"
        items={subjects}
        header={
          <SpaceBetween size="m">
            <Header variant="h1" counter={`(${subjects.length})`} actions={canCreate && addButton(true)}>
              {t('title')}
            </Header>
            {added && (
              <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setAdded(null)}>
                {t('added', { name: added })}
              </Alert>
            )}
          </SpaceBetween>
        }
        empty={
          <EmptyState
            icon="subjects"
            heading={t('empty.heading')}
            body={t('empty.body')}
            action={canCreate && addButton(false)}
          />
        }
        columnDefinitions={[
          { id: 'name', header: t('name'), cell: (subject) => subject.name, isRowHeader: true },
          { id: 'code', header: t('code'), cell: (subject) => subject.code },
          { id: 'type', header: t('typeLabel'), cell: (subject) => t(`type.${subject.type}`) },
        ]}
      />
      <Modal
        visible={open}
        header={t('add')}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setOpen(false)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                {t('save')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          <FormField label={t('name')} errorText={error?.fieldErrors?.name}>
            <Input
              value={values.name}
              autoComplete={false}
              onChange={({ detail }) => setValues({ ...values, name: detail.value })}
            />
          </FormField>
          <FormField label={t('code')} constraintText={t('codeHint')} errorText={error?.fieldErrors?.code}>
            <Input
              value={values.code}
              autoComplete={false}
              onChange={({ detail }) => setValues({ ...values, code: detail.value })}
            />
          </FormField>
          <FormField label={t('typeLabel')} errorText={error?.fieldErrors?.type}>
            <Select
              selectedOption={typeOptions.find((option) => option.value === values.type) ?? null}
              options={typeOptions}
              onChange={({ detail }) => setValues({ ...values, type: detail.selectedOption.value ?? 'scholastic' })}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export function TimetableGrid({
  sections,
  sectionId,
  timetable,
  subjects,
  teachers,
  canEdit,
}: {
  sections: Option[];
  sectionId: string | null;
  timetable: Timetable;
  subjects: Option[];
  teachers: Option[];
  canEdit: boolean;
}) {
  const t = useTranslations('academics.timetable');
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<{ day: number; period: Period } | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = (items: Option[]) => items.map(({ id, name }) => ({ value: id, label: name }));
  const sectionOptions = options(sections);
  const current = editing ? timetable.cells[`${editing.day}-${editing.period.number}`] : undefined;

  function open(day: number, period: Period) {
    const cell = timetable.cells[`${day}-${period.number}`];
    setSubjectId(cell?.subjectId ?? '');
    setTeacherId(cell?.teacherId ?? '');
    setError(null);
    setEditing({ day, period });
  }

  async function run(action: 'save' | 'clear') {
    if (!editing || !sectionId) return;
    setBusy(true);
    const cell = { sectionId, day: editing.day, period: editing.period.number };
    const result =
      action === 'save'
        ? await upsertTimetableSlot({ ...cell, subjectId, teacherId })
        : await clearTimetableSlot(cell);
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    setEditing(null);
    router.refresh();
  }

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        trackBy="number"
        items={sectionId ? timetable.periods : []}
        header={
          <Header variant="h1" description={t('description')}>
            {t('title')}
          </Header>
        }
        filter={
          <Select
            inlineLabelText={t('section')}
            placeholder={t('sectionPlaceholder')}
            selectedOption={sectionOptions.find((option) => option.value === sectionId) ?? null}
            options={sectionOptions}
            onChange={({ detail }) => router.replace(`${pathname}?section=${detail.selectedOption.value ?? ''}`)}
          />
        }
        empty={
          <EmptyState
            icon="timetable"
            heading={t(sections.length ? 'choose.heading' : 'empty.heading')}
            body={t(sections.length ? 'choose.body' : 'empty.body')}
          />
        }
        columnDefinitions={[
          {
            id: 'period',
            header: t('period'),
            isRowHeader: true,
            cell: (period: Period) => (
              <>
                <Box fontWeight="bold">{t('periodNo', { number: period.number })}</Box>
                <Box color="text-body-secondary" fontSize="body-s">
                  {period.start}–{period.end}
                </Box>
              </>
            ),
          },
          ...DAYS.map((day) => ({
            id: `day-${day}`,
            header: t(`days.${day}`),
            cell: (period: Period) => {
              const cell = timetable.cells[`${day}-${period.number}`];
              const label = t('cellLabel', { day: t(`days.${day}`), number: period.number });
              return (
                <SpaceBetween size="xxxs">
                  {cell ? (
                    <>
                      <Box fontWeight="bold">{cell.subject}</Box>
                      <Box color="text-body-secondary" fontSize="body-s">
                        {cell.teacher}
                      </Box>
                    </>
                  ) : (
                    !canEdit && <Box color="text-status-inactive">{t('free')}</Box>
                  )}
                  {canEdit && (
                    <Button variant="inline-link" ariaLabel={label} onClick={() => open(day, period)}>
                      {t(cell ? 'change' : 'set')}
                    </Button>
                  )}
                </SpaceBetween>
              );
            },
          })),
        ]}
      />
      <Modal
        visible={Boolean(editing)}
        header={editing ? t('cellLabel', { day: t(`days.${editing.day}`), number: editing.period.number }) : ''}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setEditing(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              {current && (
                <Button disabled={busy} onClick={() => void run('clear')}>
                  {t('clear')}
                </Button>
              )}
              <Button variant="link" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!subjectId || !teacherId}
                onClick={() => void run('save')}
              >
                {t('save')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && <Alert type="error">{error}</Alert>}
          {subjects.length === 0 && <Alert type="warning">{t('noSubjects')}</Alert>}
          {teachers.length === 0 && <Alert type="warning">{t('noTeachers')}</Alert>}
          <FormField label={t('subject')}>
            <Select
              placeholder={t('subjectPlaceholder')}
              selectedOption={options(subjects).find((option) => option.value === subjectId) ?? null}
              options={options(subjects)}
              onChange={({ detail }) => setSubjectId(detail.selectedOption.value ?? '')}
            />
          </FormField>
          <FormField label={t('teacher')}>
            <Select
              placeholder={t('teacherPlaceholder')}
              selectedOption={options(teachers).find((option) => option.value === teacherId) ?? null}
              options={options(teachers)}
              onChange={({ detail }) => setTeacherId(detail.selectedOption.value ?? '')}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}
