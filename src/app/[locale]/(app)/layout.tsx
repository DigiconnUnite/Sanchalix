import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/AppShell';
import { MODE_COOKIE, parseVisualMode } from '@/lib/visualMode';
import { setVisualMode, signOut } from '@/server/auth/actions';
import { can, type Permission } from '@/server/auth/permissions';
import { getSchoolName } from '@/server/platform/queries';
import { homeLabel, pageContext } from './pageContext';

type ModuleKey =
  | 'students'
  | 'academics'
  | 'attendance'
  | 'calendar'
  | 'feeCounter'
  | 'feeStructures'
  | 'invoices';

const MODULES: (Omit<NavItem, 'text'> & { key: ModuleKey; permission: Permission })[] = [
  { key: 'students', href: '/students', icon: 'students', permission: 'sis.student.read' },
  { key: 'academics', href: '/academics/classes', icon: 'academics', permission: 'academics.class.read' },
  { key: 'attendance', href: '/attendance/take', icon: 'attendance', permission: 'attendance.record.read' },
  { key: 'calendar', href: '/calendar/holidays', icon: 'holiday', permission: 'calendar.holiday.read' },
  { key: 'feeCounter', href: '/fees/counter', icon: 'collectPayment', permission: 'fees.payment.create' },
  { key: 'feeStructures', href: '/fees/structures', icon: 'fees', permission: 'fees.structure.read' },
  { key: 'invoices', href: '/fees/invoices', icon: 'invoice', permission: 'fees.invoice.read' },
];

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const ctx = await pageContext();
  const t = await getTranslations('shell');
  const nav: NavItem[] = [
    { text: t(`nav.${homeLabel(ctx.role)}`), href: '/', icon: 'dashboard' },
    ...MODULES.filter((item) => can(ctx.role, item.permission)).map(({ key, href, icon }) => ({
      text: t(`nav.${key}`),
      href,
      icon,
    })),
  ];

  return (
    <AppShell
      nav={nav}
      schoolName={await getSchoolName(ctx.schoolId)}
      userName={ctx.name}
      roleLabel={t(`roles.${ctx.role}`)}
      signOut={signOut}
      visualMode={parseVisualMode((await cookies()).get(MODE_COOKIE)?.value)}
      setVisualMode={setVisualMode}
    >
      {children}
    </AppShell>
  );
}
