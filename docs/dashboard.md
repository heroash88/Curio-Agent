# Dashboard and Widgets

The dashboard is Curio's persistent information surface. It keeps the assistant useful while idle, listening, or running routines.

## Board Modes

### Grid Layout

Grid layout gives predictable widget packing. It is best for tablets, wall panels, and shared household dashboards.

Capabilities:

- Drag and resize widgets.
- Snap widgets to the grid.
- Preserve stable widget dimensions.
- Fit widgets into smaller mobile layouts.
- Use per-widget min/max size bounds.
- Use fixed desktop dashboard tracks so a 1x2, 2x2, or larger widget keeps the
  same card proportions while the board adds or removes columns around it.

### Freeform Canvas

Freeform layout lets the user place widgets more like a canvas. It is best for desktop dashboards and custom command centers.

Capabilities:

- Free placement with optional snap.
- Layering and z-order behavior.
- Board background and accent controls.
- Fixed dashboard-space widget rectangles so saved freeform positions do not
  stretch or shrink when the browser window is resized.
- Robot Face starts in a fixed floating overlay by default. The Float action
  in the widget's 3-dot menu or widget settings can toggle it back to the
  board, and the overlay stays on screen while the user scrolls or switches
  dashboard pages. The floating shell has a hover/focus resize corner that
  can grow the face up to the visible viewport while keeping it on screen.
  Floating Motion can be set to Still, Idle only, or Full wander; autonomous
  moves are temporary above-board inspect/perch/peek visits, respect reduced
  motion, pause during interaction or bubbles, and return smoothly to the
  saved position. Optional per-type
  proactive bubbles cover email, direct messages, calendar, reminders,
  system alerts, widget data, and companion comments while editing or typing.
- Reduced-motion mode.

## Dashboard Controls

The board controls menu gives quick access to dashboard-level settings without opening the full settings modal:

- Dashboard pages: add empty pages, rename, remove, switch, and reorder named
  pages such as Home, Work, or Productivity.
- Page switcher visibility for users who want the toolbar even quieter.
- Page keyboard shortcut enablement for `[` and `]`. Shortcuts are ignored while
  focus is in text-editable UI.
- Global widget glow. Glow starts off by default and can be enabled for the
  whole board from dashboard settings or board controls. Individual widgets can
  opt out from the widget action menu or widget settings.
- Per-page theme, accent, glass, and background controls. Dashboard settings and
  board controls also expose a glassy-feel intensity slider for the shared glass
  variables.
- AI Theme Generator prompts in board controls and Settings can restyle the
  active page from natural language, including explicit light/dark requests,
  custom accent colors, glass settings, and animated background effects. Reset
  Theme clears the active page overrides. The same behavior is exposed to voice
  and text AI through `generate_dashboard_theme` and `reset_dashboard_theme`.
  Novel animated prompts use a structured generated animation spec that is
  rendered by Curio's canvas engine rather than executing arbitrary generated
  code. Generated specs may include weather, elemental, and cinematic effects
  such as fire, embers, snow, rain, lightning, fog, bubbles, nebula, wormhole,
  radar, scanline, data storm, constellation, and energy ribbon layers with safe
  controls for opacity, blending, depth, trails, pulse, turbulence, and blur.
- Layout mode.
- Snap-to-grid.
- Reduced motion.
- Board reset/restore actions.
- Visual system preferences.

Dashboard pages are profile-scoped. Each page owns its own widget set and
positions plus its own visual appearance: light/dark theme, accent, glass
effect, background, and optional animated background preset. Animated page
backgrounds are canvas-rendered behind the full dashboard surface and currently
support Matrix rain, particle mesh, waves, starfield, aurora, plasma, and neon
grid effects. The built-in animated backgrounds are selectable from board
controls and Dashboard settings, and AI can create generated variants for
families such as fire, snow, rain, lightning, fog, embers, bubbles, nebula,
wormholes, and data storms by choosing effect kind, palette, density, speed,
complexity, shape, direction, glow, and optional layered cinematic effects.
They unmount when reduced motion is enabled. Newly added pages start with no
widgets so the user can build them intentionally. Board preferences such as
layout mode, snap-to-grid, widget glow, glass intensity, page switcher
visibility, page keyboard shortcuts, and reduced motion remain shared for the
active profile. Existing single-layout storage migrates into one default
Dashboard page, and the legacy layout helpers continue to operate on the
active page.

