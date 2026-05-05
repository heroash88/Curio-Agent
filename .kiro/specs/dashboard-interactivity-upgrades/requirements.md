# Requirements Document

## Introduction

The Curio Robot dashboard currently renders data through 60+ widgets but feels largely static between refreshes, with limited ability to mutate state inline, few animated deltas, and inconsistent cross-widget interactions. This feature introduces a broad set of dashboard-wide quality-of-life upgrades that make widgets feel alive, directly manipulable, and interconnected while keeping every behavior individually toggleable.

The upgrades span ten functional groups: shared live-data primitives, direct manipulation inside widgets, cross-widget dataflow, expanded mini-editors in the focused overlay, persistent widget memory, motion and micro-interactions, live status expressiveness, discovery and flow (command palette, presets), accessibility and kiosk polish, and per-widget specific wins.

Every feature that can meaningfully be opted into or out of MUST be individually toggleable, surfaced in the Dashboard section of `CurioSettingsModal` (with a new "Interactivity" sub-section for board-level toggles) and, where applicable, in per-widget settings. New toggles persist through `src/utils/settings/dashboardSettings.ts`, fire `curio:settings-changed` events same-tab, and are captured by `src/services/curioBackupService.ts`. All motion features MUST honor both the existing reduced-motion preference and the new animation-intensity setting. The feature MUST keep Home Assistant ingress compatibility (relative paths, no new required backend services) and update `docs/dashboard.md`, `PROJECT.md`, and `AGENTS.md` in the same change.

## Glossary

- **Dashboard**: The profile-aware, multi-page widget surface rendered by `src/components/curio/Dashboard.tsx`.
- **Widget**: A dashboard tile declared in `src/services/dashboardTypes.ts` and rendered through `dashboardRegistry.tsx`.
- **WidgetShell**: The shared wrapper in `src/components/curio/dashboard/WidgetShell.tsx` that provides chrome, glow, accent bleed, refresh metadata, and the action menu slot.
- **DashboardFocusedWidgetOverlay**: The full-bleed expanded overlay for a single widget defined in `src/components/curio/dashboard/DashboardFocusedWidgetOverlay.tsx`.
- **DashboardSettings**: The settings module at `src/utils/settings/dashboardSettings.ts` that owns pages, preferences, and board-level toggles.
- **DashboardBoardPreferences**: The shared per-profile preferences object (layout mode, snap, widget glow, etc.) declared in `dashboardTypes.ts`.
- **InteractivitySettings**: The new sub-section of `DashboardBoardPreferences` that holds the board-level interactivity toggles introduced by this feature.
- **WidgetInteractivityConfig**: Per-widget boolean/selection overrides (for example `dragReorderEnabled`, `swipeGesturesEnabled`) stored in `DashboardWidgetConfig`.
- **WidgetCounter**: The shared numeric-animation primitive introduced by this feature, covering odometer (digit columns), slot-roll (vertical roll), and tick-up (interpolated count) modes.
- **WidgetSkeleton**: The shared first-load placeholder primitive that matches a widget's final layout.
- **WidgetInlineError**: The shared inline error primitive with a retry button and an "open settings" link.
- **WidgetIconButton**: The shared icon button primitive that enforces a 44px minimum hit target and keyboard focus styling.
- **InlineQuickAdd**: The shared quick-add primitive used for natural-language adds in Tasks, Reminders, Timers, Stocks, Weather Outlook, World Clock, Bookmarks, and Countdowns.
- **DashboardToastBus**: The shared transient toast channel for single-undo toasts on destructive in-widget actions.
- **DashboardIntentBus**: The existing widget intent bus in `useDashboardWidgetIntents.ts`, extended in this feature with a `curio:dashboard-item-drop` event and a hover/selection channel.
- **UseWidgetPersistentState**: The new `useWidgetPersistentState(widgetId, key, initial)` helper hook that persists small per-widget UI state (collapse, tab selection, view mode).
- **AnimationIntensity**: The board-level setting with values `off`, `subtle`, and `full` that scales all non-essential animations.
- **FreshnessDot**: The enhanced live dot in `WidgetShell` with states fresh (pulsing), idle (dim), stale (amber), and error (red with retry chip).
- **RollingNumber**: A numeric rendering produced by `WidgetCounter` that animates from its previous value to its current value.
- **SparklineHistory**: A bounded ring buffer of recent numeric samples persisted per widget (for stocks, AQI, energy, temperature).
- **OptimisticAction**: An action that mutates local state immediately while a background request confirms or rolls back the change (HA toggle, task complete, email archive).
- **LinkedWidgetId**: A reference stored in one widget's config that points to another widget's id (for example `Pomodoro.linkedTaskId`).
- **DashboardCommandPalette**: The ⌘K / Ctrl+K scoped palette introduced by this feature, implemented on top of `DashboardWidgetPickerPanel` and `useDashboardWidgetIntents`.
- **LayoutPreset**: A saved, named JSON snapshot of a dashboard page's widgets and appearance, exportable and importable.
- **ReducedMotion**: The existing `prefers-reduced-motion` and in-app reduced-motion preference.
- **HAWidgetApi**: The shared Home Assistant widget state cache in `src/services/haWidgetApi.ts` used for optimistic HA actions.

## Requirements

### Requirement 1: Rolling Number Primitive (WidgetCounter / WidgetRollingNumber)

**User Story:** As a dashboard user, I want numeric values to animate between changes, so that I can feel when data is live and notice meaningful deltas.

#### Acceptance Criteria

