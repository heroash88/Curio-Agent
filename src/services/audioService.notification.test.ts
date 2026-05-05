import { describe, expect, it } from 'vitest';
import { NOTIFICATION_SOUND_PATTERNS } from './audioService';
import { getNotificationPriorityDetails } from './notificationPriority';

describe('notification sound design', () => {
  it('uses subtle, lower-register notification tone patterns', () => {
    expect(NOTIFICATION_SOUND_PATTERNS.low).toEqual([
      { frequency: 293.66, velocity: 0.026, duration: 0.32, delayMs: 0 },
    ]);
    expect(NOTIFICATION_SOUND_PATTERNS.normal).toEqual([
      { frequency: 329.63, velocity: 0.032, duration: 0.34, delayMs: 0 },
      { frequency: 392, velocity: 0.026, duration: 0.34, delayMs: 115 },
    ]);
    expect(NOTIFICATION_SOUND_PATTERNS.high).toEqual([
      { frequency: 349.23, velocity: 0.04, duration: 0.36, delayMs: 0 },
      { frequency: 440, velocity: 0.034, duration: 0.34, delayMs: 95 },
      { frequency: 523.25, velocity: 0.03, duration: 0.34, delayMs: 190 },
    ]);

    const allNotes = Object.values(NOTIFICATION_SOUND_PATTERNS).flat();

    expect(Math.max(...allNotes.map((note) => note.velocity))).toBeLessThanOrEqual(0.04);
    expect(Math.max(...allNotes.map((note) => note.frequency))).toBeLessThanOrEqual(523.25);
  });

  it('describes the softer sounds in user-facing priority labels', () => {
    expect(getNotificationPriorityDetails('low').soundDescription).toBe('Single soft chime');
    expect(getNotificationPriorityDetails('normal').soundDescription).toBe('Warm double chime');
    expect(getNotificationPriorityDetails('high').soundDescription).toBe('Clear triple chime');
  });
});