### AI theme prompt examples

Users can ask these through voice, the AI Chat widget, board controls, or
Settings > Dashboard > AI Theme Generator:

- "Make my dashboard a dark volcanic command center with realistic fire,
  smoke, orange glass, and glowing embers behind every widget."
- "Create a calm light-mode snowfall dashboard with icy blue accents, soft
  white glass cards, drifting snow, and gentle fog."
- "Turn this into a rainy cyberpunk night dashboard with neon reflections,
  diagonal rain streaks, electric purple highlights, and occasional lightning."
- "Give me an underwater research lab theme with teal glass, rising bubbles,
  slow wave caustics, and bright readable widgets."
- "Make a thunderstorm operations dashboard: dark mode, storm clouds, blue
  lightning bolts, wet glass, and high contrast text."
- "Create a cozy fireplace dashboard with warm amber glass, slow embers,
  subtle smoke, and no harsh red background."
- "Make it a winter aurora theme in light mode with pale green accents,
  snowfall, mist, and glassy white widgets."
- "Turn my dashboard into a deep-space wormhole with star trails, violet and
  cyan glow, layered particles, and dark readable cards."
- "Make a Matrix terminal dashboard with animated digital rain, black glass,
  green accents, and dense code-like motion."
- "Reset the dashboard theme back to the default look."

Widget glass chrome applies to regular card-style widgets, including Music.
YouTube, Sketch, Home Assistant Camera, and Map keep their full-bleed treatment
and do not receive the per-widget glass controls. Widget glow applies at the
frame level for all widgets unless disabled per widget.

## Dashboard Search

Dashboard search is contextual. It searches the widgets already on screen and returns useful information from them rather than only finding widgets to add.

Examples:

- Searching `weather` can show the current weather result and focus the Weather widget.
- Searching `calendar` can surface the schedule widget.
- Searching a note, table value, task, or widget title can jump to the matching widget.

Selecting a result closes the search panel, scrolls the widget into view, and applies a rounded focus effect.

## Refresh Modes

Live widgets can avoid over-polling by choosing a refresh strategy:

- **Push**: use provider updates when available. Home Assistant camera widgets
  use this mode for shared live camera frames with quick snapshot fallback.
- **Timed**: poll on a configured interval.
- **Manual**: refresh only from the widget control.
- **Refresh on focus**: refresh when the app/window regains focus.
- **Metadata**: optionally show last refresh state on the card.

Refresh settings live in widget settings and shared dashboard refresh helpers.

## Widget Catalog

Notion-backed widgets require the Notion Workspace MCP preset to be connected
and enabled in Accounts & Keys. `Notion Notes` and `Notion Projects` call the
Notion MCP search tool directly through `notionMcpWidgetService`, normalize
page/database results into dashboard rows, and use each widget's Notion source
query to choose what to show. Widget settings can fetch candidate Notion notes
or projects and save a selected source, and widget rows open a pulled MCP
detail view inside Curio with a separate external Notion link when available.

Zapier-backed dashboard providers require the Zapier Actions MCP preset to be
connected and enabled, with the relevant Zapier actions exposed in Zapier MCP.
`zapierMcpWidgetService` discovers the enabled Zapier MCP server, chooses
email, calendar, task, or note actions by tool name/description, and normalizes
flexible Zapier responses for the Mail, Calendar, Tasks, and Notes widgets.
These providers stay explicit: select `zapier` in widget settings and add an
optional query such as `inbox`, `today`, `open tasks`, or `meeting notes`.

