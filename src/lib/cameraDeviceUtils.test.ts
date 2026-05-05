import { describe, expect, it } from 'vitest';

import { getNextCameraFacingMode, hasMultipleVideoInputDevices } from '../hooks/cameraDeviceUtils';

describe('camera device utilities', () => {
  it('detects when a device has multiple video inputs', () => {
    expect(hasMultipleVideoInputDevices([
      { kind: 'audioinput' },
      { kind: 'videoinput' },
      { kind: 'videoinput' },
    ])).toBe(true);
  });

  it('does not allow flipping when fewer than two cameras are visible', () => {
    expect(hasMultipleVideoInputDevices([{ kind: 'videoinput' }])).toBe(false);
    expect(hasMultipleVideoInputDevices([{ kind: 'audioinput' }])).toBe(false);
  });

  it('toggles between user and environment facing modes', () => {
    expect(getNextCameraFacingMode('environment')).toBe('user');
    expect(getNextCameraFacingMode('user')).toBe('environment');
  });
});
