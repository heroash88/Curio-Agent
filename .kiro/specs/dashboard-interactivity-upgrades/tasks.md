# Implementation Plan: Dashboard Interactivity Upgrades

## Overview

This plan converts the feature design into a sequence of implementation
tasks. Each task builds on the previous tasks, and ends with wiring
things together. There is no hanging or orphaned code that isn't
integrated into a previous step. Tasks focus only on writing,
modifying, or testing code.

The order is:

1. Shared data model, settings, migration, motion profile, event bus,
   toast bus (everything every later task depends on).
2. Shared widget primitives (`WidgetCounter`, `WidgetSkeleton`,
   `WidgetInlineError`, `WidgetIconButton`, `InlineQuickAdd`) and
   quick-add parsers.
3. `WidgetShell` extensions (ambient pulse, `FreshnessDot`, stale sheen,
   `aria-live` coalescer).
4. Shared widget-facing hooks (`useRelativeTime`,
   `useWidgetPersistentState`, `useOptimisticAction`, `useDragReorder`,
   `useSwipeGesture`, `useLongPressEdit`, `useListKeyboardNav`, pinning
   helpers, hover/drop bus hooks).
5. Widget integrations (rolling numbers, sparklines, drag-reorder,
   swipe, inline quick-add, long-press edit, double-click edit,
   pinning, optimistic actions, linked widgets, insights actions, hover
   bus).
6. Discovery surfaces (command palette, layout presets).
7. Focused-overlay mini editors (each with its own lazy module).
8. Widget-specific wins (NowPlaying, Pomodoro, Habits, AirQuality,
   Stocks/Portfolio row cycle, WorldClock, ImageGallery, RichNote).
9. Accessibility pass (keyboard contract, 44px targets, aria-live).
10. Docs + backup coverage (`docs/dashboard.md`, `PROJECT.md`,
    `AGENTS.md`, `curioBackupService.ts`).
11. Final manual verification across light/dark, reduced motion, HA
    ingress, kiosk/touch, and desktop.

All new persisted keys use the `curio_*` prefix so the existing backup
sweep picks them up. All new animations respect the `animationIntensity`
setting and reduced-motion preference through `useMotionProfile()`.
Test sub-tasks marked with `*` are optional.

Property-based tests use `fast-check` with `Vitest`. Each property test
includes a JSDoc tag of the form:

```ts
/**
 * Feature: dashboard-interactivity-upgrades, Property N: <title>
 */
```

---

## Tasks

- [x] 1. Settings, data model, migration, and backup wiring
  - [x] 1.1 Add `DashboardInteractivitySettings` and `animationIntensity` to `dashboardTypes.ts`
    - Add `DashboardAnimationIntensity` type (`'off' | 'subtle' | 'full'`).
    - Add `DashboardInteractivitySettings` interface with every toggle listed in Requirement 30.1 plus `animationIntensity`.
    - Export `DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS` matching design defaults.
    - Extend `DashboardBoardPreferences` with `interactivity: DashboardInteractivitySettings`.
    - Extend `DashboardWidgetConfig` with the new optional fields from design: `linkedTaskId`, `linkedCommuteId`, `linkedMusicWidgetId`, `linkedWidgetIds`, `pinnedItemIds`, per-widget overrides (`ambientPulseEnabled`, `freshnessDotEnabled`, `swipeGesturesEnabled`, `dragReorderEnabled`, `rollingNumbersEnabled`, `widgetPinningEnabled`), widget-specific wins (`seekBarLiveSyncEnabled`, `breathingRingEnabled`, `valueMorphEnabled`, `clockOffsetPreviewEnabled`, `pinchZoomEnabled`, `ttsWordHighlightEnabled`), and `sparklineMaxSamples`.
    - _Requirements: 19.2, 30.1, 30.5, 11.1, 15.2_

  - [x] 1.2 Extend `dashboardSettings.ts` with interactivity getters, setters, hooks, and preference normalization
    - Add `getDashboardInteractivitySettings`, `setDashboardInteractivitySettings`, and `useDashboardInteractivitySettings` following the `get/set/use` pattern.
    - Update `normalizeDashboardPreferences` to fill `interactivity` with `DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS` when missing and to merge missing keys without clobbering user values.
    - Dispatch both `storage` and `curio:settings-changed` same-tab on setter calls.
    - _Requirements: 19.2, 30.1, 30.2, 30.3_

  - [x] 1.3 Add the `effectiveToggle(toggle, board, widgetConfig)` helper
    - Pure function that returns the per-widget override when defined, otherwise the board-level value.
    - Export from `dashboardSettings.ts` for use by widgets.
    - _Requirements: 30.6, 30.8_

  - [x] 1.4 Write property test for the effective-toggle formula
    - **Property 23: Effective-toggle formula**
    - **Validates: Requirement 30.8**
    - fast-check arbitraries over `(boardValue, widgetValue)` pairs, assert `effectiveToggle === (W !== undefined ? W : B)`.

  - [x] 1.5 Add settings migration v2 for Interactivity defaults
    - Extend `src/utils/settingsMigrations.ts` with the v2 migration from the design, walking every `curio_dashboard_prefs` / `curio_dashboard_prefs_*` key and filling `interactivity` with defaults without clobbering user-set values.
    - Bump `CURRENT_VERSION` to 2.
    - Make the migration idempotent: re-running against already-migrated data is a no-op.
    - _Requirements: 30.4_

  - [x] 1.6 Write unit tests for the v2 migration
    - Fresh install, legacy install with no `interactivity`, legacy install with partial `interactivity`, multi-profile install, malformed JSON entry.
    - Re-running the migration twice leaves data unchanged.
    - _Requirements: 30.4_

