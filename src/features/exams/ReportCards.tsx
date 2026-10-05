'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { useCrumb } from '@/components/Crumb';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { usePrintInLightMode } from '@/lib/usePrintInLightMode';
import { generateReportCards, publishReportCards, saveReportCardRemarks } from '@/server/modules/exams/actions';
import type { ReportCardDetail, ReportCardList, ReportCardRow } from '@/server/modules/exams/reportCards';
import { Results } from './Results';

const NONE = '—';
const STATUS_TYPE: Record<ReportCardRow['status'], StatusIndicatorProps.Type> = {
  none: 'stopped',
  draft: 'pending',
  published: 'success',
  withdrawn: 'stopped',
};
type Feedback = { type: 'success' | 'error'; text: string };

export function ReportCardsTable({
  list,
  canGenerate,
  canPublish,
  canRemark,
}: {
  list: ReportCardList;
  canGenerate: boolean;
  canPublish: boolean;
  canRemark: boolean;
}) {
  const t = useTranslations('exams.reportCards');
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState<'generate' | 'publish' | 'remarks' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [editing, setEditing] = useState<ReportCardRow | null>(null);
  const [remarks, setRemarks] = useState({ classTeacherRemark: '', principalRemark: '' });
  const [publishing, setPublishing] = useState(false);
  const { section } = list;
  const drafts = list.rows.filter((row) => row.status === 'draft').length;
  // The class teacher writes their own remark; the principal may write both.
  const mayEditTeacherRemark = canRemark && (list.isClassTeacher || canPublish);
  const sectionOptions = list.sections.map(({ id, name }) => ({ value: id, label: name }));

  async function generate() {
    if (!section) return;
    setBusy('generate');
    const result = await generateReportCards(section.id);
    setBusy(null);
    setFeedback(
      result.ok ? { type: 'success', text: t('generated', result.data) } : { type: 'error', text: result.error.message },
    );
    router.refresh();
  }

  async function publish() {
    if (!section) return;
    setBusy('publish');
    const result = await publishReportCards(section.id);
    setBusy(null);
    setPublishing(false);
    setFeedback(
      result.ok ? { type: 'success', text: t('published', result.data) } : { type: 'error', text: result.error.message },
    );
    router.refresh();
  }

  async function save() {
    if (!editing?.cardId) return;
    setBusy('remarks');
    const result = await saveReportCardRemarks({
      id: editing.cardId,
      ...(mayEditTeacherRemark && { classTeacherRemark: remarks.classTeacherRemark }),
      ...(canPublish && { principalRemark: remarks.principalRemark }),
    });
    setBusy(null);
    setEditing(null);
    setFeedback(
      result.ok
        ? { type: 'success', text: t('remarksSaved', { name: editing.name }) }
        : { type: 'error', text: result.error.message },
    );
    router.refresh();
  }

  return (
    <>
      <Table
        variant="container"
        stickyHeader
        trackBy="studentId"
        items={list.rows}
        header={
          <SpaceBetween size="m">
            <Header
              variant="h1"
              counter={section ? `(${list.rows.length})` : ''}
              description={t('description')}
              actions={
                section && (
                  <SpaceBetween direction="horizontal" size="xs">
                    {canPublish && (
                      <Button disabled={drafts === 0} onClick={() => setPublishing(true)}>
                        {t('publish', { count: drafts })}
                      </Button>
                    )}
                    {canGenerate && (
                      <Button variant="primary" loading={busy === 'generate'} onClick={() => void generate()}>
                        {t('generate')}
                      </Button>
                    )}
                  </SpaceBetween>
                )
              }
            >
              {t('title')}
            </Header>
            {feedback && (
              <Alert type={feedback.type} dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => setFeedback(null)}>
                {feedback.text}
              </Alert>
            )}
          </SpaceBetween>
        }
        filter={
          <Select
            inlineLabelText={t('section')}
            placeholder={t('sectionPlaceholder')}
            selectedOption={sectionOptions.find((option) => option.value === section?.id) ?? null}
            options={sectionOptions}
            empty={t('noSections')}
            onChange={({ detail }) => router.replace(`${pathname}?section=${detail.selectedOption.value ?? ''}`)}
          />
        }
        empty={
          <EmptyState
            icon="reportCard"
            heading={t(section ? 'empty.heading' : 'choose.heading')}
            body={t(section ? 'empty.body' : 'choose.body')}
          />
        }
        columnDefinitions={[
          { id: 'rollNo', header: t('columns.rollNo'), cell: (row) => row.rollNo, width: 110 },
          {
            id: 'name',
            header: t('columns.name'),
            isRowHeader: true,
            cell: (row) => (row.cardId ? <AppLink href={`/report-cards/${row.cardId}`}>{row.name}</AppLink> : row.name),
          },
          { id: 'percent', header: t('columns.percent'), cell: (row) => (row.percent === null ? NONE : `${row.percent}%`) },
          {
            id: 'status',
            header: t('columns.status'),
            cell: (row) => <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`status.${row.status}`)}</StatusIndicator>,
          },
          { id: 'remark', header: t('columns.remark'), cell: (row) => row.classTeacherRemark || NONE },
          ...(mayEditTeacherRemark || canPublish
            ? [
                {
                  id: 'actions',
                  header: t('columns.actions'),
                  cell: (row: ReportCardRow) =>
                    row.status === 'draft' && (
                      <Button
                        variant="inline-link"
                        ariaLabel={t('remarksLabel', { name: row.name })}
                        onClick={() => {
                          setRemarks({ classTeacherRemark: row.classTeacherRemark, principalRemark: row.principalRemark });
                          setEditing(row);
                        }}
                      >
                        {t('remarks')}
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
      />
      <Modal
        visible={Boolean(editing)}
        header={t('remarksTitle', { name: editing?.name ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setEditing(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy === 'remarks'} onClick={() => void save()}>
                {t('saveRemarks')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {mayEditTeacherRemark && (
            <FormField label={t('classTeacherRemark')} constraintText={t('remarkHint')}>
              <Textarea
                value={remarks.classTeacherRemark}
                rows={3}
                onChange={({ detail }) => setRemarks({ ...remarks, classTeacherRemark: detail.value.slice(0, 300) })}
              />
            </FormField>
          )}
          {canPublish && (
            <FormField label={t('principalRemark')} constraintText={t('remarkHint')}>
              <Textarea
                value={remarks.principalRemark}
                rows={3}
                onChange={({ detail }) => setRemarks({ ...remarks, principalRemark: detail.value.slice(0, 300) })}
              />
            </FormField>
          )}
        </SpaceBetween>
      </Modal>
      <Modal
        visible={publishing}
        header={t('publishTitle', { section: section?.name ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setPublishing(false)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setPublishing(false)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={busy === 'publish'} onClick={() => void publish()}>
                {t('publish', { count: drafts })}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('publishBody')}
      </Modal>
    </>
  );
}

export function ReportCardView({ card }: { card: ReportCardDetail }) {
  const t = useTranslations('exams.reportCards');
  useCrumb(card.studentName);
  usePrintInLightMode();

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={card.schoolName}
          actions={
            <div className="vw-no-print">
              <Button variant="primary" iconSvg={svg('print')} onClick={() => window.print()}>
                {t('print')}
              </Button>
            </div>
          }
        >
          {t('cardTitle', { name: card.studentName })}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {card.status !== 'published' && (
          <div className="vw-no-print">
            <Alert type="info">{t('draftNote')}</Alert>
          </div>
        )}
        <Container>
          <KeyValuePairs
            columns={3}
            items={[
              { label: t('view.student'), value: card.studentName },
              { label: t('view.admissionNo'), value: card.admissionNo },
              { label: t('view.classSection'), value: t('view.classRoll', { classSection: card.classSection, rollNo: card.rollNo }) },
              {
                label: t('view.overall'),
                value:
                  card.percent === null ? NONE : t('view.overallValue', { total: card.total, max: card.maxTotal, percent: card.percent }),
              },
              {
                label: t('view.attendance'),
                value: card.attendancePercent === null ? NONE : `${card.attendancePercent}%`,
              },
            ]}
          />
        </Container>
        <Results results={card.exams} />
        <Container header={<Header variant="h2">{t('view.remarks')}</Header>}>
          <KeyValuePairs
            columns={2}
            items={[
              { label: t('classTeacherRemark'), value: card.classTeacherRemark || NONE },
              { label: t('principalRemark'), value: card.principalRemark || NONE },
            ]}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
