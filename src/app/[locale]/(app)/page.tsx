import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { KpiTile } from '@/components/KpiTile';
import { formatMoney } from '@/lib/money';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { listAnnouncements } from '@/server/modules/comms/service';
import { getAttendanceToday, getFeesSummary } from '@/server/modules/dashboard/queries';
import { countStudents } from '@/server/modules/sis/queries';
import { PortalHome } from '@/features/portal/Portal';
import { getPortalHome } from '@/server/modules/portal/service';
import { getTeacherDay } from '@/server/modules/timetable/service';
import { homeLabel, pageContext } from './pageContext';

const ANNOUNCEMENTS = '/communication/announcements';
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

export async function generateMetadata() {
  const ctx = await pageContext();
  const t = await getTranslations('shell.nav');
  return { title: t(homeLabel(ctx.role)) };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext();
  const [t, tNav] = await Promise.all([getTranslations('dashboard'), getTranslations('shell.nav')]);

  if (can(ctx.role, 'portal.self.read')) {
    const { student } = await searchParams;
    const [tPortal, home] = await Promise.all([
      getTranslations('portal'),
      getPortalHome(ctx, typeof student === 'string' ? student : undefined),
    ]);
    const title = tNav(homeLabel(ctx.role));
    if (!home) {
      return (
        <ContentLayout header={<Header variant="h1">{title}</Header>}>
          <EmptyState icon="students" heading={tPortal('notLinked.heading')} body={tPortal('notLinked.body')} />
        </ContentLayout>
      );
    }
    return <PortalHome key={home.selected.id} home={home} title={title} welcome={t('welcome', { name: ctx.name })} />;
  }

  const loading = (title: string) => (
    <Container fitHeight header={<Header variant="h2">{title}</Header>}>
      <StatusIndicator type="loading">{t('loading')}</StatusIndicator>
    </Container>
  );
  const widget = (title: string, content: ReactNode) => <Suspense fallback={loading(title)}>{content}</Suspense>;
  const sees = {
    attendance: can(ctx.role, 'attendance.record.read'),
    students: can(ctx.role, 'sis.student.read') && ctx.scope !== 'assigned',
    fees: can(ctx.role, 'fees.invoice.read'),
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={t('welcome', { name: ctx.name })}
          actions={
            can(ctx.role, 'fees.payment.create') ? (
              <Button variant="primary" href="/fees/counter" iconSvg={svg('collectPayment')}>
                {t('actions.counter')}
              </Button>
            ) : (
              can(ctx.role, 'attendance.record.create') &&
              ctx.scope === 'assigned' && (
                <Button variant="primary" href="/attendance/take" iconSvg={svg('attendance')}>
                  {t('actions.attendance')}
                </Button>
              )
            )
          }
        >
          {tNav(homeLabel(ctx.role))}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {(sees.attendance || sees.students || sees.fees) && (
          <ColumnLayout columns={3}>
            {sees.attendance && widget(t('attendance.title'), <AttendanceTile ctx={ctx} />)}
            {sees.students && widget(t('students.title'), <StudentsTile ctx={ctx} />)}
            {sees.fees && widget(t('fees.title'), <FeeTiles ctx={ctx} />)}
          </ColumnLayout>
        )}
        {ctx.staffId && can(ctx.role, 'academics.timetable.read') && widget(t('classes.title'), <TodayClasses ctx={ctx} />)}
        {widget(t('announcements.title'), <LatestAnnouncements ctx={ctx} />)}
      </SpaceBetween>
    </ContentLayout>
  );
}

async function AttendanceTile({ ctx }: { ctx: RequestContext }) {
  const [t, attendance] = await Promise.all([getTranslations('dashboard.attendance'), getAttendanceToday(ctx)]);
  const title = t('title');
  if (attendance.sections === 0) {
    return <KpiTile title={title} value={t('none')} href="/attendance/take" description={t('noSections')} />;
  }
  if (attendance.state !== 'open') {
    return (
      <KpiTile
        title={title}
        value={t('notNeeded')}
        href="/attendance/register"
        description={t(attendance.state === 'holiday' ? 'holiday' : 'nonWorking', { name: attendance.holidayName ?? '' })}
      />
    );
  }
  const pending = attendance.sections - attendance.submitted;
  const href = attendance.firstPending ? `/attendance/take?section=${attendance.firstPending.id}` : '/attendance/register';
  return (
    <KpiTile
      title={title}
      value={attendance.percent === null ? t('notTaken') : `${attendance.percent}%`}
      href={href}
      description={
        pending > 0 ? (
          <StatusIndicator type="warning">{t('pending', { count: pending, total: attendance.sections })}</StatusIndicator>
        ) : (
          <StatusIndicator type="success">{t('allSubmitted', { absent: attendance.absent })}</StatusIndicator>
        )
      }
    />
  );
}