- [x] 2. Shared motion profile and event bus primitives
  - [x] 2.1 Implement `useMotionProfile()` and `buildMotionProfile(mode)`
    - New file `src/hooks/useMotionProfile.ts`.
    - Resolve motion mode from `(intensity, prefersReducedMotion, boardReduceMotion)` exactly as in design.
    - Return a `MotionProfile` with `mode`, `shouldAnimate`, `durationMs`, `scale` helpers.
    - Memoize by inputs via `useSyncExternalStore`-backed hooks.
    - _Requirements: 19.1, 19.3, 19.4, 19.5, 19.6_

  - [x] 2.2 Write property test for motion profile zero-duration
    - **Property 14: Motion profile collapses to zero duration**
    - **Validates: Requirement 19.8**
    - fast-check over `(intensity, reducedMotion, baseMs)`; assert `durationMs === 0` and `shouldAnimate === false` when `intensity === 'off'` or reduced motion is active.

  - [x] 2.3 Implement `dashboardToastBus.ts`
    - New service at `src/services/dashboardToastBus.ts`.
    - `show(toast)`, `dismiss(id)`, `subscribe(fn)` API from design.
    - `show({ id, ... })` with the same id replaces the existing toast.
    - Schedule auto-dismiss via a managed `setTimeout` cleaned up on dismiss.
    - Do not render anything — the UI host is a separate task.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.6_

  - [x] 2.4 Implement `useDashboardToastBus()` hook
    - New file `src/hooks/useDashboardToastBus.ts`.
    - Subscribes to `dashboardToastBus` via `useSyncExternalStore` so subscribers only re-render when the visible toast list changes.
    - _Requirements: 16.1_

  - [x] 2.5 Implement `dashboardIntents.ts` event bus helpers
    - New service at `src/services/dashboardIntents.ts`.
    - `dispatchDropIntent`, `DROP_INTENT_REGISTRY`, `isDropTargetSupported`, `dispatchHover`, `dispatchSelect` from design.
    - Register the design-defined (source -> targets) rules: Bookmarks -> Notes/RichNote/Obsidian, Task -> Pomodoro, Stocks -> Portfolio, Map -> Commute, News -> RichNote/Obsidian.
    - Export typed `HoverItemKind` and the payload shape.
    - _Requirements: 10.1, 10.7, 12.1_

  - [x] 2.6 Implement `useDropIntentTarget(widgetId, handlers)` and `useHoverBus()` hooks
    - New file `src/hooks/useDashboardIntents.ts`.
    - `useDropIntentTarget` subscribes to `curio:dashboard-item-drop`, looks up the rule registry, validates the payload, and invokes the matching handler; unsupported payloads dispatch the "Not supported here" toast through `dashboardToastBus`.
    - `useHoverBus()` subscribes to `curio:dashboard-hover` and `curio:dashboard-select`, reducing hover-end events to clear all highlights.
    - _Requirements: 10.8, 12.2, 12.3, 12.4_

  - [x] 2.7 Write property test for drop intent failure no-op
    - **Property 7: Drop intent failure is a no-op on both sides**
    - **Validates: Requirement 10.9**
    - fast-check over `(sourceType, targetType, payload)` triples, assert rejected drops produce no config mutations.

  - [x] 2.8 Write property test for hover-end clearing highlights
    - **Property 9: Hover-end clears highlights**
    - **Validates: Requirement 12.7**
    - fast-check over event sequences ending with `itemId=null`, assert the reducer leaves an empty highlight set.

  - [x] 2.9 Extend `dashboardRefresh.ts` with `curio:widget-data-updated` and `computeFreshnessState`
    - Emit `curio:widget-data-updated` on every successful refresh with `{ widgetId, widgetType, updatedAt }`.
    - Add pure `computeFreshnessState(updatedAt, intervalMs, lastRefreshError, nowMs)` returning one of `'fresh' | 'idle' | 'stale' | 'error'` (30s fresh, interval idle, past interval stale, `lastRefreshError` wins with error).
    - Add pure `shouldRenderSheen({ isFirstLoad, isRefreshing, sheenEnabled, motionProfile })`.
    - _Requirements: 2.1, 20.1, 22.1, 22.5_

  - [x] 2.10 Write property test for freshness state mutual exclusion
    - **Property 15: FreshnessDot state is mutually exclusive**
    - **Validates: Requirement 20.6**

  - [x] 2.11 Write property test for sheen exclusivity with first-load
    - **Property 16: Sheen never renders during first-load**
    - **Validates: Requirement 22.5**