Mail, Calendar, Tasks, Notes, and Messages also offer a generic **`mcp`**
provider for any enabled general (non-search) external MCP server. The widget
settings expose an MCP server dropdown (populated from
`getEnabledGenericMcpServers()`) and an optional query/channel input so users
can point a widget at a specific server without picking it up from the first
enabled match. This powers internal/company MCP stacks like an amzn-mcp stdio
server that expose Slack, email, and calendar tools under their own names.
The dispatch goes through the same server-aware helpers in
`zapierMcpWidgetService.ts` (`listMcpMailMessages`, `listMcpCalendarEvents`,
`listMcpWidgetItems`, `listMcpMessages`, etc.). Create/reply/compose stays
disabled for `mcp` because the upstream tool contracts vary; read/list paths
are supported.

### Personal

| Widget | Purpose |
| --- | --- |
| Profile | Operator identity, recognition source, and actionable focus/open/away/offline modes. |
| Daily Summary | Overview of weather, calendar, tasks, notifications, devices, and routines. |
| Activity | Steps, movement, exercise, stand, and heart-style stats. |
| Greeting | Greeting, user name, and date. |
| Habits | Daily habit tracking and streaks. |
| Insights | Local dashboard analytics for dashboard time, AI messages, response cards, widget taps, visits, top widget, active hour, focus score, and weekly trend. |

### Productivity

| Widget | Purpose |
| --- | --- |
| Tasks | Internal tasks with quick add, priority, edit, complete, and a separate task store. |
| Chores | Household chore list with categories, timing, priorities, and a separate chores store. |
| Google Tasks | Google Tasks list with add, complete, and delete controls. |
| Calendar | Auto/provider-selected calendar agenda, including explicit Zapier MCP actions. |
| Google Calendar | Agenda pinned to Google Calendar. |
| Outlook Calendar | Agenda pinned to Outlook Calendar. |
| iCal Calendar | Read-only agenda from imported `.ics` or `.ical` files. |
| Reminders | Curio reminders. |
| Notes | Internal notes. |
| Sticky Note | Rich note with pasted formatted text and IndexedDB-backed images. |
| Table | Editable table with pasted rich tables, formulas, styling, sorting, CSV export, and row/column tools. |
| Obsidian Notes | Recent notes written to Obsidian from Curio. |
| Timers | Timers, alarms, and countdowns. |
| Alarms | Alarm-focused timer widget. |
| Countdowns | Countdown-focused timer widget. |
| Pomodoro | Focus timer with work/break intervals. |
| Stocks | Market watch list with quote refresh and company/ticker search through same-origin market data proxies. Firebase Hosting deploys mirror the Vite `/stock-proxy` and `/stooq-proxy` routes through Firebase Functions. |
| Portfolio | Holdings tracker with share counts, total value, daily gain/loss, per-holding rows that toggle between holding total and current share price, and Day/W/M/3M/YTD/1Y/5Y historical value chart. Uses Yahoo history first, Stooq daily history fallback when Yahoo is rate limited, and range-labeled estimates when market history is unavailable. Compact sizes hide holding rows first, then the chart, and the 1x1 tile shows only fitted total value plus up/down movement. Firebase Hosting uses the same Functions-backed market proxies as Stocks. |
| Freeform | Sketches, shapes, connectors, files, diagrams, and saved drawings. |

### Communication

