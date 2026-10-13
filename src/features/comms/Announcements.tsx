'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Multiselect from '@cloudscape-design/components/multiselect';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Textarea from '@cloudscape-design/components/textarea';
import Tiles from '@cloudscape-design/components/tiles';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AppLink } from '@/components/AppLink';
import { useCrumb } from '@/components/Crumb';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { RoleKey } from '@/server/auth/permissions';
import { acknowledgeAnnouncement, previewAudience, publishAnnouncement } from '@/server/modules/comms/actions';
import type { AnnouncementDetail, AnnouncementRow } from '@/server/modules/comms/schemas';

const LIST = '/communication/announcements';
const NEW = `${LIST}/new`;
const STAFF_ROLES: RoleKey[] = ['school_admin', 'principal', 'teacher', 'accountant', 'librarian', 'transport_manager'];
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const day = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

function useAudienceLabel() {
  const t = useTranslations('comms.audience');
  const tRole = useTranslations('shell.roles');
  return (audience: AnnouncementRow['audience']) =>
    audience.type === 'school'
      ? t('school')
      : audience.type === 'section'
        ? t('sections', { sections: audience.sections.join(', ') })
        : t('roles', { roles: audience.roles.map((role) => tRole(role)).join(', ') });
}

export function AnnouncementsTable({
  announcements,
  canCreate,
  published,
  recipients,
  scheduled,
}: {
  announcements: AnnouncementRow[];
  canCreate: boolean;
  published: string | null;
  recipients: number;
  scheduled: boolean;
}) {
  const t = useTranslations('comms');
  const router = useRouter();
  const pathname = usePathname();
  const audienceLabel = useAudienceLabel();
  const addButton = (primary: boolean) => (
    <Button
      {...(primary && { variant: 'primary' as const })}
      href={NEW}
      onFollow={(event) => {
        event.preventDefault();
        router.push(NEW);
      }}
    >
      {t('announcements.add')}
    </Button>
  );

  return (
    <Table
      variant="container"
      stickyHeader
      enableKeyboardNavigation
      wrapLines
      trackBy="id"
      items={announcements}
      header={
        <SpaceBetween size="m">
          <Header variant="h2" counter={`(${announcements.length})`} actions={canCreate && addButton(true)}>
            {t('announcements.title')}
          </Header>
          {published && (
            <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => router.replace(pathname)}>
              {t(scheduled ? 'announcements.scheduledNotice' : 'announcements.published', { title: published, count: recipients })}
            </Alert>
          )}
        </SpaceBetween>
      }
      empty={
        <EmptyState
          icon="announcements"
          heading={t('announcements.empty.heading')}
          body={t('announcements.empty.body')}
          action={canCreate && addButton(false)}
        />
      }
      columnDefinitions={[
        {
          id: 'title',
          header: t('announcements.columns.title'),
          isRowHeader: true,
          cell: (row) => (
            <SpaceBetween size="xxxs">
              <AppLink href={`${LIST}/${row.id}`}>{row.title}</AppLink>
              <Box color="text-body-secondary">{row.excerpt}</Box>
            </SpaceBetween>
          ),
        },
        { id: 'audience', header: t('announcements.columns.audience'), cell: (row) => audienceLabel(row.audience) },
        { id: 'author', header: t('announcements.columns.author'), cell: (row) => row.author },
        {
          id: 'published',
          header: t('announcements.columns.published'),
          cell: (row) =>
            row.scheduled ? (
              <StatusIndicator type="pending">
                {t('announcements.scheduledFor', { date: day.format(new Date(row.publishedAt)) })}
              </StatusIndicator>
            ) : (
              <SpaceBetween size="xxxs">
                <span>{dateTime.format(new Date(row.publishedAt))}</span>
                {row.expiresOn && (
                  <Box color="text-body-secondary" fontSize="body-s">
                    {t(new Date(row.expiresOn) < new Date() ? 'announcements.expired' : 'announcements.until', {
                      date: day.format(new Date(row.expiresOn)),
                    })}
                  </Box>
                )}
              </SpaceBetween>
            ),
        },
      ]}
    />
  );
}

