import type { CurioDesktopRole } from './desktopTypes';

export const DEFAULT_DESKTOP_ROLE: CurioDesktopRole = 'app';

export const normalizeDesktopRole = (
  value: string | null | undefined,
): CurioDesktopRole => {
  if (value === 'face' || value === 'cards') return value;
  return DEFAULT_DESKTOP_ROLE;
};

export const getDesktopRole = (): CurioDesktopRole => {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_ROLE;
  return normalizeDesktopRole(window.__CURIO_DESKTOP_ROLE__);
};
