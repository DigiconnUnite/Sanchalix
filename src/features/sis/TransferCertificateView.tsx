'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import { useCrumb } from '@/components/Crumb';
import { svg } from '@/components/icons';
import { usePrintInLightMode } from '@/lib/usePrintInLightMode';
import type { TransferCertificate } from '@/server/modules/sis/schemas';

const NONE = '—';
const SIGNATURES = ['preparedBy', 'classTeacher', 'principal'] as const;
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export function TransferCertificateView({ certificate }: { certificate: TransferCertificate }) {
  const t = useTranslations('sis.students.certificate');
  const tGender = useTranslations('sis.students.gender');
  useCrumb(certificate.name);
  usePrintInLightMode();

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={[certificate.schoolName, certificate.schoolAddress].filter(Boolean).join(' · ')}
          actions={
            <div className="vw-no-print">
              <SpaceBetween direction="horizontal" size="xs">
              <Button
                href={`/api/v1/students/${certificate.studentId}/transfer-certificate`}
                target="_blank"
                iconSvg={svg('download')}
                ariaLabel={t('downloadLabel', { name: certificate.name })}
              >
                {t('download')}
              </Button>
              <Button
                variant="primary"
                iconSvg={svg('print')}
                ariaLabel={t('printLabel', { name: certificate.name })}
                onClick={() => window.print()}
              >
                {t('print')}
              </Button>
              </SpaceBetween>
            </div>
          }
        >
          {t('title')}
        </Header>
      }
    >
      <Container>
        <SpaceBetween size="xxl">
          <KeyValuePairs
            columns={3}
            items={[
              { label: t('tcNo'), value: certificate.tcNo },
              { label: t('issuedOn'), value: day(certificate.leftOn) },
              { label: t('affiliationNo'), value: certificate.affiliationNo ?? NONE },
              { label: t('name'), value: certificate.name },
              { label: t('admissionNo'), value: certificate.admissionNo },
              { label: t('guardians'), value: certificate.guardians || NONE },
              { label: t('dob'), value: day(certificate.dob) },
              { label: t('gender'), value: tGender(certificate.gender) },
              { label: t('class'), value: certificate.classSection ?? NONE },
              { label: t('academicYear'), value: certificate.academicYear ?? NONE },
              { label: t('leftOn'), value: day(certificate.leftOn) },
              { label: t('dues'), value: t(certificate.duesCleared ? 'duesCleared' : 'duesPending') },
              { label: t('reason'), value: certificate.reason || NONE },
            ]}
          />
          <ColumnLayout columns={3}>
            {SIGNATURES.map((role) => (
              <Box key={role} padding={{ top: 'xxxl' }} color="text-body-secondary">
                {t(role)}
              </Box>
            ))}
          </ColumnLayout>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
