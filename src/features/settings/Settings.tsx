'use client';

import Alert from '@cloudscape-design/components/alert';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Button from '@cloudscape-design/components/button';
import Checkbox from '@cloudscape-design/components/checkbox';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
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
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/appError';
import { updateAlertTime, updateLeaveQuotas, updatePeriods, updateQuietHours, updateSchoolSettings, updateTerms } from '@/server/modules/settings/actions';
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
    logoUrl: settings.logoUrl,
    ...settings.address,
  });
  const [workingDays, setWorkingDays] = useState(settings.workingDays);
  const [shiftDueDates, setShiftDueDates] = useState(settings.shiftDueDates);
  const [periods, setPeriods] = useState(settings.periods);
  const [terms, setTerms] = useState(settings.year?.terms ?? []);
  const [quiet, setQuiet] = useState(settings.quietHours);
  const [alertTime, setAlertTime] = useState(settings.absenceAlertTime);
  const [quotas, setQuotas] = useState(() => ({
    CL: String(settings.leaveQuotas.CL),
    SL: String(settings.leaveQuotas.SL),
    EL: String(settings.leaveQuotas.EL),
  }));
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
    <ContentLayout>
      <Tabs
        activeTabId={tab === 'periods' || tab === 'terms' || tab === 'notifications' || tab === 'leave' || tab === 'attendance' || tab === 'data' ? tab : 'school'}
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
                    logoUrl: school.logoUrl,
                    address: { line1: school.line1, city: school.city, state: school.state, pincode: school.pincode },
                    workingDays,
                    shiftDueDates,
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
                        <FormField
                          label={t('school.logoUrl')}
                          description={t('school.logoUrlHint')}
                          errorText={errors.logoUrl}
                        >
                          <Input
                            type="url"
                            inputMode="url"
                            placeholder="https://"
                            value={school.logoUrl}
                            autoComplete={false}
                            onChange={({ detail }) => setSchool({ ...school, logoUrl: detail.value })}
                          />
                        </FormField>
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
                      <Checkbox
                        checked={shiftDueDates}
                        description={t('workingDays.shiftHint')}
                        onChange={({ detail }) => setShiftDueDates(detail.checked)}
                      >
                        {t('workingDays.shift')}
                      </Checkbox>
                    </Container>
                  </SpaceBetween>
                )}
              </SettingsForm>
            ),
          },
          {
            id: 'data',
            label: t('tabs.data'),
            content: (
              <Container
                header={<Header variant="h2" description={t('data.description')}>{t('data.title')}</Header>}
                footer={t('data.footer')}
              >
                <Button href="/api/v1/export/school" iconSvg={svg('download')}>
                  {t('data.download')}
                </Button>
              </Container>
            ),
          },
          {
            id: 'attendance',
            label: t('tabs.attendance'),
            content: (
              <SettingsForm submit={t('save')} saved={t('alertTime.saved')} save={() => updateAlertTime({ absenceAlertTime: alertTime })}>
                {(errors) => (
                  <Container header={<Header variant="h2" description={t('alertTime.description')}>{t('alertTime.title')}</Header>}>
                    <FormField label={t('alertTime.label')} constraintText={t('alertTime.hint')} errorText={errors.absenceAlertTime}>
                      <TimeInput format="hh:mm" placeholder="hh:mm" value={alertTime} onChange={({ detail }) => setAlertTime(detail.value)} />
                    </FormField>
                  </Container>
                )}
              </SettingsForm>
            ),
          },
          {
            id: 'leave',
            label: t('tabs.leave'),
            content: (
              <SettingsForm submit={t('save')} saved={t('leave.saved')} save={() => updateLeaveQuotas(quotas)}>
                {(errors) => (
                  <Container header={<Header variant="h2" description={t('leave.description')}>{t('leave.title')}</Header>}>
                    <ColumnLayout columns={3}>
                      {(['CL', 'SL', 'EL'] as const).map((type) => (
                        <FormField key={type} label={t(`leave.${type}`)} constraintText={t('leave.days')} errorText={errors[type]}>
                          <Input
                            value={quotas[type]}
                            inputMode="numeric"
                            autoComplete={false}
                            onChange={({ detail }) => setQuotas({ ...quotas, [type]: detail.value })}
                          />
                        </FormField>
                      ))}
                    </ColumnLayout>
                  </Container>
                )}
              </SettingsForm>
            ),
          },
          {
            id: 'notifications',
            label: t('tabs.notifications'),
            content: (
              <SettingsForm submit={t('save')} saved={t('quiet.saved')} save={() => updateQuietHours(quiet)}>
                {(errors) => (
                  <Container header={<Header variant="h2" description={t('quiet.description')}>{t('quiet.title')}</Header>}>
                    <ColumnLayout columns={2}>
                      {(['start', 'end'] as const).map((key) => (
                        <FormField key={key} label={t(`quiet.${key}`)} errorText={errors[key] ?? (key === 'end' ? errors[''] : undefined)}>
                          <TimeInput
                            format="hh:mm"
                            placeholder="hh:mm"
                            value={quiet[key]}
                            onChange={({ detail }) => setQuiet({ ...quiet, [key]: detail.value })}
                          />
                        </FormField>
                      ))}
                    </ColumnLayout>
                  </Container>
                )}
              </SettingsForm>
            ),
          },
          {
            id: 'terms',
            label: t('tabs.terms'),
            content: settings.year ? (
              <SettingsForm submit={t('save')} saved={t('terms.saved')} save={() => updateTerms(terms)}>
                {(errors) => (
                  <Container
                    header={
                      <Header variant="h2" description={t('terms.description', { year: settings.year?.label ?? '' })}>
                        {t('terms.title')}
                      </Header>
                    }
                  >
                    <AttributeEditor
                      items={terms}
                      addButtonText={t('terms.add')}
                      removeButtonText={t('terms.remove')}
                      removeButtonAriaLabel={(item) => t('terms.removeLabel', { name: item.name || t('terms.unnamed') })}
                      disableAddButton={terms.length >= 6}
                      empty={t('terms.empty')}
                      onAddButtonClick={() => setTerms([...terms, { name: '', startDate: '', endDate: '' }])}
                      onRemoveButtonClick={({ detail }) => setTerms(terms.filter((_, index) => index !== detail.itemIndex))}
                      definition={[
                        {
                          label: t('terms.name'),
                          errorText: (_, index) => errors[`${index}.name`],
                          control: (term, index) => (
                            <Input
                              value={term.name}
                              autoComplete={false}
                              placeholder={t('terms.namePlaceholder')}
                              onChange={({ detail }) =>
                                setTerms(terms.map((item, at) => (at === index ? { ...item, name: detail.value } : item)))
                              }
                            />
                          ),
                        },
                        ...(['startDate', 'endDate'] as const).map((key) => ({
                          label: t(`terms.${key}`),
                          errorText: (_: unknown, index: number) => errors[`${index}.${key}`],
                          control: (term: (typeof terms)[number], index: number) => (
                            <DatePicker
                              value={term[key]}
                              placeholder="YYYY/MM/DD"
                              isDateEnabled={(date) => {
                                const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                return day >= (settings.year?.startDate ?? '') && day <= (settings.year?.endDate ?? '9');
                              }}
                              onChange={({ detail }) =>
                                setTerms(terms.map((item, at) => (at === index ? { ...item, [key]: detail.value } : item)))
                              }
                            />
                          ),
                        })),
                      ]}
                    />
                  </Container>
                )}
              </SettingsForm>
            ) : (
              <Alert type="info">{t('terms.noYear')}</Alert>
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
