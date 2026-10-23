import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { getTranslations } from 'next-intl/server';
import { cache, type ReactNode, Suspense } from 'react';
import { AppLink } from '@/components/AppLink';
import { EmptyState } from '@/components/EmptyState';
import { svg } from '@/components/icons';
import { KpiTile } from '@/components/KpiTile';
import { AgeingChart, AttendanceTrendChart, CollectionChart, MethodChart } from '@/features/dashboard/DashboardCharts';
import { daysBefore } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { listUpcoming } from '@/server/modules/calendar/events';
import { listAnnouncements } from '@/server/modules/comms/service';
import { getLeaveBalances } from '@/server/modules/hr/leave';
import { getSchoolCalendar } from '@/server/modules/attendance/queries';
import {
  getAttendanceToday,
  getAttendanceTrend,
  getDuesAgeing,
  getFeesSummary,
} from '@/server/modules/dashboard/queries';
import { getAttention } from '@/server/modules/dashboard/attention';
import { getCollectionReport } from '@/server/modules/fees/reports';
import { countStudents } from '@/server/modules/sis/queries';
import { PortalHome } from '@/features/portal/Portal';
import { getPortalHome } from '@/server/modules/portal/service';
import { getTeacherDay } from '@/server/modules/timetable/service';
import { homeLabel, pageContext } from './pageContext';

const ANNOUNCEMENTS = '/communication/announcements';
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
const dayFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDay = (value: string) => dayFormat.format(new Date(`${value}T00:00:00Z`));

const COLLECTION_DAYS = 14;
const attendanceToday = cache(getAttendanceToday);
const feesSummary = cache(getFeesSummary);
const recentCollection = cache(async (ctx: RequestContext) => {
  const { today } = await getSchoolCalendar(ctx);
  const dates = Array.from({ length: COLLECTION_DAYS }, (_, index) => daysBefore(today, COLLECTION_DAYS - 1 - index));
  return { dates, report: await getCollectionReport(ctx, dates[0], today) };
});

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
        <ContentLayout>
          <EmptyState icon="students" heading={tPortal('notLinked.heading')} body={tPortal('notLinked.body')} />
        </ContentLayout>
      );
    }
    return (
      <PortalHome
        key={home.selected.id}
        home={home}
        title={title}
        canPay={ctx.role === 'parent'}
      />
    );
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
    collection: can(ctx.role, 'fees.payment.read'),
  };

  return (
    <ContentLayout
      header={
        <Header
          variant="h2"
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
          <ColumnLayout columns={4}>
            {sees.attendance && widget(t('attendance.title'), <AttendanceTile ctx={ctx} />)}
            {sees.students && widget(t('students.title'), <StudentsTile ctx={ctx} />)}
            {sees.fees && widget(t('fees.collectedToday'), <CollectedTile ctx={ctx} />)}
            {sees.fees && widget(t('fees.overdue'), <OverdueTile ctx={ctx} />)}
          </ColumnLayout>
        )}
        {ctx.staffId && can(ctx.role, 'academics.timetable.read') && widget(t('classes.title'), <TodayClasses ctx={ctx} />)}
        <ColumnLayout columns={2}>
          {(sees.attendance || sees.fees) &&
            widget(t('attention.title'), <Attention ctx={ctx} attendance={sees.attendance} fees={sees.fees} />)}
          {sees.attendance && widget(t('charts.attendance.title'), <AttendanceTrend ctx={ctx} />)}
          {sees.collection && widget(t('charts.collection.title'), <Collection ctx={ctx} />)}
          {sees.collection && widget(t('charts.methods.title'), <Methods ctx={ctx} />)}
          {sees.fees && widget(t('charts.ageing.title'), <Ageing ctx={ctx} />)}
          {widget(t('announcements.title'), <LatestAnnouncements ctx={ctx} />)}
          {widget(t('upcoming.title'), <UpcomingEvents ctx={ctx} />)}
          {ctx.staffId && can(ctx.role, 'hr.leave.create') && widget(t('myLeave.title'), <MyLeave ctx={ctx} />)}
        </ColumnLayout>
      </SpaceBetween>
    </ContentLayout>
  );
}

