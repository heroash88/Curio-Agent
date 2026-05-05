import { useEffect, useState } from 'react';

import { useDashboardInteractivitySettings } from '../utils/settings/dashboardSettings';

/**
 * Default coalescing window for per-widget aria-live announcements
 * (Requirement 26.6): within any 2 second window, at most one
 * announcement per widget id SHALL be emitted.
 */
export const DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS = 2000;

/**
 * Module-level map of `widgetId -> lastAnnouncedAtMs`. Kept outside the
 * React tree so coalescing is per widget id (not per component
 * instance) — a widget can remount and still have its coalescing window
 * respected (design §Event Bus Contracts).
 */
const lastAnnouncedAtByWidget = new Map<string, number>();

/**
 * Input for the pure announce helper.
 */
export interface AnnounceTextArgs {
  widgetId: string;
  incomingText: string | null | undefined;
  nowMs: number;
  coalesceWindowMs: number;
  lastAnnouncedAtMs: number | null;
}

export interface AnnounceTextResult {
  /** The text that should currently be rendered into the aria-live region. */
  text: string;
  /**
   * `true` when this call accepts `incomingText` as a fresh announcement
   * and updates the internal `lastAnnouncedAtMs`.
   */
  announced: boolean;
  /**
   * The new value for `lastAnnouncedAtMs` after this call. Unchanged
   * when the announcement was suppressed.
   */
  nextLastAnnouncedAtMs: number | null;
}

const isNonEmpty = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Pure coalescing classifier for aria-live announcements
 * (Requirement 26.6, Property 20).
 *
 * Rules (in order):
 *   - An empty / null / undefined `incomingText` does not emit an
 *     announcement and does not reset the window.
 *   - A non-empty `incomingText` emits an announcement when there has
 *     been no prior announcement for the widget, or at least
 *     `coalesceWindowMs` has elapsed since the last one.
 *   - Otherwise the announcement is suppressed and the previous
 *     timestamp is preserved.
 *
 * Pure: given the same inputs, the same output is returned. All state
 * (the per-widget timestamp) is passed in and threaded out — callers
 * own persistence.
 */
export const announceText = ({
  widgetId: _widgetId,
  incomingText,
  nowMs,
  coalesceWindowMs,
  lastAnnouncedAtMs,
}: AnnounceTextArgs): AnnounceTextResult => {
  if (!isNonEmpty(incomingText)) {
    return {
      text: '',
      announced: false,
      nextLastAnnouncedAtMs: lastAnnouncedAtMs,
    };
  }

  if (
    lastAnnouncedAtMs != null &&
    nowMs - lastAnnouncedAtMs < coalesceWindowMs
  ) {
    return {
      text: '',
      announced: false,
      nextLastAnnouncedAtMs: lastAnnouncedAtMs,
    };
  }

  return {
    text: incomingText,
    announced: true,
    nextLastAnnouncedAtMs: nowMs,
  };
};

/**
 * React hook wrapping {@link announceText} with a module-level
 * per-widget coalescing map.
 *
 * Returns the text that should be rendered into an `sr-only`
 * `aria-live="polite"` region. Initially `''`; changes only when the
 * pure helper says a new announcement is allowed.
 *
 * Honors the board-level `ariaLiveUpdatesEnabled` toggle
 * (Requirement 26.5): when `false`, the hook always returns `''`.
 */
export function useWidgetAriaAnnouncer(
  widgetId: string,
  incomingText: string | null | undefined,
  coalesceWindowMs: number = DEFAULT_ARIA_ANNOUNCER_COALESCE_WINDOW_MS,
): string {
  const interactivity = useDashboardInteractivitySettings();
  const enabled = interactivity.ariaLiveUpdatesEnabled;

  const [announced, setAnnounced] = useState<string>('');

  useEffect(() => {
    if (!enabled) {
      if (announced !== '') setAnnounced('');
      return;
    }
    if (!isNonEmpty(incomingText)) return;

    const nowMs = Date.now();
    const lastAnnouncedAtMs = lastAnnouncedAtByWidget.get(widgetId) ?? null;
    const result = announceText({
      widgetId,
      incomingText,
      nowMs,
      coalesceWindowMs,
      lastAnnouncedAtMs,
    });

    if (result.announced) {
      if (result.nextLastAnnouncedAtMs != null) {
        lastAnnouncedAtByWidget.set(widgetId, result.nextLastAnnouncedAtMs);
      }
      setAnnounced(result.text);
    }
    // Suppressed announcements keep the previously rendered text so
    // screen readers do not re-announce the same value.
  }, [widgetId, incomingText, coalesceWindowMs, enabled, announced]);

  return enabled ? announced : '';
}

/**
 * Reset the module-level per-widget coalescing map. Exposed only for
 * tests so each property run starts with a clean state.
 */
export const resetWidgetAriaAnnouncerForTests = (): void => {
  lastAnnouncedAtByWidget.clear();
};
