# Feature Guide

Curio Robot is an AI assistant, dashboard, and automation console. It is built around a simple loop: listen, understand, invoke tools, speak, and show the result as a visual card or dashboard widget.

## Primary Modes

### Face Mode

Face mode is the conversational assistant surface. It shows one of the robot face personalities, listens for voice input, and displays response cards as the assistant works. It is best for hands-free conversations, tablet stands, desktop companion use, and kiosk setups where the assistant is the main focus.

Face mode includes:

- Curio, Astro, Kiro, and Bender-style face components.
- Camera-aware and speech-aware animation hooks.
- Optional voice waveform and subtitle/input surfaces.
- Screensaver support.
- Desktop floating face support in Electron.

### Dashboard Mode

Dashboard mode keeps useful information on screen while Curio listens. Widgets can be arranged in a structured grid or freeform canvas, searched contextually, resized, refreshed, and configured from per-widget controls.

Use dashboard mode for wall panels, iPad displays, Home Assistant sidebars, desktop command centers, and shared household dashboards.

### Response Cards

Response cards are temporary visual overlays created by tools, routines, and notifications. They make AI results inspectable instead of only spoken.

Built-in card families include:

- Weather, forecast, air quality, astronomy, maps, directions, places, commute, and flights.
- Timers, alarms, stopwatch, reminders, chores, calendar, notes, lists, and recipes.
- Music, YouTube, camera, images, quotes, jokes, trivia, news, definitions, calculations, unit conversion, and translation.
- Finance, sports, Gmail, Outlook Mail, Slack, security, energy, Home Assistant status, sensors, thermostats, and devices.

Cards are lazy-loaded from `src/services/cardRegistry.ts`.

## Dashboard Capabilities

The dashboard includes:

- Grid and freeform layout modes.
- Board controls for theme, background, accent preset, motion, snapping, and layout behavior.
- Drag, resize, and per-widget menu controls.
- Contextual search across the widgets already on screen.
- Widget focus/highlight from search results and tool calls.
- Live data refresh options such as push, timed, manual, refresh-on-focus, and refresh metadata.
- Widget settings for provider choices, entity IDs, display names, visual size, icons, and data options.
- PWA safe-area behavior for iOS/iPadOS.

See [Dashboard and widgets](dashboard.md).

## Voice and AI

Curio supports several voice and AI paths:

- **Gemini Live**: real-time speech conversation and Gemini tool calling.
- **Nova Sonic**: speech-to-speech through Amazon Nova Sonic, with a local proxy in Electron.
- **Offline mode**: wake word plus browser speech recognition and local/offline TTS.
- **Home Assistant Voice**: routes speech through a Home Assistant Assist pipeline.
- **Custom LLM**: text LLM mode using Gemini, Ollama, hosted providers, or custom endpoints with Curio's tool agent.

Curio protects the chat surface from model "thinking" leaks by treating assistant output and tool context separately. Tool declarations and context are prepared before the session so the model can call the available tools without exposing internal reasoning text to the user.

See [Voice and AI backends](voice-ai.md).

## Local Speech and Identity

Curio includes local browser-side intelligence:

- Wake word detection through bundled ONNX models.
- Voice profiles and speaker recognition.
- Face profiles, face recognition, and face tracking through MediaPipe/ONNX helpers.
- Session identity resolution that can combine voice and face signals.
- Offline TTS engines and voice profile storage.

Profile data is stored locally through browser storage/IndexedDB helpers unless a configured provider is explicitly used.

## Integrations

Supported integration areas:

- Home Assistant entities, services, cameras, sensors, lights, climates, covers, media players, select entities, vacuums, printers, energy, calendars, and Assist pipelines.
- Google Calendar, Tasks, Gmail, Photos, Places, Routes, Gemini, and search-style helpers.
- Microsoft Outlook Calendar and Mail.
- Slack messages, channels, and outgoing messages.
- Obsidian notes.
- YouTube search and playback.
- iCal/ICS imported calendars.
- Weather, forecast, and air-quality data.
- Gemini Text, local Ollama, hosted text providers, and custom text endpoints.
- Remote TTS servers.
- Encrypted offline backup and restore for settings, dashboards, credentials,
  and user-owned local assets.

See [Integrations and configuration](integrations.md).

## Proactive Notifications

Curio can monitor configured rules and deliver alerts through a shared notification center. Rules can speak, play subtle sounds, show cards, and create notification-center entries.

Rule families include:

- Calendar lead-time reminders.
- Reminder due windows.
- Weather condition changes.
- Custom scheduled notifications.
- Gmail and Outlook alert rules.
- Slack app alerts.
- Commute and traffic thresholds.
- Chore/task state alerts.
- Air quality thresholds.

See [Notifications and routines](design-routines-notifications-dashboard.md).

## Routines

Routines are small automations that Curio can run from voice phrases, schedules, session events, Home Assistant state changes, or music events.

Routine steps can:

- Speak text.
- Wait for a duration.
- Call a Curio tool.
- Show a response card.
- Call a Home Assistant service.

Preset routines include Good Night and Start Focus Mode. Users can add and edit routines in Settings.

## Platform Support

Curio can run as:

- A web app on localhost or LAN.
- A PWA on iOS/iPadOS/Android.
- A Firebase-hosted web app.
- An Electron desktop app.
- A Home Assistant add-on with ingress and direct access.
- A Raspberry Pi fullscreen kiosk.

See [Deployment guide](deployment.md).
