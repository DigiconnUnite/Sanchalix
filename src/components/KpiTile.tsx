import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { ReactNode } from 'react';
import { AppLink } from '@/components/AppLink';

export function KpiTile({
  title,
  value,
  href,
  description,
}: {
  title: string;
  value: string;
  href: string;
  description?: ReactNode;
}) {
  return (
    <Container fitHeight header={<Header variant="h2">{title}</Header>}>
      <SpaceBetween size="xxs">
        <AppLink href={href} variant="awsui-value-large">
          {value}
        </AppLink>
        {description && <Box color="text-body-secondary">{description}</Box>}
      </SpaceBetween>
    </Container>
  );
}
