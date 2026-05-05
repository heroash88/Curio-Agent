/**
 * Timer quick-add parser.
 *
 * Accepts short-form duration strings like `10m`, `1h30m`, `45s`, `2h`,
 * `1h 30m 45s`, `30` (bare minutes), and sub-second values via `ms`
 * (for example `500ms` or `1s 500ms`).
 *
 * The paired `formatTimerShorthand(ms)` returns a canonical
 * `Xh Ym Zs Wms` form with zero parts omitted. Zero renders as `0s`.
 *
 * Round-trip guarantee (Property 6 / Requirement 7.11):
 *
 *   parseTimerQuickAdd(formatTimerShorthand(ms)).durationMs === ms
 *
 * for any integer `ms` in `[0, 86_400_000]`.
 */

export interface TimerQuickAddResult {
  /** Total duration in milliseconds. */
  durationMs: number;
}

export interface ParseError {
  parseError: string;
}

const MS_IN_SECOND = 1_000;
const MS_IN_MINUTE = 60_000;
const MS_IN_HOUR = 3_600_000;

// Order matters: `ms` must be matched before the single-letter units so
// `500ms` does not get read as `500m` + `s`.
const TOKEN_RE = /(\d+)\s*(ms|h|m|s)?/g;

/**
 * Parse a short-form duration string. Returns `{ durationMs }` on
 * success or `{ parseError }` on failure. Pure; no side effects.
 */
export const parseTimerQuickAdd = (
  input: string,
): TimerQuickAddResult | ParseError => {
  if (typeof input !== 'string') {
    return { parseError: 'Duration required' };
  }
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { parseError: 'Duration required' };
  }

  TOKEN_RE.lastIndex = 0;
  let total = 0;
  let sawToken = false;
  let consumedLength = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(trimmed)) !== null) {
    sawToken = true;
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value)) {
      return { parseError: 'Invalid duration' };
    }
    if (unit === 'ms') total += value;
    else if (unit === 'h') total += value * MS_IN_HOUR;
    else if (unit === 'm') total += value * MS_IN_MINUTE;
    else if (unit === 's') total += value * MS_IN_SECOND;
    // Bare number with no unit: interpret as minutes (common timer convention).
    else total += value * MS_IN_MINUTE;
    consumedLength += match[0].length;
  }

  if (!sawToken) {
    return { parseError: 'Invalid duration' };
  }

  // Anything left over after stripping matched tokens and whitespace is
  // gibberish (e.g. `5x`, `abc`, `10m!!!`).
  const residue = trimmed.replace(TOKEN_RE, '').replace(/\s+/g, '');
  if (residue.length > 0) {
    return { parseError: 'Invalid duration' };
  }
  // Extra guard: the union of matched tokens should cover the non-space
  // characters in the input exactly.
  const nonSpaceLength = trimmed.replace(/\s+/g, '').length;
  if (consumedLength < nonSpaceLength) {
    return { parseError: 'Invalid duration' };
  }

  return { durationMs: total };
};

/**
 * Render a millisecond duration as a canonical shorthand string. Zero
 * parts are omitted; zero total renders as `0s` so the parser's
 * inverse still round-trips.
 */
export const formatTimerShorthand = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';

  let remaining = Math.floor(ms);
  const h = Math.floor(remaining / MS_IN_HOUR);
  remaining -= h * MS_IN_HOUR;
  const m = Math.floor(remaining / MS_IN_MINUTE);
  remaining -= m * MS_IN_MINUTE;
  const s = Math.floor(remaining / MS_IN_SECOND);
  const msPart = remaining - s * MS_IN_SECOND;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  if (msPart > 0) parts.push(`${msPart}ms`);
  return parts.length === 0 ? '0s' : parts.join(' ');
};
