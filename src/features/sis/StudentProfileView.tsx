'use client';

import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Tabs from '@cloudscape-design/components/tabs';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { formatPhone } from '@/lib/phone';
import type { HistoryEntry, StudentProfile } from '@/server/modules/sis/schemas';
import { STATUS_TYPE } from './studentStatus';

const NONE = '—';

export function StudentProfileView({
  student,
  history,
  tab,
  added,
}: {
  student: StudentProfile;
  history: HistoryEntry[] | null;
  tab: string;
  added: boolean;
}) {
  const t = useTranslations('sis.students');
  const router = useRouter();
  const pathname = usePathname();
  const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
  const dateTime = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const actionLabel = (action: string) => {
    const key = `profile.history.actions.${action.replaceAll('.', '_')}`;
    return t.has(key) ? t(key) : action;
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={
            student.classSection &&
            t('profile.description', { classSection: student.classSection, rollNo: student.rollNo ?? NONE })
          }
        >
          {student.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {added && (
          <Alert
            type="success"
            dismissible
            dismissAriaLabel={t('profile.dismiss')}
            onDismiss={() => router.replace(pathname)}
          >
            {t('profile.added', { name: student.name, admissionNo: student.admissionNo })}
          </Alert>
        )}
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => router.replace(`${pathname}?tab=${detail.activeTabId}`)}
          tabs={[
            {
              id: 'overview',
              label: t('profile.tabs.overview'),
              content: (
                <Container>
                  <KeyValuePairs
                    columns={3}
                    items={[
                      {
                        label: t('columns.admissionNo'),
                        value: (
                          <CopyToClipboard
                            variant="inline"
                            textToCopy={student.admissionNo}
                            copyButtonAriaLabel={t('profile.copyAdmissionNo', { admissionNo: student.admissionNo })}
                            copySuccessText={t('profile.copied')}
                            copyErrorText={t('profile.copyFailed')}
                          />
                        ),
                      },
                      {
                        label: t('columns.status'),
                        value: (
                          <StatusIndicator type={STATUS_TYPE[student.status]}>
                            {t(`status.${student.status}`)}
                          </StatusIndicator>
                        ),
                      },
                      { label: t('columns.classSection'), value: student.classSection ?? NONE },
                      { label: t('profile.dob'), value: date.format(new Date(`${student.dob}T00:00:00Z`)) },
                      { label: t('profile.gender'), value: t(`gender.${student.gender}`) },
                      { label: t('profile.bloodGroup'), value: student.bloodGroup ?? NONE },
                      { label: t('profile.address'), value: student.address ?? NONE },
                    ]}
                  />
                </Container>
              ),
            },
            {
              id: 'guardians',
              label: t('profile.tabs.guardians'),
              content: (
                <Table
                  trackBy="id"
                  items={student.guardians}
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: t('columns.name'),
                      isRowHeader: true,
                      cell: (guardian) => (
                        <SpaceBetween direction="horizontal" size="xs">
                          {guardian.name}
                          {guardian.isPrimary && <Badge>{t('profile.primary')}</Badge>}
                        </SpaceBetween>
                      ),
                    },
                    { id: 'relation', header: t('profile.relation'), cell: (g) => t(`relation.${g.relation}`) },
                    {
                      id: 'phone',
                      header: t('columns.phone'),
                      cell: (g) => <Link href={`tel:${g.phone}`}>{formatPhone(g.phone)}</Link>,
                    },
                    { id: 'email', header: t('profile.email'), cell: (g) => g.email ?? NONE },
                  ]}
                />
              ),
            },
            ...(history
              ? [
                  {
                    id: 'history',
                    label: t('profile.tabs.history'),
                    content: (
                      <Table
                        trackBy="id"
                        items={history}
                        empty={
                          <EmptyState
                            icon="auditLog"
                            heading={t('profile.history.emptyHeading')}
                            body={t('profile.history.emptyBody')}
                          />
                        }
                        columnDefinitions={[
                          {
                            id: 'at',
                            header: t('profile.history.when'),
                            cell: (entry) => dateTime.format(new Date(entry.at)),
                          },
                          { id: 'actor', header: t('profile.history.who'), cell: (entry) => entry.actor },
                          { id: 'action', header: t('profile.history.what'), cell: (entry) => actionLabel(entry.action) },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
