import { describe, expect, it } from 'vitest';

import { parseTaskQuickAdd } from './taskParser';

describe('parseTaskQuickAdd', () => {
  // Pinned now: Mon 2024-01-15 12:00:00 local time.
  const now = new Date(2024, 0, 15, 12, 0, 0, 0).getTime();

  it('returns parseError for empty input', () => {
    const result = parseTaskQuickAdd('');
    expect('parseError' in result).toBe(true);
  });

  it('returns parseError for whitespace-only input', () => {
    const result = parseTaskQuickAdd('   \t ');
    expect('parseError' in result).toBe(true);
  });

  it('parses a plain title with no phrase', () => {
    const result = parseTaskQuickAdd('buy milk', now);
    expect(result).toEqual({ title: 'buy milk' });
  });

  it('parses "in 30m" as a relative due date', () => {
    const result = parseTaskQuickAdd('review PR in 30m', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.title).toBe('review PR');
    expect(result.dueAt).toBe(now + 30 * 60_000);
  });

  it('parses "tomorrow 9am" as a due date at 9:00 the next day', () => {
    const result = parseTaskQuickAdd('call mom tomorrow 9am', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.title).toBe('call mom');
    const due = new Date(result.dueAt!);
    expect(due.getFullYear()).toBe(2024);
    expect(due.getMonth()).toBe(0);
    expect(due.getDate()).toBe(16);
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(0);
  });

  it('maps trailing !! to priority high', () => {
    const result = parseTaskQuickAdd('finish report !!', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.title).toBe('finish report');
    expect(result.priority).toBe('high');
  });

  it('maps trailing !!! to priority medium', () => {
    const result = parseTaskQuickAdd('follow up !!!', now);
    if ('parseError' in result) throw new Error('expected success');
    expect(result.priority).toBe('medium');
  });
});