- [x] 3. Shared widget primitives (widgetPrimitives/)
  - [x] 3.1 Implement `WidgetCounter` with odometer / slotRoll / tickUp modes
    - New file `src/components/curio/dashboard/widgetPrimitives/WidgetCounter.tsx`.
    - Use Framer Motion `useMotionValue` + `animate`; call `set(value)` on end so the final rendered text always equals `format(value)`.
    - Short-circuit non-finite values to static fallback.
    - Read `useMotionProfile()` to cap duration at 200ms in `subtle` and render immediately (no animation) in `off`.
    - Honor `prefersReducedMotion` prop as an escape hatch.
    - Export from the `widgetPrimitives` barrel.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 3.2 Write property test for WidgetCounter final-value settling
    - **Property 1: WidgetCounter settles to final value**
    - **Validates: Requirement 1.10**
    - Mount, replay an array of updates including `NaN`/`Infinity`, flush timers, assert rendered text equals `format(lastFiniteValue)`.

  - [x] 3.3 Implement `WidgetSkeleton` with variants (stat/list/chart/grid/hero/custom)
    - New file `src/components/curio/dashboard/widgetPrimitives/WidgetSkeleton.tsx`.
    - Use `bg-[var(--ether-control-bg)]` tokens; `w-full h-full` so dimensions equal `WidgetBody`.
    - Disable shimmer when motion profile is `off`.
    - Export from the barrel.
    - _Requirements: 18.1, 18.2, 18.4, 18.5_

  - [x] 3.4 Write unit test for `WidgetSkeleton` dimensions
    - Assert outer dimensions equal `WidgetBody` for the same `frameInfo`.
    - _Requirements: 18.5_

  - [x] 3.5 Implement `WidgetInlineError` with retry + open-settings actions
    - New file `src/components/curio/dashboard/widgetPrimitives/WidgetInlineError.tsx`.
    - Retry dispatches the widget's refresh event via `getDashboardRefreshEventName(widgetId)`.
    - Open Settings calls the provided `onOpenSettings` callback.
    - Export from the barrel.
    - _Requirements: 21.1, 21.3, 21.4_

  - [x] 3.6 Write unit test for `WidgetInlineError` retry clearing error state
    - After a successful retry, the component unmounts / hides itself.
    - _Requirements: 21.6_

  - [x] 3.7 Implement `WidgetIconButton` with 44px minimum targets and container-query relaxation
    - New file `src/components/curio/dashboard/widgetPrimitives/WidgetIconButton.tsx`.
    - Enforce `min-w-[44px] min-h-[44px]` and the standard focus ring.
    - Relax to 36px under `@container (width < 200px)`.
    - In dev mode, warn when `ariaLabel` is missing/empty.
    - Export from the barrel.
    - _Requirements: 27.1, 27.3, 27.4_

  - [x] 3.8 Write unit test for `WidgetIconButton` dev-mode aria warning
    - Snapshot the development-mode console warning on empty `ariaLabel`.
    - _Requirements: 27.5_

  - [x] 3.9 Implement quick-add parsers (task, reminder, timer, stock symbol)
    - New files: `src/services/quickAddParsers/taskParser.ts`, `reminderParser.ts`, `timerParser.ts` (with a paired `format(ms): string`), `stockSymbolParser.ts`.
    - Pure, deterministic regex-based parsing; return `{ ...result }` or `{ parseError }`.
    - _Requirements: 7.6, 7.7, 7.8_

  - [x] 3.10 Write property test for timer shorthand round-trip
    - **Property 6: Timer shorthand round-trip**
    - **Validates: Requirement 7.11**
    - fast-check `ms in [0, 86_400_000]`; assert `parse(format(ms)).durationMs === ms`.

  - [x] 3.11 Write unit tests for task/reminder/stock parsers
    - Cover "tomorrow 9am", "in 30m", invalid input, 8-char symbol cap, non-alphanumeric rejection.
    - _Requirements: 7.6, 7.8, 7.9_

  - [x] 3.12 Implement `InlineQuickAdd` primitive
    - New file `src/components/curio/dashboard/widgetPrimitives/InlineQuickAdd.tsx`.
    - Props: `placeholder`, `parser`, `onSubmit`, `onDismiss`, `showShortcutHint`, `ariaLabel`, `compact`.
    - Enter submits via parser; parse errors render inline hint and do not call `onSubmit`. Escape clears and calls `onDismiss`.
    - Export from the barrel.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.9_

  - [x] 3.13 Update the `widgetPrimitives` barrel
    - Add exports for the five new primitives above.
    - _Requirements: 1.1, 18.1, 21.1, 27.1, 7.1_

- [x] 4. WidgetShell extensions
  - [x] 4.1 Add ambient pulse layer to `WidgetShell`
    - Listen for `curio:widget-data-updated` filtered by `widgetId`.
    - Render a soft accent ring for 600-900ms via `useMotionProfile()`.
    - Coalesce >=3 events within 2s into a single pulse through a ref-held timestamp.
    - Restore resting styles when the animation ends.
    - Respect board-level and per-widget `ambientPulseEnabled`.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 4.2 Write unit test for ambient pulse style restoration
    - Render shell, fire event, advance timers, assert computed styles match pre-pulse snapshot.
    - _Requirements: 2.8_

  - [x] 4.3 Add `FreshnessDot` to the refresh-metadata chip
    - New component under `src/components/curio/dashboard/FreshnessDot.tsx` consumed by `WidgetShell`.
    - Derive state from `computeFreshnessState(...)`.
    - In `error` state, render a retry chip that dispatches the widget's refresh event.
    - Respect `freshnessDotEnabled` board toggle and per-widget override; only render when `showRefreshMetadata` is true.
    - Static dot in `off` / reduced motion.
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 4.4 Add stale-while-revalidate sheen to `WidgetShell`
    - Absolutely positioned top-edge gradient controlled by `refreshInFlight` from `useDashboardRefresh`.
    - Suppress while `isFirstLoad`; skip when motion profile is `off`.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x] 4.5 Add `useWidgetAriaAnnouncer(widgetId, text)` and aria-live region
    - New hook at `src/hooks/useWidgetAriaAnnouncer.ts` that coalesces updates to one announcement per 2000ms per widget id.
    - `WidgetShell` renders an `sr-only` `aria-live="polite"` region whose content is the latest announcement text.
    - Respect `ariaLiveUpdatesEnabled` toggle.
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 4.6 Write property test for aria-live coalescing
    - **Property 20: aria-live coalescing window**
    - **Validates: Requirement 26.6**
    - fast-check event timelines, assert at most one emission per 2000ms per widget id.

  - [x] 4.7 Extend `WidgetShell` props with `freshness`, `refreshInFlight`, `ariaAnnouncement`
    - Keep all three optional so existing widgets require no changes.
    - _Requirements: 20.1, 22.1, 26.1_

