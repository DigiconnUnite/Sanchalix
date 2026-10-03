'use client';

import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import DatePicker from '@cloudscape-design/components/date-picker';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { upsertHoliday } from '@/server/modules/calendar/actions';

const LIST = '/calendar/holidays';

export function HolidayForm() {
  const t = useTranslations('calendar.holidays');
  const router = useRouter();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<{ message: string; fieldErrors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (error) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await upsertHoliday({ date, name });
    if (result.ok) {
      const params = new URLSearchParams({
        created: result.data.name,
        affected: String(result.data.affectedAttendanceRecords),
      });
      return router.push(`${LIST}?${params}`);
    }
    setError(result.error);
    setBusy(false);
  }

  return (
    <ContentLayout header={<Header variant="h1">{t('form.title')}</Header>}>
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
                {t('add')}
              </Button>
            </SpaceBetween>
          }
        >
          <Container>
            <SpaceBetween size="m">
              <FormField label={t('columns.date')} constraintText={t('form.dateHint')} errorText={error?.fieldErrors?.date}>
                <DatePicker value={date} placeholder="YYYY/MM/DD" onChange={({ detail }) => setDate(detail.value)} />
              </FormField>
              <FormField label={t('columns.name')} constraintText={t('form.nameHint')} errorText={error?.fieldErrors?.name}>
                <Input value={name} autoComplete={false} onChange={({ detail }) => setName(detail.value)} />
              </FormField>
            </SpaceBetween>
          </Container>
        </Form>
      </form>
    </ContentLayout>
  );
}