export function AnnouncementView({ announcement }: { announcement: AnnouncementDetail }) {
  const t = useTranslations('comms.announcements');
  useCrumb(announcement.title);
  const router = useRouter();
  const audienceLabel = useAudienceLabel();
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    setConfirming(true);
    await acknowledgeAnnouncement(announcement.id);
    setConfirming(false);
    router.refresh();
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={t('by', { author: announcement.author, date: dateTime.format(new Date(announcement.publishedAt)) })}
          actions={
            <Button
              href={LIST}
              onFollow={(event) => {
                event.preventDefault();
                router.push(LIST);
              }}
            >
              {t('back')}
            </Button>
          }
        >
          {announcement.title}
        </Header>
      }
    >
      <Container
        footer={
          <SpaceBetween size="xxs">
            <Box color="text-body-secondary">{audienceLabel(announcement.audience)}</Box>
            {announcement.recipients !== null && (
              <StatusIndicator type="success">{t('reached', { count: announcement.recipients })}</StatusIndicator>
            )}
            {announcement.ackCount !== null && (
              <StatusIndicator type={announcement.ackCount > 0 ? 'info' : 'pending'}>
                {t('confirmedBy', { count: announcement.ackCount })}
              </StatusIndicator>
            )}
            {announcement.acknowledged === true && <StatusIndicator type="success">{t('youConfirmed')}</StatusIndicator>}
            {announcement.acknowledged === false && (
              <Box margin={{ top: 'xs' }}>
                <Button variant="primary" loading={confirming} onClick={() => void confirm()}>
                  {t('confirmRead')}
                </Button>
              </Box>
            )}
          </SpaceBetween>
        }
      >
        <SpaceBetween size="s">
          {announcement.body.split(/\n{2,}/).map((paragraph, index) => (
            <Box key={index} variant="p">
              {paragraph}
            </Box>
          ))}
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}

