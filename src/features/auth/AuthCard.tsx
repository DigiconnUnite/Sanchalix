'use client';

import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppLink } from '@/components/AppLink';

/** The frame every signed-out screen shares: the product logo, one card with a title, and a line back to the home page. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const t = useTranslations('auth.card');
  return (
    <SpaceBetween size="l">
      <div className="vw-auth-logo" role="img" aria-label={t('logo')} />
      <Container
        header={
          <Header variant="h1" description={description}>
            {title}
          </Header>
        }
      >
        {children}
      </Container>
      <Box textAlign="center" color="text-body-secondary" fontSize="body-s">
        {t('note')} <AppLink href="/welcome" fontSize="body-s">{t('home')}</AppLink>
      </Box>
    </SpaceBetween>
  );
}

/** "or" between the main way to sign in and the alternatives. */
export function AuthDivider() {
  const t = useTranslations('auth.card');
  return (
    <div className="vw-auth-divider" role="separator">
      <Box color="text-body-secondary" fontSize="body-s">
        {t('or')}
      </Box>
    </div>
  );
}
