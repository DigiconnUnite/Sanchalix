import type { StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import type { StudentStatus } from '@/server/modules/sis/schemas';

export const STATUS_TYPE: Record<StudentStatus, StatusIndicatorProps.Type> = {
  active: 'success',
  transferred: 'stopped',
  alumni: 'info',
  withdrawn: 'stopped',
};
