import { describe, expect, it } from 'vitest';

import { parseReminderQuickAdd } from './reminderParser';

describe('parseReminderQuickAdd', () => {
  // Pinned now: Mon 2024-01-15 12:00:00 local time.
  const now = new Date(2024, 0, 15, 12, 0, 0, 0).getTime();

  it('returns parseError for empty input', () => {
    const result = parseReminderQuickAdd('', now);
    expect('parseError' in result).toBe(true);
  });

  it('parses "in 30m" as a future remindAt', () => {
    const result = parseReminderQuickAdd('stretch in 30m', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.title).toBe('stretch');
    expect(result.remindAt).toBe(now + 30 * 60_000);
  });

  it('parses "tomorrow 5pm" as tomorrow at 17:00', () => {
    const result = parseReminderQuickAdd('water plants tomorrow 5pm', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.title).toBe('water plants');
    const at = new Date(result.remindAt);
    expect(at.getDate()).toBe(16);
    expect(at.getHours()).toBe(17);
    expect(at.getMinutes()).toBe(0);
  });

  it('defaults to "in 1 hour" when no phrase is supplied', () => {
    const result = parseReminderQuickAdd('take medicine', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.title).toBe('take medicine');
    expect(result.remindAt).toBe(now + 60 * 60_000);
  });
});