- [x] 5. Checkpoint — Shared plumbing ready
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Shared widget-facing hooks
  - [x] 6.1 Implement `useRelativeTime(timestamp)`
    - New file `src/hooks/useRelativeTime.ts`.
    - Return short human label: "just now", "12s ago", "4m ago", "2h ago".
    - Re-render on 10s / 30s / 5m schedule matching label resolution.
    - Return `"—"` and schedule no timer when timestamp is `null`/`undefined`.
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 6.2 Write property test for relative-time monotonicity
    - **Property 3: Relative-time monotonicity**
    - **Validates: Requirement 4.6**
    - fast-check `(t1, t2, now)` with `t1 <= t2`, assert implied age of `useRelativeTime(t1)` >= implied age of `useRelativeTime(t2)`.

  - [x] 6.3 Wire relative-time label into `WidgetShell` refresh metadata
    - When `showRefreshMetadata` and `relativeTimeHintsEnabled` are both true, render the relative-time label in place of the interval label.
    - _Requirements: 4.3, 4.4_

  - [x] 6.4 Implement `useWidgetPersistentState<T>(widgetId, key, initial)`
    - New file `src/hooks/useWidgetPersistentState.ts`.
    - Back by `curio_widget_state_<widgetId>_<key>`.
    - JSON-serialize; fall back to `initial` on malformed stored data.
    - `setValue` persists synchronously and dispatches `curio:settings-changed` same-tab.
    - Do not delete on unmount.
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [x] 6.5 Write property test for persistent state round-trip
    - **Property 10: `useWidgetPersistentState` round-trip across remount**
    - **Validates: Requirement 14.7**
    - fast-check JSON-serializable arbitraries; assert `setValue(v)` then remount reads `v`.

  - [x] 6.6 Add widget-deletion cleanup to `dashboardSettings.ts`
    - When a widget is removed from a page, sweep all `curio_widget_state_<widgetId>_*` keys matching that widget id.
    - _Requirements: 14.4_

  - [x] 6.7 Implement `useOptimisticAction`
    - New file `src/hooks/useOptimisticAction.ts`.
    - `run()` snapshots, applies locally, calls `commit()`, rolls back on failure, shakes via motion profile (static red outline when motion is off), and emits a retry toast through `dashboardToastBus`.
    - Expose `isPending` and `error` for the syncing ring.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.6_

  - [x] 6.8 Write property test for optimistic rollback
    - **Property 13: Optimistic rollback restores visible state**
    - **Validates: Requirement 17.7**
    - fast-check `(initialState, apply, rejectCase)` triples; assert post-rollback state deep-equals pre-apply state.

  - [x] 6.9 Implement `useDragReorder(items, onReorder, { keyExtractor })`
    - New file `src/hooks/useDragReorder.ts`.
    - Pointer-based drag with keyboard fallback: Space picks up, Arrow keys move, Space/Enter commits, Escape/drop outside reverts.
    - Announces position via `aria-live="polite"`.
    - Respects `dragReorderEnabled` board toggle and per-widget override.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 6.10 Write property test for reorder permutation invariant
    - **Property 4: Reorder preserves the multiset of row identifiers**
    - **Validates: Requirement 5.8**
    - fast-check unique id arrays and `(from, to)` indices; assert resulting list is a permutation of the original.

  - [x] 6.11 Implement `useSwipeGesture`
    - New file `src/hooks/useSwipeGesture.ts`.
    - Captures pointer on `pointerdown` and releases on `pointerup` / `pointercancel`.
    - `touch-action: pan-y` and 6px horizontal hysteresis so vertical scroll still works.
    - Proportional accent wash during swipe; commit at 40% threshold on release; spring back below.
    - Linear transforms only when motion profile is `off` / reduced.
    - Respects `swipeGesturesEnabled` toggle with fine/coarse-pointer default refinement.
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_

  - [x] 6.12 Implement `useLongPressEdit` and `useDoubleClickEdit`
    - `useLongPressEdit`: >450ms press or right-click on fine-pointer enters edit mode, ignoring events during active drag/swipe.
    - `useDoubleClickEdit`: double-click/double-tap enters inline editor, preselects value; Enter commits, Escape cancels.
    - Respect `longPressEditEnabled` and `doubleClickEditEnabled`.
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4_

  - [x] 6.13 Implement `useListKeyboardNav`
    - Tab to first actionable row, ArrowUp/ArrowDown moves focus without scrolling page, Enter activates primary action, Backspace deletes with undo toast, Escape exits inline editor without committing.
    - Apply to every list-widget list container.
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x] 6.14 Write property test for editor cancel no-op
    - **Property 5: Cancel leaves data unchanged across every editor**
    - **Validates: Requirements 6.8, 8.7, 9.6, 28.7**
    - fast-check `(editorKind, initialState, typedInput)`; assert cancellation leaves data deep-equal to pre-edit state.

  - [x] 6.15 Implement `resolveLinkedWidget(id, widgets)` helper and `useLinkedWidget(ref)` hook
    - New helpers inside `dashboardIntents.ts` (or a dedicated module).
    - Return null when the id does not exist; never return a widget with a different id.
    - Clear stale ids on next render without crashing.
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [x] 6.16 Write property test for LinkedWidgetId resolution
    - **Property 8: LinkedWidgetId resolution is id-preserving or null**
    - **Validates: Requirement 11.8**

