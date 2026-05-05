/**
 * Reminder quick-add parser.
 *
 * Similar shape to the task parser, but `remindAt` is always defined:
 * if the user omits a due phrase, defaults to "in 1 hour" from `now`.
 *
 * Pure, deterministic given a `now` input.
 */

export interface ReminderQuickAddResult {
  title: string;
  /** Reminder time in milliseconds since epoch. Always present. */
  remindAt: number;
}

export interface ParseError {
  parseError: string;
}

const MS_IN_MINUTE = 60_000;
const MS_IN_HOUR = 3_600_000;
const MS_IN_DAY = 86_400_000;
const MS_IN_WEEK = MS_IN_DAY * 7;

const RELATIVE_RE =
  /\s+in\s+(\d+)\s*(ms|s|m|h|d|w|min|mins|minute|minutes|hour|hours|day|days|week|weeks)?$/i;

const TOMORROW_RE =
  /\s+(tomorrow|today)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i;

const unitToMs = (value: number, unit: string | undefined): number => {
  const u = (unit ?? 'm').toLowerCase();
  if (u === 'ms') return value;
  if (u === 's') return value * 1_000;
  if (u === 'm' || u === 'min' || u === 'mins' || u === 'minute' || u === 'minutes') {
    return value * MS_IN_MINUTE;
  }
  if (u === 'h' || u === 'hour' || u === 'hours') return value * MS_IN_HOUR;
  if (u === 'd' || u === 'day' || u === 'days') return value * MS_IN_DAY;
  if (u === 'w' || u === 'week' || u === 'weeks') return value * MS_IN_WEEK;
  return value * MS_IN_MINUTE;
};

const applyClockTime = (
  base: Date,
  hourRaw: string,
  minuteRaw: string | undefined,
  meridiem: string | undefined,
): Date => {
  let hour = Number(hourRaw);
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (m === 'pm' && hour < 12) hour += 12;
    if (m === 'am' && hour === 12) hour = 0;
  }
  const out = new Date(base);
  out.setHours(hour, minute, 0, 0);
  return out;
};

export const parseReminderQuickAdd = (
  input: string,
  now: number = Date.now(),
): ReminderQuickAddResult | ParseError => {
  if (typeof input !== 'string') {
    return { parseError: 'Title required' };
  }
  let working = input.trim();
  if (working.length === 0) {
    return { parseError: 'Title required' };
  }

  let remindAt: number | undefined;

  const tomorrowMatch = working.match(TOMORROW_RE);
  if (tomorrowMatch) {
    const dayWord = tomorrowMatch[1].toLowerCase();
    const base = new Date(now);
    base.setMilliseconds(0);
    base.setSeconds(0);
    if (dayWord === 'tomorrow') {
      base.setDate(base.getDate() + 1);
    }
    if (tomorrowMatch[2]) {
      const dated = applyClockTime(
        base,
        tomorrowMatch[2],
        tomorrowMatch[3],
        tomorrowMatch[4],
      );
      remindAt = dated.getTime();
    } else {
      base.setHours(9, 0, 0, 0);
      remindAt = base.getTime();
    }
    working = working.slice(0, tomorrowMatch.index).trimEnd();
  } else {
    const relativeMatch = working.match(RELATIVE_RE);
    if (relativeMatch) {
      const value = Number(relativeMatch[1]);
      if (Number.isFinite(value)) {
        remindAt = now + unitToMs(value, relativeMatch[2]);
        working = working.slice(0, relativeMatch.index).trimEnd();
      }
    }
  }

  const title = working.trim();
  if (title.length === 0) {
    return { parseError: 'Title required' };
  }

  // Default window when no phrase is supplied.
  if (remindAt === undefined) {
    remindAt = now + MS_IN_HOUR;
  }

  return { title, remindAt };
};