| Widget | Purpose |
| --- | --- |
| Mail | Provider-aware Gmail/Outlook mail preview. |
| Gmail | Dedicated Gmail inbox surface. |
| Outlook Mail | Dedicated Outlook inbox surface. |
| AI Chat | Text LLM chat widget with selectable/copyable rich replies, image rendering, JSON chart rendering, sanitized HTML/CSS previews for generated code, timestamped conversation history, density and bubble text-size controls, thread open/delete controls, in-widget provider/model selection, default-on app action tool use, optional browser voice input, and file/image attachments when the configured provider supports them. |
| Messages | Slack or mock message feed. |
| Slack Channel | Focused Slack channel widget with channel context. |
| GitHub | Pull requests, issues, repos, notifications, workflow runs, projects, releases, and profile stats. Auth via personal access token, OAuth token, or the `github-remote` MCP server. Resizes from a 1x1 unread-notifications badge to a 6x6 multi-list surface. Widget settings pick the view (overview, PRs, issues, repos, notifications, workflow runs, projects, releases, profile), scope (account vs. specific owner/repo), item state, stat visibility, label visibility, and transport (API vs. MCP vs. auto). Participates in routines through the `check_github` tool and in proactive notifications through the `github` app alert source. |

### Context

| Widget | Purpose |
| --- | --- |
| Weather | Current weather, animated icon, conditions, and compact forecast. |
| Weather Outlook | Five-day forecast with multiple tracked cities. |
| Clock | Digital clock. |
| Analog Clock | Premium analog clock faces, including classical, black-and-white numbered, regulator, railway, marine, modern, and instrument styles. |
| World Clock | Local and remote time zones. |
| Traffic | Travel time to home, work, or custom destinations. |
| Map | Current, saved, or custom location map. |
| Air Quality | Current AQI with animated level-aware air effects and guidance. |
| Astronomy | Animated sun path, daylight timing, sunset, and moon phase visuals. |
| Date Info | Editable date facts, mini month calendar, expanded week/month/year views, optional week numbers, fiscal calendar, and important date markers. |

### Media

| Widget | Purpose |
| --- | --- |
| Now Playing | In-app music playback state. |
| YouTube | Search and play videos inline. |
| Image Gallery | Local image gallery. |
| Quote | ZenQuotes-backed quote batch with local fallback, source picker, manual quote picker, and configurable rotation interval that defaults to one hour. Firebase Hosting deploys mirror the Vite `/quotes-proxy` route through Firebase Functions. |
| Fun Fact | Useless Facts-backed fun fact with local fallback, cleaner text-first typography, and hourly rotation by default. Firebase Hosting deploys mirror the Vite `/facts-proxy` route through Firebase Functions. |
| Bookmarks | Compact quick access links with touch-visible delete controls and a quick add form. |
| News | World News starts by default and combines curated RSS feeds from major publishers with user-added RSS feeds, type filters, and a same-origin `/rss-proxy` for browser and Firebase Hosting builds. |

### Smart Home

| Widget | Purpose |
| --- | --- |
| Robot Face | Embed or float the active robot face. New robot widgets start as a draggable fixed-screen overlay; the 3-dot menu and settings can toggle Float, clicks connect, drags do not connect, hover resize can grow the shell up to the visible viewport while keeping it on screen, Floating Motion supports Still, Idle only, or Full wander with above-board inspect/perch/peek visits, and optional proactive bubbles surface email, messages, calendar, reminders, widget data, and companion comments. |
| Camera | Home Assistant camera snapshot/live view with in-widget camera switching. |
| Light Controller | Toggle and adjust HA lights. |
| Sensor Value | HA sensor display with custom name, icon, size, and live badge options. |
| Climate | Thermostat control. |
| Cover / Shutter | Covers, blinds, garage doors, and shutters. |
| HA Media Player | Transport, album artwork, source selection, progress, and volume controls. |
| Select | HA select/input_select controls. |
| Button Stack | Scenes, scripts, buttons, switches, and light actions. |
| HA Calendar | Events from HA calendar entities. |
| Vacuum | Start, pause, home, locate, and status controls. |
| 3D Printer | Print status, authorized camera snapshots, temperatures, progress, and printer action buttons. |
| Energy | Reference-style monthly usage card for power, grid, solar, battery, and energy sensors, with settings for adding multiple tracked energy devices. |
| Home | General HA entity snapshot. |

