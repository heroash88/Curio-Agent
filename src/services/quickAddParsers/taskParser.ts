/**
 * Task quick-add parser.
 *
 * Pure, deterministic regex-based parser that extracts a title and
 * optional due-date / priority hint from free-form user input.
 *
 * Supported due-date phrases (anchored at the end of the input):
 *   - `in 30m`, `in 2h`, `in 90 minutes`, `in 3 days`, `in 1w`
 *   - `tomorrow`, `tomorrow 9am`, `tomorrow 5:30pm`
 *   - `today`, `today 5pm`, `today 17:30`
 *
 * Priority tokens are trailing bang markers:
 *   - `!!` -> `high`
 *   - `!!!` -> `medium`
 *
 * Empty / whitespace-only input returns `{ parseError: 'Title required' }`.
 */

export interface TaskQuickAddResult {
  title: string;
  dueAt?: number;
  priority?: 'low' | 'medium' | 'high';
}

export interface ParseError {
  parseError: string;
}

const MS_IN_MINUTE = 60_000;
const MS_IN_HOUR = 3_600_000;
const MS_IN_DAY = 86_400_000;
const MS_IN_WEEK = MS_IN_DAY * 7;

// Trailing `in <n><unit>` or `in <n> <unit-word>`.
const RELATIVE_RE =
  /\s+in\s+(\d+)\s*(ms|s|m|h|d|w|min|mins|minute|minutes|hour|hours|day|days|week|weeks)?$/i;

// Trailing `tomorrow` / `today` with optional time (`9am`, `5:30pm`, `17:30`).
const TOMORROW_RE =
  /\s+(tomorrow|today)(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i;

const TRAILING_PRIORITY_RE = /(\s*)(!!!|!!)$/;

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

/**
 * Parse a task quick-add string. Accepts an optional `now` so tests can
 * pin time without mocking globals. Pure.
 */
export const parseTaskQuickAdd = (
  input: string,
  now: number = Date.now(),
): TaskQuickAddResult | ParseError => {
  if (typeof input !== 'string') {
    return { parseError: 'Title required' };
  }
  let working = input.trim();
  if (working.length === 0) {
    return { parseError: 'Title required' };
  }

  // Priority first so `buy milk tomorrow !!` keeps the `tomorrow` phrase.
  let priority: TaskQuickAddResult['priority'];
  const priorityMatch = working.match(TRAILING_PRIORITY_RE);
  if (priorityMatch) {
    priority = priorityMatch[2] === '!!!' ? 'medium' : 'high';
    working = working.slice(0, priorityMatch.index).trimEnd();
  }

  let dueAt: number | undefined;

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
      dueAt = dated.getTime();
    } else {
      // Default to 9:00am when no time is supplied.
      base.setHours(9, 0, 0, 0);
      dueAt = base.getTime();
    }
    working = working.slice(0, tomorrowMatch.index).trimEnd();
  } else {
    const relativeMatch = working.match(RELATIVE_RE);
    if (relativeMatch) {
      const value = Number(relativeMatch[1]);
      if (Number.isFinite(value)) {
        dueAt = now + unitToMs(value, relativeMatch[2]);
        working = working.slice(0, relativeMatch.index).trimEnd();
      }
    }
  }

  const title = working.trim();
  if (title.length === 0) {
    return { parseError: 'Title required' };
  }

  const result: TaskQuickAddResult = { title };
  if (dueAt !== undefined) result.dueAt = dueAt;
  if (priority !== undefined) result.priority = priority;
  return result;
};
