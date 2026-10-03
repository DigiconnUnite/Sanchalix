import { useMediaQuery } from './useMediaQuery';
import type { VisualMode } from './visualMode';

export function useIsDark(mode: VisualMode) {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  return mode === 'system' ? systemDark : mode === 'dark';
}