export function AnnouncementForm({ sections }: { sections: { id: string; name: string }[] }) {
  const t = useTranslations('comms');
  const tRole = useTranslations('shell.roles');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<'school' | 'role' | 'section'>('school');
  const [roles, setRoles] = useState<RoleKey[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [requiresAck, setRequiresAck] = useState(false);
  const [publishOn, setPublishOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const sectionOptions = sections.map(({ id, name }) => ({ value: id, label: name }));
  const sectionsKey = sectionIds.join(',');
  const [reach, setReach] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const roleOptions = STAFF_ROLES.map((value) => ({ value, label: tRole(value) }));
  const rolesKey = roles.join(',');
  const needsRoles =
    (audienceType === 'role' && roles.length === 0) || (audienceType === 'section' && sectionIds.length === 0);
  const audience =
    audienceType === 'school'
      ? { type: 'school' }
      : audienceType === 'role'
        ? { type: 'role', roles }
        : { type: 'section', sectionIds };
  const shownReach = needsRoles ? 0 : reach;

  useEffect(() => {
    if ((audienceType === 'role' && !rolesKey) || (audienceType === 'section' && !sectionsKey)) return;
    let current = true;
    const preview =
      audienceType === 'school'
        ? { type: 'school' }
        : audienceType === 'role'
          ? { type: 'role', roles: rolesKey.split(',') }
          : { type: 'section', sectionIds: sectionsKey.split(',') };
    void previewAudience(preview).then((result) => {
      if (current && result.ok) setReach(result.data.recipients);
    });
    return () => {
      current = false;
    };
  }, [audienceType, rolesKey, sectionsKey]);

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await publishAnnouncement({
      title,
      body,
      audience,
      requiresAck,
      publishOn,
      expiresOn,
    });
    if (result.ok) {
      const params = new URLSearchParams({
        published: result.data.title,
        recipients: String(result.data.recipients),
        ...(result.data.scheduled && { scheduled: '1' }),
      });
      return router.push(`${LIST}?${params}`);
    }
    setError(result.error);
    setBusy(false);
  }

  return (
    <ContentLayout header={<Header variant="h1">{t('announcements.form.title')}</Header>}>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Form
          errorText={error?.message}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button formAction="none" onClick={() => router.push(LIST)}>
                {t('cancel')}
              </Button>
              <Button variant="primary" iconSvg={svg('send')} loading={busy}>
                {t('announcements.form.submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container>
              <SpaceBetween size="m">
                <FormField
                  label={t('announcements.form.heading')}
                  constraintText={t('announcements.form.headingHint')}
                  errorText={error?.fieldErrors?.title}
                  stretch
                >
                  <Input value={title} autoComplete={false} onChange={({ detail }) => setTitle(detail.value)} />
                </FormField>
                <FormField
                  label={t('announcements.form.body')}
                  constraintText={t('announcements.form.bodyHint', { count: body.length })}
                  errorText={error?.fieldErrors?.body}
                  stretch
                >
                  <Textarea value={body} rows={8} onChange={({ detail }) => setBody(detail.value)} />
                </FormField>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">{t('announcements.form.audience')}</Header>}>
              <SpaceBetween size="m">
                <Tiles
                  ariaLabel={t('announcements.form.audience')}
                  columns={3}
                  value={audienceType}
                  onChange={({ detail }) => setAudienceType(detail.value as 'school' | 'role' | 'section')}
                  items={[
                    {
                      value: 'school',
                      label: t('announcements.form.school'),
                      description: t('announcements.form.schoolHint'),
                    },
                    { value: 'role', label: t('announcements.form.role'), description: t('announcements.form.roleHint') },
                    {
                      value: 'section',
                      label: t('announcements.form.section'),
                      description: t('announcements.form.sectionHint'),
                    },
                  ]}
                />
                {audienceType === 'section' && (
                  <FormField
                    label={t('announcements.form.sections')}
                    errorText={error?.fieldErrors?.['audience.sectionIds']}
                  >
                    <Multiselect
                      selectedOptions={sectionOptions.filter((option) => sectionIds.includes(option.value))}
                      options={sectionOptions}
                      placeholder={t('announcements.form.sectionsPlaceholder')}
                      onChange={({ detail }) => setSectionIds(detail.selectedOptions.map((option) => option.value ?? ''))}
                    />
                  </FormField>
                )}
                {audienceType === 'role' && (
                  <FormField label={t('announcements.form.roles')} errorText={error?.fieldErrors?.['audience.roles']}>
                    <Multiselect
                      selectedOptions={roleOptions.filter((option) => roles.includes(option.value))}
                      options={roleOptions}
                      placeholder={t('announcements.form.rolesPlaceholder')}
                      onChange={({ detail }) =>
                        setRoles(detail.selectedOptions.map((option) => option.value as RoleKey))
                      }
                    />
                  </FormField>
                )}
                <Checkbox
                  checked={requiresAck}
                  description={t('announcements.form.ackHint')}
                  onChange={({ detail }) => setRequiresAck(detail.checked)}
                >
                  {t('announcements.form.ack')}
                </Checkbox>
                <ColumnLayout columns={2}>
                  <FormField
                    label={t('announcements.form.publishOn')}
                    constraintText={t('announcements.form.publishOnHint')}
                    errorText={error?.fieldErrors?.publishOn}
                  >
                    <DatePicker
                      value={publishOn}
                      placeholder="YYYY/MM/DD"
                      isDateEnabled={(date) => date >= new Date(new Date().setHours(0, 0, 0, 0))}
                      onChange={({ detail }) => setPublishOn(detail.value)}
                    />
                  </FormField>
                  <FormField
                    label={t('announcements.form.expiresOn')}
                    constraintText={t('announcements.form.expiresOnHint')}
                    errorText={error?.fieldErrors?.expiresOn}
                  >
                    <DatePicker
                      value={expiresOn}
                      placeholder="YYYY/MM/DD"
                      isDateEnabled={(date) => date >= new Date(new Date().setHours(0, 0, 0, 0))}
                      onChange={({ detail }) => setExpiresOn(detail.value)}
                    />
                  </FormField>
                </ColumnLayout>
                <FormField label={t('announcements.form.channels')}>
                  <Checkbox checked disabled description={t('announcements.form.inAppReason')}>
                    {t('announcements.form.inApp')}
                  </Checkbox>
                </FormField>
                <Alert type="info">
                  <span aria-live="polite">
                    {shownReach === null
                      ? t('announcements.form.reachLoading')
                      : t('announcements.form.reach', { count: shownReach })}
                  </span>
                </Alert>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