Home Assistant widgets share the cached HA state/service helper where possible
so lights, sensors, entities, climate, covers, media players, printers, energy,
and cameras stay consistent after actions. The Energy widget uses the shared
multi-entity picker so users can track additional power or kWh sensors from the
widget settings flow. The developer review surface
`/?curioHaSmartHomeReview=1` opens a mocked Home Assistant board with the Smart
Home widgets and their dashboard action menu present for quick layout and
clickability checks without editing a user's saved dashboard.

### System

| Widget | Purpose |
| --- | --- |
| Quick Actions | Shortcut buttons for common assistant commands. |
| System Status | Configurable system health view for network estimates, voice, Home Assistant, storage, performance, device capability hints, and browser runtime signals. |

## Widget Settings

Widgets can expose settings for:

- Size and grid dimensions.
- Provider selection.
- Data source/entity selection.
- Display name.
- Icon selection.
- Live badge visibility.
- Refresh mode and interval.
- Widget-specific display options.
- AI Chat title, custom instructions, tone, density, bubble text size, history
  limit, timestamps, uploads, voice input, rich reply rendering, in-widget
  provider/model switching, and conversation history. App action tool use is
  enabled by default and can be disabled per widget.
- Home Assistant entity IDs and controls.
- System Status visible signal modules.
- Insights visible activity modules.

Home Assistant widgets keep icon choices relevant to the device domain, such as light icons for lights, sensor icons for sensors, and switch/button icons for switches or buttons.

## Freeform Widget

The Freeform widget is a sketching and diagramming surface.

It supports:

- Pen, marker, eraser, text, shapes, and connectors.
- Straight, elbow, curved, and arrow connector styles.
- Smooth drawing input for mouse and touch.
- Image/file insertion.
- Object selection, duplicate, delete, and layer movement.
- Saved sketches in app storage.
- Export to image.

Sketch data is managed by `src/lib/freeformSketchStore.ts` and related operation helpers.

## Authoring new widgets

Widget bodies compose shared primitives from
`src/components/curio/dashboard/widgetPrimitives/`. The primitives enforce the
dashboard guardrails in one place so individual widgets do not have to
re-implement them:

- No accidental scroll. `WidgetBody` defaults to `overflow: hidden`. Opt in
  with `scroll="y"` (or `"x"`) only when a widget genuinely needs a scroll
  region (chat, long news lists, long tasks).
- No text cutoffs. Use `WidgetText` variants (`title`, `label`, `value`,
  `body`, `caption`) instead of hand-rolling Tailwind size/weight/truncate
  combinations. The `body` variant accepts `lines={1..5}` to clamp
  multi-line text. `FitText` (and its `WidgetHero` wrapper) auto-shrink big
  numbers before they clip.
- No runaway wide boxes. `WidgetStatGrid` collapses columns based on widget
  width. Every primitive enforces `min-w-0`/`min-h-0` so flex rows behave
  inside `WidgetShell`.
- Shared empty state. `WidgetEmptyState` renders the consistent
  empty/loading/error panel used by every widget.

For "hero + stats + list + footer" shaped widgets (Astronomy, DateInfo,
AirQuality, Health, WorldClock, Stopwatch, Pomodoro, and similar),
`WidgetContent` accepts a `WidgetContentSpec` object and lays the widget out
based on the current size class. Authors describe *what* to show; the
primitive decides *how it fits*. Tiny widgets collapse to hero-only, small
widgets add one stat, medium widgets add the stat grid, large and xlarge
widgets add the list and footer.

Widgets that do not fit the spec shape (AI Chat, Sketch, HA Camera, Map,
Rich Note, Table, Image Gallery, YouTube) still compose `WidgetBody`,
`WidgetText`, and `WidgetEmptyState` so scroll rules, typography, and empty
states stay consistent.

Import the primitives through the barrel:

```ts
import {
  WidgetBody,
  WidgetContent,
  WidgetFooter,
  WidgetHero,
  WidgetList,
  WidgetStatGrid,
  WidgetText,
  type WidgetContentSpec,
} from './widgetPrimitives';
```

