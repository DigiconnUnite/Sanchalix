'use client';

import AppLayoutToolbar from '@cloudscape-design/components/app-layout-toolbar';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Icon from '@cloudscape-design/components/icon';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { type IconKey, svg } from '@/components/icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useIsDark } from '@/lib/useIsDark';
import { useIsMobile } from '@/lib/useIsMobile';
import type { VisualMode } from '@/lib/visualMode';

export type NavItem = { text: string; href: string; icon: IconKey; group?: string };

export function AppShell({
  nav,
  schoolName,
  userName,
  roleLabel,
  signOut,
  visualMode,
  setVisualMode,
  unread,
  children,
}: {
  unread: number;
  visualMode: VisualMode;
  setVisualMode: (mode: VisualMode) => Promise<unknown>;
  nav: NavItem[];
  schoolName: string;
  userName: string;
  roleLabel: string;
  signOut: () => Promise<unknown>;
  children: ReactNode;
}) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const router = useRouter();
  // The item whose link is the longest prefix of the page wins, so /fees/invoices picks Invoices over Fee structures.
  // Failing that, a module owns everything under its first path segment: /academics/sections/new is Academics.
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const active =
    nav
      .filter((item) => (item.href === '/' ? pathname === '/' : under(item.href)))
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    nav.find((item) => item.href !== '/' && under(`/${item.href.split('/')[1] ?? ''}`));
  const isActive = (href: string) => href === active?.href;
  const [mode, setMode] = useState(visualMode);
  const isDark = useIsDark(mode);
  // Until the user toggles it, the navigation is open on desktop and closed on phones, where it is an overlay.
  const isMobile = useIsMobile();
  const [navigationChoice, setNavigationChoice] = useState<boolean | null>(null);
  const navigationOpen = navigationChoice ?? !isMobile;
  const collapsed = !isMobile && !navigationOpen;
  const link = ({ text, href, icon }: NavItem) => ({
    type: 'link' as const,
    text,
    href,
    icon: <Icon size="medium" svg={svg(icon, isActive(href))} />,
  });
  const groups = [...new Set(nav.flatMap((item) => item.group ?? []))];

  return (
    <>
      <div id="top-nav" className="vw-top-nav">
        <TopNavigation
          identity={{
            href: '/',
            title: schoolName,
            onFollow: (event) => {
              event.preventDefault();
              router.push('/');
            },
          }}
          utilities={[
            {
              type: 'button',
              iconSvg: svg('notifications'),
              ariaLabel: t('notifications', { count: unread }),
              title: t('notifications', { count: unread }),
              badge: unread > 0,
              onClick: () => router.push('/notifications'),
            },
            {
              type: 'button',
              iconSvg: (
                <span className="vw-icon vw-theme-toggle" data-dark={isDark}>
                  {svg('themeToggle')}
                </span>
              ),
              ariaLabel: t(isDark ? 'theme.toLight' : 'theme.toDark'),
              title: t(isDark ? 'theme.toLight' : 'theme.toDark'),
              onClick: () => {
                const next = isDark ? 'light' : 'dark';
                setMode(next);
                applyMode(isDark ? Mode.Light : Mode.Dark);
                void setVisualMode(next);
              },
            },
            {
              type: 'menu-dropdown',
              text: userName,
              description: roleLabel,
              iconSvg: svg('profile'),
              items: [
                { id: 'profile', text: t('profile'), iconSvg: svg('profile') },
                { id: 'signOut', text: t('signOut'), iconSvg: svg('signOut') },
              ],
              onItemClick: ({ detail }) =>
                detail.id === 'profile'
                  ? router.push('/profile')
                  : void signOut().then(() => router.replace('/signin')),
            },
          ]}
        />
      </div>
      <AppLayoutToolbar
        headerSelector="#top-nav"
        toolsHide
        navigationCloseBehavior="collapse"
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationChoice(detail.open)}
        breadcrumbs={
          <BreadcrumbGroup
            ariaLabel={t('breadcrumbs')}
            items={nav.filter((item) => item.href === '/' || item === active)}
            onFollow={(event) => {
              event.preventDefault();
              router.push(event.detail.href);
            }}
          />
        }
        navigation={
          <SideNavigation
            collapsed={collapsed}
            activeHref={active?.href ?? ''}
            items={[
              ...nav.filter((item) => !item.group).map(link),
              ...groups.map((title) => ({
                type: 'section-group' as const,
                title,
                items: nav.filter((item) => item.group === title).map(link),
              })),
            ]}
            onFollow={(event) => {
              if (event.detail.external) return;
              event.preventDefault();
              router.push(event.detail.href);
            }}
          />
        }
        content={children}
      />
    </>
  );
}