async function StudentsTile({ ctx }: { ctx: RequestContext }) {
  const [t, count] = await Promise.all([getTranslations('dashboard.students'), countStudents(ctx, 'active')]);
  return <KpiTile title={t('title')} value={t('link', { count })} href="/students" />;
}

async function FeeTiles({ ctx }: { ctx: RequestContext }) {
  const [t, fees] = await Promise.all([getTranslations('dashboard.fees'), getFeesSummary(ctx)]);
  return (
    <SpaceBetween size="l">
      <KpiTile
        title={t('collectedToday')}
        value={formatMoney(fees.collectedTodayMinor)}
        href="/fees/payments"
        description={t('receipts', { count: fees.receiptsToday, month: formatMoney(fees.collectedMonthMinor) })}
      />
      <KpiTile
        title={t('overdue')}
        value={formatMoney(fees.overdueMinor)}
        href="/fees/dues"
        description={
          fees.overdueInvoices > 0 ? (
            <StatusIndicator type="warning">{t('overdueInvoices', { count: fees.overdueInvoices })}</StatusIndicator>
          ) : (
            <StatusIndicator type="success">{t('noDues')}</StatusIndicator>
          )
        }
      />
      {fees.draftStructures > 0 && can(ctx.role, 'fees.structure.read') && (
        <KpiTile
          title={t('approvals')}
          value={t('drafts', { count: fees.draftStructures })}
          href="/fees/structures"
          description={t(can(ctx.role, 'fees.structure.approve') ? 'approveHint' : 'waitingHint')}
        />
      )}
    </SpaceBetween>
  );
}

async function TodayClasses({ ctx }: { ctx: RequestContext }) {
  const [t, periods] = await Promise.all([getTranslations('dashboard.classes'), getTeacherDay(ctx)]);
  return (
    <Container
      header={
        <Header variant="h2" actions={<AppLink href="/academics/timetable">{t('timetable')}</AppLink>}>
          {t('title')}
        </Header>
      }
    >
      {periods.length === 0 ? (
        <EmptyState icon="timetable" heading={t('empty.heading')} body={t('empty.body')} />
      ) : (
        <ColumnLayout columns={4} variant="text-grid">
          {periods.map((period) => (
            <div key={period.number}>
              <Box variant="awsui-key-label">
                {t('period', { number: period.number, start: period.start, end: period.end })}
              </Box>
              <Box fontWeight="bold">{period.subject}</Box>
              <Box color="text-body-secondary">{period.section}</Box>
            </div>
          ))}
        </ColumnLayout>
      )}
    </Container>
  );
}

async function LatestAnnouncements({ ctx }: { ctx: RequestContext }) {
  const [t, announcements] = await Promise.all([getTranslations('dashboard.announcements'), listAnnouncements(ctx)]);
  return (
    <Container
      header={
        <Header variant="h2" actions={<AppLink href={ANNOUNCEMENTS}>{t('all')}</AppLink>}>
          {t('title')}
        </Header>
      }
    >
      {announcements.length === 0 ? (
        <EmptyState icon="announcements" heading={t('empty.heading')} body={t('empty.body')} />
      ) : (
        <SpaceBetween size="m">
          {announcements.slice(0, 3).map((announcement) => (
            <SpaceBetween key={announcement.id} size="xxxs">
              <AppLink href={`${ANNOUNCEMENTS}/${announcement.id}`} fontSize="heading-s">
                {announcement.title}
              </AppLink>
              <Box color="text-body-secondary">
                {t('by', { author: announcement.author, date: dateFormat.format(new Date(announcement.publishedAt)) })}
              </Box>
              <Box>{announcement.excerpt}</Box>
            </SpaceBetween>
          ))}
        </SpaceBetween>
      )}
    </Container>
  );
}
