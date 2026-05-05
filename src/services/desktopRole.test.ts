import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_ROLE,
  normalizeDesktopRole,
} from '../desktop/desktopRole';

describe('desktop role parsing', () => {
  it('defaults to the app role for missing or unsupported values', () => {
    expect(DEFAULT_DESKTOP_ROLE).toBe('app');
    expect(normalizeDesktopRole(null)).toBe('app');
    expect(normalizeDesktopRole(undefined)).toBe('app');
    expect(normalizeDesktopRole('dashboard')).toBe('app');
  });

  it('accepts only companion desktop roles', () => {
    expect(normalizeDesktopRole('face')).toBe('face');
    expect(normalizeDesktopRole('cards')).toBe('cards');
  });
});
