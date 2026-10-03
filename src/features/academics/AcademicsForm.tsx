'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/appError';
import { upsertClass, upsertSection } from '@/server/modules/academics/actions';

const LIST = '/academics/classes';

type FieldSpec = {
  name: string;
  hint?: string;
  optional?: boolean;
  input?: Partial<InputProps>;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

function AcademicsForm({
  form,
  fields,
  initial,
  blocked,
  save,
}: {
  form: 'classForm' | 'sectionForm';
  fields: FieldSpec[];
  initial: Record<string, string>;
  blocked?: string | false;
  save: (values: Record<string, string>) => Promise<ActionResult<{ name: string }>>;
}) {
  const t = useTranslations('academics.classes');
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const change = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await save(values);
    if (result.ok) return router.push(`${LIST}?created=${encodeURIComponent(result.data.name)}`);
    setError(result.error);
    setBusy(false);
  }

  return (
    <ContentLayout header={<Header variant="h1">{t(`${form}.title`)}</Header>}>
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
              <Button variant="primary" loading={busy} disabled={Boolean(blocked)}>
                {t(`${form}.submit`)}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {blocked && <Alert type="warning">{blocked}</Alert>}
            <Container>
              <SpaceBetween size="m">
                {fields.map(({ name, hint, optional, input, options, placeholder }) => (
                  <FormField
                    key={name}
                    label={
                      optional ? (
                        <>
                          {t(`${form}.${name}`)} - <i>{t('optional')}</i>
                        </>
                      ) : (
                        t(`${form}.${name}`)
                      )
                    }
                    constraintText={hint}
                    errorText={error?.fieldErrors?.[name]}
                  >
                    {options ? (
                      <Select
                        selectedOption={options.find((option) => option.value === values[name]) ?? null}
                        options={options}
                        {...(placeholder && { placeholder })}
                        onChange={({ detail }) => change(name, detail.selectedOption.value ?? '')}
                      />
                    ) : (
                      <Input
                        {...input}
                        autoComplete={false}
                        value={values[name] ?? ''}
                        onChange={({ detail }) => change(name, detail.value)}
                      />
                    )}
                  </FormField>
                ))}
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}

export function ClassForm() {
  const t = useTranslations('academics.classes.classForm');
  return (
    <AcademicsForm
      form="classForm"
      initial={{ name: '', order: '' }}
      save={upsertClass}
      fields={[
        { name: 'name', hint: t('nameHint') },
        { name: 'order', hint: t('orderHint'), input: { inputMode: 'numeric' } },
      ]}
    />
  );
}

export function SectionForm({ classes }: { classes: { id: string; name: string }[] }) {
  const t = useTranslations('academics.classes.sectionForm');
  return (
    <AcademicsForm
      form="sectionForm"
      initial={{ classId: '', name: '', capacity: '40', room: '' }}
      blocked={classes.length === 0 && t('noClasses')}
      save={upsertSection}
      fields={[
        {
          name: 'classId',
          options: classes.map(({ id, name }) => ({ value: id, label: name })),
          placeholder: t('classPlaceholder'),
        },
        { name: 'name', hint: t('nameHint') },
        { name: 'capacity', hint: t('capacityHint'), input: { inputMode: 'numeric' } },
        { name: 'room', optional: true },
      ]}
    />
  );
}