- [x] 7. Sparkline store and relative-time metadata
  - [x] 7.1 Implement `dashboardSparklineStore.ts`
    - New service at `src/services/dashboardSparklineStore.ts`.
    - `getWidgetSparklineHistory`, `appendWidgetSparklineSample`, `clearWidgetSparklineHistory`.
    - localStorage-backed bounded ring buffer keyed by `curio_widget_sparkline_<widgetId>_<key>`; default max 60, configurable per widget via `sparklineMaxSamples`.
    - Dispatch `curio:settings-changed` on writes.
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [x] 7.2 Write property test for sparkline ring buffer invariants
    - **Property 2: Sparkline ring buffer respects max and last-appended**
    - **Validates: Requirement 3.9**
    - fast-check arrays of `{t, v}` samples and `maxSamples in [1, 200]`; assert length cap and last-element equality.

- [x] 8. DashboardToastHost and Interactivity settings UI
  - [x] 8.1 Implement `DashboardToastHost.tsx`
    - New file `src/components/curio/dashboard/DashboardToastHost.tsx`.
    - Subscribes to `dashboardToastBus`; renders up to three stacked toasts with an optional Undo button.
    - Ensures `onUndo` is invoked at most once per toast id.
    - Deduplicates by `id`.
    - _Requirements: 16.1, 16.3, 16.6_

  - [x] 8.2 Mount `DashboardToastHost` inside `Dashboard.tsx`
    - Render outside the grid so it survives page switches.
    - _Requirements: 16.1_

  - [x] 8.3 Write property test for undo restoring exact prior state
    - **Property 12: Undo restores exact prior state**
    - **Validates: Requirement 16.7**
    - fast-check `(state, destructiveAction)` pairs across Tasks, Reminders, Bookmarks, Portfolio, Stocks, Notifications, pinned items; assert `undo(act(state)) === state`.

  - [x] 8.4 Add Interactivity sub-section to `DashboardSection.tsx`
    - Segmented control for `animationIntensity`.
    - One `ToggleRow` per `InteractivitySetting` key listed in Requirement 30.1.
    - Help copy linking to `docs/dashboard.md#interactivity`.
    - _Requirements: 19.7, 30.1_

  - [x] 8.5 Add per-widget interactivity overrides to widget settings sheets
    - Extend `CurioSettingsModal` widget-settings flow to expose the overrides supported by each widget (pulse, freshness, swipe, drag reorder, rolling numbers, pinning, and widget-specific wins).
    - _Requirements: 30.5, 30.7_

  - [x] 8.6 Wrap Dashboard widget tree in `MotionConfig`
    - In `Dashboard.tsx`, memoize the `MotionConfig` props from `useMotionProfile()` so the provider only re-renders when intensity/reduced-motion actually change.
    - _Requirements: 19.1, 19.3, 19.4, 19.5_

- [x] 9. Checkpoint — Primitives and hooks wired into shell
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Rolling numbers and sparklines across numeric widgets
  - [x] 10.1 Integrate `WidgetCounter` into Stocks, Portfolio, Activity (Health), Habits, AirQuality, Tasks, Insights, HealthWidget
    - Replace the primary numeric text with `WidgetCounter` when `effectiveToggle('rollingNumbersEnabled', board, widget)` is true.
    - Static text when false.
    - Wire the aria-live announcement through `useWidgetAriaAnnouncer`.
    - _Requirements: 1.8, 1.9, 26.2, 26.3_

  - [x] 10.2 Append sparkline samples from Stocks, AirQuality, HaEnergy, Weather on refresh
    - When `sparklineHistoryEnabled` is true, append the primary numeric reading to `dashboardSparklineStore` on every successful refresh.
    - Render a compact trail when there are >=2 samples; render nothing trail-side below two.
    - Add a "Clear trend" action in widget settings for each widget.
    - _Requirements: 3.4, 3.5, 3.7_

- [x] 11. Drag-reorder across list widgets
  - [x] 11.1 Wire `useDragReorder` into Tasks, Reminders, Chores, Bookmarks, Habits, Portfolio holdings, Stocks watchlist, Weather Outlook cities, World Clock zones
    - Persist the new order through each widget's existing store and dispatch its store-changed event.
    - Render the aria-live announcement region per widget.
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 12. Swipe gestures for Tasks, Reminders, NotificationsCenter
  - [x] 12.1 Wire `useSwipeGesture` into each row
    - Swipe-right completes/acknowledges, swipe-left snoozes/archives.
    - Commit destructive actions through `useOptimisticAction` + `dashboardToastBus` undo toast.
    - Add keyboard equivalents (`Shift+Enter`, `Backspace`).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_

- [x] 13. Inline quick-add across list widgets
  - [x] 13.1 Integrate `InlineQuickAdd` into Tasks, Reminders, Timers, Countdowns, Stocks, Weather Outlook, World Clock, Bookmarks
    - Wire each widget's parser (task, reminder, timer, stock symbol).
    - When `inlineQuickAddEnabled` is false, fall back to previous add controls.
    - _Requirements: 7.5, 7.10_