1. THE WidgetCounter SHALL accept a numeric `value`, a `mode` of `odometer`, `slotRoll`, or `tickUp`, an optional `precision`, an optional `durationMs`, and an optional `format` function.
2. WHEN the `value` prop changes from a previous numeric value to a new numeric value, THE WidgetCounter SHALL animate the rendered text from the previous value to the new value over `durationMs` and SHALL end exactly at the new value.
3. WHEN the `value` prop changes to a non-finite number (NaN, Infinity), THE WidgetCounter SHALL render a static fallback string and SHALL NOT start an animation.
4. WHEN AnimationIntensity is `off` or ReducedMotion is enabled, THE WidgetCounter SHALL render the new value immediately without animation.
5. WHEN AnimationIntensity is `subtle`, THE WidgetCounter SHALL cap the animation duration at 200ms.
6. WHERE a consumer sets `prefersReducedMotion` through the `WidgetCounter` prop, THE WidgetCounter SHALL behave as if ReducedMotion is enabled for that instance.
7. THE WidgetCounter SHALL support both positive and negative values and SHALL respect the configured `precision` without introducing floating-point drift in the final rendered value.
8. THE Stocks, Portfolio, Activity, Habits, AirQuality, Tasks, Insights, and Health widgets SHALL render their primary numeric values through WidgetCounter when the `rollingNumbersEnabled` InteractivitySetting is `true`.
9. IF `rollingNumbersEnabled` is `false`, THEN THE listed widgets SHALL render numeric values as static text.
10. **Correctness property**: For any sequence of value updates applied to a WidgetCounter, after all animations have completed, the rendered final value SHALL equal the last input value (modulo formatting).

### Requirement 2: Ambient Pulse on Fresh Data

**User Story:** As a dashboard user, I want a subtle visual cue when a widget receives fresh data, so that I know the board is alive without any sound or text interruption.

#### Acceptance Criteria

1. WHEN a successful refresh completes inside `useDashboardRefresh`, THE dashboardRefresh service SHALL emit a `curio:widget-data-updated` CustomEvent whose detail includes `{ widgetId, widgetType, updatedAt }`.
2. WHEN `curio:widget-data-updated` fires for a widget, THE WidgetShell for that widget SHALL flash a soft accent ring for 600-900ms and SHALL return to its resting state after the flash.
3. WHEN AnimationIntensity is `off` or ReducedMotion is enabled, THE WidgetShell SHALL NOT render the ambient pulse.
4. WHEN AnimationIntensity is `subtle`, THE WidgetShell SHALL render the ambient pulse at reduced opacity and without scale change.
5. THE `ambientPulseEnabled` InteractivitySetting SHALL control whether ambient pulses render at all; when `false`, no widgets SHALL pulse.
6. THE per-widget `ambientPulseEnabled` config field SHALL override the board-level setting when explicitly set.
7. IF a widget refreshes more than three times within two seconds, THEN THE WidgetShell SHALL coalesce the pulses into a single pulse.
8. **Correctness property**: For any pulse event, the WidgetShell's resting styles (border, background, shadow) SHALL be restored to their pre-pulse values once the animation ends.

### Requirement 3: Persisted Sparkline History

**User Story:** As a dashboard user, I want widgets like Stocks, AQI, Energy, and Temperature to show recent trend context, so that I can see direction at a glance.

#### Acceptance Criteria

1. THE dashboardSettings module SHALL expose `getWidgetSparklineHistory(widgetId, key)`, `appendWidgetSparklineSample(widgetId, key, sample)`, and `clearWidgetSparklineHistory(widgetId, key)` helpers.
2. THE SparklineHistory for a given widget/key pair SHALL retain at most 60 samples (configurable per-widget through `sparklineMaxSamples`).
3. WHEN a sample is appended beyond the maximum, THE dashboardSettings module SHALL drop the oldest sample so the stored array length stays at or below the maximum.
4. THE Stocks, AirQuality, HaEnergy, and Weather widgets SHALL append their primary numeric reading to SparklineHistory on every successful refresh when `sparklineHistoryEnabled` is `true`.
5. WHERE a widget has fewer than two stored samples, THE widget SHALL render its compact display without a sparkline trail.
6. IF `sparklineHistoryEnabled` is `false`, THEN no widget SHALL append samples and existing stored samples SHALL remain untouched until the user clears them.
7. THE `clearWidgetSparklineHistory` helper SHALL be exposed as a "Clear trend" control in the widget settings sheet for each supporting widget.
8. THE curioBackupService SHALL include SparklineHistory entries in full backups and SHALL restore them on restore.
9. **Correctness property**: After any number of appends, `getWidgetSparklineHistory` SHALL return an array whose length is at most the configured maximum and whose last element equals the most recently appended sample.

### Requirement 4: Relative Last-Updated Hint

**User Story:** As a dashboard user, I want to see how fresh each widget's data is, so that I can trust live readings and refresh stale ones.

#### Acceptance Criteria

1. THE hooks module SHALL expose `useRelativeTime(timestamp)` that returns a short human-readable string (for example "just now", "12s ago", "4m ago", "2h ago").
2. THE `useRelativeTime` hook SHALL re-render on a schedule that matches the string's resolution (every 10s while under one minute, every 30s while under one hour, every 5 minutes beyond).
3. WHEN a widget has `showRefreshMetadata` enabled, THE WidgetShell SHALL render a relative-time label derived from `useRelativeTime` in its refresh metadata chip.
4. THE `relativeTimeHintsEnabled` InteractivitySetting SHALL control whether the relative-time label replaces the existing interval label; when `false`, the existing interval label SHALL render unchanged.
5. WHEN the source timestamp is unknown (null/undefined), THE WidgetShell SHALL render "—" and SHALL NOT schedule any timer.
6. **Correctness property**: For any two timestamps `t1 <= t2`, `useRelativeTime(t1)` observed at the same present time as `useRelativeTime(t2)` SHALL produce a string whose implied age is greater than or equal to the age implied by `useRelativeTime(t2)`.

### Requirement 5: Inline Drag and Reorder for List Widgets

**User Story:** As a dashboard user, I want to drag rows inside list widgets to reorder them, so that I can curate priority without opening the focused overlay.

#### Acceptance Criteria

