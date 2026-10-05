'use client';

import Alert from '@cloudscape-design/components/alert';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Multiselect from '@cloudscape-design/components/multiselect';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import TimeInput from '@cloudscape-design/components/time-input';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/appError';
import { updatePeriods, updateSchoolSettings } from '@/server/modules/settings/actions';
import type { SchoolSettings } from '@/server/modules/settings/service';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
type Failure = { message: string; fieldErrors?: Record<string, string> };

function SettingsForm({
  save,
  saved,
  submit,
  children,
}: {
  save: () => Promise<ActionResult<unknown>>;
  saved: string;
  submit: string;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setDone(false);
    const result = await save();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDone(true);
    router.refresh();
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <Form
        errorText={error?.message}
        actions={
          <Button variant="primary" loading={busy}>
            {submit}
          </Button>
        }
      >
        <SpaceBetween size="l">
          {done && <Alert type="success">{saved}</Alert>}
          {children(error?.fieldErrors ?? {})}
        </SpaceBetween>
      </Form>
    </form>
  );
}

export function Settings({ settings, tab }: { settings: SchoolSettings; tab: string }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const pathname = usePathname();
  const [school, setSchool] = useState({
    name: settings.name,
    affiliationNo: settings.affiliationNo,
    ...settings.address,
  });
  const [workingDays, setWorkingDays] = useState(settings.workingDays);
  const [periods, setPeriods] = useState(settings.periods);
  const dayOptions = DAYS.map((value) => ({ value: String(value), label: t(`days.${value}`) }));

  const field = (name: keyof typeof school, errors: Record<string, string>, path: string = name) => (
    <FormField label={t(`school.${name}`)} errorText={errors[path]}>
      <Input
        value={school[name]}
        autoComplete={false}
        {...(name === 'pincode' && { inputMode: 'numeric' as const })}
        onChange={({ detail }) => setSchool({ ...school, [name]: detail.value })}
      />
    </FormField>
  );
  const time = (index: number, key: 'start' | 'end') => (
    <TimeInput
      format="hh:mm"
      placeholder="hh:mm"
      ariaLabel={t(`periods.${key}Label`, { number: index + 1 })}
      value={periods[index]?.[key] ?? ''}
      onChange={({ detail }) =>
        setPeriods(periods.map((period, at) => (at === index ? { ...period, [key]: detail.value } : period)))
      }
    />
  );

  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      <Tabs
        activeTabId={tab === 'periods' ? 'periods' : 'school'}
        onChange={({ detail }) => router.replace(`${pathname}?tab=${detail.activeTabId}`)}
        tabs={[
          {
            id: 'school',
            label: t('tabs.school'),
            content: (
              <SettingsForm
                submit={t('save')}
                saved={t('school.saved')}
                save={() =>
                  updateSchoolSettings({
                    name: school.name,
                    affiliationNo: school.affiliationNo,
                    address: { line1: school.line1, city: school.city, state: school.state, pincode: school.pincode },
                    workingDays,
                  })
                }
              >
                {(errors) => (
                  <SpaceBetween size="l">
                    <Container header={<Header variant="h2">{t('school.title')}</Header>}>
                      <SpaceBetween size="l">
                        <KeyValuePairs
                          columns={2}
                          items={[
                            { label: t('school.code'), value: settings.code },
                            { label: t('school.board'), value: settings.board },
                          ]}
                        />
                        <ColumnLayout columns={2}>
                          {field('name', errors)}
                          {field('affiliationNo', errors)}
                          {field('line1', errors, 'address.line1')}
                          {field('city', errors, 'address.city')}
                          {field('state', errors, 'address.state')}
                          {field('pincode', errors, 'address.pincode')}
                        </ColumnLayout>
                      </SpaceBetween>
                    </Container>
                    <Container header={<Header variant="h2">{t('workingDays.title')}</Header>}>
                      <FormField
                        label={t('workingDays.label')}
                        description={t('workingDays.description')}
                        errorText={errors.workingDays}
                      >
                        <Multiselect
                          selectedOptions={dayOptions.filter((option) => workingDays.includes(Number(option.value)))}
                          options={dayOptions}
                          placeholder={t('workingDays.placeholder')}
                          onChange={({ detail }) => setWorkingDays(detail.selectedOptions.map((option) => Number(option.value)))}
                        />
                      </FormField>
                    </Container>
                  </SpaceBetween>
                )}
              </SettingsForm>
            ),
          },
          {
            id: 'periods',
            label: t('tabs.periods'),
            content: (
              <SettingsForm submit={t('save')} saved={t('periods.saved')} save={() => updatePeriods(periods)}>
                {(errors) => (
                  <Container header={<Header variant="h2" description={t('periods.description')}>{t('periods.title')}</Header>}>
                    <AttributeEditor
                      items={periods}
                      addButtonText={t('periods.add')}
                      removeButtonText={t('periods.remove')}
                      removeButtonAriaLabel={(item) => t('periods.removeLabel', { number: periods.indexOf(item) + 1 })}
                      disableAddButton={periods.length >= 12}
                      empty={t('periods.empty')}
                      onAddButtonClick={() => setPeriods([...periods, { start: periods.at(-1)?.end ?? '08:00', end: '' }])}
                      onRemoveButtonClick={({ detail }) => setPeriods(periods.filter((_, index) => index !== detail.itemIndex))}
                      definition={[
                        {
                          label: t('periods.number'),
                          control: (_, index) => (
                            <Input value={t('periods.periodNo', { number: index + 1 })} readOnly onChange={() => {}} />
                          ),
                        },
                        {
                          label: t('periods.start'),
                          control: (_, index) => time(index, 'start'),
                          errorText: (_, index) => errors[`${index}.start`],
                        },
                        {
                          label: t('periods.end'),
                          control: (_, index) => time(index, 'end'),
                          errorText: (_, index) => errors[`${index}.end`],
                        },
                      ]}
                    />
                  </Container>
                )}
              </SettingsForm>
            ),
          },
        ]}
      />
    </ContentLayout>
  );
}