- [x] 14. Long-press edit, right-click, and inline numeric edit
  - [x] 14.1 Wire `useLongPressEdit` into `Dashboard.tsx` widget tiles
    - Enter inline edit mode with subtle wiggle (skipped under reduced motion) and expose move / resize / duplicate / remove via action menu.
    - Click outside exits edit mode.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 14.2 Wire `useDoubleClickEdit` into Timers, Pomodoro, Portfolio shares, HaClimate setpoint, Habits goal
    - HaClimate setpoint commit uses the `useOptimisticAction` path from Requirement 17.
    - Invalid commits revert and announce through `aria-live`.
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 15. Cross-widget drop intents and linked widgets
  - [x] 15.1 Implement drop sources and targets
    - Bookmark -> Notes/RichNote/Obsidian (append URL + title).
    - Task -> Pomodoro (sets `linkedTaskId`, starts focus session).
    - Stock -> Portfolio (opens add-holding form with symbol prefilled).
    - Map pin -> Commute (sets destination).
    - News article -> RichNote/Obsidian (inserts title + URL).
    - Respect `dropIntentsEnabled`; unsupported drops render the "Not supported here" toast.
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 15.2 Render linked widget state
    - Pomodoro displays linked task title and progress.
    - Map displays linked commute route summary.
    - NowPlaying reflects linked music widget playback state.
    - Expose a link picker populated from the active page's widgets in widget settings for each linkable widget.
    - _Requirements: 11.2, 11.3, 11.4, 11.6_

- [x] 16. Hover / selection bus across Calendar, Tasks, Mail
  - [x] 16.1 Wire hover events in Calendar <-> Mail
    - Hovering a calendar event dispatches `itemKind='calendar-event'`; Mail widgets highlight matching threads by attendee.
    - Hovering a due task dispatches a hover event; Calendar highlights the matching day cell.
    - `hoverSelectionBusEnabled=false` disables both dispatch and highlight; `AnimationIntensity='off'` renders highlights as static outlines.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 17. Pinning across Mail, YouTube, HaEntities, News
  - [x] 17.1 Add per-widget pinning
    - Store `pinnedItemIds` via `useWidgetPersistentState`.
    - Sort pinned items to the top in insertion order.
    - Hide pin affordance when `widgetPinningEnabled=false`; preserve existing pinned ids.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 17.2 Write property test for pinning idempotence
    - **Property 11: Pinning is idempotent**
    - **Validates: Requirement 15.6**

- [x] 18. Optimistic actions across HA, Tasks, Reminders, Mail
  - [x] 18.1 Wire `useOptimisticAction` into HaWidgetApi toggles, Tasks complete, Reminders snooze, Gmail/Outlook/Mail archive
    - Render syncing ring via `WidgetShell` pending prop.
    - On success, merge server response; on failure, rollback, shake, show retry toast.
    - Honor `optimisticActionsEnabled=false` (wait for confirmation).
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 19. WidgetSkeleton + WidgetInlineError integration across widgets
  - [x] 19.1 Replace first-load placeholders with `WidgetSkeleton`
    - Every widget that currently hand-rolls a first-load panel uses `WidgetSkeleton` with the appropriate variant.
    - Continue rendering cached data with stale sheen during refresh rather than the skeleton.
    - _Requirements: 18.2, 18.3_

  - [x] 19.2 Render `WidgetInlineError` on refresh failure
    - Every widget shows `WidgetInlineError` inside its body when `lastRefreshError` is set; header is preserved.
    - Focused editors render the inline error from within the overlay instead of collapsing.
    - _Requirements: 21.2, 13.9_

- [x] 20. Checkpoint — Widget integrations complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Discovery: DashboardCommandPalette
  - [x] 21.1 Implement `dashboardCommandPaletteService.ts`
    - New service at `src/services/dashboardCommandPaletteService.ts`.
    - `registerSource`, `unregisterSource`, `search(query)` with parallel source fan-out.
    - _Requirements: 23.2_

  - [x] 21.2 Register the four built-in sources
    - `onBoardWidgetsSource`: active page widgets matched on label/title/keywords.
    - `catalogSource`: `WIDGET_CATALOG`.
    - `quickActionsSource`: "Add stock", "Set timer", "Toggle kitchen lights" etc., routed through existing widget intent bus + tool router where appropriate.
    - `recentCardsSource`: CardManager history, last N.
    - _Requirements: 23.2, 23.5_

  - [x] 21.3 Implement `DashboardCommandPalette.tsx` (lazy-loaded)
    - Modal portal with focus trap and focus restoration.
    - Full keyboard navigation (arrow/Enter/Escape).
    - Selection dispatches one of `curio:dashboard-scroll-to-widget`, `curio:dashboard-widget-intent`, quick-action handlers, or the matching card-open event.
    - _Requirements: 23.1, 23.3, 23.4, 23.5, 23.6_

  - [x] 21.4 Mount the Cmd+K / Ctrl+K listener in `Dashboard.tsx`
    - Lazy-mount the palette on first press.
    - Ignore the shortcut while `document.activeElement` is a text-editable selector.
    - Respect `commandPaletteEnabled=false` (ignore the shortcut).
    - _Requirements: 23.1, 23.7, 23.8_

  - [x] 21.5 Handle `curio:dashboard-scroll-to-widget` in `Dashboard.tsx`
    - Scroll target widget into view and apply a 1200ms focus ring.
    - _Requirements: 23.3_

  - [x] 21.6 Write property test for palette open/close no-op
    - **Property 17: Palette open/close without selection is a no-op**
    - **Validates: Requirement 23.9**

