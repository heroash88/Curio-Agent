import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCardTheme } from '../../../hooks/useCardTheme';

const settingsMock = vi.hoisted(() => ({
  themeMode: 'light' as 'light' | 'dark',
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useThemeMode: () => settingsMock.themeMode,
}));

describe('useCardTheme', () => {
  it('keeps light-mode dashboard text crisp without embossed text shadows', () => {
    settingsMock.themeMode = 'light';

    const { result } = renderHook(() => useCardTheme());

    expect(result.current.onSurface).toBe('text-[var(--ether-on-surface)]');
    expect(result.current.onSurfaceVariant).toBe('text-[var(--ether-on-surface-variant)]');
    expect(result.current.text).toBe('text-[var(--ether-on-surface)]');
    expect(result.current.text2).toBe('text-[var(--ether-on-surface-variant)]');
    expect(result.current.muted).toBe('text-[var(--ether-on-surface-variant)]');
  });

  it('keeps subtle shadows for dark-mode dashboard text on dark glass', () => {
    settingsMock.themeMode = 'dark';

    const { result } = renderHook(() => useCardTheme());

    expect(result.current.onSurface).toContain('[text-shadow:0_1px_3px_rgba(0,0,0,0.6)]');
    expect(result.current.onSurfaceVariant).toContain('[text-shadow:0_1px_2px_rgba(0,0,0,0.5)]');
  });
});