1. THE Tasks, Reminders, Chores, Bookmarks, Habits, Portfolio holdings, Stocks watchlist, Weather Outlook cities, and World Clock zones widgets SHALL support pointer-based drag-to-reorder of their list items.
2. WHEN a user completes a drag-and-drop of a row within a list widget, THE widget SHALL persist the new ordering to its backing store and SHALL dispatch the existing store-changed event.
3. THE same widgets SHALL support keyboard reordering: focusing a row and pressing `Space` SHALL pick it up, `ArrowUp`/`ArrowDown` SHALL move it, and `Space` or `Enter` SHALL drop it.
4. WHEN drag-reorder is in progress, THE widget SHALL announce the moving row's position through an `aria-live="polite"` region.
5. IF the user releases the pointer outside the list bounds, THEN THE widget SHALL revert the row to its original position.
6. THE `dragReorderEnabled` InteractivitySetting SHALL default to `true` and SHALL disable all drag-reorder affordances when `false`.
7. THE per-widget `dragReorderEnabled` config field SHALL override the board-level setting when explicitly set.
8. **Correctness property**: After any drag-reorder or keyboard-reorder completes, the resulting list SHALL be a permutation of the original list (same set of row identifiers, no duplicates, no additions, no deletions).

### Requirement 6: Swipe-to-Complete and Swipe-to-Snooze

**User Story:** As a tablet and phone user, I want to swipe task, reminder, and notification rows, so that I can complete or snooze them without hunting for buttons.

#### Acceptance Criteria

1. THE Tasks, Reminders, and NotificationsCenter rows SHALL respond to horizontal touch swipes: swipe-right SHALL complete or acknowledge, swipe-left SHALL snooze or archive.
2. WHILE a swipe is in progress, THE row SHALL render an accent wash proportional to the swipe distance and SHALL reveal an icon indicating the pending action.
3. WHEN a swipe crosses a threshold of 40% of the row width, THE row SHALL commit the action on release; below the threshold, THE row SHALL spring back.
4. WHEN a swipe commits a destructive action (delete, archive), THE widget SHALL emit a DashboardToastBus undo toast as defined in Requirement 18.
5. THE `swipeGesturesEnabled` InteractivitySetting SHALL default to `true` on coarse-pointer devices and `false` on fine-pointer devices, with explicit user override.
6. IF ReducedMotion is enabled, THEN THE swipe animation SHALL use linear transforms only (no overshoot or spring).
7. THE same widgets SHALL provide keyboard equivalents: `Shift+Enter` SHALL complete/acknowledge, `Backspace` SHALL snooze or delete with undo.
8. **Correctness property**: A swipe that does not cross the commit threshold SHALL leave the row's data unchanged.

### Requirement 7: InlineQuickAdd Primitive

**User Story:** As a dashboard user, I want a consistent natural-language quick-add input across list widgets, so that I can add items without opening dialogs.

#### Acceptance Criteria

1. THE InlineQuickAdd primitive SHALL accept `placeholder`, `onSubmit(parsed)`, `parser`, `onDismiss`, and `showShortcutHint` props.
2. THE InlineQuickAdd SHALL render a single-line text field with an inline submit affordance and an optional shortcut hint (for example "⌘N").
3. WHEN the user presses `Enter`, THE InlineQuickAdd SHALL call `parser(text)` and pass the parsed result to `onSubmit`.
4. WHEN the user presses `Escape`, THE InlineQuickAdd SHALL clear the input and call `onDismiss`.
5. THE Tasks, Reminders, Timers, Countdowns (inside Stopwatch), Stocks, Weather Outlook, World Clock, and Bookmarks widgets SHALL use InlineQuickAdd for their add-row control.
6. THE Tasks and Reminders parsers SHALL support natural-language due dates ("tomorrow 9am", "in 30 minutes") and return a structured `{ title, dueAt?, priority? }` object.
7. THE Timers parser SHALL accept shorthand ("10m", "1h30m", "45s") and return `{ durationMs }`.
8. THE Stocks parser SHALL accept a symbol token (alphanumeric, up to eight chars) and return `{ symbol }`.
9. IF parsing fails, THEN THE InlineQuickAdd SHALL show an inline validation hint and SHALL NOT call `onSubmit`.
10. THE `inlineQuickAddEnabled` InteractivitySetting SHALL default to `true`; when `false`, the widgets SHALL fall back to their previous add controls.
11. **Correctness property**: For any input string that the parser accepts, `parser(parser.format(result)) == result` when a `format` inverse is defined (round-trip for the Timer shorthand parser).

### Requirement 8: Long-Press and Right-Click Edit Mode

**User Story:** As a user, I want to long-press or right-click a widget to enter an inline edit mode, so that I can reposition and resize without opening the action menu.

#### Acceptance Criteria

1. WHEN a user long-presses (>450ms) a widget body, THE Dashboard SHALL enter inline edit mode for that widget with a subtle wiggle effect.
2. WHEN a user right-clicks a widget body on a fine-pointer device, THE Dashboard SHALL enter inline edit mode for that widget.
3. WHILE inline edit mode is active, THE widget's action menu SHALL expose move, resize, duplicate, and remove controls; clicking outside SHALL exit edit mode.
4. WHEN AnimationIntensity is `off` or ReducedMotion is enabled, THE wiggle animation SHALL NOT render but edit mode SHALL still activate.
5. THE `longPressEditEnabled` InteractivitySetting SHALL default to `true`; when `false`, long-press and right-click SHALL behave as normal pointer events.
6. IF a user has drag-reorder or swipe-gesture interaction in progress, THEN long-press SHALL NOT trigger edit mode during that interaction.
7. **Correctness property**: Exiting edit mode SHALL leave the widget configuration unchanged unless the user performed an explicit move, resize, duplicate, or remove action.

### Requirement 9: Double-Click to Edit Numbers

**User Story:** As a user, I want to double-click or double-tap a numeric value to edit it inline, so that I can tweak timer durations, share counts, and thermostat setpoints quickly.

#### Acceptance Criteria

1. THE Timers, Pomodoro, Portfolio shares, HaClimate thermostat setpoint, and Habits goal fields SHALL support double-click (desktop) and double-tap (touch) to enter an inline numeric editor.
2. WHILE the inline editor is active, THE field SHALL render an `<input type="number">` (or the HaClimate setpoint stepper), preselect the current value, and accept Enter to commit, Escape to cancel.
3. WHEN the user commits an invalid value (non-numeric, out of range), THE widget SHALL revert to the previous value and SHALL announce the error through `aria-live="polite"`.
4. THE `doubleClickEditEnabled` InteractivitySetting SHALL default to `true`; when `false`, double-click SHALL not activate the inline editor.
5. WHEN a double-click inline edit commits an HaClimate setpoint, THE HaClimate widget SHALL use the OptimisticAction path defined in Requirement 21.
6. **Correctness property**: Cancelling an inline numeric edit SHALL leave the underlying value exactly equal to its pre-edit value.

