import { describe, expect, it } from 'vitest';
import { getSessionMicRestoreMode } from './browserIdlePolicy';

describe('browserIdlePolicy', () => {
  it('defers session mic restore while idle', () => {
    expect(
      getSessionMicRestoreMode({
        isConnected: false,
        isConnecting: false,
        hasExistingLiveTracks: false,
      }),
    ).toBe('defer');
  });

  it('reuses an existing live session stream during an active session', () => {
    expect(
      getSessionMicRestoreMode({
        isConnected: true,
        isConnecting: false,
        hasExistingLiveTracks: true,
      }),
    ).toBe('reuse_existing');
  });

  it('reacquires the session stream only when the session is active and no live tracks remain', () => {
    expect(
      getSessionMicRestoreMode({
        isConnected: false,
        isConnecting: true,
        hasExistingLiveTracks: false,
      }),
    ).toBe('reacquire');
  });
});
