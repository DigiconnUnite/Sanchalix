'use client';

import { I18nProvider } from '@cloudscape-design/components/i18n';
import enMessages from '@cloudscape-design/components/i18n/messages/all.en';
import IconProvider from '@cloudscape-design/components/icon-provider';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { type ReactNode, useEffect } from 'react';
import { svg } from '@/components/icons';
import { useIsDark } from '@/lib/useIsDark';
import type { VisualMode } from '@/lib/visualMode';

const builtInIcons = {
  search: svg('search'),
  notification: svg('notifications'),
  settings: svg('settings'),
  'user-profile': svg('profile'),
  calendar: svg('calendar'),
  filter: svg('filter'),
  edit: svg('edit'),
  download: svg('download'),
  upload: svg('upload'),
  copy: svg('copy'),
  external: svg('external'),
  menu: svg('menu'),
  'sign-out': svg('signOut'),
  'status-positive': svg('success'),
  'status-negative': svg('error'),
  'status-warning': svg('warning'),
  'status-info': svg('info'),
};

export function Providers({ mode, children }: { mode: VisualMode; children: ReactNode }) {
  const isDark = useIsDark(mode);
  useEffect(() => applyMode(isDark ? Mode.Dark : Mode.Light), [isDark]);

  return (
    <I18nProvider locale="en" messages={[enMessages]}>
      <IconProvider icons={builtInIcons}>{children}</IconProvider>
    </I18nProvider>
  );
}
