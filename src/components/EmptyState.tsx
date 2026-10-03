import Box from '@cloudscape-design/components/box';
import Icon from '@cloudscape-design/components/icon';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { ReactNode } from 'react';
import { type IconKey, svg } from '@/components/icons';

export function EmptyState({
  icon,
  heading,
  body,
  action,
}: {
  icon: IconKey;
  heading: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Box textAlign="center" color="text-body-secondary" padding="xxl">
      <SpaceBetween size="xs">
        <Icon size="large" svg={svg(icon)} />
        <Box variant="h3">{heading}</Box>
        <Box variant="p">{body}</Box>
        {action}
      </SpaceBetween>
    </Box>
  );
}
