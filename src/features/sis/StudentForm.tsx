'use client';

import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input, { type InputProps } from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createStudent, updateStudent } from '@/server/modules/sis/actions';
import type { StudentProfile } from '@/server/modules/sis/schemas';

const GENDERS = ['female', 'male', 'other', 'undisclosed'];
const RELATIONS = ['mother', 'father', 'guardian', 'other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const EMPTY = {
  firstName: '',
  lastName: '',
  dob: '',
  gender: '',
  sectionId: '',
  bloodGroup: '',
  guardianName: '',
  relation: '',
  phone: '',
  email: '',
  line1: '',
  city: '',
  state: '',
  pincode: '',
};
type Field = keyof typeof EMPTY;
type Option = { value: string; label: string };

export function StudentForm({
  sections,
  student,
}: {
  sections: { id: string; name: string }[];
  student?: StudentProfile;
}) {
  const t = useTranslations('sis.students');
  const router = useRouter();
  const [values, setValues] = useState(() =>
    student
      ? {
          ...EMPTY,
          firstName: student.editable.firstName,
          lastName: student.editable.lastName,
          line1: student.editable.line1,
          city: student.editable.city,
          state: student.editable.state,
          pincode: student.editable.pincode,
          dob: student.dob,
          gender: student.gender as string,
          bloodGroup: student.bloodGroup ?? '',
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const change = (field: Field, value: string) => setValues((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    if (formError) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [formError, errors]);

  async function save() {
    const details = {
      firstName: values.firstName,
      lastName: values.lastName,
      dob: values.dob,
      gender: values.gender,
      ...(values.bloodGroup && { bloodGroup: values.bloodGroup }),
      address: { line1: values.line1, city: values.city, state: values.state, pincode: values.pincode },
    };
    if (student) {
      const result = await updateStudent({ ...details, id: student.id, version: student.editable.version });
      return result.ok ? { ok: true as const, href: `/students/${student.id}?notice=updated` } : result;
    }
    const result = await createStudent({
      ...details,
      sectionId: values.sectionId,
      guardians: [{ name: values.guardianName, relation: values.relation, phone: values.phone, email: values.email }],
    });
    return result.ok ? { ok: true as const, href: `/students/${result.data.id}?notice=added` } : result;
  }

  async function submit() {
    setBusy(true);
    setFormError(null);
    const result = await save();
    if (result.ok) return router.push(result.href);
    setErrors(result.error.fieldErrors ?? {});
    setFormError(result.error.message);
    setBusy(false);
  }

  const optional = (label: string): ReactNode => (
    <>
      {label} - <i>{t('form.optional')}</i>
    </>
  );

  const text = (field: Field, path: string, label: ReactNode, props: Partial<InputProps> = {}, hint?: string) => (
    <FormField label={label} errorText={errors[path]} constraintText={hint}>
      <Input {...props} value={values[field]} onChange={({ detail }) => change(field, detail.value)} />
    </FormField>
  );

  const select = (field: Field, path: string, label: ReactNode, options: Option[], placeholder?: string) => (
    <FormField label={label} errorText={errors[path]}>
      <Select
        selectedOption={options.find((option) => option.value === values[field]) ?? null}
        options={options}
        {...(placeholder && { placeholder })}
        onChange={({ detail }) => change(field, detail.selectedOption.value ?? '')}
      />
    </FormField>
  );

  const translated = (group: 'gender' | 'relation', keys: string[]) =>
    keys.map((value) => ({ value, label: t(`${group}.${value}`) }));

  return (
    <ContentLayout
      header={<Header variant="h1">{student ? t('form.editTitle', { name: student.name }) : t('form.title')}</Header>}
    >
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Form
          errorText={formError}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button formAction="none" onClick={() => router.push(student ? `/students/${student.id}` : '/students')}>
                {t('form.cancel')}
              </Button>
              <Button variant="primary" loading={busy} disabled={!student && sections.length === 0}>
                {student ? t('form.save') : t('form.submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {!student && sections.length === 0 && <Alert type="warning">{t('form.noSections')}</Alert>}
            <Container header={<Header variant="h2">{t('form.student')}</Header>}>
              <ColumnLayout columns={2}>
                {text('firstName', 'firstName', t('form.firstName'), { autoComplete: false })}
                {text('lastName', 'lastName', t('form.lastName'), { autoComplete: false })}
                <FormField label={t('form.dob')} errorText={errors.dob} constraintText={t('form.dobConstraint')}>
                  <DatePicker
                    value={values.dob}
                    placeholder="YYYY/MM/DD"
                    isDateEnabled={(date) => date <= new Date()}
                    onChange={({ detail }) => change('dob', detail.value)}
                  />
                </FormField>
                {select('gender', 'gender', t('form.gender'), translated('gender', GENDERS))}
                {!student &&
                  select(
                    'sectionId',
                    'sectionId',
                    t('form.section'),
                    sections.map(({ id, name }) => ({ value: id, label: name })),
                    t('form.sectionPlaceholder'),
                  )}
                {select(
                  'bloodGroup',
                  'bloodGroup',
                  optional(t('form.bloodGroup')),
                  BLOOD_GROUPS.map((value) => ({ value, label: value })),
                  t('form.bloodGroupPlaceholder'),
                )}
              </ColumnLayout>
            </Container>
            {!student && (
              <Container header={<Header variant="h2">{t('form.guardian')}</Header>}>
                <ColumnLayout columns={2}>
                  {text('guardianName', 'guardians.0.name', t('form.guardianName'), { autoComplete: 'name' })}
                  {select('relation', 'guardians.0.relation', t('form.relation'), translated('relation', RELATIONS))}
                  {text(
                    'phone',
                    'guardians.0.phone',
                    t('form.phone'),
                    { inputMode: 'tel', autoComplete: 'tel-national' },
                    t('form.phoneConstraint'),
                  )}
                  {text('email', 'guardians.0.email', optional(t('form.email')), {
                    type: 'email',
                    inputMode: 'email',
                    autoComplete: 'email',
                  })}
                </ColumnLayout>
              </Container>
            )}
            <Container header={<Header variant="h2">{t('form.address')}</Header>}>
              <ColumnLayout columns={2}>
                {text('line1', 'address.line1', t('form.line1'), { autoComplete: 'street-address' })}
                {text('city', 'address.city', t('form.city'), { autoComplete: 'address-level2' })}
                {text('state', 'address.state', t('form.state'), { autoComplete: 'address-level1' })}
                {text('pincode', 'address.pincode', t('form.pincode'), {
                  inputMode: 'numeric',
                  autoComplete: 'postal-code',
                })}
              </ColumnLayout>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
