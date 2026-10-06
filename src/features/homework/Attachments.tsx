'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Link from '@cloudscape-design/components/link';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

const MAX_BYTES = 5 * 1024 * 1024;

export function AttachmentLinks({ homeworkId, files }: { homeworkId: string; files: { id: string; fileName: string }[] }) {
  const t = useTranslations('homework.files');
  if (files.length === 0) return null;
  return (
    <SpaceBetween direction="horizontal" size="s">
      {files.map((file) => (
        <Link
          key={file.id}
          href={`/api/v1/homework/${homeworkId}/attachments/${file.id}`}
          external
          externalIconAriaLabel={t('download')}
          fontSize="body-s"
        >
          {file.fileName}
        </Link>
      ))}
    </SpaceBetween>
  );
}

export function AttachFile({ homeworkId, title }: { homeworkId: string; title: string }) {
  const t = useTranslations('homework.files');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = files[0];
  const tooBig = Boolean(file && file.size > MAX_BYTES);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set('file', file);
    try {
      const response = await fetch(`/api/v1/homework/${homeworkId}/attachments`, { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (result.ok) {
        setOpen(false);
        setFiles([]);
        router.refresh();
      } else setError(result.error?.message ?? t('failed'));
    } catch {
      setError(t('failed'));
    }
    setBusy(false);
  }

  return (
    <>
      <Button variant="inline-link" ariaLabel={t('attachLabel', { title })} onClick={() => setOpen(true)}>
        {t('attach')}
      </Button>
      <Modal
        visible={open}
        header={t('attachTitle', { title })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setOpen(false)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy} disabled={!file || tooBig} onClick={() => void upload()}>
                {t('upload')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && <Alert type="error">{error}</Alert>}
          <FormField label={t('file')} constraintText={t('hint')} errorText={tooBig ? t('tooBig') : null}>
            <FileUpload
              value={files}
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              showFileSize
              i18nStrings={{
                uploadButtonText: () => t('choose'),
                dropzoneText: () => t('drop'),
                removeFileAriaLabel: () => t('remove'),
                limitShowFewer: t('showFewer'),
                limitShowMore: t('showMore'),
                errorIconAriaLabel: t('errorIcon'),
              }}
              onChange={({ detail }) => setFiles(detail.value.slice(-1))}
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}
