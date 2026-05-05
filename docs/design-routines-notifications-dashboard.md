# Dashboard, Notifications, and Routines

This page documents three connected systems: the dashboard board, the proactive notification system, and routines. They share data stores and runtime events so the dashboard, settings modal, cards, and notification sidebar stay in sync.

## How the Pieces Fit

```text
Settings UI
  -> settingsStorage helpers
  -> dashboard/routine/proactive stores
  -> runtime engines
  -> card events, notification center entries, spoken output, sounds
  -> dashboard widgets and sidebars
```

Key files:

- `src/services/dashboardTypes.ts`
- `src/components/curio/Dashboard.tsx`
- `src/components/curio/dashboard/dashboardRegistry.tsx`
- `src/services/proactiveTypes.ts`
- `src/services/proactiveAlertOptions.ts`
- `src/services/proactiveEngine.ts`
- `src/services/notificationCenterStore.ts`
- `src/services/notificationPriority.ts`
- `src/services/routineTypes.ts`
- `src/services/routineEngine.ts`
- `src/services/routineScheduler.ts`
- `src/components/curio/settings/NotificationsSection.tsx`
- `src/components/curio/settings/RoutinesSection.tsx`

## Dashboard System

The dashboard is a persistent board of widgets. It can replace the classic face-only idle view or run alongside a Robot Face widget.

Capabilities:

- Grid and freeform layouts.
- Snap-to-grid and reduced-motion preferences.
- Background and accent presets.
- Widget drag, resize, enable, disable, duplicate, remove, and settings flows.
- Contextual dashboard search.
- Live data refresh configuration.
- PWA safe-area behavior.
- Widget catalog grouped by Personal, Productivity, Communication, Context, Media, Smart Home, and System.

Dashboard preferences are represented by `DashboardBoardPreferences`:

- `mode`
- `snapToGrid`
- `accentPreset`
- `reduceMotion`

Widget data is represented by `DashboardWidget`:

- `id`
- `type`
- `position`
- `size`
- `config`
- `enabled`
- optional layout information

## Widget Configuration

Common widget config includes:

- `w` and `h` grid dimensions.
- Provider selections for calendar, mail, messages, notes, and tasks.
- Home Assistant entity IDs.
- Display names.
- Device icon choices.
- Display size choices.
- Refresh mode, refresh interval, refresh-on-focus, and refresh metadata.
- Widget-specific values such as symbols, time zones, locations, table cells, rich note HTML, and YouTube queries.

Live widgets should respect `refreshMode`:

- `push`
- `timed`
- `manual`

Widgets with live data should avoid polling faster than the user selected.

## Notification Center

The notification center is the shared backend for notification data. It is used by settings, the sidebar, proactive alerts, routines, dashboard summaries, and AI tools.

Store file:

- `src/services/notificationCenterStore.ts`

Notification center entries support:

- `id`
- `source`
- `title`
- `message`
- `priority`
- `state`
- `unread`
- timestamps

Common operations:

- Get all entries.
- Get unread count.
- Upsert an entry.
- Mark one entry read.
- Mark all read.
- Clear entries.

The UI should show actual notifications first, not consume space with static rule summaries unless the user opens the rules/settings surface.

## Proactive Notification Rules

Rule types live in `src/services/proactiveTypes.ts`.

Rule kinds:

- `calendar`
- `reminder`
- `weather`
- `schedule`
- `email`
- `app`

Rule properties shared by all rule kinds:

- `id`
- `kind`
- `label`
- `enabled`
- `speak`
- `sound`
- `showCard`
- `priority`

Priority values:

- **Low**: quiet informational alert; good for ambient changes.
- **Normal**: useful alert that deserves attention.
- **High**: urgent or time-sensitive alert.

Delivery modes:

- **Timed**: checks on the configured interval.
- **Near push**: checks as frequently as Curio safely allows for that source without uncontrolled polling.

## Built-In Alert Families

### Calendar

Calendar rules alert before an event starts.

Configuration:

