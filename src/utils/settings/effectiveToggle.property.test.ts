/**
 * Feature: dashboard-interactivity-upgrades, Property 23: Effective-toggle formula
 *
 * Validates: Requirement 30.8
 *
 * For any interactivity toggle T, board value B, and per-widget value W:
 *   effectiveToggle(T, board, widget) === (W !== undefined ? W : B)
 * when T is an override-capable toggle; for board-only toggles, the result
 * equals B regardless of any value W on the widget config.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  effectiveToggle,
  type DashboardInteractivityToggleKey,
  type DashboardWidgetInteractivityOverrideKey,
} from './dashboardSettings';
import {
  DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
  type DashboardInteractivitySettings,
  type DashboardWidgetConfig,
} from '../../services/dashboardTypes';

// Literal arrays drive fast-check's `constantFrom` and double as a compile-time
// check that these key sets stay in sync with the union types in
// dashboardSettings.ts.

const OVERRIDE_KEYS: readonly DashboardWidgetInteractivityOverrideKey[] = [
  'ambientPulseEnabled',
  'freshnessDotEnabled',
  'swipeGesturesEnabled',
  'dragReorderEnabled',
  'rollingNumbersEnabled',
  'widgetPinningEnabled',
  'seekBarLiveSyncEnabled',
  'breathingRingEnabled',
  'valueMorphEnabled',
  'clockOffsetPreviewEnabled',
  'pinchZoomEnabled',
  'ttsWordHighlightEnabled',
];

// Board-only toggles: boolean keys of DashboardInteractivitySettings that
// are NOT part of the per-widget override set (animationIntensity is not a
// boolean and is intentionally excluded from DashboardInteractivityToggleKey).
const BOARD_ONLY_KEYS: readonly Exclude<
  DashboardInteractivityToggleKey,
  DashboardWidgetInteractivityOverrideKey
>[] = [
  'staleRevalidateSheenEnabled',
  'doubleClickEditEnabled',
  'commandPaletteEnabled',
  'dropIntentsEnabled',
  'hoverSelectionBusEnabled',
  'undoToastsEnabled',
  'relativeTimeHintsEnabled',
  'inlineQuickAddEnabled',
  'optimisticActionsEnabled',
  'insightsActionsEnabled',
  'ariaLiveUpdatesEnabled',
  'sparklineHistoryEnabled',
];

const ALL_TOGGLE_KEYS: readonly DashboardInteractivityToggleKey[] = [
  ...OVERRIDE_KEYS,
  ...BOARD_ONLY_KEYS,
];

const overrideKeyArb = fc.constantFrom(...OVERRIDE_KEYS);
const boardOnlyKeyArb = fc.constantFrom(...BOARD_ONLY_KEYS);
const anyKeyArb = fc.constantFrom(...ALL_TOGGLE_KEYS);

const buildBoard = (
  toggle: DashboardInteractivityToggleKey,
  boardValue: boolean,
): DashboardInteractivitySettings => ({
  ...DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
  [toggle]: boardValue,
});

const buildWidgetConfig = (
  toggle: DashboardInteractivityToggleKey,
  widgetValue: boolean | undefined,
): DashboardWidgetConfig => {
  const config: DashboardWidgetConfig = {};
  if (widgetValue !== undefined) {
    (config as Record<string, unknown>)[toggle] = widgetValue;
  }
  return config;
};

describe('effectiveToggle — Property 23: Effective-toggle formula', () => {
  it('Property A: for override-capable toggles, result is W when defined, else B', () => {
    fc.assert(
      fc.property(
        overrideKeyArb,
        fc.boolean(),
        fc.option(fc.boolean(), { nil: undefined }),
        (toggle, boardValue, widgetValue) => {
          const board = buildBoard(toggle, boardValue);
          const widgetConfig = buildWidgetConfig(toggle, widgetValue);

          const expected =
            widgetValue !== undefined ? widgetValue : boardValue;

          expect(effectiveToggle(toggle, board, widgetConfig)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property B: for board-only toggles, result equals B regardless of any widget value', () => {
    fc.assert(
      fc.property(
        boardOnlyKeyArb,
        fc.boolean(),
        fc.option(fc.boolean(), { nil: undefined }),
        (toggle, boardValue, widgetValueMaybe) => {
          const board = buildBoard(toggle, boardValue);
          // Attempt to sneak the toggle onto the widget config. Because the
          // toggle is not part of the per-widget override set, effectiveToggle
          // must still return the board value.
          const widgetConfig: DashboardWidgetConfig = {};
          if (widgetValueMaybe !== undefined) {
            (widgetConfig as Record<string, unknown>)[toggle] =
              widgetValueMaybe;
          }

          expect(effectiveToggle(toggle, board, widgetConfig)).toBe(boardValue);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property C: never throws and returns the default for null/undefined inputs', () => {
    fc.assert(
      fc.property(anyKeyArb, (toggle) => {
        const expected = DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS[
          toggle
        ] as boolean;

        expect(() => effectiveToggle(toggle, null, null)).not.toThrow();
        expect(() => effectiveToggle(toggle, undefined, undefined)).not.toThrow();

        expect(effectiveToggle(toggle, null, null)).toBe(expected);
        expect(effectiveToggle(toggle, undefined, undefined)).toBe(expected);
        expect(effectiveToggle(toggle, undefined)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});
