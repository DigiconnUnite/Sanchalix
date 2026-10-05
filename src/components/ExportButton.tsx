'use client';

import Button from '@cloudscape-design/components/button';
import { useTranslations } from 'next-intl';
import { svg } from '@/components/icons';

export function ExportButton({ kind }: { kind: 'students' | 'dues' | 'payments' }) {
  const t = useTranslations('export');
  return (
    <Button href={`/api/v1/export/${kind}`} download iconSvg={svg('export')} ariaLabel={t(`label.${kind}`)}>
      {t('button')}
    </Button>
  );
}
