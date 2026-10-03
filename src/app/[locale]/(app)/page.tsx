import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { countStudents } from '@/server/modules/sis/queries';
import { homeLabel, pageContext } from './pageContext';

export async function generateMetadata() {
  const ctx = await pageContext();
  const t = await getTranslations('shell.nav');
  return { title: t(homeLabel(ctx.role)) };
}

export default async function DashboardPage() {
  const ctx = await pageContext();
  const [t, tNav] = await Promise.all([getTranslations('dashboard'), getTranslations('shell.nav')]);

  return (
    <ContentLayout
      header={
        <Header variant="h1" description={t('welcome', { name: ctx.name })}>
          {tNav(homeLabel(ctx.role))}
        </Header>
      }
    >
      <Container header={can(ctx.role, 'sis.student.read') && <Header variant="h2">{t('students.title')}</Header>}>
        {can(ctx.role, 'sis.student.read') ? (
          <Suspense fallback={<StatusIndicator type="loading">{t('loading')}</StatusIndicator>}>
            <ActiveStudents ctx={ctx} />
          </Suspense>
        ) : (
          <EmptyState icon="dashboard" heading={t('empty.heading')} body={t('empty.body')} />
        )}
      </Container>
    </ContentLayout>
  );
}

async function ActiveStudents({ ctx }: { ctx: RequestContext }) {
  const [t, count] = await Promise.all([getTranslations('dashboard'), countStudents(ctx, 'active')]);
  return (
    <AppLink href="/students" variant="awsui-value-large">
      {t('students.link', { count })}
    </AppLink>
  );
}
