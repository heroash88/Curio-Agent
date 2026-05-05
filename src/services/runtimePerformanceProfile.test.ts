import { describe, expect, it } from 'vitest';
import { createRuntimePerformanceProfile } from './runtimePerformanceProfile';
import type { BrowserDeviceProfile } from './browserDeviceProfile';

const createDeviceProfile = (overrides: Partial<BrowserDeviceProfile> = {}): BrowserDeviceProfile => ({
  cores: 8,
  memoryGb: 8,
  touchPoints: 0,
  userAgent: 'Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36',
  isChromiumLike: true,
  isMobileClass: false,
  isChromiumMobileClass: false,
  isLowEnd: false,
  isConstrained: false,
  ...overrides,
});

describe('createRuntimePerformanceProfile', () => {
  it('tightens idle budgets for constrained Chromium mobile wake-word idle scenarios', () => {
    const profile = createRuntimePerformanceProfile({
      lowPowerMode: false,
      wakeWordEnabled: true,
      isConnected: false,
      isConnecting: false,
      deviceProfile: createDeviceProfile({
        cores: 4,
        memoryGb: 4,
        isMobileClass: true,
        isChromiumMobileClass: true,
        isConstrained: true,
      }),
    });

    expect(profile.constrainedDevice).toBe(true);
    expect(profile.allowFaceHeavyEffects).toBe(false);
    expect(profile.idleAnimationChance).toBeLessThanOrEqual(0.1);
    expect(profile.maxCurioIdleAnimationType).toBe(18);
    expect(profile.maxAstroIdleAnimationType).toBe(24);
    expect(profile.microSaccadeIntervalMs).toBeGreaterThanOrEqual(420);
    expect(profile.eyeConvergedThrottleMs).toBeGreaterThanOrEqual(450);
  });

  it('keeps heavier face budgets available on unconstrained desktop sessions', () => {
    const profile = createRuntimePerformanceProfile({
      lowPowerMode: false,
      wakeWordEnabled: false,
      isConnected: true,
      deviceProfile: createDeviceProfile(),
    });

    expect(profile.constrainedDevice).toBe(false);
    expect(profile.allowFaceHeavyEffects).toBe(true);
    expect(profile.idleAnimationChance).toBe(0.25);
    expect(profile.maxCurioIdleAnimationType).toBe(65);
    expect(profile.maxAstroIdleAnimationType).toBe(120);
  });
});
