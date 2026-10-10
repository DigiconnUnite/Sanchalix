'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import DatePicker from '@cloudscape-design/components/date-picker';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import Multiselect from '@cloudscape-design/components/multiselect';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { useCrumb } from '@/components/Crumb';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { lockMarks, publishExamResults, saveMarks, upsertExam, upsertExamSchedule } from '@/server/modules/exams/actions';
import type { ExamDetail, ExamRow, MarksSheet as Sheet } from '@/server/modules/exams/service';

type Option = { id: string; name: string };
type Failure = { message: string; fieldErrors?: Record<string, string> };
type Feedback = { type: 'success' | 'error'; text: string };
const TYPES = ['unit_test', 'term', 'annual', 'practical', 'other'];
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));
const options = (items: Option[]) => items.map(({ id, name }) => ({ value: id, label: name }));

function Dialog({
  visible,
  header,
  confirm,
  cancel,
  busy,
  disabled,
  onConfirm,
  onDismiss,
  children,
}: {
  visible: boolean;
  header: string;
  confirm: string;
  cancel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      header={header}
      closeAriaLabel={cancel}
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              {cancel}
            </Button>
            <Button variant="primary" loading={busy} disabled={Boolean(disabled)} onClick={onConfirm}>
              {confirm}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      {children}
    </Modal>
  );
}

export function ExamsTable({ exams, classes, canEdit }: { exams: ExamRow[]; classes: Option[]; canEdit: boolean }) {
  const t = useTranslations('exams');
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState({ name: '', type: 'unit_test' });
  const [classIds, setClassIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const typeOptions = TYPES.map((value) => ({ value, label: t(`type.${value}`) }));
  const addButton = (primary: boolean) => (
    <Button {...(primary && { variant: 'primary' as const })} onClick={() => setAdding(true)}>
      {t('add')}
    </Button>
  );

  async function create() {
    setBusy(true);
    setError(null);
    const result = await upsertExam({ ...values, classIds });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push(`/exams/${result.data.id}`);
  }

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        trackBy="id"
        items={exams}
        header={
          <Header variant="h2" counter={`(${exams.length})`} description={t('description')} actions={canEdit && addButton(true)}>
            {t('title')}
          </Header>
        }
        empty={
          <EmptyState icon="exams" heading={t('empty.heading')} body={t('empty.body')} action={canEdit && addButton(false)} />
        }
        columnDefinitions={[
          {
            id: 'name',
            header: t('columns.name'),
            isRowHeader: true,
            cell: (exam) => <AppLink href={`/exams/${exam.id}`}>{exam.name}</AppLink>,
          },
          { id: 'type', header: t('columns.type'), cell: (exam) => t(`type.${exam.type}`) },
          { id: 'classes', header: t('columns.classes'), cell: (exam) => exam.classes },
          { id: 'papers', header: t('columns.papers'), cell: (exam) => exam.papers },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (exam) => (
              <StatusIndicator type={exam.published ? 'success' : 'in-progress'}>
                {t(exam.published ? 'status.published' : 'status.open')}
              </StatusIndicator>
            ),
          },
        ]}
      />
      <Dialog
        visible={adding}
        header={t('add')}
        confirm={t('create')}
        cancel={t('cancel')}
        busy={busy}
        onConfirm={() => void create()}
        onDismiss={() => setAdding(false)}
      >
        <SpaceBetween size="m">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          {classes.length === 0 && <Alert type="warning">{t('noClasses')}</Alert>}
          <FormField label={t('columns.name')} constraintText={t('nameHint')} errorText={error?.fieldErrors?.name}>
            <Input value={values.name} autoComplete={false} onChange={({ detail }) => setValues({ ...values, name: detail.value })} />
          </FormField>
          <FormField label={t('columns.type')} errorText={error?.fieldErrors?.type}>
            <Select
              selectedOption={typeOptions.find((option) => option.value === values.type) ?? null}
              options={typeOptions}
              onChange={({ detail }) => setValues({ ...values, type: detail.selectedOption.value ?? 'other' })}
            />
          </FormField>
          <FormField label={t('columns.classes')} errorText={error?.fieldErrors?.classIds}>
            <Multiselect
              placeholder={t('classesPlaceholder')}
              selectedOptions={options(classes).filter((option) => classIds.includes(option.value))}
              options={options(classes)}
              onChange={({ detail }) => setClassIds(detail.selectedOptions.map((option) => option.value ?? ''))}
            />
          </FormField>
        </SpaceBetween>
      </Dialog>
    </>
  );
}

