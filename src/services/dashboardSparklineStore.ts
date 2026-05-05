/**
 * DashboardSparklineStore
 *
 * LocalStorage-backed, bounded ring-buffer store for widget sparkline
 * history. Widgets (Stocks, AirQuality, HaEnergy, Weather) append a
 * single `{t, v}` sample per successful refresh and the store caps the
 * retained samples to a per-widget configurable maximum (default 60).
 *
 * Contract (design §Data Models / §7):
 *  - Keyed by `curio_widget_sparkline_<widgetId>_<key>`.
 *  - `appendWidgetSparklineSample` preserves append order and drops the
 *    oldest samples while the array length exceeds `maxSamples`.
 *  - Writes dispatch `curio:settings-changed` so live consumers re-read
 *    from localStorage.
 *  - `clearWidgetSparklineHistory` removes the key and dispatches
 *    `curio:settings-changed`.
 *  - `appendSamplePure` is the pure, side-effect-free ring buffer
 *    function that Property 2 exercises. It is exported so the property
 *    test can assert invariants without touching the DOM or storage.
 *
 * SSR-safe: every branch that touches `window`/`localStorage` is guarded
 * so the module can be imported in a Node/SSR context without crashing.
 */

export interface SparklineSample {
  /** Sample timestamp in ms (epoch-style; consumers may use a relative clock). */
  t: number;
  /** Numeric sample value. */
  v: number;
}

/** Shared localStorage prefix for every sparkline key. */
export const SPARKLINE_KEY_PREFIX = 'curio_widget_sparkline_';

/** Default cap on retained samples when the caller does not supply one. */
export const DEFAULT_SPARKLINE_MAX_SAMPLES = 60;

const SETTINGS_CHANGED_EVENT = 'curio:settings-changed';

const isBrowser = (): boolean => typeof window !== 'undefined';

/**
 * Compose the localStorage key for a given `(widgetId, key)` pair.
 *
 * Exported so callers/tests can derive keys without duplicating the
 * prefix. Safe to call in SSR: returns a stable string.
 */
export function getSparklineKey(widgetId: string, key: string): string {
  return `${SPARKLINE_KEY_PREFIX}${widgetId}_${key}`;
}

const isValidSample = (value: unknown): value is SparklineSample => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.t === 'number' &&
    Number.isFinite(record.t) &&
    typeof record.v === 'number' &&
    Number.isFinite(record.v)
  );
};

/**
 * Read the current persisted sparkline samples for a `(widgetId, key)`
 * pair. Returns `[]` when the key is missing, storage access fails, or
 * the stored value is malformed.
 *
 * SSR-safe: returns `[]` when `window` is undefined.
 */
export function getWidgetSparklineHistory(
  widgetId: string,
  key: string,
): SparklineSample[] {
  if (!isBrowser()) return [];
  const storageKey = getSparklineKey(widgetId, key);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return [];
  }
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSample);
  } catch {
    return [];
  }
}

/**
 * Pure ring-buffer append.
 *
 * Returns a new array that starts with `current`, has `sample`
 * appended, and has its length capped at `maxSamples`. Oldest samples
 * are dropped first. When `maxSamples <= 0`, returns `[]` so callers
 * can disable history entirely by passing a non-positive cap.
 *
 * This is the function Property 2 asserts against.
 */
export function appendSamplePure(
  current: readonly SparklineSample[],
  sample: SparklineSample,
  maxSamples: number,
): SparklineSample[] {
  if (!Number.isFinite(maxSamples) || maxSamples <= 0) {
    return [];
  }
  const next = current.slice();
  next.push(sample);
  while (next.length > maxSamples) {
    next.shift();
  }
  return next;
}

/**
 * Append a single `{t, v}` sample to the widget's sparkline history,
 * enforcing the ring-buffer cap and persisting the result. Dispatches
 * `curio:settings-changed` so live subscribers re-read.
 *
 * Returns the new samples array. SSR-safe: returns the in-memory
 * computed array without touching storage when `window` is undefined.
 */
export function appendWidgetSparklineSample(
  widgetId: string,
  key: string,
  sample: SparklineSample,
  maxSamples: number = DEFAULT_SPARKLINE_MAX_SAMPLES,
): SparklineSample[] {
  const current = getWidgetSparklineHistory(widgetId, key);
  const next = appendSamplePure(current, sample, maxSamples);

  if (!isBrowser()) return next;

  const storageKey = getSparklineKey(widgetId, key);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Swallow quota/permission errors; callers still receive the
    // computed array so in-memory UI stays consistent for the session.
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  } catch {
    // Older environments without CustomEvent fall back silently.
  }
  return next;
}

/**
 * Remove the persisted sparkline history for `(widgetId, key)`.
 *
 * Dispatches `curio:settings-changed` so live consumers re-read and
 * re-render empty. SSR-safe.
 */
export function clearWidgetSparklineHistory(
  widgetId: string,
  key: string,
): void {
  if (!isBrowser()) return;
  const storageKey = getSparklineKey(widgetId, key);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore removal errors; a subsequent write will overwrite the
    // stale value anyway.
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  } catch {
    // Older browsers without CustomEvent fall back silently.
  }
}