### Requirement 10: Cross-Widget Drop Intent Bus

**User Story:** As a dashboard user, I want to drag items from one widget and drop them on another to trigger contextual actions, so that widgets feel connected.

#### Acceptance Criteria

1. THE Dashboard SHALL define a `curio:dashboard-item-drop` CustomEvent whose detail includes `{ sourceWidgetId, sourceWidgetType, payload, targetWidgetId, targetWidgetType, position }`.
2. WHEN a user drags a Bookmark row onto a Notes or RichNote widget, THE target widget SHALL append the bookmark URL and title as a new note line.
3. WHEN a user drags a Task row onto a Pomodoro widget, THE Pomodoro widget SHALL set its `linkedTaskId` to the task id and SHALL start a focus session.
4. WHEN a user drags a Stock row onto a Portfolio widget, THE Portfolio widget SHALL open its add-holding inline form with the symbol prefilled.
5. WHEN a user drags a Map pin onto a Commute widget, THE Commute widget SHALL set the destination to the pin's coordinates.
6. WHEN a user drags a News article onto a RichNote or Obsidian widget, THE target SHALL insert the article's title and URL.
7. THE `dropIntentsEnabled` InteractivitySetting SHALL default to `true` and SHALL disable all drop intents when `false`.
8. IF a drop target does not recognize the source payload, THEN THE Dashboard SHALL render a brief "Not supported here" hint via DashboardToastBus and SHALL NOT dispatch any mutation.
9. **Correctness property**: A drop that fails validation SHALL leave both the source and target widget configurations unchanged.

### Requirement 11: Widget Linking Configuration

**User Story:** As a user, I want to explicitly link widgets so one widget can read from another, so that Pomodoro knows my current task and NowPlaying mirrors my music widget.

#### Acceptance Criteria

1. THE DashboardWidgetConfig SHALL include optional `linkedTaskId`, `linkedCommuteId`, `linkedMusicWidgetId`, and `linkedWidgetIds` (generic array) fields.
2. THE Pomodoro widget SHALL render the linked task's title and progress when `linkedTaskId` resolves to an existing task.
3. THE Map widget SHALL render the linked commute's route summary when `linkedCommuteId` resolves to an existing commute.
4. THE NowPlaying widget SHALL reflect the linked music widget's playback state when `linkedMusicWidgetId` resolves to an existing Music, Spotify, or HaMediaPlayer widget.
5. WHEN a linked widget is deleted, THE referencing widget SHALL clear the stale LinkedWidgetId on its next render and SHALL NOT crash.
6. THE widget settings sheet for linkable widgets SHALL expose a link picker populated from the current dashboard page's widgets.
7. THE curioBackupService SHALL include LinkedWidgetId references in full backups.
8. **Correctness property**: Resolving a LinkedWidgetId SHALL return either a live widget matching the id or `null`; it SHALL NEVER return a widget with a different id.

### Requirement 12: Dashboard Hover and Selection Bus

**User Story:** As a user, I want related widgets to highlight when I hover one widget, so that I can see connected context at a glance.

#### Acceptance Criteria

1. THE Dashboard SHALL define `curio:dashboard-hover` and `curio:dashboard-select` CustomEvents whose detail includes `{ widgetId, itemKind, itemId }`.
2. WHEN a user hovers a calendar event, THE Calendar widget SHALL dispatch a hover event with `itemKind="calendar-event"` and `itemId=<eventId>`; THE Mail widgets SHALL highlight threads whose participants match the event attendees.
3. WHEN a user hovers a Task with a due date, THE Tasks widget SHALL dispatch a hover event; THE Calendar widgets SHALL highlight the matching day cell.
4. WHEN the hover ends, THE Dashboard SHALL dispatch a hover event with `itemId=null` and all highlights SHALL clear.
5. THE `hoverSelectionBusEnabled` InteractivitySetting SHALL default to `true`; when `false`, no hover events SHALL be dispatched and no highlights SHALL render.
6. WHEN AnimationIntensity is `off`, THE highlights SHALL render as static outline only (no pulse).
7. **Correctness property**: The set of highlighted widgets after a hover-end event SHALL be empty.

### Requirement 13: Expanded Mini-Editors in Focused Overlay

**User Story:** As a user, I want widgets to expose richer editors when expanded, so that I can do detailed work without leaving the dashboard.

#### Acceptance Criteria

1. THE DashboardFocusedWidgetOverlay SHALL pass `focused={true}` to the rendered widget and SHALL allocate the larger grid/pixel dimensions already defined in the overlay.
2. THE Stocks widget SHALL render a multi-timeframe chart (1D, 1W, 1M, 3M, 1Y, 5Y), symbol reorder, and alert rules editor when `focused` is `true`.
3. THE Portfolio widget SHALL render lot-level editing, dividend tracking, and a rebalance helper when `focused` is `true`.
4. THE Weather widget SHALL render an hourly strip, radar tile toggles, and saved locations when `focused` is `true`.
5. THE Calendar widget SHALL render week and month grid views with inline event creation when `focused` is `true`.
6. THE Mail, Gmail, and OutlookMail widgets SHALL render a full thread reader with an inline reply draft when `focused` is `true`.
7. THE Habits widget SHALL render a month heatmap with tap-to-toggle day cells when `focused` is `true`.
8. THE Tasks widget SHALL render subtasks, notes, a due-date picker, and drag across sections when `focused` is `true`.
9. IF any of the listed focused editors fails to load its data, THEN THE expanded widget SHALL render a WidgetInlineError with a retry action (Requirement 23).
10. **Correctness property**: Any mutation committed inside the focused editor SHALL persist through the same store used by the compact widget, and closing the overlay SHALL render the compact widget with the updated data.

### Requirement 14: useWidgetPersistentState Hook

