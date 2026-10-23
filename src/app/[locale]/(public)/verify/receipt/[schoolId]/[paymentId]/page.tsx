import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { getTranslations } from 'next-intl/server';
import { PublicPage } from '@/features/marketing/PublicPage';
import { formatMoney } from '@/lib/money';
import { connectDb } from '@/server/db/connect';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';
import { isReceiptLink } from '@/server/modules/fees/receiptPdf';
import { clientIp, withinLimit } from '@/server/rateLimit';

const ID = /^[0-9a-f]{24}$/;
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' });

export async function generateMetadata() {
  const t = await getTranslations('fees.verify');
  return { title: t('title'), robots: { index: false } };
}

// Public on purpose: whoever holds a printed receipt can check it. It shows the school, number, date and amount,
// which are already on the paper, and nothing about the child.
export default async function VerifyReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string; paymentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ schoolId, paymentId }, { s }, t] = await Promise.all([params, searchParams, getTranslations('fees.verify')]);
  // The school id comes from the address, which is safe only because the signature covers it.
  // Checking is open to anyone holding a receipt, so one caller can't be allowed to try links without end.
  const allowed = await withinLimit('verifyReceipt', await clientIp(), 60, 60);
  const genuine = allowed && ID.test(schoolId) && ID.test(paymentId) && typeof s === 'string' && isReceiptLink(schoolId, paymentId, s);
  await connectDb();
  const [payment, school] = genuine
    ? await Promise.all([
        Payment.findOne({ schoolId, _id: paymentId }).select('receiptNo amountMinor createdAt').lean(),
        School.findById(schoolId).select('name').lean(),
      ])
    : [null, null];

  return (
    <PublicPage>
      <ContentLayout defaultPadding maxContentWidth={640} header={<Header variant="h1">{t('title')}</Header>}>
        <Box padding={{ vertical: 'xl' }}>
          <Container>
            {payment && school ? (
              <SpaceBetween size="l">
                <StatusIndicator type="success">{t('valid')}</StatusIndicator>
                <KeyValuePairs
                  columns={2}
                  items={[
                    { label: t('school'), value: school.name },
                    { label: t('receiptNo'), value: payment.receiptNo },
                    { label: t('date'), value: date.format(payment.createdAt) },
                    { label: t('amount'), value: formatMoney(payment.amountMinor) },
                  ]}
                />
                <Box color="text-body-secondary">{t('compare')}</Box>
              </SpaceBetween>
            ) : (
              <SpaceBetween size="s">
                <StatusIndicator type="error">{t(allowed ? 'invalid' : 'tooMany')}</StatusIndicator>
                <Box color="text-body-secondary">{t(allowed ? 'invalidBody' : 'tooManyBody')}</Box>
              </SpaceBetween>
            )}
          </Container>
        </Box>
      </ContentLayout>
    </PublicPage>
  );
}