See `widgetPrimitives/widgetPrimitives.test.tsx` for representative usage of
each primitive.

## Universal guardrails

Every dashboard widget body inherits a small set of CSS guardrails scoped to
`.dashboard-widget-body` in `src/styles/dashboard-widgets.css`. They apply
whether the widget uses the primitives or not:

- `min-width: 0` and `min-height: 0` on the body and on every direct child,
  so flex rows can truncate without pushing the card wider than its frame.
- `overflow-x: clip` on the body, so a single rogue child cannot introduce
  horizontal scrolling.
- `overflow-wrap: anywhere` on common text elements, so long URLs, IDs, and
  filenames wrap instead of overflowing the card. Elements with
  `tabular-nums`, `whitespace-nowrap`, `font-mono`, and code/kbd/pre keep
  their original wrap behavior so numeric readouts and code blocks are not
  affected.
- `actionSafeArea` support on both `WidgetShell` and `WidgetBody`. When set,
  the body reserves top-right padding so content cannot slide under the
  3-dot action menu. Headered widgets already reserve this space
  automatically. `bare` and `padded={false}` widgets that draw their own
  chrome can opt in when they need it.
- **Footer safety**: when a widget contains a `[data-widget-primitive="footer"]`
  element (the `WidgetFooter` primitive), the body reserves at least `1rem`
  of bottom padding so the footer never clips against the card's rounded
  corner. Respects `env(safe-area-inset-bottom)` for iOS kiosks.
- **Anti-pattern neutralization**: direct body children that set
  `flex flex-col justify-between` (with or without `flex-1` / `min-h-0`)
  get their `justify-content` reset to `flex-start`. This extremes-pinning
  pattern overflowed the rounded bottom when middle content exceeded the
  body height. Widgets that genuinely need the pattern can opt out with
  `data-layout-allow-between="true"`, but `WidgetFooter` (`mt-auto` +
  `shrink-0`) is the recommended expression.
- **Compact heading clamp**: headings (`h1`/`h2`/`h3`) in widget bodies
  narrower than ~280px auto-clamp to a safe size range via container
  queries. Oversized hero titles are the #1 cause of "button pushed out
  the bottom" bugs at 2x2 sizes. Inline font-size overrides still win.

These rules are written with `:where()` at zero specificity, so any widget
that explicitly sets a competing property still wins. They ship as part of
the shell, so there is nothing to import.

## Authoring rules for small widget sizes

Small widgets (1x1, 2x2, compressed freeform rects, narrow grid cells)
break most often. Follow these rules to avoid the Music-widget class of
bug:

1. **Never use `justify-between` on the outer body column.** Use natural
   flex flow with `WidgetFooter` (`mt-auto` + `shrink-0`) for any button,
   summary row, or action bar that must sit at the bottom. The CSS
   guardrails now neutralize `justify-between` on top-level body children
   by default.

2. **Scale your hero title with size.** Headings larger than `text-xl`
   should be conditional on non-compact sizes (`!size.isCompact` or
   `size.pixelHeight >= 300`). The container-query clamp catches obvious
   overflows but designer-set sizes still win, so keep the bounds
   reasonable in code.

3. **Hide decorative middle blocks when space is tight.** Waveforms,
   animated meters, and secondary icon badges should be conditional on
   `!size.isCompact` or explicit pixel thresholds. A widget should
   gracefully reduce to `title + label + primary action` at its smallest
   size, not cram everything in.

4. **Always use `min-h-0` on flex-column bodies and `shrink-0` on
   header/footer rows.** `WidgetBody` and `WidgetFooter` apply both
   automatically; manual bodies should match.

5. **Primary action always lives in a `WidgetFooter`**, even if it is
   currently the only footer element. This future-proofs the widget so a
   secondary action (Connect Spotify, Retry, View all) never collides
   with the primary one.

## Already migrated widgets

