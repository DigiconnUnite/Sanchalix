import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { getTranslations } from 'next-intl/server';
import { PublicPage } from '@/features/marketing/PublicPage';
import { connectDb } from '@/server/db/connect';
import { School } from '@/server/models/school';
import { Student } from '@/server/models/student';
import { isCertificateLink } from '@/server/modules/sis/certificatePdf';
import { clientIp, withinLimit } from '@/server/rateLimit';

const ID = /^[0-9a-f]{24}$/;
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' });

export async function generateMetadata() {
  const t = await getTranslations('sis.students.certificate.verify');
  return { title: t('title'), robots: { index: false } };
}

// Public on purpose: another school can check a certificate it was handed. It shows the school, the certificate
// number, the student's name and the date of leaving, which are on the paper already. Nothing else about the child.
export default async function VerifyCertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string; studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ schoolId, studentId }, { s }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('sis.students.certificate.verify'),
  ]);
  const allowed = await withinLimit('verifyCertificate', await clientIp(), 60, 60);
  const genuine = allowed && ID.test(schoolId) && ID.test(studentId) && typeof s === 'string' && isCertificateLink(schoolId, studentId, s);
  await connectDb();
  const [student, school] = genuine
    ? await Promise.all([
        Student.findOne({ schoolId, _id: studentId, tcNo: { $ne: null } })
          .setOptions({ withDeleted: true })
          .select('firstName lastName tcNo leftOn')
          .lean(),
        School.findById(schoolId).select('name').lean(),
      ])
    : [null, null];

  return (
    <PublicPage>
      <ContentLayout defaultPadding maxContentWidth={640} header={<Header variant="h1">{t('title')}</Header>}>
        <Box padding={{ vertical: 'xl' }}>
          <Container>
            {student?.tcNo && student.leftOn && school ? (
              <SpaceBetween size="l">
                <StatusIndicator type="success">{t('valid')}</StatusIndicator>
                <KeyValuePairs
                  columns={2}
                  items={[
                    { label: t('school'), value: school.name },
                    { label: t('tcNo'), value: student.tcNo },
                    { label: t('name'), value: `${student.firstName} ${student.lastName ?? ''}`.trim() },
                    { label: t('leftOn'), value: date.format(new Date(`${student.leftOn}T00:00:00Z`)) },
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