**User Story:** As a user, I want per-widget UI state like collapse, tab selection, and view mode to survive reloads, so that the board remembers my preferences.

#### Acceptance Criteria

1. THE hooks module SHALL export `useWidgetPersistentState<T>(widgetId, key, initial)` that returns a `[value, setValue]` tuple backed by localStorage under `curio_widget_state_<widgetId>_<key>`.
2. WHEN `setValue` is called, THE hook SHALL persist the new value synchronously and SHALL dispatch `curio:settings-changed` same-tab.
3. WHEN the component unmounts, THE hook SHALL NOT delete the stored value.
4. WHEN a widget is deleted via the dashboard, THE DashboardSettings module SHALL remove all persistent-state entries whose key prefix matches the deleted widget id.
5. THE hook SHALL JSON-serialize the value and SHALL fall back to `initial` when stored data is malformed.
6. THE curioBackupService SHALL include widget persistent-state entries in full backups.
7. **Correctness property**: After `setValue(v)` is called and the component remounts with the same `widgetId` and `key`, `useWidgetPersistentState` SHALL return `v` as its current value.

### Requirement 15: Per-Widget Pinning

**User Story:** As a user, I want to pin favorite items inside widgets, so that they float to the top of lists.

#### Acceptance Criteria

1. THE Mail, YouTube, HaEntities, and News widgets SHALL support pinning individual items.
2. WHEN a user pins an item, THE widget SHALL store the item id in a persistent `pinnedItemIds` array through `useWidgetPersistentState`.
3. WHEN a widget renders its list, THE widget SHALL sort pinned items to the top in the order they were pinned (oldest first).
4. WHEN a user unpins an item, THE widget SHALL remove the id from `pinnedItemIds`.
5. THE `widgetPinningEnabled` InteractivitySetting SHALL default to `true`; when `false`, no pin affordance SHALL render and existing pinned items SHALL render in their natural order until the user pins again.
6. **Correctness property**: Pinning an already-pinned item SHALL be a no-op (idempotent); `pinnedItemIds` SHALL contain no duplicates.

### Requirement 16: DashboardToastBus for Undo

**User Story:** As a user, I want a quick undo after destructive in-widget actions, so that I can recover from mistakes without opening a full dialog.

#### Acceptance Criteria

1. THE Dashboard SHALL mount a shared DashboardToastBus that renders transient toasts with an optional `Undo` action.
2. WHEN a widget deletes a task, reminder, bookmark, portfolio holding, stock row, or notification, THE widget SHALL call `dashboardToastBus.showUndo({ label, onUndo, durationMs: 5000 })`.
3. WHEN the user clicks `Undo` within the duration, THE DashboardToastBus SHALL invoke `onUndo` exactly once and SHALL dismiss the toast.
4. WHEN the duration elapses without click, THE toast SHALL dismiss and `onUndo` SHALL NOT be called.
5. THE `undoToastsEnabled` InteractivitySetting SHALL default to `true`; when `false`, destructive actions SHALL commit immediately without a toast.
6. WHEN multiple undo toasts are queued, THE DashboardToastBus SHALL render them stacked (max three visible) and SHALL keep separate `onUndo` callbacks.
7. **Correctness property**: For any destructive action A followed immediately by `Undo`, the dashboard state after undo SHALL equal the dashboard state observed immediately before A (same task list, same reminder list, same portfolio holdings, same pinned items, etc.).

### Requirement 17: Optimistic State with Rollback

**User Story:** As a user, I want HA toggles, task completions, and email archives to feel instant, so that the dashboard reflects my intent even over slow networks.

#### Acceptance Criteria

1. THE HaWidgetApi, Tasks, Reminders, Gmail, OutlookMail, Mail widgets SHALL apply state changes to their local cache before the backing service confirms.
2. WHILE an optimistic request is in flight, THE affected row or control SHALL render a subtle syncing ring indicator.
3. IF the backing request fails, THEN THE widget SHALL revert the optimistic change, SHALL render a short shake animation, and SHALL emit a DashboardToastBus error toast with a retry action.
4. WHEN the backing request succeeds, THE widget SHALL remove the syncing ring and SHALL merge the server response into its local cache.
5. THE `optimisticActionsEnabled` InteractivitySetting SHALL default to `true`; when `false`, widgets SHALL wait for server confirmation before updating visible state.
6. WHEN AnimationIntensity is `off` or ReducedMotion is enabled, THE shake-on-rollback SHALL be replaced by a static red outline that fades after 600ms.
7. **Correctness property**: For an optimistic action that fails, the widget's visible state after rollback SHALL equal its visible state immediately before the action.

### Requirement 18: WidgetSkeleton Primitive

**User Story:** As a user, I want widgets to show a layout-matching skeleton on first load, so that the board does not jump when data arrives.

#### Acceptance Criteria

1. THE widgetPrimitives barrel SHALL export a WidgetSkeleton component that renders the widget's final layout with neutral placeholder blocks.
2. WHEN a widget is in its first-load state (no cached data), THE widget SHALL render WidgetSkeleton instead of its regular body.
3. WHEN a widget has cached data and is refreshing, THE widget SHALL continue rendering the cached data (no skeleton) and SHALL surface the stale-while-revalidate sheen from Requirement 24.
4. THE WidgetSkeleton SHALL not animate when AnimationIntensity is `off` or ReducedMotion is enabled.
5. **Correctness property**: The WidgetSkeleton's outer dimensions SHALL equal the WidgetBody's rendered dimensions for the same `frameInfo`.

### Requirement 19: Global MotionConfig and Animation Intensity

**User Story:** As a user, I want to tune dashboard motion globally, so that I can make the board calmer without fully disabling motion.

#### Acceptance Criteria

