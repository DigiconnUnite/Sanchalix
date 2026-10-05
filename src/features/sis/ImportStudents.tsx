'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { svg } from '@/components/icons';
import { useRouter } from '@/i18n/navigation';
import { importStudents } from '@/server/modules/sis/actions';

type Report = {
  total: number;
  imported: number;
  errorCount: number;
  errors: { row: number; field: string; message: string }[];
};

export function ImportStudents({ columns, sections }: { columns: readonly string[]; sections: string[] }) {
  const t = useTranslations('sis.import');
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = report !== null && report.errorCount === 0 && report.imported === 0;
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`${columns.join(',')}\n`)}`;

  async function run(dryRun: boolean) {
    const file = files[0];
    if (!file) return setFailure(t('errors.noFile'));
    setBusy(true);
    setFailure(null);
    const result = await importStudents({ csv: await file.text(), dryRun });
    setBusy(false);
    if (!result.ok) {
      setReport(null);
      return setFailure(result.error.message);
    }
    setReport(result.data);
    if (result.data.imported > 0) router.refresh();
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={t('description')}
          actions={
            <Button href={template} download="students-template.csv" iconSvg={svg('download')}>
              {t('template')}
            </Button>
          }
        >
          {t('title')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {failure && <Alert type="error">{failure}</Alert>}
        {report && report.imported > 0 && (
          <Alert
            type="success"
            action={
              <Button
                href="/students"
                onFollow={(event) => {
                  event.preventDefault();
                  router.push('/students');
                }}
              >
                {t('viewStudents')}
              </Button>
            }
          >
            {t('imported', { count: report.imported })}
          </Alert>
        )}
        {ready && <Alert type="info">{t('ready', { count: report.total })}</Alert>}
        <Container header={<Header variant="h2">{t('file')}</Header>}>
          <SpaceBetween size="l">
            <Box>{t('columns', { columns: columns.join(', ') })}</Box>
            <Box>{t(sections.length ? 'sections' : 'noSections', { sections: sections.join(', ') })}</Box>
            <FormField label={t('choose')} constraintText={t('constraint')}>
              <FileUpload
                value={files}
                accept=".csv,text/csv"
                showFileSize
                i18nStrings={{
                  uploadButtonText: () => t('choose'),
                  dropzoneText: () => t('drop'),
                  removeFileAriaLabel: () => t('remove'),
                  limitShowFewer: t('showFewer'),
                  limitShowMore: t('showMore'),
                  errorIconAriaLabel: t('errorIcon'),
                }}
                onChange={({ detail }) => {
                  setFiles(detail.value);
                  setReport(null);
                  setFailure(null);
                }}
              />
            </FormField>
            <Button variant="primary" loading={busy} disabled={files.length === 0} onClick={() => void run(!ready)}>
              {ready ? t('import', { count: report.total }) : t('check')}
            </Button>
          </SpaceBetween>
        </Container>
        {report && report.errorCount > 0 && (
          <Table
            variant="container"
            trackBy={(item) => `${item.row}-${item.field}`}
            items={report.errors}
            header={
              <Header
                variant="h2"
                counter={`(${report.errorCount})`}
                description={t('errorsDescription', { shown: report.errors.length, count: report.errorCount })}
              >
                {t('errorsTitle')}
              </Header>
            }
            columnDefinitions={[
              { id: 'row', header: t('row'), cell: (item) => item.row, isRowHeader: true },
              { id: 'field', header: t('column'), cell: (item) => item.field },
              { id: 'message', header: t('problem'), cell: (item) => item.message },
            ]}
          />
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
