import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/AppShell';
import { MODE_COOKIE, parseVisualMode } from '@/lib/visualMode';
import { setVisualMode, signOut, switchRole, switchSchool } from '@/server/auth/actions';
import { getPlatformContext, type PlatformContext } from '@/server/auth/context';
import { listOtherSchools } from '@/server/auth/service';
import { User } from '@/server/models/user';
import { can, type Permission } from '@/server/auth/permissions';
import { countUnread, listNotifications } from '@/server/modules/comms/service';
import { getSchoolBrand } from '@/server/platform/queries';
import { homeLabel, pageContext } from './pageContext';

type ModuleKey =
  | 'students'
  | 'admissions'
  | 'staff'
  | 'leave'
  | 'staffAttendance'
  | 'academics'
  | 'subjects'
  | 'timetable'
  | 'attendance'
  | 'homework'
  | 'exams'
  | 'reportCards'
  | 'calendar'
  | 'feeCounter'
  | 'feeStructures'
  | 'invoices'
  | 'payments'
  | 'dues'
  | 'feeReports'
  | 'feeDiscounts'
  | 'attendanceReport'
  | 'reports'
  | 'announcements'
  | 'calendarEvents'
  | 'promotion'
  | 'users'
  | 'settings'
  | 'outbox';
type Group = 'people' | 'academics' | 'fees' | 'communication' | 'admin';

const MODULES: (Omit<NavItem, 'text' | 'group' | 'banner'> & { key: ModuleKey; group: Group; permission: Permission })[] = [
  { key: 'students', group: 'people', href: '/students', icon: 'students', permission: 'sis.student.read' },
  { key: 'admissions', group: 'people', href: '/admissions', icon: 'admissions', permission: 'sis.admission.read' },
  { key: 'staff', group: 'people', href: '/staff', icon: 'staff', permission: 'hr.staff.read' },
  {
    key: 'staffAttendance',
    group: 'people',
    href: '/staff/attendance',
    icon: 'attendance',
    permission: 'hr.attendance.read',
  },
  { key: 'leave', group: 'people', href: '/leave', icon: 'leave', permission: 'hr.leave.read' },
  { key: 'academics', group: 'academics', href: '/academics/classes', icon: 'classes', permission: 'academics.class.read' },
  { key: 'subjects', group: 'academics', href: '/academics/subjects', icon: 'subjects', permission: 'academics.class.read' },
  {
    key: 'timetable',
    group: 'academics',
    href: '/academics/timetable',
    icon: 'timetable',
    permission: 'academics.timetable.read',
  },
  { key: 'attendance', group: 'academics', href: '/attendance/take', icon: 'attendance', permission: 'attendance.record.read' },
  {
    key: 'attendanceReport',
    group: 'academics',
    href: '/attendance/report',
    icon: 'reports',
    permission: 'attendance.record.read',
  },
  { key: 'exams', group: 'academics', href: '/exams', icon: 'exams', permission: 'exams.exam.read' },
  {
    key: 'reportCards',
    group: 'academics',
    href: '/report-cards',
    icon: 'reportCard',
    permission: 'exams.reportCard.read',
  },
  { key: 'homework', group: 'academics', href: '/homework', icon: 'homework', permission: 'homework.assignment.read' },
  { key: 'calendar', group: 'academics', href: '/calendar/holidays', icon: 'holiday', permission: 'calendar.holiday.read' },
  { key: 'feeCounter', group: 'fees', href: '/fees/counter', icon: 'collectPayment', permission: 'fees.payment.create' },
  { key: 'feeStructures', group: 'fees', href: '/fees/structures', icon: 'fees', permission: 'fees.structure.read' },
  { key: 'feeDiscounts', group: 'fees', href: '/fees/discounts', icon: 'concession', permission: 'fees.discount.read' },
  { key: 'invoices', group: 'fees', href: '/fees/invoices', icon: 'invoice', permission: 'fees.invoice.read' },
  { key: 'payments', group: 'fees', href: '/fees/payments', icon: 'receipt', permission: 'fees.payment.read' },
  { key: 'dues', group: 'fees', href: '/fees/dues', icon: 'dues', permission: 'fees.invoice.read' },
  { key: 'feeReports', group: 'fees', href: '/fees/reports', icon: 'financeReports', permission: 'fees.payment.read' },
  {
    key: 'announcements',
    group: 'communication',
    href: '/communication/announcements',
    icon: 'announcements',
    permission: 'comms.announcement.read',
  },
  { key: 'calendarEvents', group: 'communication', href: '/calendar/events', icon: 'calendar', permission: 'calendar.event.read' },
  { key: 'reports', group: 'admin', href: '/reports', icon: 'reports', permission: 'sis.admission.read' },
  { key: 'promotion', group: 'admin', href: '/promotion', icon: 'promote', permission: 'sis.enrollment.update' },
  { key: 'users', group: 'admin', href: '/users', icon: 'users', permission: 'users.user.read' },
  { key: 'outbox', group: 'admin', href: '/outbox', icon: 'sms', permission: 'messaging.outbox.read' },
  { key: 'settings', group: 'admin', href: '/settings', icon: 'settings', permission: 'settings.school.update' },
];

