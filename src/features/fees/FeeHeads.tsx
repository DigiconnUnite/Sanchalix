'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Checkbox from '@cloudscape-design/components/checkbox';
import Select from '@cloudscape-design/components/select';
import Toggle from '@cloudscape-design/components/toggle';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { usePathname, useRouter } from '@/i18n/navigation';
import { setFeeHeadDiscountable, upsertFeeHead } from '@/server/modules/fees/actions';
import type { FeeHeadRow } from '@/server/modules/fees/schemas';

const LIST = '/fees/heads';
const NEW = '/fees/heads/new';
const GST_RATES = ['0', '5', '12', '18'];

export function FeeHeadsTable({
  heads,
  canEdit,
  created,
}: {
  heads: FeeHeadRow[];
  canEdit: boolean;
  created: string | null;
}) {
  const t = useTranslations('fees');
  const router = useRouter();
  const pathname = usePathname();
  const addButton = (primary: boolean) => (
    <Button
      {...(primary && { variant: 'primary' as const })}
      href={NEW}
      onFollow={(event) => {
        event.preventDefault();
        router.push(NEW);
      }}
    >
      {t('heads.add')}
    </Button>
  );

  return (
    <Table
      variant="container"
      stickyHeader
      enableKeyboardNavigation
      trackBy="id"
      items={heads}
      header={
        <SpaceBetween size="m">
          <Header variant="h1" counter={`(${heads.length})`} actions={canEdit && addButton(true)}>
            {t('heads.title')}
          </Header>
          {created && (
            <Alert type="success" dismissible dismissAriaLabel={t('dismiss')} onDismiss={() => router.replace(pathname)}>
              {t('heads.created', { name: created })}
            </Alert>
          )}
        </SpaceBetween>
      }
      empty={
        <EmptyState
          icon="fees"
          heading={t('heads.empty.heading')}
          body={t('heads.empty.body')}
          action={canEdit && addButton(false)}
        />
      }
      columnDefinitions={[
        { id: 'name', header: t('heads.columns.name'), cell: (head) => head.name, isRowHeader: true },
        { id: 'code', header: t('heads.columns.code'), cell: (head) => head.code },
        {
          id: 'gst',
          header: t('heads.columns.gst'),
          cell: (head) => (head.gstRate ? `${head.gstRate}%` : t('heads.gstNone')),
        },
        {
          id: 'discountable',
          header: t('heads.columns.discountable'),
          cell: (head) =>
            canEdit ? (
              <Toggle
                checked={head.discountable}
                ariaLabel={t('heads.discountableLabel', { name: head.name })}
                onChange={({ detail }) =>
                  void setFeeHeadDiscountable({ id: head.id, discountable: detail.checked }).then(() => router.refresh())
                }
              >
                {t(head.discountable ? 'heads.discountableYes' : 'heads.discountableNo')}
              </Toggle>
            ) : (
              t(head.discountable ? 'heads.discountableYes' : 'heads.discountableNo')
            ),
        },
      ]}
    />
  );
}

export function FeeHeadForm() {
  const t = useTranslations('fees');
  const router = useRouter();
  const [values, setValues] = useState({ name: '', code: '', gstRate: '0', discountable: false });
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const gstOptions = GST_RATES.map((value) => ({ value, label: value === '0' ? t('heads.gstNone') : `${value}%` }));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await upsertFeeHead(values);
    if (result.ok) return router.push(`${LIST}?created=${encodeURIComponent(result.data.name)}`);
    setError(result.error);
    setBusy(false);
  }

  return (
    <ContentLayout header={<Header variant="h1">{t('heads.form.title')}</Header>}>
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
              <Button variant="primary" loading={busy}>
                {t('heads.add')}
              </Button>
            </SpaceBetween>
          }
        >
          <Container>
            <SpaceBetween size="m">
              <FormField
                label={t('heads.form.name')}
                constraintText={t('heads.form.nameHint')}
                errorText={error?.fieldErrors?.name}
              >
                <Input
                  value={values.name}
                  autoComplete={false}
                  onChange={({ detail }) => setValues((current) => ({ ...current, name: detail.value }))}
                />
              </FormField>
              <FormField
                label={t('heads.form.code')}
                constraintText={t('heads.form.codeHint')}
                errorText={error?.fieldErrors?.code}
              >
                <Input
                  value={values.code}
                  autoComplete={false}
                  onChange={({ detail }) => setValues((current) => ({ ...current, code: detail.value }))}
                />
              </FormField>
              <FormField label={t('heads.form.gstRate')} errorText={error?.fieldErrors?.gstRate}>
                <Select
                  selectedOption={gstOptions.find((option) => option.value === values.gstRate) ?? null}
                  options={gstOptions}
                  onChange={({ detail }) =>
                    setValues((current) => ({ ...current, gstRate: detail.selectedOption.value ?? '0' }))
                  }
                />
              </FormField>
              <Checkbox
                checked={values.discountable}
                description={t('heads.form.discountableHint')}
                onChange={({ detail }) => setValues((current) => ({ ...current, discountable: detail.checked }))}
              >
                {t('heads.form.discountable')}
              </Checkbox>
            </SpaceBetween>
          </Container>
        </Form>
      </form>
    </ContentLayout>
  );
}
