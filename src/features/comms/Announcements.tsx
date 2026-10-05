'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
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
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { RoleKey } from '@/server/auth/permissions';
import { previewAudience, publishAnnouncement } from '@/server/modules/comms/actions';
import type { AnnouncementDetail, AnnouncementRow } from '@/server/modules/comms/schemas';

const LIST = '/communication/announcements';
const NEW = `${LIST}/new`;
const STAFF_ROLES: RoleKey[] = ['school_admin', 'principal', 'teacher', 'accountant', 'librarian', 'transport_manager'];
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

function useAudienceLabel() {
  const t = useTranslations('comms.audience');
  const tRole = useTranslations('shell.roles');
  return (audience: AnnouncementRow['audience']) =>
    audience.type === 'school' ? t('school') : t('roles', { roles: audience.roles.map((role) => tRole(role)).join(', ') });
}

export function AnnouncementsTable({
  announcements,
  canCreate,
  published,
  recipients,
}: {
  announcements: AnnouncementRow[];
  canCreate: boolean;
  published: string | null;
  recipients: number;
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
          <Header variant="h1" counter={`(${announcements.length})`} actions={canCreate && addButton(true)}>
            {t('announcements.title')}
          </Header>
          {published && (
            <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => router.replace(pathname)}>
              {t('announcements.published', { title: published, count: recipients })}
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
          cell: (row) => dateTime.format(new Date(row.publishedAt)),
        },
      ]}
    />
  );
}

export function AnnouncementView({ announcement }: { announcement: AnnouncementDetail }) {
  const t = useTranslations('comms.announcements');
  const router = useRouter();
  const audienceLabel = useAudienceLabel();
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

export function AnnouncementForm() {
  const t = useTranslations('comms');
  const tRole = useTranslations('shell.roles');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<'school' | 'role'>('school');
  const [roles, setRoles] = useState<RoleKey[]>([]);
  const [reach, setReach] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const roleOptions = STAFF_ROLES.map((value) => ({ value, label: tRole(value) }));
  const rolesKey = roles.join(',');
  const needsRoles = audienceType === 'role' && roles.length === 0;
  const shownReach = needsRoles ? 0 : reach;

  useEffect(() => {
    if (audienceType === 'role' && !rolesKey) return;
    let current = true;
    const audience = audienceType === 'school' ? { type: 'school' } : { type: 'role', roles: rolesKey.split(',') };
    void previewAudience(audience).then((result) => {
      if (current && result.ok) setReach(result.data.recipients);
    });
    return () => {
      current = false;
    };
  }, [audienceType, rolesKey]);

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await publishAnnouncement({
      title,
      body,
      audience: audienceType === 'school' ? { type: 'school' } : { type: 'role', roles },
    });
    if (result.ok) {
      const params = new URLSearchParams({ published: result.data.title, recipients: String(result.data.recipients) });
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
                  columns={2}
                  value={audienceType}
                  onChange={({ detail }) => setAudienceType(detail.value as 'school' | 'role')}
                  items={[
                    {
                      value: 'school',
                      label: t('announcements.form.school'),
                      description: t('announcements.form.schoolHint'),
                    },
                    { value: 'role', label: t('announcements.form.role'), description: t('announcements.form.roleHint') },
                  ]}
                />
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