- Lead time in minutes.
- Speak toggle.
- Sound toggle.
- Card toggle.
- Priority.

### Reminders

Reminder rules alert when reminders are due or entering a due window.

Configuration:

- Due window in minutes.
- Speak, sound, card, and priority.

### Weather

Weather rules alert when selected weather conditions appear.

Selectable conditions:

- Rain
- Snow
- Storms
- Severe weather
- Fog or haze
- Clear skies
- Cloud cover

### Email

Email rules can target Gmail, Outlook, or both.

Selectable conditions:

- New unread messages.
- Specific sender.
- Subject or keyword.

Configuration:

- Provider.
- Check interval.
- Sender filter.
- Keyword filter.
- Timed or near-push delivery.
- Speak, sound, card, and priority.

Multiple email rules can exist at the same time, so a user can create separate alerts for different senders, keywords, or providers.

### Slack

Slack alerts are app rules with `appSource: 'slack'`.

Selectable conditions:

- New messages.
- Specific channel or DM.
- Specific people.
- Mentions.
- Priority words or custom keywords.

Configuration:

- Channel reference.
- Person filter.
- Keyword filter.
- Check interval.
- Timed or near-push delivery.
- Speak, sound, card, and priority.

### Commute

Commute alerts watch route conditions.

Selectable conditions:

- Moderate traffic.
- Heavy traffic.
- Commute over limit.

Configuration:

- Target route.
- Minute threshold.
- Check interval.

### Chores and Tasks

Task alerts watch internal chores and task state.

Selectable conditions:

- Pending tasks.
- High priority tasks.
- Overdue items.

### Air Quality

Air quality alerts watch AQI values.

Selectable conditions:

- Moderate AQI.
- Unhealthy for sensitive groups.
- Unhealthy AQI.
- Custom threshold.

## Notification Delivery

When a rule fires, `proactiveEngine` creates a `ProactiveNotification`.

Delivery can:

- Upsert a notification center entry.
- Emit a response card.
- Play a subtle notification sound.
- Speak the alert text.
- Queue the alert if the session is active and immediate delivery is not appropriate.

Sound patterns live in `src/services/audioService.ts`; priority labels and descriptions live in `src/services/notificationPriority.ts`.

## Routines

Routines are user-configurable automations.

Type file:

- `src/services/routineTypes.ts`

Runtime files:

- `src/services/routineEngine.ts`
- `src/services/routineScheduler.ts`

Settings UI:

- `src/components/curio/settings/RoutinesSection.tsx`

## Routine Triggers

Supported trigger types:

- **Voice**: run when the user says a matching phrase.
- **Schedule**: run at a saved time on selected days.
- **Event**: run on session start or session end.
- **Home Assistant state**: run when an entity state matches.
- **Music**: run when music starts or stops.

## Routine Steps

Supported step types:

- **Speak**: say configured text.
- **Wait**: pause for a configured duration.
- **Tool call**: invoke a Curio tool with configured arguments.
- **Show card**: emit a response card with configured payload data.
- **Home Assistant service**: call an HA service such as `light.turn_on`.

The routine engine continues through enabled steps and records completion or failure in the notification center.

## Preset Routines

Curio ships with:

- **Good Night**: speaks a closing line and can turn off lights through Home Assistant.
- **Start Focus Mode**: scheduled weekday focus prompt and card.

## Dashboard Sync

Dashboard widgets can reflect notification and routine state through:

- Daily Summary modules.
- Notification center counts.
- Routine queue/status.
- Search results.
- Cards emitted by routine steps or notification rules.

The dashboard should not duplicate notification/routine state. It should read from the same settings and notification stores as the settings modal and sidebar.

## Testing Checklist

Before shipping changes to these systems:

```bash
npm test -- src/services/routineEngine.test.ts
npm test -- src/components/curio/settings/SettingsAutomationSections.test.tsx
npm test -- src/utils/settingsStorage.notifications.test.ts
npm run typecheck
npm run build
```

Run focused tests for the specific file you changed when working on dashboard widgets or notification behavior.
