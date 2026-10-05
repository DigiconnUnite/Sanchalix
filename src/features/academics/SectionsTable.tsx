'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import Header from '@cloudscape-design/components/header';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useIsMobile } from '@/lib/useIsMobile';
import { assignClassTeacher } from '@/server/modules/academics/actions';
import type { SectionRow } from '@/server/modules/academics/schemas';

const NONE = '—';

export function SectionsTable({
  sections,
  teachers,
  canCreate,
  created,
}: {
  sections: SectionRow[];
  teachers: { id: string; name: string }[];
  canCreate: boolean;
  created: string | null;
}) {
  const t = useTranslations('academics.classes');
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

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

  const fields: { id: string; header: string; content: (section: SectionRow) => ReactNode }[] = [
    { id: 'section', header: t('columns.section'), content: (section) => section.name },
    { id: 'class', header: t('columns.class'), content: (section) => section.className },
    {
      id: 'students',
      header: t('columns.students'),
      content: ({ strength, capacity }) => t('strength', { strength, capacity }),
    },
    { id: 'room', header: t('columns.room'), content: (section) => section.room ?? NONE },
    {
      id: 'classTeacher',
      header: t('columns.classTeacher'),
      content: (section) => section.classTeacher?.name ?? t('noClassTeacher'),
    },
  ];
  const teacherOptions = [{ value: '', label: t('noClassTeacher') }, ...teachers.map(({ id, name }) => ({ value: id, label: name }))];

  const shared = {
    trackBy: 'id',
    stickyHeader: true,
    items: sections,
    header: (
      <SpaceBetween size="m">
        <Header
          variant="h1"
          counter={`(${sections.length})`}
          actions={
            canCreate && (
              <SpaceBetween direction="horizontal" size="xs">
                {link('/academics/classes/new', t('addClass'))}
                {link('/academics/sections/new', t('addSection'), true)}
              </SpaceBetween>
            )
          }
        >
          {t('title')}
        </Header>
        {created && (
          <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => router.replace(pathname)}>
            {t('created', { name: created })}
          </Alert>
        )}
      </SpaceBetween>
    ),
    empty: (
      <EmptyState
        icon="classes"
        heading={t('empty.heading')}
        body={t('empty.body')}
        action={canCreate && link('/academics/classes/new', t('addClass'))}
      />
    ),
  };

  if (isMobile) {
    return (
      <Cards
        {...shared}
        variant="container"
        cardDefinition={{ header: (section) => section.name, sections: fields.slice(1) }}
      />
    );
  }
  return (
    <Table
      {...shared}
      variant="container"
      resizableColumns
      enableKeyboardNavigation
      submitEdit={async (section, _column, value) => {
        const result = await assignClassTeacher({ sectionId: section.id, staffId: (value as string) || null });
        // Cloudscape keeps the cell open and shows its error state when submitEdit rejects.
        if (!result.ok) throw new Error(result.error.message);
        router.refresh();
      }}
      columnDefinitions={fields.map(({ id, header, content }) => ({
        id,
        header,
        cell: content,
        isRowHeader: id === 'section',
        ...(id === 'classTeacher' &&
          canCreate && {
            minWidth: 220,
            editConfig: {
              ariaLabel: t('columns.classTeacher'),
              editIconAriaLabel: t('editClassTeacher'),
              errorIconAriaLabel: t('classTeacherError'),
              editingCell: (
                section: SectionRow,
                { currentValue, setValue }: { currentValue?: string; setValue: (value: string) => void },
              ) => {
                const selected = currentValue ?? section.classTeacher?.id ?? '';
                return (
                  <Select
                    autoFocus
                    expandToViewport
                    ariaLabel={t('classTeacherFor', { section: section.name })}
                    selectedOption={teacherOptions.find((option) => option.value === selected) ?? null}
                    options={teacherOptions}
                    onChange={({ detail }) => setValue(detail.selectedOption.value ?? '')}
                  />
                );
              },
            },
          }),
      }))}
    />
  );
}