These widgets compose the shared primitives for their typography, scroll
containers, empty states, tiny-mode labels, stat rows, body wrappers, or
footers. They are the reference implementations for future widget work:

- `AirQualityWidget`
- `AlertsWidget`
- `AiChatWidget`
- `AnalogClockWidget`
- `AstronomyWidget`
- `BookmarksWidget`
- `CalendarWidget`
- `ClockWidget`
- `CommuteWidget`
- `DailySummaryWidget`
- `DateInfoWidget`
- `ForecastWidget`
- `FunFactWidget`
- `GreetingWidget`
- `HabitsWidget`
- `HaButtonStackWidget`
- `HaCameraWidget`
- `HaCalendarWidget`
- `HaClimateWidget`
- `HaCoverWidget`
- `HaEnergyWidget`
- `HaEntitiesWidget`
- `HaLightWidget`
- `HaMediaPlayerWidget`
- `HaPrinterWidget`
- `HaSensorWidget`
- `HaSelectWidget`
- `HaVacuumWidget`
- `HealthWidget`
- `ImageGalleryWidget`
- `MailWidget`
- `MapWidget`
- `MessagesWidget`
- `MusicWidget`
- `NewsWidget`
- `NotesWidget`
- `PomodoroWidget`
- `PortfolioWidget`
- `ProfileWidget`
- `QuoteWidget`
- `QuickActionsWidget`
- `RemindersWidget`
- `RichNoteWidget`
- `RobotFaceWidget`
- `ScreenTimeWidget`
- `SketchWidget`
- `StockWidget`
- `StopwatchWidget`
- `SystemStatusWidget`
- `TableWidget`
- `TasksWidget`
- `TimersWidget`
- `WeatherDashWidget`
- `WorldClockWidget`
- `YouTubeWidget`

All dashboard widgets now compose the shared primitives at least at the body,
text, empty-state, scroll-region, or footer layer. Special-surface widgets
still keep their custom effect after the primitive migration: YouTube keeps
the active video full-bleed, Image Gallery keeps the current photo full-bleed,
Analog Clock keeps its custom dial face, Weather keeps its animated weather
surface, Map keeps the map preview, Sketch keeps the canvas, Robot Face keeps
the face fit/glow behavior, and Home Assistant camera/media/printer surfaces
keep their live visual treatments.

Migration rules:

- Preserve testids and observable behavior.
- Swap hand-rolled label typography (`text-[9px|10px|11px] font-bold
  uppercase tracking-...` with theme text color) for
  `<WidgetText variant="label" tone="muted">`.
- Swap generic body containers (`flex h-full min-h-0 flex-col gap-*`) for
  `<WidgetBody>`.
- Swap `dashboard-widget-touch-scroll ... overflow-y-auto ...` scroll
  containers for `<WidgetBody scroll="y">`.
- Swap dashed-border empty panels for `<WidgetEmptyState>`.
- Leave custom animated surfaces (Astronomy scene, AirQuality orb,
  AnalogClock face, DateInfo calendar grid, WeatherDash surface, HaCamera
  video, Music skin, RichNote editor, Sketch canvas, ImageGallery grid)
  and interactive button-pill controls untouched.


## Interactivity

The dashboard exposes a dedicated Interactivity sub-section in Settings >
Dashboard that controls animation behavior and per-feature toggles. All
interactivity features respect the board-level `animationIntensity` setting
(`off`, `subtle`, `full`) and the OS-level `prefers-reduced-motion` preference
through the shared `useMotionProfile()` hook.

### Interactivity Settings

Board-level toggles (all default to `true` unless noted):

