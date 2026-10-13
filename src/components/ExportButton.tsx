'use client';

import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import { useTranslations } from 'next-intl';

const FORMATS = ['csv', 'xlsx'] as const;

/** Offers a list as a file. `href` is the export address; the format is added to it. */
export function ExportButton({ href, label }: { href: string; label: string }) {
  const t = useTranslations('export');
  const separator = href.includes('?') ? '&' : '?';
  return (
    <ButtonDropdown
      ariaLabel={label}
      items={FORMATS.map((format) => ({
        id: format,
        text: t(`format.${format}`),
        href: `${href}${separator}format=${format}`,
        download: true,
      }))}
    >
      {t('button')}
    </ButtonDropdown>
  );
}
