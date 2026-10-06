'use client';

import TopNavigation from '@cloudscape-design/components/top-navigation';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { svg } from '@/components/icons';
import { useIsDark } from '@/lib/useIsDark';
import { MODE_COOKIE, type VisualMode } from '@/lib/visualMode';
import { setVisualMode } from '@/server/auth/actions';

export function PublicHeader({
  brand,
  enter,
  visualMode,
}: {
  brand: string;
  enter: { href: string; text: string };
  visualMode: VisualMode;
}) {
  const t = useTranslations('shell.theme');
  const [mode, setMode] = useState(visualMode);
  const isDark = useIsDark(mode);
  const label = t(isDark ? 'toLight' : 'toDark');

  function toggle() {
    const next = isDark ? 'light' : 'dark';
    setMode(next);
    applyMode(isDark ? Mode.Light : Mode.Dark);
    // A visitor has no account to save the choice to, so it is kept in the same cookie the app reads.
    document.cookie = `${MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    void setVisualMode(next);
  }

  return (
    <TopNavigation
      identity={{ href: '/welcome', title: brand }}
      utilities={[
        {
          type: 'button',
          iconSvg: (
            <span className="vw-icon vw-theme-toggle" data-dark={isDark}>
              {svg('themeToggle')}
            </span>
          ),
          ariaLabel: label,
          title: label,
          onClick: toggle,
        },
        { type: 'button', variant: 'primary-button', text: enter.text, href: enter.href },
      ]}
    />
  );
}
