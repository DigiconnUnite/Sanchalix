'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatMoney } from '@/lib/money';
import { approveFeeStructure, deleteFeeStructure } from '@/server/modules/fees/actions';
import type { FeeStructureRow } from '@/server/modules/fees/schemas';

const NEW = '/fees/structures/new';
const HEADS = '/fees/heads';
const STATUS_TYPE: Record<FeeStructureRow['status'], StatusIndicatorProps.Type> = {
  draft: 'pending',
  approved: 'info',
  active: 'success',
};

type Feedback = { type: 'success' | 'error'; text: string };

export function FeeStructuresTable({
  structures,
  canEdit,
  canApprove,
  created,
  updated,
}: {
  structures: FeeStructureRow[];
  canEdit: boolean;
  canApprove: boolean;
  created: string | null;
  updated: string | null;
}) {
  const t = useTranslations('fees');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<FeeStructureRow | null>(null);
  const [removing, setRemoving] = useState<FeeStructureRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Feedback | null>(null);
  const saved = created ?? updated;
  const feedback =
    result ??
    (saved
      ? { type: 'success' as const, text: t(created ? 'structures.created' : 'structures.updated', { name: saved }) }
      : null);

  const link = (href: string, label: string, primary = false) => (
    <Button
      {...(primary && { variant: 'primary' as const })}
      href={href}
      onFollow={(event) => {
        event.preventDefault();
        router.push(href);
      }}
    >
      {label}
    </Button>
  );

  async function approve() {
    if (!pending) return;
    setBusy(true);
    const response = await approveFeeStructure(pending.id);
    setBusy(false);
    setPending(null);
    setResult(
      response.ok
        ? {
            type: 'success',
            text: t('structures.approved', { name: response.data.name, count: response.data.invoicesIssued }),
          }
        : { type: 'error', text: response.error.message },
    );
    router.replace(pathname);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const response = await deleteFeeStructure(removing.id);
    setBusy(false);
    setRemoving(null);
    setResult(
      response.ok
        ? { type: 'success', text: t('structures.deleted', { name: response.data.name }) }
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
        items={structures}
        header={
          <SpaceBetween size="m">
            <Header
              variant="h1"
              counter={`(${structures.length})`}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  {link(HEADS, t('structures.feeHeads'))}
                  {canEdit && link(NEW, t('structures.add'), true)}
                </SpaceBetween>
              }
            >
              {t('structures.title')}
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
        empty={
          <EmptyState
            icon="fees"
            heading={t('structures.empty.heading')}
            body={t('structures.empty.body')}
            action={canEdit && link(NEW, t('structures.add'))}
          />
        }
        columnDefinitions={[
          { id: 'name', header: t('structures.columns.name'), cell: (row) => row.name, isRowHeader: true },
          { id: 'classes', header: t('structures.columns.classes'), cell: (row) => row.classes },
          { id: 'total', header: t('structures.columns.total'), cell: (row) => formatMoney(row.totalMinor) },
          { id: 'installments', header: t('structures.columns.installments'), cell: (row) => row.installments },
          {
            id: 'status',
            header: t('structures.columns.status'),
            cell: (row) => (
              <StatusIndicator type={STATUS_TYPE[row.status]}>{t(`structures.status.${row.status}`)}</StatusIndicator>
            ),
          },
          ...(canApprove || canEdit
            ? [
                {
                  id: 'actions',
                  header: t('structures.columns.actions'),
                  cell: (row: FeeStructureRow) =>
                    row.status === 'draft' && (
                      <SpaceBetween direction="horizontal" size="s">
                        {canApprove && (
                          <Button
                            variant="inline-link"
                            ariaLabel={t('structures.approveLabel', { name: row.name })}
                            onClick={() => setPending(row)}
                          >
                            {t('structures.approve')}
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="inline-link"
                            ariaLabel={t('structures.editLabel', { name: row.name })}
                            href={`/fees/structures/${row.id}/edit`}
                            onFollow={(event) => {
                              event.preventDefault();
                              router.push(`/fees/structures/${row.id}/edit`);
                            }}
                          >
                            {t('structures.edit')}
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="inline-link"
                            ariaLabel={t('structures.deleteLabel', { name: row.name })}
                            onClick={() => setRemoving(row)}
                          >
                            {t('structures.delete')}
                          </Button>
                        )}
                      </SpaceBetween>
                    ),
                },
              ]
            : []),
        ]}
      />
      <Modal
        visible={Boolean(pending)}
        header={t('structures.approveTitle', { name: pending?.name ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setPending(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setPending(null)}>{t('cancel')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void approve()}>
                {t('structures.approveConfirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('structures.approveBody')}
      </Modal>
      <Modal
        visible={Boolean(removing)}
        header={t('structures.deleteTitle', { name: removing?.name ?? '' })}
        closeAriaLabel={t('cancel')}
        onDismiss={() => setRemoving(null)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setRemoving(null)}>{t('cancel')}</Button>
              <Button variant="primary" loading={busy} onClick={() => void remove()}>
                {t('structures.deleteConfirm')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {t('structures.deleteBody')}
      </Modal>
    </>
  );
}