// Pages whose banner has an illustration in public/banners, named after the module key.
const ILLUSTRATED = new Set<ModuleKey>([
  'students',
  'admissions',
  'staff',
  'staffAttendance',
  'leave',
  'academics',
  'subjects',
  'timetable',
  'attendance',
  'exams',
  'reportCards',
  'homework',
  'calendar',
  'feeCounter',
  'feeStructures',
  'invoices',
  'payments',
  'dues',
  'announcements',
  'calendarEvents',
  'promotion',
  'users',
]);

async function PlatformLayout({ platform, children }: { platform: PlatformContext; children: ReactNode }) {
  const [t, cookieStore] = await Promise.all([getTranslations('shell'), cookies()]);
  const pages = [
    { key: 'platformHome', href: '/platform', icon: 'dashboard' },
    { key: 'platformSchools', href: '/platform/schools', icon: 'school' },
    { key: 'platformAudit', href: '/platform/audit', icon: 'auditLog' },
  ] as const;
  const nav: NavItem[] = pages.map(({ key, href, icon }) => ({
    text: t(`nav.${key}`),
    banner: { title: t(`banner.${key}.title`), description: t(`banner.${key}.description`) },
    href,
    icon,
  }));
  return (
    <AppShell
      nav={nav}
      schoolName={t('platformName')}
      schoolLogo={null}
      userName={platform.name}
      roleLabel={t('roles.super_admin')}
      signOut={signOut}
      otherRoles={[]}
      switchRole={switchRole}
      otherSchools={[]}
      switchSchool={switchSchool}
      visualMode={parseVisualMode(cookieStore.get(MODE_COOKIE)?.value)}
      setVisualMode={setVisualMode}
      unread={0}
      notifications={[]}
    >
      {children}
    </AppShell>
  );
}

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const platform = await getPlatformContext();
  if (platform) return <PlatformLayout platform={platform}>{children}</PlatformLayout>;
  const ctx = await pageContext();
  // Everything the shell needs is asked for at once; one after another, each page waited on five round trips.
  const [t, tDashboard, school, account, unread, notifications, cookieStore, otherSchools] = await Promise.all([
    getTranslations('shell'),
    getTranslations('dashboard'),
    getSchoolBrand(ctx.schoolId),
    User.findById(ctx.userId).select('roles').lean(),
    countUnread(ctx),
    listNotifications(ctx, 5),
    cookies(),
    listOtherSchools(ctx.userId, ctx.schoolId),
  ]);
  const otherRoles = (account?.roles ?? [])
    .filter((assignment) => assignment.schoolId?.equals(ctx.schoolId) && assignment.role !== ctx.role)
    .map((assignment) => ({ role: assignment.role, label: t(`roles.${assignment.role}`) }));
  const nav: NavItem[] = [
    {
      text: t(`nav.${homeLabel(ctx.role)}`),
      banner: {
        title: tDashboard('welcome', { name: ctx.name }),
        description: t('banner.home', { school: school.name }),
        image: '/banners/dashboard.svg',
      },
      href: '/',
      icon: 'dashboard',
    },
    ...MODULES.filter((item) => can(ctx.role, item.permission)).map(({ key, group, href, icon }) => ({
      text: t(`nav.${key}`),
      banner: {
        title: t(`banner.${key}.title`),
        description: t(`banner.${key}.description`),
        ...(ILLUSTRATED.has(key) && { image: `/banners/${key}.svg` }),
      },
      group: t(`groups.${group}`),
      href,
      icon,
    })),
  ];

  return (
    <AppShell
      nav={nav}
      schoolName={school.name}
      schoolLogo={school.logoUrl}
      userName={ctx.name}
      roleLabel={t(`roles.${ctx.role}`)}
      signOut={signOut}
      otherRoles={otherRoles}
      switchRole={switchRole}
      otherSchools={otherSchools.map(({ id, name }) => ({ id, name }))}
      switchSchool={switchSchool}
      visualMode={parseVisualMode(cookieStore.get(MODE_COOKIE)?.value)}
      setVisualMode={setVisualMode}
      unread={unread}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