1. THE Dashboard SHALL wrap its widget tree in a Framer Motion `MotionConfig` boundary.
2. THE DashboardBoardPreferences SHALL include an `animationIntensity` field with values `off`, `subtle`, and `full`, defaulting to `full`.
3. WHEN `animationIntensity` is `off`, THE MotionConfig SHALL set `reducedMotion="always"` and all new motion features introduced by this feature SHALL render static fallbacks.
4. WHEN `animationIntensity` is `subtle`, THE MotionConfig SHALL use `reducedMotion="user"` and new motion features SHALL cap durations at 200ms and omit scale/bounce transforms.
5. WHEN `animationIntensity` is `full`, THE MotionConfig SHALL allow full motion subject to the user's system reduced-motion preference.
6. WHEN ReducedMotion is enabled at the OS level, THE motion behavior SHALL match `animationIntensity="off"` regardless of the selected value.
7. THE CurioSettingsModal Dashboard section SHALL expose the animation-intensity selector in the Interactivity sub-section.
8. **Correctness property**: For any widget animation introduced by this feature, when `animationIntensity === "off"` or ReducedMotion is enabled, the animation SHALL complete synchronously (zero transition time).

### Requirement 20: FreshnessDot and Live Status

**User Story:** As a user, I want a live status dot that expresses whether a widget is fresh, idle, stale, or errored, so that I can see trust at a glance.

#### Acceptance Criteria

1. THE WidgetShell SHALL render a FreshnessDot whose color and animation reflect the widget's live status: `fresh` (pulsing accent) when updated within 30s, `idle` (dim accent) between 30s and the refresh interval, `stale` (amber) past the interval, and `error` (red) on the last refresh failure.
2. WHEN a widget is in `error` state, THE WidgetShell SHALL render a retry chip adjacent to the FreshnessDot that dispatches the same refresh event as the action menu's "Refresh now".
3. WHEN `showRefreshMetadata` is `false` on a widget, THE FreshnessDot SHALL NOT render.
4. THE `freshnessDotEnabled` InteractivitySetting SHALL default to `true`; when `false`, the FreshnessDot SHALL NOT render even when refresh metadata is visible.
5. WHEN AnimationIntensity is `off` or ReducedMotion is enabled, THE `fresh` state SHALL render as a static dot without a pulse.
6. **Correctness property**: At any given time, the FreshnessDot SHALL render exactly one of `fresh`, `idle`, `stale`, or `error` (mutually exclusive).

### Requirement 21: WidgetInlineError Primitive

**User Story:** As a user, I want failing widgets to show an inline error with retry, so that I can fix problems without opening settings.

#### Acceptance Criteria

1. THE widgetPrimitives barrel SHALL export a WidgetInlineError component with `message`, `onRetry`, and `onOpenSettings` props.
2. WHEN a widget's refresh fails, THE widget SHALL render WidgetInlineError inside its body, preserving the widget header.
3. WHEN the user clicks Retry, THE widget SHALL dispatch its refresh event and SHALL clear the error on success.
4. WHEN the user clicks Open Settings, THE Dashboard SHALL call `onOpenWidgetSettings(widgetId)`.
5. WHEN the widget's `showRefreshMetadata` is enabled, THE FreshnessDot SHALL reflect the error state simultaneously (Requirement 20).
6. **Correctness property**: After a successful retry, the widget SHALL transition out of the error state and SHALL NOT render WidgetInlineError.

### Requirement 22: Stale-While-Revalidate Sheen

**User Story:** As a user, I want a subtle top-edge sheen when a widget refreshes in the background, so that I can see activity without data flickering.

#### Acceptance Criteria

1. WHEN a widget begins a background refresh (cached data still visible), THE WidgetShell SHALL render a top-edge sheen that sweeps left-to-right across the card border.
2. WHEN the refresh completes (success or error), THE sheen SHALL fade out within 400ms.
3. THE `staleRevalidateSheenEnabled` InteractivitySetting SHALL default to `true`; when `false`, no sheen SHALL render.
4. WHEN AnimationIntensity is `off` or ReducedMotion is enabled, THE sheen SHALL NOT render.
5. **Correctness property**: The sheen SHALL NOT render while the widget is in first-load state (WidgetSkeleton is active).

### Requirement 23: Dashboard Command Palette (⌘K / Ctrl+K)

**User Story:** As a user, I want a command palette scoped to the dashboard, so that I can jump to widgets, run quick actions, and add content by typing.

#### Acceptance Criteria

