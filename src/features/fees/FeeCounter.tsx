'use client';

import Alert from '@cloudscape-design/components/alert';
import Autosuggest, { type AutosuggestProps } from '@cloudscape-design/components/autosuggest';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import Tiles from '@cloudscape-design/components/tiles';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { allocateInOrder } from '@/lib/allocate';
import { formatMoney, toMinor } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { collectPayment } from '@/server/modules/fees/actions';
import type { CounterMethod, CounterStudent, StudentMatch } from '@/server/modules/fees/schemas';

const METHODS: CounterMethod[] = ['cash', 'upi', 'card', 'cheque', 'bank_transfer'];
const NONE = '—';
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const rupees = (minor: number) => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));

type Invoice = CounterStudent['invoices'][number];

function StudentSearch() {
  const t = useTranslations('fees.counter');
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState('');
  const [options, setOptions] = useState<AutosuggestProps.Option[]>([]);
  const [status, setStatus] = useState<'pending' | 'loading' | 'finished' | 'error'>('pending');

  async function load(query: string) {
    if (query.trim().length < 2) return setOptions([]);
    setStatus('loading');
    try {
      const response = await fetch(`/api/v1/students/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(String(response.status));
      const { data } = (await response.json()) as { data: StudentMatch[] };
      setOptions(
        data.map((match) => ({
          value: match.id,
          label: match.name,
          description: [match.admissionNo, match.classSection, match.guardianName].filter(Boolean).join(' · '),
        })),
      );
      setStatus('finished');
    } catch {
      setStatus('error');
    }
  }

  return (
    <FormField label={t('search')} constraintText={t('searchHint')} stretch>
      <Autosuggest
        value={text}
        options={options}
        statusType={status}
        filteringType="manual"
        autoFocus
        loadingText={t('searching')}
        empty={t('noResults')}
        errorText={t('searchError')}
        enteredTextLabel={(value) => t('useText', { text: value })}
        onChange={({ detail }) => setText(detail.value)}
        onLoadItems={({ detail }) => void load(detail.filteringText)}
        onSelect={({ detail }) => {
          if (detail.selectedOption?.value) router.replace(`${pathname}?student=${detail.selectedOption.value}`);
        }}
      />
    </FormField>
  );
}

function Counter({ student }: { student: CounterStudent }) {
  const t = useTranslations('fees.counter');
  const router = useRouter();
  const pathname = usePathname();
  // The oldest overdue invoice is preselected, or the oldest open one when nothing is overdue yet.
  const preselected = student.invoices.find((invoice) => invoice.dueDate <= student.today) ?? student.invoices[0];
  const [selected, setSelected] = useState<Invoice[]>(preselected ? [preselected] : []);
  const selectedTotal = selected.reduce((sum, invoice) => sum + invoice.balanceMinor, 0);
  const [amount, setAmount] = useState(rupees(selectedTotal));
  const [method, setMethod] = useState<CounterMethod>('cash');
  const [reference, setReference] = useState('');
  const [bankName, setBankName] = useState('');
  const [note, setNote] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const amountMinor = toMinor(amount);

  function select(invoices: Invoice[]) {
    const ordered = student.invoices.filter((invoice) => invoices.some(({ id }) => id === invoice.id));
    setSelected(ordered);
    setAmount(rupees(ordered.reduce((sum, invoice) => sum + invoice.balanceMinor, 0)));
  }

  async function collect() {
    const problems: Record<string, string> = {};
    if (selected.length === 0) problems.invoices = t('errors.select');
    if (!amountMinor) problems.amount = t('errors.amount');
    else if (amountMinor > selectedTotal) problems.amount = t('errors.tooMuch', { amount: formatMoney(selectedTotal) });
    setErrors(problems);
    setFormError(null);
    if (Object.keys(problems).length > 0 || !amountMinor) return;

    setBusy(true);
    const result = await collectPayment({
      studentId: student.id,
      allocations: allocateInOrder(selected, amountMinor).allocations,
      method,
      ...(reference && { reference }),
      ...(bankName && { bankName }),
      ...(note && { note }),
      idempotencyKey,
    });
    if (result.ok) return router.push(`/fees/payments/${result.data.paymentId}?created=1`);
    setErrors(result.error.fieldErrors ?? {});
    setFormError(result.error.message);
    setBusy(false);
  }

  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header variant="h2" actions={<Button onClick={() => router.replace(pathname)}>{t('change')}</Button>}>
            {student.name}
          </Header>
        }
      >
        <KeyValuePairs
          columns={4}
          items={[
            { label: t('student'), value: student.admissionNo },
            { label: t('class'), value: student.classSection ?? NONE },
            {
              label: t('guardian'),
              value: [student.guardianName, student.guardianPhone && formatPhone(student.guardianPhone)]
                .filter(Boolean)
                .join(' · ') || NONE,
            },
            { label: t('totalDue'), value: formatMoney(student.totalDueMinor) },
          ]}
        />
      </Container>

      {student.invoices.length === 0 ? (
        <Container>
          <EmptyState icon="success" heading={t('noDues.heading', { name: student.name })} body={t('noDues.body')} />
        </Container>
      ) : (
        <>
          <FormField errorText={errors.invoices} stretch>
            <Table
              variant="container"
              trackBy="id"
              items={student.invoices}
              selectionType="multi"
              selectedItems={selected}
              onSelectionChange={({ detail }) => select(detail.selectedItems)}
              ariaLabels={{
                selectionGroupLabel: t('openInvoices'),
                allItemsSelectionLabel: () => t('selectAll'),
                itemSelectionLabel: (_, invoice) => t('selectInvoice', { invoiceNo: invoice.invoiceNo }),
              }}
              header={<Header variant="h2">{t('openInvoices')}</Header>}
              columnDefinitions={[
                { id: 'invoiceNo', header: t('columns.invoiceNo'), cell: (invoice) => invoice.invoiceNo, isRowHeader: true },
                { id: 'installment', header: t('columns.installment'), cell: (invoice) => invoice.installment },
                {
                  id: 'dueDate',
                  header: t('columns.dueDate'),
                  cell: (invoice) => (
                    <SpaceBetween direction="horizontal" size="xs">
                      {dateFormat.format(new Date(`${invoice.dueDate}T00:00:00Z`))}
                      {invoice.dueDate < student.today && <StatusIndicator type="error">{t('overdue')}</StatusIndicator>}
                    </SpaceBetween>
                  ),
                },
                { id: 'total', header: t('columns.total'), cell: (invoice) => formatMoney(invoice.totalMinor) },
                { id: 'paid', header: t('columns.paid'), cell: (invoice) => formatMoney(invoice.paidMinor) },
                { id: 'balance', header: t('columns.balance'), cell: (invoice) => formatMoney(invoice.balanceMinor) },
              ]}
            />
          </FormField>

          <Container header={<Header variant="h2">{t('payment')}</Header>}>
            <SpaceBetween size="m">
              {formError && <Alert type="error">{formError}</Alert>}
              <FormField
                label={t('amount')}
                constraintText={t('amountHint', { amount: formatMoney(selectedTotal) })}
                errorText={errors.amount ?? errors.allocations}
              >
                <Input
                  value={amount}
                  inputMode="decimal"
                  autoComplete={false}
                  onChange={({ detail }) => setAmount(detail.value)}
                />
              </FormField>
              <FormField label={t('method')} errorText={errors.method} stretch>
                <Tiles
                  columns={5}
                  value={method}
                  items={METHODS.map((value) => ({ value, label: t(`methods.${value}`) }))}
                  onChange={({ detail }) => setMethod(detail.value as CounterMethod)}
                />
              </FormField>
              <ColumnLayout columns={2}>
                {method !== 'cash' && (
                  <FormField label={t(method === 'cheque' ? 'chequeNo' : 'reference')} errorText={errors.reference}>
                    <Input value={reference} autoComplete={false} onChange={({ detail }) => setReference(detail.value)} />
                  </FormField>
                )}
                {method === 'cheque' && (
                  <FormField label={t('bankName')} errorText={errors.bankName}>
                    <Input value={bankName} autoComplete={false} onChange={({ detail }) => setBankName(detail.value)} />
                  </FormField>
                )}
                <FormField label={t('note')} errorText={errors.note}>
                  <Input value={note} autoComplete={false} onChange={({ detail }) => setNote(detail.value)} />
                </FormField>
              </ColumnLayout>
              <Button variant="primary" iconSvg={svg('collectPayment')} loading={busy} onClick={() => void collect()}>
                {amountMinor ? t('collect', { amount: formatMoney(amountMinor) }) : t('collectNothing')}
              </Button>
            </SpaceBetween>
          </Container>
        </>
      )}
    </SpaceBetween>
  );
}

export function FeeCounter({ student, notFound }: { student: CounterStudent | null; notFound: boolean }) {
  const t = useTranslations('fees.counter');
  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      {student ? (
        <Counter key={student.id} student={student} />
      ) : (
        <SpaceBetween size="l">
          {notFound && <Alert type="warning">{t('notFound')}</Alert>}
          <Container>
            <StudentSearch />
          </Container>
          <Container>
            <EmptyState icon="collectPayment" heading={t('start.heading')} body={t('start.body')} />
          </Container>
        </SpaceBetween>
      )}
    </ContentLayout>
  );
}