- [x] 22. Discovery: Dashboard layout presets
  - [x] 22.1 Implement `dashboardLayoutPresets.ts`
    - New service at `src/services/dashboardLayoutPresets.ts`.
    - `getDashboardLayoutPresets`, `saveDashboardLayoutPreset`, `deleteDashboardLayoutPreset`, `exportDashboardLayoutPreset`, `importDashboardLayoutPreset`, `normalizePreset`.
    - Profile-scoped storage key `curio_dashboard_presets[_<profileId>]`.
    - Schema version 1; reject other versions with a descriptive error.
    - _Requirements: 24.1, 24.2, 24.5_

  - [x] 22.2 Write property test for preset export/import round-trip
    - **Property 18: Layout preset export/import round-trip**
    - **Validates: Requirement 24.8**

  - [x] 22.3 Add preset controls to `DashboardWidgetActionMenu` and settings
    - Menu entries: "Pin preset", "Save as preset", "Export preset", "Import preset", "Copy widget link".
    - Settings modal lists presets grouped by category.
    - Applying a preset replaces the active page widgets + appearance and emits an undo toast.
    - _Requirements: 24.3, 24.4_

- [x] 23. Insights actions
  - [x] 23.1 Make Insights rows tappable
    - Tapping "top widget" dispatches `curio:dashboard-scroll-to-widget` with that widget's id.
    - Tapping "least used widget" opens the widget's action menu in delete-confirm state.
    - Missing widget on the active page shows a "Widget no longer on this page" toast.
    - Respect `insightsActionsEnabled=false` (non-interactive text).
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

  - [x] 23.2 Write property test for Insights taps not mutating configuration
    - **Property 19: Insights taps do not mutate configuration**
    - **Validates: Requirement 25.5**

- [x] 24. Checkpoint — Discovery surfaces ready
  - Ensure all tests pass, ask the user if questions arise.

- [x] 25. Focused-overlay mini editor: Stocks multi-timeframe
  - [x] 25.1 Add `stocks/StocksMultiTimeframe.tsx` and lazy-wire it
    - Render 1D/1W/1M/3M/1Y/5Y chart, symbol reorder, alert rules editor inside the focused branch of `StockWidget`.
    - Heavy subtree imported via `React.lazy`; fallback is `WidgetSkeleton variant="chart"`.
    - Errors render `WidgetInlineError`.
    - _Requirements: 13.2, 13.9_

- [x] 26. Focused-overlay mini editor: Portfolio lot editor
  - [x] 26.1 Add `portfolio/PortfolioLotEditor.tsx` and lazy-wire it
    - Lot-level edit, dividend tracking, rebalance helper.
    - Mutations write through the existing portfolio store so the compact view re-renders on close.
    - _Requirements: 13.3, 13.10_

- [x] 27. Focused-overlay mini editor: Weather hourly + radar
  - [x] 27.1 Add `weather/WeatherFocused.tsx` and lazy-wire it
    - Hourly strip, radar tile toggles, saved locations.
    - _Requirements: 13.4_

- [x] 28. Focused-overlay mini editor: Calendar week/month
  - [x] 28.1 Add `calendar/CalendarFocused.tsx` and lazy-wire it for Calendar, GoogleCalendar, OutlookCalendar, iCal, HaCalendar
    - Week and month grids with inline event creation.
    - _Requirements: 13.5_

- [x] 29. Focused-overlay mini editor: Mail thread reader
  - [x] 29.1 Add `mail/MailThreadReader.tsx` and lazy-wire it for Mail, Gmail, OutlookMail
    - Full thread reader with inline reply draft.
    - _Requirements: 13.6_

- [x] 30. Focused-overlay mini editor: Habits heatmap
  - [x] 30.1 Add `habits/HabitsFocusedHeatmap.tsx` and lazy-wire it
    - Month heatmap with tap-to-toggle day cells.
    - _Requirements: 13.7_

- [x] 31. Focused-overlay mini editor: Tasks subtasks
  - [x] 31.1 Add `tasks/TasksFocused.tsx` and lazy-wire it
    - Subtasks, notes, due-date picker, drag across sections.
    - _Requirements: 13.8_

- [x] 32. Checkpoint — Focused editors persist state on close
  - Ensure all tests pass, ask the user if questions arise.

- [x] 33. Widget-specific wins
  - [x] 33.1 NowPlaying live seek bar
    - Advance every 250ms while playing; do not advance while paused.
    - Guarded by `seekBarLiveSyncEnabled`.
    - _Requirements: 29.1, 29.9_

  - [x] 33.2 Pomodoro breathing ring and session chime
    - Render breathing animation matching session phase; play chime on session end honoring the existing notification chime setting.
    - Guarded by `breathingRingEnabled`.
    - _Requirements: 29.2, 29.9_

  - [x] 33.3 Habits tap-to-toggle burst + streak tick-up
    - Subtle burst on toggle (skipped under reduced motion); streak count animates upward via `WidgetCounter`.
    - _Requirements: 29.3, 29.9_

  - [x] 33.4 AirQuality value morph
    - Smooth value morph via `WidgetCounter` instead of snap replace.
    - Guarded by `valueMorphEnabled`.
    - _Requirements: 29.4, 29.9_

  - [x] 33.5 Stocks / Portfolio row display-mode cycle
    - Per-row tap cycles `value -> percent -> dayChange -> value`, persisted via `useWidgetPersistentState`.
    - _Requirements: 29.5, 29.9_

  - [x] 33.6 Write property test for row display-mode cycle
    - **Property 22: Stocks/Portfolio display-mode cycle**
    - **Validates: Requirement 29.11**

  - [x] 33.7 WorldClock drag-to-preview offset
    - Drag clock face to preview a time offset; release restores real time within 1s and does not mutate the persisted time zone.
    - Guarded by `clockOffsetPreviewEnabled`.
    - _Requirements: 29.6, 29.9_

  - [x] 33.8 Write property test for WorldClock offset release
    - **Property 21: WorldClock offset release restores real time**
    - **Validates: Requirement 29.10**

  - [x] 33.9 ImageGallery pinch-to-zoom + compact swipe
    - Pinch-to-zoom inside `DashboardFocusedWidgetOverlay`; swipe in the compact tile.
    - Guarded by `pinchZoomEnabled`.
    - _Requirements: 29.7, 29.9_

  - [x] 33.10 RichNote TTS word highlight
    - Highlight the word currently being spoken/dictated via `ttsProgress` events.
    - Guarded by `ttsWordHighlightEnabled`.
    - _Requirements: 29.8, 29.9_

