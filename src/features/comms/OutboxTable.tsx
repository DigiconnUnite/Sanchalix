'use client';

import Box from '@cloudscape-design/components/box';
import Header from '@cloudscape-design/components/header';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import type { OutboxRow } from '@/server/messaging/send';

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function OutboxTable({ messages }: { messages: OutboxRow[] }) {
  const t = useTranslations('outbox');
  return (
    <Table
      variant="container"
      stickyHeader
      wrapLines
      trackBy="id"
      items={messages}
      header={
        <Header variant="h2" counter={`(${messages.length})`} description={t('description')}>
          {t('title')}
        </Header>
      }
      empty={<EmptyState icon="sms" heading={t('empty.heading')} body={t('empty.body')} />}
      columnDefinitions={[
        { id: 'sentAt', header: t('sentAt'), cell: (message) => dateTime.format(new Date(message.sentAt)), width: 190 },
        { id: 'channel', header: t('channel'), cell: (message) => t(`channels.${message.channel}`), width: 110 },
        { id: 'to', header: t('to'), cell: (message) => message.to, isRowHeader: true, width: 220 },
        { id: 'template', header: t('kind'), cell: (message) => t(`kinds.${message.template}`), width: 170 },
        {
          id: 'body',
          header: t('message'),
          cell: (message) => message.body ?? <Box color="text-status-inactive">{t('notKept')}</Box>,
        },
        {
          id: 'status',
          header: t('status'),
          width: 150,
          cell: (message) => (
            <StatusIndicator type={message.status === 'sent' ? 'success' : message.status === 'failed' ? 'error' : 'stopped'}>
              {t(`statuses.${message.status}`)}
            </StatusIndicator>
          ),
        },
      ]}
    />
  );
}
