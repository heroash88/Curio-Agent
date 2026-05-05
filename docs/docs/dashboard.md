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

### Freeform Canvas

Freeform layout lets the user place widgets more like a canvas. It is best for desktop dashboards and custom command centers.

Capabilities:

- Free placement with optional snap.
- Layering and z-order behavior.
- Board background and accent controls.
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
- Layout mode.
- Snap-to-grid.
- Reduced motion.
- Board reset/restore actions.
- Visual system preferences.

Dashboard pages are profile-scoped. Each page owns its own widget set and
positions plus its own visual appearance: light/dark theme, accent, glass
effect, and background. Newly added pages start with no widgets so the user can
build them intentionally. Board preferences such as layout mode, snap-to-grid,
widget glow, glass intensity, page switcher visibility, page keyboard shortcuts,
and reduced motion remain shared for the active profile. Existing single-layout
storage migrates into one default Dashboard page, and the legacy layout helpers
continue to operate on the active page.

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
| Calendar | Auto/provider-selected calendar agenda. |
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
| Portfolio | Holdings tracker with share counts, total value, daily gain/loss, per-holding rows that toggle between holding total and current share price, and Day/W/M/3M/YTD/1Y/5Y historical value chart. Uses Yahoo history first, Stooq daily history fallback when Yahoo is rate limited, and range-labeled estimates when market history is unavailable. Compact sizes hide holding rows first, then the chart at the smallest sizes. Firebase Hosting uses the same Functions-backed market proxies as Stocks. |
| Freeform | Sketches, shapes, connectors, files, diagrams, and saved drawings. |

### Communication

| Widget | Purpose |
| --- | --- |
| Mail | Provider-aware Gmail/Outlook mail preview. |
| Gmail | Dedicated Gmail inbox surface. |
| Outlook Mail | Dedicated Outlook inbox surface. |
| Messages | Slack or mock message feed. |
| Slack Channel | Focused Slack channel widget with channel context. |

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
| Robot Face | Embed the active robot face in the dashboard. |
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
| Energy | Power, grid, solar, battery, and energy sensor summary. |
| Home | General HA entity snapshot. |

Home Assistant widgets share the cached HA state/service helper where possible
so lights, sensors, entities, climate, covers, media players, printers, and
cameras stay consistent after actions. The developer review surface
`/?curioHaSmartHomeReview=1` opens a mocked Home Assistant board with the Smart
Home widgets and their dashboard action menu present for quick layout and
clickability checks without editing a user's saved dashboard.

### System

| Widget | Purpose |
| --- | --- |
| Quick Actions | Shortcut buttons for common assistant commands. |
| System Status | Configurable system health view for network, voice, Home Assistant, storage, performance, battery, and browser runtime signals. |

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
