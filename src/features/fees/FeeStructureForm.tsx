'use client';

import Alert from '@cloudscape-design/components/alert';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Multiselect from '@cloudscape-design/components/multiselect';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { upsertFeeStructure } from '@/server/modules/fees/actions';

const LIST = '/fees/structures';

type Option = { id: string; name: string };
type Line = { feeHeadId: string; amountMinor: string };
type Installment = { label: string; dueDate: string; percent: string };

export function FeeStructureForm({ classes, heads }: { classes: Option[]; heads: Option[] }) {
  const t = useTranslations('fees');
  const router = useRouter();
  const [name, setName] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([{ feeHeadId: '', amountMinor: '' }]);
  const [installments, setInstallments] = useState<Installment[]>([{ label: '', dueDate: '', percent: '100' }]);
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = error?.fieldErrors ?? {};
  const blocked = heads.length === 0 ? t('structures.form.noHeads') : classes.length === 0 ? t('structures.form.noClasses') : null;
  const classOptions = classes.map(({ id, name: label }) => ({ value: id, label }));
  const headOptions = heads.map(({ id, name: label }) => ({ value: id, label }));
  const percentTotal = installments.reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
  const editAt = <T,>(items: T[], index: number, patch: Partial<T>) =>
    items.map((item, position) => (position === index ? { ...item, ...patch } : item));

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await upsertFeeStructure({ name, classIds, lines, installments });
    if (result.ok) return router.push(`${LIST}?created=${encodeURIComponent(result.data.name)}`);
    setError(result.error);
    setBusy(false);
  }

  return (
    <ContentLayout header={<Header variant="h1">{t('structures.form.title')}</Header>}>
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
                {t('structures.form.submit')}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {blocked && <Alert type="warning">{blocked}</Alert>}
            <Container header={<Header variant="h2">{t('structures.form.basics')}</Header>}>
              <SpaceBetween size="m">
                <FormField
                  label={t('structures.form.name')}
                  constraintText={t('structures.form.nameHint')}
                  errorText={errors.name}
                >
                  <Input value={name} autoComplete={false} onChange={({ detail }) => setName(detail.value)} />
                </FormField>
                <FormField label={t('structures.form.classes')} errorText={errors.classIds}>
                  <Multiselect
                    selectedOptions={classOptions.filter((option) => classIds.includes(option.value))}
                    options={classOptions}
                    placeholder={t('structures.form.classesPlaceholder')}
                    onChange={({ detail }) => setClassIds(detail.selectedOptions.map((option) => option.value ?? ''))}
                  />
                </FormField>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">{t('structures.form.lines')}</Header>}>
              <FormField errorText={errors.lines} stretch>
                <AttributeEditor
                  items={lines}
                  addButtonText={t('structures.form.addLine')}
                  removeButtonText={t('structures.form.removeLine')}
                  isItemRemovable={() => lines.length > 1}
                  onAddButtonClick={() => setLines([...lines, { feeHeadId: '', amountMinor: '' }])}
                  onRemoveButtonClick={({ detail }) => setLines(lines.filter((_, index) => index !== detail.itemIndex))}
                  definition={[
                    {
                      label: t('structures.form.feeHead'),
                      errorText: (_, index) => errors[`lines.${index}.feeHeadId`],
                      control: (line, index) => (
                        <Select
                          selectedOption={headOptions.find((option) => option.value === line.feeHeadId) ?? null}
                          options={headOptions}
                          placeholder={t('structures.form.feeHeadPlaceholder')}
                          onChange={({ detail }) =>
                            setLines(editAt(lines, index, { feeHeadId: detail.selectedOption.value ?? '' }))
                          }
                        />
                      ),
                    },
                    {
                      label: t('structures.form.amount'),
                      errorText: (_, index) => errors[`lines.${index}.amountMinor`],
                      control: (line, index) => (
                        <Input
                          value={line.amountMinor}
                          inputMode="decimal"
                          autoComplete={false}
                          onChange={({ detail }) => setLines(editAt(lines, index, { amountMinor: detail.value }))}
                        />
                      ),
                    },
                  ]}
                />
              </FormField>
            </Container>
            <Container header={<Header variant="h2">{t('structures.form.installments')}</Header>}>
              <FormField
                stretch
                errorText={errors.installments}
                constraintText={t('structures.form.percentTotal', { total: percentTotal })}
              >
                <AttributeEditor
                  items={installments}
                  addButtonText={t('structures.form.addInstallment')}
                  removeButtonText={t('structures.form.removeInstallment')}
                  isItemRemovable={() => installments.length > 1}
                  onAddButtonClick={() => setInstallments([...installments, { label: '', dueDate: '', percent: '' }])}
                  onRemoveButtonClick={({ detail }) =>
                    setInstallments(installments.filter((_, index) => index !== detail.itemIndex))
                  }
                  definition={[
                    {
                      label: t('structures.form.label'),
                      errorText: (_, index) => errors[`installments.${index}.label`],
                      control: (item, index) => (
                        <Input
                          value={item.label}
                          autoComplete={false}
                          onChange={({ detail }) =>
                            setInstallments(editAt(installments, index, { label: detail.value }))
                          }
                        />
                      ),
                    },
                    {
                      label: t('structures.form.dueDate'),
                      errorText: (_, index) => errors[`installments.${index}.dueDate`],
                      control: (item, index) => (
                        <DatePicker
                          value={item.dueDate}
                          placeholder="YYYY/MM/DD"
                          onChange={({ detail }) =>
                            setInstallments(editAt(installments, index, { dueDate: detail.value }))
                          }
                        />
                      ),
                    },
                    {
                      label: t('structures.form.percent'),
                      errorText: (_, index) => errors[`installments.${index}.percent`],
                      control: (item, index) => (
                        <Input
                          value={item.percent}
                          inputMode="numeric"
                          autoComplete={false}
                          onChange={({ detail }) =>
                            setInstallments(editAt(installments, index, { percent: detail.value }))
                          }
                        />
                      ),
                    },
                  ]}
                />
              </FormField>
            </Container>
          </SpaceBetween>
        </Form>
      </form>
    </ContentLayout>
  );
}
