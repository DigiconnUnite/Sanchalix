import '@cloudscape-design/global-styles/index.css';
import '@/styles/global.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { DENSITY_COOKIE, MODE_COOKIE, parseDensity, parseVisualMode } from '@/lib/visualMode';
import { Providers } from './providers';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: 'Vidyawan', template: '%s · Vidyawan' },
    description: t('description'),
    authors: [{ name: 'Shivam Thakur' }],
    creator: 'Shivam Thakur',
    publisher: 'Digiconn Unite',
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const mode = parseVisualMode(store.get(MODE_COOKIE)?.value);
  const density = parseDensity(store.get(DENSITY_COOKIE)?.value);
  const classes = [mode === 'dark' && 'awsui-dark-mode', density === 'compact' && 'awsui-compact-mode'];
  return (
    <html lang={await getLocale()}>
      <body className={classes.filter(Boolean).join(' ') || undefined}>
        <Providers mode={mode} density={density}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