1. WHEN the user presses `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux), THE Dashboard SHALL open the DashboardCommandPalette modal.
2. THE DashboardCommandPalette SHALL search across four groups: on-board widgets, widget catalog (for adding), quick actions (for example "add a stock AAPL", "set timer 10m", "toggle kitchen lights"), and recent cards.
3. WHEN the user selects an on-board widget result, THE Dashboard SHALL scroll the widget into view and SHALL apply a focus ring for 1200ms.
4. WHEN the user selects a catalog result, THE Dashboard SHALL dispatch `curio:dashboard-widget-intent` through `useDashboardWidgetIntents` to add the widget.
5. WHEN the user selects a quick-action result, THE Dashboard SHALL dispatch the corresponding action (timer add, stock add, HA service call).
6. THE DashboardCommandPalette SHALL support full keyboard navigation (arrow keys to move, Enter to commit, Escape to dismiss) and SHALL restore focus to the previously focused element on close.
7. THE `commandPaletteEnabled` InteractivitySetting SHALL default to `true`; when `false`, the keyboard shortcut SHALL be ignored and the palette SHALL NOT open.
8. THE shortcut SHALL be ignored while focus is inside a text-editable UI element.
9. **Correctness property**: Opening and closing the palette without selecting a result SHALL leave the dashboard widget list and configurations unchanged.

### Requirement 24: Dashboard Layout Presets

**User Story:** As a user, I want to save, name, export, and import dashboard page layouts, so that I can switch between Morning, Focus, and Weekend configurations.

#### Acceptance Criteria

1. THE dashboardSettings module SHALL expose `getDashboardLayoutPresets(profileId)`, `saveDashboardLayoutPreset(profileId, preset)`, `deleteDashboardLayoutPreset(profileId, presetId)`, `exportDashboardLayoutPreset(preset): string`, and `importDashboardLayoutPreset(json): LayoutPreset` helpers.
2. THE LayoutPreset SHALL contain `{ id, name, category, pageAppearance, widgets, createdAt }` and SHALL pass through the same normalization as stored dashboard pages.
3. WHEN the user saves a preset, THE CurioSettingsModal SHALL list it grouped by category (Morning, Focus, Weekend, Custom).
4. WHEN the user applies a preset, THE Dashboard SHALL replace the active page's widgets and appearance with the preset's contents and SHALL emit an undo toast as defined in Requirement 16.
5. WHEN the user imports malformed JSON, THE `importDashboardLayoutPreset` helper SHALL throw a descriptive error and the caller SHALL show an inline validation message.
6. THE `exportDashboardLayoutPreset` and `importDashboardLayoutPreset` helpers SHALL round-trip: for any valid preset `p`, `importDashboardLayoutPreset(exportDashboardLayoutPreset(p))` SHALL return an object equivalent to `p` (same widget set, same appearance).
7. THE curioBackupService SHALL include saved LayoutPresets in full backups.
8. **Correctness property**: Exporting then importing any valid preset SHALL produce a preset whose normalized contents equal the normalized contents of the original (round-trip property).

### Requirement 25: Insights Widget Actions

**User Story:** As a user, I want Insights items to be tappable, so that I can jump to my top widget or review my least-used ones.

#### Acceptance Criteria

1. WHEN the user taps "top widget" in the Insights widget, THE Insights widget SHALL dispatch `curio:dashboard-scroll-to-widget` with the top widget's id.
2. WHEN the user taps "least used widget" in the Insights widget, THE Insights widget SHALL open the widget's action menu in delete-confirm state.
3. IF the referenced widget no longer exists on the active page, THEN THE Insights widget SHALL show a brief "Widget no longer on this page" toast via DashboardToastBus.
4. THE `insightsActionsEnabled` InteractivitySetting SHALL default to `true`; when `false`, Insights rows SHALL render as non-interactive text.
5. **Correctness property**: Tapping Insights actions SHALL NOT mutate widget configurations on its own; only the subsequent user confirmation SHALL mutate state.

### Requirement 26: Accessibility Announcements for Fresh Data

**User Story:** As a user with assistive technology, I want updated numeric widgets to announce changes politely, so that I can track live data without visual scanning.

#### Acceptance Criteria

1. THE WidgetShell SHALL include an `aria-live="polite"` region for widgets that render rolling numeric data.
2. WHEN a rolling number updates, THE WidgetShell SHALL update the `aria-live` region with a short text ("Stocks AAPL 187.42") once per update, coalesced over a 2-second window per widget.
3. WHEN `rollingNumbersEnabled` is `false`, THE `aria-live` region SHALL still announce the new value on refresh but SHALL NOT animate.
4. THE aria-live region SHALL be hidden visually (`sr-only`) and SHALL remain accessible to screen readers.
5. THE `ariaLiveUpdatesEnabled` InteractivitySetting SHALL default to `true`; when `false`, no aria-live announcement SHALL fire.
6. **Correctness property**: Within any 2-second window, at most one aria-live announcement per widget SHALL be emitted.

### Requirement 27: WidgetIconButton Primitive with 44px Targets

**User Story:** As a kiosk and touch user, I want every icon button to have a 44px minimum hit target, so that I can tap accurately on tablets and wall panels.

#### Acceptance Criteria

1. THE widgetPrimitives barrel SHALL export a WidgetIconButton component that renders a `<button>` with `min-width: 44px`, `min-height: 44px`, accessible label, and focus ring styles.
2. THE Tasks, Reminders, Chores, Bookmarks, Habits, Pomodoro, Timers, Stocks, Portfolio, and HA action widgets SHALL use WidgetIconButton for their in-card icon controls.
3. WHEN the widget body is smaller than 200px in either dimension, THE WidgetIconButton SHALL relax its minimum size to 36px while keeping the same focus styles.
4. THE WidgetIconButton SHALL forward `aria-label`, `disabled`, and `onClick` props.
5. **Correctness property**: Every WidgetIconButton instance SHALL have a non-empty `aria-label` or visible text; a missing label SHALL raise a development-mode warning.

### Requirement 28: Explicit Keyboard Contract for List Widgets

**User Story:** As a keyboard user, I want a consistent keyboard contract inside list widgets, so that I can navigate and manage items without a mouse.

#### Acceptance Criteria

1. WHEN focus enters a list widget via Tab, THE widget SHALL move focus to its first actionable row.
2. WHILE focus is inside a list widget, THE `ArrowUp` and `ArrowDown` keys SHALL move focus between rows and SHALL NOT scroll the page.
3. WHEN the user presses `Enter` on a row, THE widget SHALL activate the row's primary action (open task detail, open bookmark, play stock sparkline, etc.).
4. WHEN the user presses `Backspace` on a row, THE widget SHALL delete the row and SHALL emit a DashboardToastBus undo toast (Requirement 16).
5. WHEN the user presses `Escape` within an inline editor (quick-add, double-click edit, long-press edit), THE widget SHALL exit the editor without committing.
6. THE keyboard contract SHALL apply uniformly across Tasks, Reminders, Chores, Bookmarks, Habits, Portfolio, Stocks, Weather Outlook, World Clock, Notifications, Mail, and News widgets.
7. **Correctness property**: Pressing `Escape` in any inline editor SHALL NOT mutate the widget's stored data.

### Requirement 29: Widget-Specific Wins

**User Story:** As a user, I want specific widgets to get targeted polish (real-time seek bars, breathing rings, animated streaks, value morphs, drag-offset previews, pinch-zoom, TTS word highlighting), so that each widget feels crafted.

#### Acceptance Criteria

1. THE NowPlaying widget SHALL render a seek bar that advances in real time while a track is playing, synced to the underlying player's current position every 250ms, and SHALL NOT advance while paused.
2. THE Pomodoro widget SHALL render a breathing ring animation matching the current session phase and SHALL play an audio/voice chime on session end, honoring the existing notification chime setting.
3. THE Habits widget SHALL render a tap-to-toggle day cell with a subtle burst animation on toggle and SHALL animate the streak count tick upward when it increases.
4. THE AirQuality widget SHALL morph its value smoothly between updates using WidgetCounter (Requirement 1) instead of a snap replace.
5. THE Stocks and Portfolio widgets SHALL support per-row tap that cycles through value, percent change, and day-change modes, persisted through `useWidgetPersistentState`.
6. THE WorldClock widget SHALL support dragging the clock face to preview a time offset live; releasing SHALL restore the true time.
7. THE ImageGallery widget SHALL support pinch-to-zoom inside DashboardFocusedWidgetOverlay and swipe in the compact tile.
8. THE RichNote widget SHALL highlight the word currently being spoken during TTS playback or being dictated, using `ttsProgress` events.
9. Every widget-specific win listed above SHALL be guarded by a per-widget setting (for example `seekBarLiveSyncEnabled`, `breathingRingEnabled`, `valueMorphEnabled`, `clockOffsetPreviewEnabled`, `pinchZoomEnabled`, `ttsWordHighlightEnabled`) that defaults to `true` and respects AnimationIntensity and ReducedMotion.
10. **Correctness property (WorldClock)**: Releasing a clock-offset drag SHALL restore the displayed time to within 1 second of the real current time; the drag SHALL NOT modify the widget's persisted time zone.
11. **Correctness property (Stocks/Portfolio cycle)**: The display-mode state machine SHALL cycle `value -> percent -> dayChange -> value` and SHALL persist across reloads through `useWidgetPersistentState`.

### Requirement 30: Interactivity Settings Surface and Persistence

**User Story:** As a user, I want a clear Interactivity sub-section in Dashboard settings, so that I can toggle every new behavior individually with a single change.

#### Acceptance Criteria

1. THE CurioSettingsModal Dashboard section SHALL render a new "Interactivity" sub-section that exposes toggles for: `animationIntensity`, `ambientPulseEnabled`, `freshnessDotEnabled`, `staleRevalidateSheenEnabled`, `swipeGesturesEnabled`, `longPressEditEnabled`, `doubleClickEditEnabled`, `commandPaletteEnabled`, `dropIntentsEnabled`, `hoverSelectionBusEnabled`, `undoToastsEnabled`, `widgetPinningEnabled`, `relativeTimeHintsEnabled`, `rollingNumbersEnabled`, `inlineQuickAddEnabled`, `dragReorderEnabled`, `optimisticActionsEnabled`, `insightsActionsEnabled`, `ariaLiveUpdatesEnabled`, and `sparklineHistoryEnabled`.
2. THE dashboardSettings module SHALL expose `getDashboardInteractivitySettings()`, `setDashboardInteractivitySettings(patch)`, and `useDashboardInteractivitySettings()` through the standard get/set/use pattern.
3. WHEN any interactivity setting changes, THE dashboardSettings setter SHALL persist the value, dispatch a `storage` event, and dispatch a `curio:settings-changed` event same-tab.
4. THE dashboardSettings module SHALL include a settings migration that adds the Interactivity defaults for existing profiles without overwriting any user-set values.
5. THE per-widget `DashboardWidgetConfig` SHALL accept optional overrides for every board-level toggle where per-widget opt-out is useful (`ambientPulseEnabled`, `freshnessDotEnabled`, `swipeGesturesEnabled`, `dragReorderEnabled`, `rollingNumbersEnabled`, `widgetPinningEnabled`, `seekBarLiveSyncEnabled`, `breathingRingEnabled`, `valueMorphEnabled`, `clockOffsetPreviewEnabled`, `pinchZoomEnabled`, `ttsWordHighlightEnabled`).
6. THE per-widget override SHALL win over the board-level setting when explicitly set (not undefined).
7. THE CurioSettingsModal widget-settings sheet SHALL expose the relevant per-widget overrides for each supporting widget.
8. **Correctness property**: For any toggle T with board value B and per-widget value W, the effective behavior of widget for T SHALL equal W if W is defined, otherwise B.

### Requirement 31: Backup and Restore Coverage

**User Story:** As a user, I want all new persisted data from this feature to survive backup and restore, so that I do not lose sparkline history, pinned items, linked widget IDs, persistent widget state, or layout presets.

#### Acceptance Criteria

1. THE curioBackupService SHALL include in every full backup: InteractivitySettings, SparklineHistory entries, per-widget `pinnedItemIds`, LinkedWidgetIds on widget configs, `useWidgetPersistentState` entries, and saved LayoutPresets.
2. WHEN a backup is restored, THE curioBackupService SHALL restore each of the listed items and SHALL dispatch the corresponding `curio:settings-changed` event so open widgets re-render.
3. IF a backup was produced by a version that lacks a newly introduced key, THEN THE restore SHALL fall back to the default value for that key without failing the whole restore.
4. THE curioBackupService tests SHALL cover every new key with an include and a restore assertion.
5. **Correctness property**: For any dashboard state D, `restore(backup(D))` SHALL produce a dashboard state equivalent to D for all fields persisted by this feature (round-trip property).

### Requirement 32: Home Assistant Ingress and Docs Maintenance

**User Story:** As a Home Assistant user and contributor, I want this feature to keep ingress working and keep docs current, so that the dashboard runs inside HA panels and future agents can find accurate guidance.

#### Acceptance Criteria

1. THE feature SHALL NOT introduce absolute URL paths; every asset reference SHALL remain relative to `import.meta.env.BASE_URL`.
2. THE feature SHALL NOT introduce new required backend services; any optional proxies SHALL be guarded and SHALL degrade gracefully when unavailable.
3. THE feature SHALL update `docs/dashboard.md` with sections covering the Interactivity sub-section, shared primitives (WidgetCounter, WidgetSkeleton, WidgetInlineError, WidgetIconButton, InlineQuickAdd), the command palette, layout presets, and per-widget interactivity overrides.
4. THE feature SHALL update `PROJECT.md` to reference the new shared primitives, the DashboardToastBus, the DashboardCommandPalette, layout presets, and the Interactivity settings sub-module.
5. THE feature SHALL update `AGENTS.md` under "Dashboard Widgets" with rules for composing the new primitives, respecting InteractivitySettings, and routing toasts and drop intents.
6. **Correctness property**: Any new environment variable, proxy, or required service introduced by this feature SHALL cause a pre-commit documentation check to fail (there should be none).
