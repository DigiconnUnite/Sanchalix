'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { deleteAdmissionDocument, verifyAdmissionDocument } from '@/server/modules/admissions/actions';
import { deleteStaffDocument, verifyStaffDocument } from '@/server/modules/hr/actions';
import { deleteStudentDocument, verifyStudentDocument } from '@/server/modules/sis/actions';
import type { DocumentOwner, DocumentRow } from '@/server/modules/sis/documents';

const TYPES: Record<DocumentOwner, string[]> = {
  student: ['birth_certificate', 'transfer_certificate_prev', 'aadhaar', 'photo', 'report_card_prev', 'medical', 'other'],
  admission: ['birth_certificate', 'transfer_certificate_prev', 'aadhaar', 'photo', 'report_card_prev', 'medical', 'other'],
  staff: ['qualification', 'id_proof', 'appointment_letter', 'experience_letter', 'other'],
};
const PATH: Record<DocumentOwner, string> = { student: 'students', admission: 'admissions', staff: 'staff' };
const MAX_BYTES = 5 * 1024 * 1024;
type Feedback = { type: 'success' | 'error'; text: string };

export function StudentDocuments({
  studentId,
  owner = 'student',
  documents,
  canEdit,
}: {
  /** The id of the student, the application or the staff member, as `owner` says. */
  studentId: string;
  owner?: DocumentOwner;
  documents: DocumentRow[];
  canEdit: boolean;
}) {
  const t = useTranslations('sis.documents');
  const router = useRouter();
  const [type, setType] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [removing, setRemoving] = useState<DocumentRow | null>(null);
  const typeOptions = TYPES[owner].map((value) => ({ value, label: t(`type.${value}`) }));
  const file = files[0];
  const tooBig = Boolean(file && file.size > MAX_BYTES);
  const base = `/api/v1/${PATH[owner]}/${studentId}/documents`;
  const verify = (documentId: string) =>
    owner === 'admission'
      ? verifyAdmissionDocument({ admissionId: studentId, documentId })
      : owner === 'staff'
        ? verifyStaffDocument({ staffId: studentId, documentId })
        : verifyStudentDocument({ studentId, documentId });
  const remove = (documentId: string) =>
    owner === 'admission'
      ? deleteAdmissionDocument({ admissionId: studentId, documentId })
      : owner === 'staff'
        ? deleteStaffDocument({ staffId: studentId, documentId })
        : deleteStudentDocument({ studentId, documentId });

  async function upload() {
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    const body = new FormData();
    body.set('type', type);
    body.set('file', file);
    try {
      const response = await fetch(base, { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; error?: { message: string } };
      setFeedback(
        result.ok
          ? { type: 'success', text: t('uploaded', { name: file.name }) }
          : { type: 'error', text: result.error?.message ?? t('errors.failed') },
      );
      if (result.ok) {
        setFiles([]);
        setType('');
        router.refresh();
      }
    } catch {
      setFeedback({ type: 'error', text: t('errors.failed') });
    }
    setBusy(false);
  }

  async function act(run: () => Promise<{ ok: boolean; error?: { message: string } }>, done: string) {
    setBusy(true);
    const result = await run();
    setBusy(false);
    setRemoving(null);
    setFeedback(result.ok ? { type: 'success', text: done } : { type: 'error', text: result.error?.message ?? '' });
    router.refresh();
  }

  return (
    <SpaceBetween size="l">
      {feedback && (
        <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </Alert>
      )}
      <Table
        variant="container"
        trackBy="id"
        items={documents}
        header={
          <Header variant="h2" counter={`(${documents.length})`} description={t('description')}>
            {t('title')}
          </Header>
        }
        empty={<EmptyState icon="documents" heading={t('empty.heading')} body={t('empty.body')} />}
        columnDefinitions={[
          { id: 'type', header: t('columns.type'), cell: (row) => t(`type.${row.type}`), isRowHeader: true },
          {
            id: 'file',
            header: t('columns.file'),
            cell: (row) => (
              <Link href={`${base}/${row.id}`} external externalIconAriaLabel={t('download')}>
                {row.fileName}
              </Link>
            ),
          },
          { id: 'size', header: t('columns.size'), cell: (row) => t('size', { kb: Math.max(1, Math.round(row.size / 1024)) }) },
          {
            id: 'verified',
            header: t('columns.verified'),
            cell: (row) => (
              <StatusIndicator type={row.verified ? 'success' : 'pending'}>
                {t(row.verified ? 'verified' : 'notVerified')}
              </StatusIndicator>
            ),
          },
          ...(canEdit
            ? [
                {
                  id: 'actions',
                  header: t('columns.actions'),
                  cell: (row: DocumentRow) => (
                    <SpaceBetween direction="horizontal" size="s">
                      {!row.verified && (
                        <Button
                          variant="inline-link"
                          ariaLabel={t('verifyLabel', { name: row.fileName })}
                          onClick={() => void act(() => verify(row.id), t('verifiedDone'))}
                        >
                          {t('verify')}
                        </Button>
                      )}
                      <Button
                        variant="inline-link"
                        ariaLabel={t('deleteLabel', { name: row.fileName })}
                        onClick={() => setRemoving(row)}
                      >
                        {t('delete')}
                      </Button>
                    </SpaceBetween>
                  ),
                },
              ]
            : []),
        ]}
      />
      {canEdit && (
        <Container header={<Header variant="h2">{t('upload.title')}</Header>}>
          <SpaceBetween size="l">
            <FormField label={t('columns.type')}>
              <Select
                placeholder={t('upload.typePlaceholder')}
                selectedOption={typeOptions.find((option) => option.value === type) ?? null}
                options={typeOptions}
                onChange={({ detail }) => setType(detail.selectedOption.value ?? '')}
              />
            </FormField>
            <FormField label={t('upload.file')} constraintText={t('upload.hint')} errorText={tooBig ? t('errors.size') : null}>
              <FileUpload
                value={files}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                showFileSize
                i18nStrings={{
                  uploadButtonText: () => t('upload.choose'),
                  dropzoneText: () => t('upload.drop'),
                  removeFileAriaLabel: () => t('upload.remove'),
                  limitShowFewer: t('upload.showFewer'),
                  limitShowMore: t('upload.showMore'),
                  errorIconAriaLabel: t('upload.errorIcon'),
                }}
                onChange={({ detail }) => setFiles(detail.value.slice(-1))}
              />
            </FormField>
            <Button
              variant="primary"
              iconSvg={svg('upload')}
              loading={busy}
              disabled={!file || !type || tooBig}
              onClick={() => void upload()}
            >
              {t('upload.submit')}
            </Button>
          </SpaceBetween>
        </Container>
      )}
      <Modal
        visible={Boolean(removing)}
        header={t('deleteTitle', { name: removing?.fileName ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setRemoving(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setRemoving(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => removing && void act(() => remove(removing.id), t('deleted'))}
              >
                {t('deleteConfirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('deleteBody')}
      </Modal>
    </SpaceBetween>
  );
}
