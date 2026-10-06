'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { updateGuardian } from '@/server/modules/sis/actions';

const RELATIONS = ['mother', 'father', 'guardian', 'other'];
type Guardian = { id: string; name: string; relation: string; phone: string; email: string | null };

export function GuardianEdit({ studentId, guardian }: { studentId: string; guardian: Guardian }) {
  const t = useTranslations('sis.students');
  const router = useRouter();
  const initial = {
    name: guardian.name,
    relation: guardian.relation,
    phone: guardian.phone.replace(/^\+91/, ''),
    email: guardian.email ?? '',
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const relationOptions = RELATIONS.map((value) => ({ value, label: t(`relation.${value}`) }));
  const errors = error?.fieldErrors ?? {};

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateGuardian({ studentId, guardianId: guardian.id, ...values });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  const field = (name: 'name' | 'phone' | 'email', label: string, hint?: string) => (
    <FormField label={label} constraintText={hint} errorText={errors[name]}>
      <Input
        value={values[name]}
        autoComplete={false}
        {...(name === 'phone' && { inputMode: 'tel' as const })}
        {...(name === 'email' && { type: 'email' as const, inputMode: 'email' as const })}
        onChange={({ detail }) => setValues({ ...values, [name]: detail.value })}
      />
    </FormField>
  );

  return (
    <>
      <Button
        variant="inline-link"
        ariaLabel={t('guardianEdit.label', { name: guardian.name })}
        onClick={() => {
          setValues(initial);
          setError(null);
          setOpen(true);
        }}
      >
        {t('profile.edit')}
      </Button>
      <Modal
        visible={open}
        header={t('guardianEdit.title', { name: guardian.name })}
        closeAriaLabel={t('form.cancel')}
        onDismiss={() => setOpen(false)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setOpen(false)}>
                {t('form.cancel')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                {t('form.save')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && !error.fieldErrors && <Alert type="error">{error.message}</Alert>}
          {field('name', t('form.guardianName'))}
          <FormField label={t('form.relation')} errorText={errors.relation}>
            <Select
              selectedOption={relationOptions.find((option) => option.value === values.relation) ?? null}
              options={relationOptions}
              onChange={({ detail }) => setValues({ ...values, relation: detail.selectedOption.value ?? 'guardian' })}
            />
          </FormField>
          {field('phone', t('form.phone'), t('guardianEdit.phoneHint'))}
          {field('email', t('form.email'))}
        </SpaceBetween>
      </Modal>
    </>
  );
}
