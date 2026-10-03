import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  if (!hasLocale(routing.locales, (await params).locale)) notFound();
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