- [x] 34. Accessibility pass — keyboard contract and 44px targets
  - [x] 34.1 Apply `useListKeyboardNav` to list widgets
    - Uniformly across Tasks, Reminders, Chores, Bookmarks, Habits, Portfolio, Stocks, Weather Outlook, World Clock, Notifications, Mail, News.
    - _Requirements: 28.6_

  - [x] 34.2 Replace in-card icon buttons with `WidgetIconButton`
    - Tasks, Reminders, Chores, Bookmarks, Habits, Pomodoro, Timers, Stocks, Portfolio, HA action widgets.
    - _Requirements: 27.2_

  - [x] 34.3 Add aria-live announcer calls to every rolling-number widget
    - Wire `useWidgetAriaAnnouncer(widgetId, text)` in Stocks, Portfolio, Activity, Habits, AirQuality, Insights so that rolling-number updates produce a single coalesced announcement per update per widget.
    - Respect `ariaLiveUpdatesEnabled=false`.
    - _Requirements: 26.2, 26.3, 26.5_

- [x] 35. Backup / restore coverage
  - [x] 35.1 Extend `curioBackupService.ts`
    - Include in every full backup: `InteractivitySettings`, `SparklineHistory` entries (`curio_widget_sparkline_*`), per-widget `pinnedItemIds`, `LinkedWidgetId` fields on widget configs, `useWidgetPersistentState` entries (`curio_widget_state_*`), and saved `LayoutPresets` (`curio_dashboard_presets*`).
    - Restore each item and dispatch matching `curio:settings-changed` events.
    - On missing keys in older backups, fall back to defaults without failing the whole restore; log a single partial-restore line.
    - Update `getSecretKeys` / `SENSITIVE_KEYS` as needed if any new key is secret-scoped (none expected for this feature).
    - _Requirements: 31.1, 31.2, 31.3_

  - [x] 35.2 Write property test for backup / restore round-trip
    - **Property 24: Backup/restore round-trip**
    - **Validates: Requirement 31.5**
    - fast-check arbitrary dashboard states with all new persisted keys; assert `restore(backup(D))` equals `D` for each feature-owned key.

  - [x] 35.3 Write unit tests for each new backup key
    - Individual include + restore assertions covering `InteractivitySettings`, `SparklineHistory`, `pinnedItemIds`, `LinkedWidgetId`, `useWidgetPersistentState`, `LayoutPresets`.
    - _Requirements: 31.4_

- [x] 36. Documentation updates
  - [x] 36.1 Update `docs/dashboard.md`
    - Add sections for the Interactivity sub-section, shared primitives (`WidgetCounter`, `WidgetSkeleton`, `WidgetInlineError`, `WidgetIconButton`, `InlineQuickAdd`), the command palette, layout presets, and per-widget interactivity overrides.
    - Document the new event bus contracts (`curio:widget-data-updated`, `curio:dashboard-item-drop`, `curio:dashboard-hover`, `curio:dashboard-select`, `curio:dashboard-scroll-to-widget`, `curio:dashboard-toast`).
    - _Requirements: 32.3_

  - [x] 36.2 Update `PROJECT.md`
    - Reference the new shared primitives, `DashboardToastBus`, `DashboardCommandPalette`, layout presets, and the Interactivity settings sub-module.
    - _Requirements: 32.4_

  - [x] 36.3 Update `AGENTS.md`
    - Add rules under "Dashboard Widgets" for composing the new primitives, respecting `InteractivitySettings`, and routing toasts and drop intents through the shared services.
    - _Requirements: 32.5_

- [x] 37. Final checkpoint and manual verification
  - [x] 37.1 Run full verification suite
    - `npm run typecheck`, `npm test`, `npm run build`.
    - Ensure all property-based tests run at >=100 iterations.
    - _Requirements: all_

  - [x] 37.2 Manual verification across environments
    - Light and dark themes.
    - `prefers-reduced-motion: reduce` and `animationIntensity='off'`.
    - Home Assistant ingress path (all assets relative, `import.meta.env.BASE_URL` preserved, no new required backend services).
    - Kiosk / touch profile (coarse pointer): 44px targets, swipe gestures, long-press edit, pinch-to-zoom in the focused overlay.
    - Desktop: keyboard contract, `Cmd+K` / `Ctrl+K` palette, drag reorder, right-click edit.
    - _Requirements: 32.1, 32.2, 32.6_

  - [x] 37.3 Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Core implementation tasks are never marked optional.
- Every property-based test file starts with the JSDoc tag `Feature: dashboard-interactivity-upgrades, Property N: <title>` so grep-based traceability from design to code is preserved.
- Every new persisted key uses the `curio_*` prefix so the existing `curioBackupService.ts` sweep picks it up; keys added in task 1.1 and tasks 7.1, 22.1, 6.4 are covered by task 35.1.
- No new required backend services are introduced; the command palette's HA quick actions reuse the existing `haWidgetApi` helpers, and preset import/export is entirely client-side JSON.
- Tasks 10-18 and 33 assume the shared plumbing (tasks 1-9) is in place; the checkpoints at tasks 5, 9, 20, 24, 32 protect against drift.
