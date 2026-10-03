import '@cloudscape-design/global-styles/index.css';
import '@/styles/global.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MODE_COOKIE, parseVisualMode } from '@/lib/visualMode';
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
  const mode = parseVisualMode((await cookies()).get(MODE_COOKIE)?.value);
  return (
    <html lang={await getLocale()}>
      <body className={mode === 'dark' ? 'awsui-dark-mode' : undefined}>
        <Providers mode={mode}>{children}</Providers>
      </body>
    </html>
  );
}
