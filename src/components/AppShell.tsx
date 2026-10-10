'use client';

import AppLayoutToolbar from '@cloudscape-design/components/app-layout-toolbar';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Icon from '@cloudscape-design/components/icon';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { CrumbContext } from '@/components/Crumb';
import { type IconKey, svg } from '@/components/icons';
import { markNotificationsRead } from '@/server/modules/comms/actions';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useIsDark } from '@/lib/useIsDark';
import { useIsMobile } from '@/lib/useIsMobile';
import type { VisualMode } from '@/lib/visualMode';

// Paths that are part of a URL but have no page of their own, so they get no crumb.
const NO_PAGE = [/^\/fees\/structures\/[0-9a-f]{24}$/, /^\/academics\/sections$/, /^\/fees$/, /^\/academics$/, /^\/attendance$/, /^\/calendar$/, /^\/communication$/];

const VIEW_ALL = 'view-all';

export type NavItem = { text: string; href: string; icon: IconKey; group?: string; banner: { title: string; description: string; image?: string } };

export function AppShell({
  nav,
  schoolName,
  schoolLogo,
  userName,
  roleLabel,
  signOut,
  otherRoles,
  switchRole,
  visualMode,
  setVisualMode,
  unread,
  notifications,
  children,
}: {
  unread: number;
  notifications: { id: string; title: string; body: string | null; link: string | null; read: boolean }[];
  visualMode: VisualMode;
  setVisualMode: (mode: VisualMode) => Promise<unknown>;
  nav: NavItem[];
  schoolName: string;
  schoolLogo: string | null;
  userName: string;
  roleLabel: string;
  signOut: () => Promise<unknown>;
  otherRoles: { role: string; label: string }[];
  switchRole: (role: string) => Promise<unknown>;
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
  // The pages in the navigation open with a banner. Forms and records under them keep their own plain heading.
  const banner = nav.find((item) => item.href === pathname);
  const [mode, setMode] = useState(visualMode);
  const isDark = useIsDark(mode);
  // Until the user toggles it, the navigation is open on desktop and closed on phones, where it is an overlay.
  const isMobile = useIsMobile();
  const [navigationChoice, setNavigationChoice] = useState<boolean | null>(null);
  const navigationOpen = navigationChoice ?? !isMobile;
  const collapsed = !isMobile && !navigationOpen;
  // Without a logo the header shows the school icon. TopNavigation's logo is an <img>, so the icon from the icon map
  // is read back as markup and handed over as an image. It is always white: the header is dark in both themes, and
  // an image can't follow the text colour the way an inline icon does.
  const iconRef = useRef<HTMLSpanElement>(null);
  const [iconLogo, setIconLogo] = useState<string | null>(null);
  useEffect(() => {
    const glyph = iconRef.current?.querySelector('svg');
    if (!glyph) return;
    // XMLSerializer adds the SVG namespace, which a standalone image needs and inline markup may leave out.
    const markup = new XMLSerializer().serializeToString(glyph).replaceAll('currentColor', 'white');
    setIconLogo(`data:image/svg+xml,${encodeURIComponent(markup)}`);
  }, []);
  const logo = schoolLogo ?? iconLogo;

  // Breadcrumbs follow the URL: home, the module, then one crumb per deeper segment. A record's id shows the name
  // its page gave through useCrumb.
  const [recordLabel, setRecordLabel] = useState('');
  const base = !active || active.href === '/' ? '' : under(active.href) ? active.href : `/${active.href.split('/')[1] ?? ''}`;
  const deeper = pathname.slice(base.length).split('/').filter(Boolean);
  const crumbs = [
    ...nav.filter((item) => item.href === '/' || item === active).map(({ text, href }) => ({ text, href })),
    ...deeper.flatMap((segment, index) => {
      const href = `${base}/${deeper.slice(0, index + 1).join('/')}`;
      if (NO_PAGE.some((pattern) => pattern.test(href))) return [];
      const isRecord = /^[0-9a-f]{24}$/.test(segment);
      const key = `crumbs.${segment}`;
      return [{ text: isRecord ? recordLabel || t('crumbs.details') : t.has(key) ? t(key) : segment, href }];
    }),
  ];
  const link = ({ text, href, icon }: NavItem) => ({
    type: 'link' as const,
    text,
    href,
    icon: <Icon size="medium" svg={svg(icon, isActive(href))} />,
  });
  const groups = [...new Set(nav.flatMap((item) => item.group ?? []))];

  return (
    <CrumbContext value={setRecordLabel}>
      <span ref={iconRef} hidden>
        {svg('school')}
      </span>
      <div
        id="top-nav"
        className="vw-top-nav"
        {...(logo && {
          'data-school-logo': schoolLogo ? 'image' : 'icon',
          style: { '--vw-school-logo': `url(${JSON.stringify(logo)})` } as CSSProperties,
        })}
      >
        <a
          // Cloudscape's own header context, so the box takes the header's dark colours in both light and dark mode.
          className="vw-platform-logo awsui-context-top-navigation"
          href="/"
          aria-label={t('platformLogoAlt')}
          onClick={(event) => {
            event.preventDefault();
            router.push('/');
          }}
        />
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
              type: 'menu-dropdown',
              iconSvg: svg('notifications'),
              ariaLabel: t('notifications', { count: unread }),
              title: t('notificationsMenu.title'),
              badge: unread > 0,
              items: [
                ...(notifications.length
                  ? notifications.map((notification) => ({
                      id: notification.id,
                      text: notification.title,
                      ...(notification.body && { description: notification.body.slice(0, 90) }),
                      ...(!notification.read && { secondaryText: t('notificationsMenu.new') }),
                    }))
                  : [{ id: 'none', text: t('notificationsMenu.empty'), disabled: true }]),
                { id: VIEW_ALL, text: t('notificationsMenu.viewAll') },
              ],
              onItemClick: ({ detail }) => {
                const opened = notifications.find((notification) => notification.id === detail.id);
                if (!opened) return router.push('/notifications');
                // Opening a notification from the menu is reading it.
                if (!opened.read) void markNotificationsRead([opened.id]).then(() => router.refresh());
                router.push(opened.link ?? '/notifications');
              },
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
                ...otherRoles.map(({ role, label }) => ({
                  id: `role:${role}`,
                  text: t('switchTo', { role: label }),
                  iconSvg: svg('switchRole'),
                })),
                { id: 'signOut', text: t('signOut'), iconSvg: svg('signOut') },
              ],
              onItemClick: ({ detail }) => {
                if (detail.id === 'profile') return router.push('/profile');
                // A different role means a different menu and home page, so the app is loaded afresh.
                if (detail.id.startsWith('role:')) {
                  return void switchRole(detail.id.slice(5)).then(() => window.location.assign('/'));
                }
                void signOut().then(() => router.replace('/signin'));
              },
            },
          ]}
        />
      </div>
      <AppLayoutToolbar
        headerSelector="#top-nav"
        toolsHide
        disableContentPaddings={Boolean(banner)}
        navigationCloseBehavior="collapse"
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationChoice(detail.open)}
        breadcrumbs={
          <BreadcrumbGroup
            ariaLabel={t('breadcrumbs')}
            items={crumbs}
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
        content={
          banner ? (
            <div
              className="vw-page-banner"
              {...(banner.banner.image && {
                'data-image': true,
                style: { '--vw-banner-image': `url(${JSON.stringify(banner.banner.image)})` } as CSSProperties,
              })}
            >
              <ContentLayout
                defaultPadding
                disableOverlap
                headerVariant="high-contrast"
                headerBackgroundStyle="var(--vw-banner-background)"
                header={
                  <div className="vw-page-banner-title">
                    <Header variant="h1" description={banner.banner.description}>
                      {banner.banner.title}
                    </Header>
                  </div>
                }
              >
                <div className="vw-page-banner-body">{children}</div>
              </ContentLayout>
            </div>
          ) : (
            children
          )
        }
      />
    </CrumbContext>
  );
}
