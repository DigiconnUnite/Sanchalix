'use client';

import { I18nProvider } from '@cloudscape-design/components/i18n';
import enMessages from '@cloudscape-design/components/i18n/messages/all.en';
import IconProvider from '@cloudscape-design/components/icon-provider';
import { generateThemeStylesheet } from '@cloudscape-design/components/theming';
import { applyDensity, applyMode, Density as CloudscapeDensity, Mode } from '@cloudscape-design/global-styles';
import { type ReactNode, useEffect } from 'react';
import { svg } from '@/components/icons';
import { useIsDark } from '@/lib/useIsDark';
import type { Density, VisualMode } from '@/lib/visualMode';

const builtInIcons = {
  search: svg('search'),
  notification: svg('notifications'),
  settings: svg('tablePreferences'),
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

// ADR-022: Cloudscape draws TopNavigation dark in both modes and has no light variant. These give its theming
// context the page's own light values in light mode. The dark values are Cloudscape's, unchanged.
const lightHeaderTokens = {
  colorBackgroundBadgeIcon: { light: '{colorError600}', dark: '{colorError400}' },
  colorBackgroundButtonLinkActive: { light: '{colorPrimary100}', dark: '{colorNeutral700}' },
  colorBackgroundButtonLinkHover: { light: '{colorPrimary50}', dark: '{colorNeutral800}' },
  colorBackgroundButtonNormalActive: { light: '{colorPrimary100}', dark: '{colorNeutral700}' },
  colorBackgroundButtonNormalDefault: { light: '{colorWhite}', dark: '{colorNeutral850}' },
  colorBackgroundButtonNormalDisabled: { light: '{colorWhite}', dark: '{colorNeutral850}' },
  colorBackgroundButtonNormalHover: { light: '{colorPrimary50}', dark: '{colorNeutral800}' },
  colorBackgroundButtonPrimaryActive: { light: '{colorPrimary900}', dark: '{colorPrimary400}' },
  colorBackgroundButtonPrimaryDisabled: { light: '{colorNeutral250}', dark: '{colorNeutral750}' },
  colorBackgroundContainerContent: { light: '{colorWhite}', dark: '{colorNeutral850}' },
  colorBackgroundControlDisabled: { light: '{colorNeutral300}', dark: '{colorNeutral700}' },
  colorBackgroundDropdownItemDefault: { light: '{colorWhite}', dark: '{colorNeutral850}' },
  colorBackgroundDropdownItemFilterMatch: { light: '{colorPrimary50}', dark: '{colorNeutral700}' },
  colorBackgroundDropdownItemHover: { light: '{colorNeutral200}', dark: '{colorNeutral900}' },
  colorBackgroundInputDefault: { light: '{colorWhite}', dark: '{colorNeutral850}' },
  colorBackgroundInputDisabled: { light: '{colorNeutral250}', dark: '{colorNeutral800}' },
  colorBackgroundItemSelected: { light: '{colorPrimary50}', dark: '{colorPrimary1000}' },
  colorBackgroundNotificationGrey: { light: '{colorNeutral650}', dark: '{colorNeutral600}' },
  colorBorderButtonNormalActive: { light: '{colorPrimary900}', dark: '{colorPrimary300}' },
  colorBorderButtonNormalDefault: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorBorderButtonNormalDisabled: { light: '{colorNeutral400}', dark: '{colorNeutral600}' },
  colorBorderButtonNormalHover: { light: '{colorPrimary900}', dark: '{colorPrimary300}' },
  colorBorderDividerDefault: { light: '{colorNeutral350}', dark: '{colorNeutral650}' },
  colorBorderDropdownContainer: { light: '{colorNeutral400}', dark: '{colorNeutral600}' },
  colorBorderDropdownItemFocused: { light: '{colorNeutral650}', dark: '{colorNeutral300}' },
  colorBorderDropdownItemHover: { light: '{colorNeutral500}', dark: '{colorNeutral600}' },
  colorBorderInputDefault: { light: '{colorNeutral500}', dark: '{colorNeutral600}' },
  colorBorderInputFocused: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorBorderItemFocused: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorItemSelected: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorTextAccent: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorTextBodyDefault: { light: '{colorNeutral950}', dark: '{colorNeutral350}' },
  colorTextBreadcrumbCurrent: { light: '{colorNeutral600}', dark: '{colorNeutral500}' },
  colorTextButtonNormalActive: { light: '{colorPrimary900}', dark: '{colorPrimary300}' },
  colorTextButtonNormalDefault: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorTextButtonNormalHover: { light: '{colorPrimary900}', dark: '{colorPrimary300}' },
  colorTextButtonPrimaryActive: { light: '{colorWhite}', dark: '{colorNeutral950}' },
  colorTextButtonPrimaryDefault: { light: '{colorWhite}', dark: '{colorNeutral950}' },
  colorTextButtonPrimaryHover: { light: '{colorWhite}', dark: '{colorNeutral950}' },
  colorTextDropdownItemDefault: { light: '{colorNeutral950}', dark: '{colorNeutral300}' },
  colorTextDropdownItemFilterMatch: { light: '{colorPrimary600}', dark: '{colorPrimary300}' },
  colorTextDropdownItemHighlighted: { light: '{colorNeutral950}', dark: '{colorNeutral250}' },
  colorTextFormSecondary: { light: '{colorNeutral600}', dark: '{colorNeutral450}' },
  colorTextGroupLabel: { light: '{colorNeutral650}', dark: '{colorNeutral350}' },
  colorTextHeadingDefault: { light: '{colorNeutral950}', dark: '{colorNeutral250}' },
  colorTextIconSubtle: { light: '{colorNeutral600}', dark: '{colorNeutral400}' },
  colorTextInputDisabled: { light: '{colorNeutral400}', dark: '{colorNeutral600}' },
  colorTextInputPlaceholder: { light: '{colorNeutral600}', dark: '{colorNeutral450}' },
  colorTextInteractiveActive: { light: '{colorNeutral950}', dark: '{colorNeutral100}' },
  colorTextInteractiveDefault: { light: '{colorNeutral650}', dark: '{colorNeutral300}' },
  colorTextInteractiveDisabled: { light: '{colorNeutral400}', dark: '{colorNeutral600}' },
  colorTextInteractiveHover: { light: '{colorNeutral950}', dark: '{colorNeutral100}' },
  colorTextLinkDefault: { light: '{colorPrimary600}', dark: '{colorPrimary400}' },
  colorTextLinkHover: { light: '{colorPrimary900}', dark: '{colorPrimary300}' },
  colorTextStatusError: { light: '{colorError600}', dark: '{colorError400}' },
  colorTextStatusInfo: { light: '{colorInfo600}', dark: '{colorInfo400}' },
  colorTextStatusSuccess: { light: '{colorSuccess600}', dark: '{colorSuccess500}' },
  colorTextStatusWarning: { light: '{colorWarning900}', dark: '{colorWarning500}' },
  colorTextTopNavigationTitle: { light: '{colorNeutral950}', dark: '{colorNeutral100}' },
};

// ADR-021: 600 carries white button text and link text in light mode, 400 carries dark text in dark mode.
// Both must stay at or above 4.5:1, so change them only with a contrast check.
const themeCss = generateThemeStylesheet({
  theme: {
    tokens: {},
    contexts: { 'top-navigation': { tokens: lightHeaderTokens } },
    referenceTokens: {
      color: {
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#c2410c',
          700: '#9a3412',
          800: '#7c2d12',
          900: '#6a2408',
          950: '#431407',
          1000: '#2a0c03',
        },
      },
    },
  },
});

export function Providers({ mode, density, children }: { mode: VisualMode; density: Density; children: ReactNode }) {
  const isDark = useIsDark(mode);
  useEffect(() => applyMode(isDark ? Mode.Dark : Mode.Light), [isDark]);
  useEffect(() => applyDensity(density === 'compact' ? CloudscapeDensity.Compact : CloudscapeDensity.Comfortable), [density]);

  return (
    <I18nProvider locale="en" messages={[enMessages]}>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <IconProvider icons={builtInIcons}>{children}</IconProvider>
    </I18nProvider>
  );
}