const PAPER = { classId: '', subjectId: '', date: '', maxMarks: '100', passMarks: '33' };
type Paper = ExamDetail['schedules'][number];

export function ExamView({
  exam,
  canEdit,
  canLock,
  canPublish,
}: {
  exam: ExamDetail;
  canEdit: boolean;
  canLock: boolean;
  canPublish: boolean;
}) {
  const t = useTranslations('exams');
  useCrumb(exam.name);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [paper, setPaper] = useState(PAPER);
  const [unlocking, setUnlocking] = useState<Paper | null>(null);
  const [reason, setReason] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const editable = canEdit && !exam.published;
  const allLocked = exam.schedules.length > 0 && exam.schedules.every((schedule) => schedule.locked);

  const finish = (result: { ok: boolean; error?: { message: string } }, success: string) => {
    setBusy(false);
    setFeedback(result.ok ? { type: 'success', text: success } : { type: 'error', text: result.error?.message ?? '' });
    router.refresh();
  };

  async function addPaper() {
    setBusy(true);
    setError(null);
    const result = await upsertExamSchedule({ examId: exam.id, ...paper });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAdding(false);
    setPaper({ ...PAPER, classId: paper.classId, date: paper.date });
    router.refresh();
  }

  async function lock(target: Paper) {
    setBusy(true);
    finish(await lockMarks({ examScheduleId: target.id, locked: true }), t('locked', { subject: target.subject }));
  }

  async function unlock() {
    if (!unlocking) return;
    setBusy(true);
    const result = await lockMarks({ examScheduleId: unlocking.id, locked: false, reason });
    if (!result.ok && result.error.fieldErrors?.reason) {
      setBusy(false);
      return setError(result.error);
    }
    finish(result, t('unlocked', { subject: unlocking.subject }));
    setUnlocking(null);
    setReason('');
  }

  async function publish() {
    setBusy(true);
    finish(await publishExamResults(exam.id), t('publishedDone', { name: exam.name }));
    setPublishing(false);
  }

  const number = (field: 'maxMarks' | 'passMarks') => (
    <FormField label={t(`paper.${field}`)} errorText={error?.fieldErrors?.[field]}>
      <Input
        type="number"
        inputMode="numeric"
        value={paper[field]}
        onChange={({ detail }) => setPaper({ ...paper, [field]: detail.value })}
      />
    </FormField>
  );
  const choose = (field: 'classId' | 'subjectId', items: Option[]) => (
    <FormField label={t(`paper.${field}`)} errorText={error?.fieldErrors?.[field]}>
      <Select
        placeholder={t(`paper.${field}Placeholder`)}
        selectedOption={options(items).find((option) => option.value === paper[field]) ?? null}
        options={options(items)}
        onChange={({ detail }) => setPaper({ ...paper, [field]: detail.selectedOption.value ?? '' })}
      />
    </FormField>
  );

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        trackBy="id"
        items={exam.schedules}
        header={
          <SpaceBetween size="m">
            <Header
              variant="h1"
              counter={`(${exam.schedules.length})`}
              description={t('examDescription', { type: t(`type.${exam.type}`), classes: exam.classes })}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  {canPublish && !exam.published && (
                    <Button disabled={!allLocked} onClick={() => setPublishing(true)}>
                      {t('publish')}
                    </Button>
                  )}
                  {editable && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setError(null);
                        setAdding(true);
                      }}
                    >
                      {t('paper.add')}
                    </Button>
                  )}
                </SpaceBetween>
              }
            >
              {exam.name}
            </Header>
            {feedback && (
              <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
                {feedback.text}
              </Alert>
            )}
            {!feedback && exam.published && <Alert type="success">{t('publishedNote')}</Alert>}
            {!feedback && !exam.published && canPublish && exam.schedules.length > 0 && !allLocked && (
              <Alert type="info">{t('lockFirst')}</Alert>
            )}
          </SpaceBetween>
        }
        empty={<EmptyState icon="exams" heading={t('paper.empty.heading')} body={t('paper.empty.body')} />}
        columnDefinitions={[
          { id: 'date', header: t('paper.date'), cell: (row) => day(row.date) },
          { id: 'class', header: t('paper.classId'), cell: (row) => row.className },
          {
            id: 'subject',
            header: t('paper.subjectId'),
            isRowHeader: true,
            cell: (row) => <AppLink href={`/exams/${exam.id}/marks?paper=${row.id}`}>{row.subject}</AppLink>,
          },
          { id: 'marks', header: t('paper.marks'), cell: (row) => t('paper.maxPass', { max: row.maxMarks, pass: row.passMarks }) },
          { id: 'entered', header: t('paper.entered'), cell: (row) => row.entered },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => (
              <StatusIndicator type={row.locked ? 'success' : 'in-progress'}>
                {t(row.locked ? 'paper.locked' : 'paper.open')}
              </StatusIndicator>
            ),
          },
          ...(canLock && !exam.published
            ? [
                {
                  id: 'actions',
                  header: t('columns.actions'),
                  cell: (row: Paper) =>
                    row.locked ? (
                      <Button
                        variant="inline-link"
                        ariaLabel={t('unlockLabel', { subject: row.subject, className: row.className })}
                        onClick={() => {
                          setError(null);
                          setUnlocking(row);
                        }}
                      >
                        {t('unlock')}
                      </Button>
                    ) : (
                      <Button
                        variant="inline-link"
                        loading={busy}
                        ariaLabel={t('lockLabel', { subject: row.subject, className: row.className })}
                        onClick={() => void lock(row)}
                      >
                        {t('lock')}
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
      />
      <Dialog
        visible={adding}
        header={t('paper.add')}
        confirm={t('paper.add')}
        cancel={t('cancel')}
        busy={busy}
        onConfirm={() => void addPaper()}
        onDismiss={() => setAdding(false)}
      >
        <SpaceBetween size="m">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          {exam.subjectOptions.length === 0 && <Alert type="warning">{t('paper.noSubjects')}</Alert>}
          {choose('classId', exam.classOptions)}
          {choose('subjectId', exam.subjectOptions)}
          <FormField label={t('paper.date')} constraintText={t('paper.dateHint')} errorText={error?.fieldErrors?.date}>
            <DatePicker value={paper.date} placeholder="YYYY/MM/DD" onChange={({ detail }) => setPaper({ ...paper, date: detail.value })} />
          </FormField>
          {number('maxMarks')}
          {number('passMarks')}
        </SpaceBetween>
      </Dialog>
      <Dialog
        visible={Boolean(unlocking)}
        header={t('unlockTitle', { subject: unlocking?.subject ?? '' })}
        confirm={t('unlock')}
        cancel={t('cancel')}
        busy={busy}
        onConfirm={() => void unlock()}
        onDismiss={() => setUnlocking(null)}
      >
        <FormField label={t('unlockReason')} description={t('unlockHint')} errorText={error?.fieldErrors?.reason}>
          <Textarea value={reason} rows={3} onChange={({ detail }) => setReason(detail.value)} />
        </FormField>
      </Dialog>
      <Dialog
        visible={publishing}
        header={t('publishTitle', { name: exam.name })}
        confirm={t('publish')}
        cancel={t('cancel')}
        busy={busy}
        onConfirm={() => void publish()}
        onDismiss={() => setPublishing(false)}
      >
        {t('publishBody')}
      </Dialog>
    </>
  );
}

export function MarksSheet({ sheet }: { sheet: Sheet }) {
  const t = useTranslations('exams');
  useCrumb(sheet.exam.name);
  const router = useRouter();
  const pathname = usePathname();
  const [marks, setMarks] = useState(
    () => new Map(sheet.students.map((student) => [student.id, student.marks === null ? '' : String(student.marks)])),
  );
  const [absent, setAbsent] = useState(() => new Set(sheet.students.filter((s) => s.isAbsent).map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const { paper, section } = sheet;
  const invalid = (id: string) => {
    const text = marks.get(id) ?? '';
    const value = Number(text);
    return text !== '' && (Number.isNaN(value) || value < 0 || value > paper.maxMarks || !Number.isInteger(value * 2));
  };
  const anyInvalid = sheet.students.some(({ id }) => !absent.has(id) && invalid(id));

  async function save() {
    if (!section) return;
    setBusy(true);
    setFeedback(null);
    const result = await saveMarks({
      examScheduleId: paper.id,
      sectionId: section.id,
      entries: sheet.students.map(({ id }) => {
        const text = marks.get(id) ?? '';
        const isAbsent = absent.has(id);
        return { studentId: id, isAbsent, marks: isAbsent || text === '' ? null : Number(text) };
      }),
    });
    setBusy(false);
    setFeedback(
      result.ok ? { type: 'success', text: t('marks.saved', result.data) } : { type: 'error', text: result.error.message },
    );
    if (result.ok) router.refresh();
  }

  const notice = sheet.exam.published
    ? t('marks.published')
    : paper.locked
      ? t('marks.locked')
      : !section
        ? t('marks.noSection')
        : !sheet.canEdit
          ? t('marks.readOnly')
          : null;

  return (
    <Table
      variant="container"
      stickyHeader
      trackBy="id"
      items={sheet.students}
      header={
        <SpaceBetween size="m">
          <Header
            variant="h1"
            counter={`(${sheet.students.length})`}
            description={t('marks.description', {
              exam: sheet.exam.name,
              className: paper.className,
              date: day(paper.date),
              max: paper.maxMarks,
              pass: paper.passMarks,
            })}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  href={`/exams/${sheet.exam.id}`}
                  onFollow={(event) => {
                    event.preventDefault();
                    router.push(`/exams/${sheet.exam.id}`);
                  }}
                >
                  {t('marks.back')}
                </Button>
                {sheet.canEdit && sheet.students.length > 0 && (
                  <Button variant="primary" loading={busy} disabled={anyInvalid} onClick={() => void save()}>
                    {t('marks.save')}
                  </Button>
                )}
              </SpaceBetween>
            }
          >
            {t('marks.title', { subject: paper.subject })}
          </Header>
          {sheet.sections.length > 1 && (
            <FormField label={t('marks.section')}>
              <Select
                selectedOption={options(sheet.sections).find((option) => option.value === section?.id) ?? null}
                options={options(sheet.sections)}
                onChange={({ detail }) =>
                  router.replace(`${pathname}?paper=${paper.id}&section=${detail.selectedOption.value ?? ''}`)
                }
              />
            </FormField>
          )}
          {feedback && (
            <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
              {feedback.text}
            </Alert>
          )}
          {notice && !feedback && <Alert type="info">{notice}</Alert>}
        </SpaceBetween>
      }
      empty={<EmptyState icon="marksEntry" heading={t('marks.empty.heading')} body={t('marks.empty.body')} />}
      columnDefinitions={[
        { id: 'rollNo', header: t('marks.rollNo'), cell: (student) => student.rollNo, width: 110 },
        { id: 'name', header: t('marks.student'), cell: (student) => student.name, isRowHeader: true },
        {
          id: 'marks',
          header: t('marks.outOf', { max: paper.maxMarks }),
          width: 200,
          cell: (student) => (
            <Input
              type="number"
              inputMode="decimal"
              step={0.5}
              ariaLabel={t('marks.marksFor', { name: student.name })}
              value={absent.has(student.id) ? '' : (marks.get(student.id) ?? '')}
              disabled={!sheet.canEdit || absent.has(student.id)}
              invalid={!absent.has(student.id) && invalid(student.id)}
              onChange={({ detail }) => setMarks((current) => new Map(current).set(student.id, detail.value))}
            />
          ),
        },
        {
          id: 'absent',
          header: t('marks.absent'),
          cell: (student) => (
            <Checkbox
              ariaLabel={t('marks.absentFor', { name: student.name })}
              checked={absent.has(student.id)}
              disabled={!sheet.canEdit}
              onChange={({ detail }) =>
                setAbsent((current) => {
                  const next = new Set(current);
                  if (detail.checked) next.add(student.id);
                  else next.delete(student.id);
                  return next;
                })
              }
            />
          ),
        },
        { id: 'grade', header: t('marks.grade'), cell: (student) => student.grade ?? '—' },
      ]}
    />
  );
}