async function AttendanceTile({ ctx }: { ctx: RequestContext }) {
  const [t, attendance] = await Promise.all([getTranslations('dashboard.attendance'), attendanceToday(ctx)]);
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

async function CollectedTile({ ctx }: { ctx: RequestContext }) {
  const [t, fees] = await Promise.all([getTranslations('dashboard.fees'), feesSummary(ctx)]);
  return (
    <KpiTile
      title={t('collectedToday')}
      value={formatMoney(fees.collectedTodayMinor)}
      href="/fees/payments"
      description={t('receipts', { count: fees.receiptsToday, month: formatMoney(fees.collectedMonthMinor) })}
    />
  );
}

async function OverdueTile({ ctx }: { ctx: RequestContext }) {
  const [t, fees] = await Promise.all([getTranslations('dashboard.fees'), feesSummary(ctx)]);
  return (
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
  );
}

async function Attention({ ctx, attendance, fees }: { ctx: RequestContext; attendance: boolean; fees: boolean }) {
  const [t, waiting, today, summary] = await Promise.all([
    getTranslations('dashboard.attention'),
    getAttention(ctx),
    attendance ? attendanceToday(ctx) : null,
    fees ? feesSummary(ctx) : null,
  ]);
  const pending = today?.state === 'open' ? today.sections - today.submitted : 0;
  const drafts = can(ctx.role, 'fees.structure.read') ? (summary?.draftStructures ?? 0) : 0;
  const items = [
    ...(pending > 0
      ? [
          {
            href: today?.firstPending ? `/attendance/take?section=${today.firstPending.id}` : '/attendance/register',
            text: t('attendance', { count: pending }),
          },
        ]
      : []),
    ...(summary && summary.overdueInvoices > 0
      ? [
          {
            href: '/fees/dues',
            text: t('overdue', { count: summary.overdueInvoices, amount: formatMoney(summary.overdueMinor) }),
          },
        ]
      : []),
    ...(drafts > 0
      ? [
          {
            href: '/fees/structures',
            text: t(can(ctx.role, 'fees.structure.approve') ? 'approve' : 'waiting', { count: drafts }),
          },
        ]
      : []),
    ...waiting.map(({ key, count, href }) => ({ href, text: t(key, { count }) })),
  ];
  return (
    <Container
      fitHeight
      header={
        <Header variant="h2" counter={items.length > 0 ? `(${items.length})` : undefined}>
          {t('title')}
        </Header>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon="success" heading={t('clear.heading')} body={t('clear.body')} />
      ) : (
        <SpaceBetween size="s">
          {items.map((item) => (
            <StatusIndicator key={item.href} type="warning">
              <AppLink href={item.href}>{item.text}</AppLink>
            </StatusIndicator>
          ))}
        </SpaceBetween>
      )}
    </Container>
  );
}

async function AttendanceTrend({ ctx }: { ctx: RequestContext }) {
  return <AttendanceTrendChart days={await getAttendanceTrend(ctx)} />;
}

async function Collection({ ctx }: { ctx: RequestContext }) {
  const { dates, report } = await recentCollection(ctx);
  const byDate = new Map(report.byDay.map((entry) => [entry.date, entry.amountMinor]));
  return <CollectionChart days={dates.map((date) => ({ date, amountMinor: byDate.get(date) ?? 0 }))} />;
}

async function Methods({ ctx }: { ctx: RequestContext }) {
  const { report } = await recentCollection(ctx);
  return <MethodChart methods={report.byMethod} />;
}

async function Ageing({ ctx }: { ctx: RequestContext }) {
  return <AgeingChart bands={await getDuesAgeing(ctx)} />;
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

async function UpcomingEvents({ ctx }: { ctx: RequestContext }) {
  const [t, items] = await Promise.all([getTranslations('dashboard.upcoming'), listUpcoming(ctx, 5)]);
  const upcoming = items.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
  return (
    <Container
      fitHeight
      header={
        <Header variant="h2" actions={<AppLink href="/calendar/events">{t('all')}</AppLink>}>
          {t('title')}
        </Header>
      }
    >
      {upcoming.length === 0 ? (
        <EmptyState icon="event" heading={t('empty.heading')} body={t('empty.body')} />
      ) : (
        <SpaceBetween size="s">
          {upcoming.map((item) => (
            <SpaceBetween key={`${item.start}-${item.title}`} size="xxxs">
              <Box fontWeight="bold">{item.title}</Box>
              <Box color="text-body-secondary">
                {item.start === item.end ? shortDay(item.start) : `${shortDay(item.start)} – ${shortDay(item.end)}`}
              </Box>
            </SpaceBetween>
          ))}
        </SpaceBetween>
      )}
    </Container>
  );
}

async function MyLeave({ ctx }: { ctx: RequestContext }) {
  const [t, tLeave, balances] = await Promise.all([
    getTranslations('dashboard.myLeave'),
    getTranslations('hr.leave'),
    getLeaveBalances(ctx),
  ]);
  return (
    <Container
      fitHeight
      header={
        <Header variant="h2" actions={<AppLink href="/leave">{t('apply')}</AppLink>}>
          {t('title')}
        </Header>
      }
    >
      <ColumnLayout columns={3} variant="text-grid">
        {balances.map((balance) => (
          <div key={balance.type}>
            <Box variant="awsui-key-label">{tLeave(`type.${balance.type}`)}</Box>
            <Box variant="awsui-value-large">{tLeave('balance', { left: balance.left, quota: balance.quota })}</Box>
          </div>
        ))}
      </ColumnLayout>
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
