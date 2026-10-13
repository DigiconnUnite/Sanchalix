'use client';

import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import type { StudentResult } from '@/server/modules/exams/service';

const NONE = '—';

export function Results({ results }: { results: StudentResult[] }) {
  const t = useTranslations('exams.results');
  if (results.length === 0) {
    return <EmptyState icon="reportCard" heading={t('empty.heading')} body={t('empty.body')} />;
  }
  return (
    <SpaceBetween size="l">
      {results.map((result) => (
        <Table
          key={result.examId}
          variant="container"
          trackBy="subject"
          items={result.papers}
          header={
            <Header
              variant="h2"
              description={
                result.percent === null
                  ? undefined
                  : t('total', { total: result.total, max: result.maxTotal, percent: result.percent })
              }
            >
              {result.term ? `${result.exam} · ${result.term}` : result.exam}
            </Header>
          }
          columnDefinitions={[
            { id: 'subject', header: t('subject'), cell: (paper) => paper.subject, isRowHeader: true },
            {
              id: 'marks',
              header: t('marks'),
              cell: (paper) =>
                paper.isAbsent ? t('absent') : paper.marks === null ? NONE : t('outOf', { marks: paper.marks, max: paper.maxMarks }),
            },
            { id: 'grade', header: t('grade'), cell: (paper) => paper.grade ?? NONE },
            {
              id: 'result',
              header: t('result'),
              cell: (paper) =>
                paper.marks === null && !paper.isAbsent ? (
                  NONE
                ) : (
                  <StatusIndicator type={paper.passed ? 'success' : 'error'}>
                    {t(paper.passed ? 'pass' : 'fail')}
                  </StatusIndicator>
                ),
            },
          ]}
        />
      ))}
    </SpaceBetween>
  );
}
