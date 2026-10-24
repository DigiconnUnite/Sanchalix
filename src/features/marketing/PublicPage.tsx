import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MODE_COOKIE, parseVisualMode } from '@/lib/visualMode';
import { getContext } from '@/server/auth/context';
import { PublicHeader } from './PublicHeader';

export const SECTIONS = ['features', 'roles', 'steps'];
const HOME = '/welcome';
const BLOG = '/blog';

/** Where "Sign in" leads. Someone already signed in gets a way back into the app, not a second sign-in. */
export async function getEntry() {
  const [t, ctx] = await Promise.all([getTranslations('marketing'), getContext()]);
  return { signedIn: Boolean(ctx), ...(ctx ? { href: '/', text: t('openApp') } : { href: '/signin', text: t('signIn') }) };
}

/**
 * The header and footer every marketing page shares. On the home page the section links scroll; on any other page
 * they lead back to the home page's sections.
 */
export async function PublicPage({ home = false, children }: { home?: boolean; children: ReactNode }) {
  const [t, enter] = await Promise.all([getTranslations('marketing'), getEntry()]);
  const links = [
    ...SECTIONS.map((key) => ({ href: `${home ? '' : HOME}#${key}`, text: t(`nav.${key}`) })),
    { href: BLOG, text: t('nav.blog') },
  ];

  return (
    <>
      <PublicHeader
        brand={t('brand')}
        builtBy={t('builtBy')}
        links={links}
        enter={enter}
        visualMode={parseVisualMode((await cookies()).get(MODE_COOKIE)?.value)}
      />
      {children}
      <footer className="vw-public-footer awsui-context-top-navigation">
        <div className="vw-public-footer-inner">
          <Box padding={{ vertical: 'xxl', horizontal: 'xl' }}>
            <SpaceBetween size="xl">
              <ColumnLayout columns={3} minColumnWidth={200}>
                <SpaceBetween size="xs">
                  <Box fontSize="heading-l" fontWeight="bold">
                    {t('brand')}
                  </Box>
                  <Box fontWeight="bold">{t('tagline')}</Box>
                  <Box color="text-body-secondary">{t('footer.tagline')}</Box>
                </SpaceBetween>
                <nav aria-label={t('footer.product')}>
                  <SpaceBetween size="xs">
                    <Box variant="awsui-key-label">{t('footer.product')}</Box>
                    {links.map(({ href, text }) => (
                      <Link key={href} href={href}>
                        {text}
                      </Link>
                    ))}
                  </SpaceBetween>
                </nav>
                <nav aria-label={t('footer.account')}>
                  <SpaceBetween size="xs">
                    <Box variant="awsui-key-label">{t('footer.account')}</Box>
                    <Link href={enter.href}>{enter.text}</Link>
                    {!enter.signedIn && <Link href="/forgot-password">{t('footer.forgotPassword')}</Link>}
                  </SpaceBetween>
                </nav>
              </ColumnLayout>
              <div className="vw-public-footer-legal">
                <Box color="text-body-secondary" fontSize="body-s">
                  {t('footer.copyright', { year: new Date().getFullYear() })}
                </Box>
                <Box color="text-body-secondary" fontSize="body-s">
                  {t('footer.credit')}
                </Box>
              </div>
            </SpaceBetween>
          </Box>
        </div>
      </footer>
    </>
  );
}
