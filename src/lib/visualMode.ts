export const VISUAL_MODES = ['light', 'dark', 'system'] as const;
export type VisualMode = (typeof VISUAL_MODES)[number];

// Mirrors User.visualMode so the server can render the right mode on first paint.
export const MODE_COOKIE = 'vw.mode';

export const parseVisualMode = (value: string | undefined): VisualMode =>
  VISUAL_MODES.find((mode) => mode === value) ?? 'system';