- `animationIntensity` — `'off' | 'subtle' | 'full'` (default `'full'`)
- `ambientPulseEnabled` — soft accent ring on data updates
- `freshnessDotEnabled` — colored dot showing data freshness
- `rollingNumbersEnabled` — animated number transitions via WidgetCounter
- `sparklineHistoryEnabled` — trend sparklines on numeric widgets
- `relativeTimeHintsEnabled` — "4m ago" labels on refresh metadata
- `swipeGesturesEnabled` — swipe-to-complete/archive on list rows
- `dragReorderEnabled` — drag-to-reorder list items
- `inlineQuickAddEnabled` — inline add fields in list widgets
- `longPressEditEnabled` — long-press to enter widget edit mode
- `doubleClickEditEnabled` — double-click to edit inline values
- `dropIntentsEnabled` — cross-widget drag-and-drop linking
- `hoverSelectionBusEnabled` — hover highlights across linked widgets
- `widgetPinningEnabled` — pin items to top of lists
- `optimisticActionsEnabled` — instant UI feedback before server confirms
- `commandPaletteEnabled` — Cmd+K / Ctrl+K command palette
- `insightsActionsEnabled` — tappable Insights rows
- `ariaLiveUpdatesEnabled` — screen reader announcements for value changes

Per-widget overrides can be set in each widget's settings sheet. When a
per-widget override is defined (boolean), it wins over the board-level value.
When undefined, the board-level value applies. This is resolved by the pure
`effectiveToggle(toggle, board, widgetConfig)` helper.

### Shared Primitives

New shared primitives in `src/components/curio/dashboard/widgetPrimitives/`:

- **WidgetCounter** — animated number transitions (odometer, slotRoll, tickUp)
- **WidgetSkeleton** — loading placeholders (stat, list, chart, grid, hero)
- **WidgetInlineError** — error state with retry and open-settings actions
- **WidgetIconButton** — accessible 44px-minimum icon buttons
- **InlineQuickAdd** — inline text input with parser-based validation

### Command Palette

`Cmd+K` / `Ctrl+K` opens the dashboard command palette. Sources:

- On-board widgets (matched by label, title, keywords)
- Widget catalog (add new widgets)
- Quick actions (set timer, add stock, toggle lights)
- Recent response cards

Selection scrolls to the widget, opens the add flow, or dispatches the action.
Respects `commandPaletteEnabled` toggle.

### Layout Presets

Users can save, restore, export, and import layout presets. Presets capture
the active page's widget set and appearance. Stored under
`curio_dashboard_presets[_<profileId>]`. Schema version 1; import rejects
other versions. Applying a preset replaces the active page and emits an undo
toast.

### Event Bus Contracts

The interactivity system uses custom DOM events for decoupled communication:

- `curio:widget-data-updated` — emitted on successful widget refresh with
  `{ widgetId, widgetType, updatedAt }`. Drives ambient pulse and freshness.
- `curio:dashboard-item-drop` — cross-widget drop intent with source/target
  type validation through `DROP_INTENT_REGISTRY`.
- `curio:dashboard-hover` — hover highlight bus for linked widgets (Calendar,
  Tasks, Mail). Payload: `{ itemId, itemKind, sourceWidgetId }`.
- `curio:dashboard-select` — selection event for linked widget focus.
- `curio:dashboard-scroll-to-widget` — scroll a widget into view with focus ring.
- `curio:dashboard-toast` — internal toast bus event (prefer `dashboardToastBus`
  API over direct dispatch).
- `curio:settings-changed` — same-tab notification for any settings/state write.

### Widget-Specific Wins

- **NowPlaying**: live seek bar tick (250ms, gated by `seekBarLiveSyncEnabled`)
- **Pomodoro**: breathing ring animation on timer ring (`breathingRingEnabled`)
- **Habits**: tap-to-toggle burst animation on completion
- **AirQuality**: smooth value morph via WidgetCounter (`valueMorphEnabled`)
- **Stocks/Portfolio**: row display-mode cycle (value/percent/dayChange)
- **WorldClock**: drag-to-preview time offset (`clockOffsetPreviewEnabled`)
- **ImageGallery**: pinch-to-zoom in focused overlay (`pinchZoomEnabled`)
- **RichNote**: TTS word highlight during dictation (`ttsWordHighlightEnabled`)
