import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getPocketTtsRuntimePreference,
  getPocketTtsThreadCount,
  shouldUsePocketMainThreadFastPath,
} from './pocketTtsRuntimeMode';

describe('Pocket TTS runtime mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the main-thread fast path by default on isolated desktop-class browsers', () => {
    expect(shouldUsePocketMainThreadFastPath({
      crossOriginIsolated: true,
      hasDocument: true,
      hardwareConcurrency: 16,
    })).toBe(true);
    expect(getPocketTtsThreadCount({
      crossOriginIsolated: true,
      hardwareConcurrency: 16,
    })).toBe(4);
  });

  it('allows the fast path on isolated desktop browsers when explicitly requested', () => {
    expect(shouldUsePocketMainThreadFastPath({
      crossOriginIsolated: true,
      hasDocument: true,
      hardwareConcurrency: 16,
      preference: 'main-thread',
    })).toBe(true);
  });

  it('allows the fast path on isolated iPad and iPhone browsers when explicitly requested', () => {
    expect(shouldUsePocketMainThreadFastPath({
      crossOriginIsolated: true,
      hasDocument: true,
      hardwareConcurrency: 8,
      preference: 'main-thread',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    })).toBe(true);
    expect(getPocketTtsThreadCount({
      crossOriginIsolated: true,
      hardwareConcurrency: 8,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    })).toBe(4);
  });

  it('keeps the worker fallback when isolation or browser document access is missing', () => {
    expect(shouldUsePocketMainThreadFastPath({
      crossOriginIsolated: false,
      hasDocument: true,
      hardwareConcurrency: 16,
    })).toBe(false);
    expect(shouldUsePocketMainThreadFastPath({
      crossOriginIsolated: true,
      hasDocument: false,
      hardwareConcurrency: 16,
    })).toBe(false);
  });

  it('honors an explicit worker runtime preference for comparison testing', () => {
    expect(shouldUsePocketMainThreadFastPath({
      crossOriginIsolated: true,
      hasDocument: true,
      hardwareConcurrency: 16,
      preference: 'worker',
    })).toBe(false);
  });

  it('does not persist the experimental main-thread preference from storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'main-thread',
    });

    expect(getPocketTtsRuntimePreference()).toBe('auto');
  });
});
