# Curio Robot Documentation

This folder is the GitHub documentation set for Curio Robot. Start with the feature guide if you want to understand the product, then use the configuration and deployment docs when setting it up on real devices.

## Guides

- [Feature guide](features.md) - what the app does, grouped by user-facing capability.
- [Dashboard and widgets](dashboard.md) - board modes, widget catalog, search, refresh, Home Assistant widgets, and freeform tools.
- [Integrations and configuration](integrations.md) - keys, OAuth, Home Assistant, Google, Outlook, Slack, Obsidian, iCal, weather, and local model servers.
- [External services and dependencies](external-services.md) - every API, data source, fallback chain, and proxy the app relies on, grouped by feature (weather, AQI, stocks, music, places, news, flights, voice/AI, and more).
- [Backup and restore](integrations.md#backup-and-restore) - encrypted offline snapshots for settings, dashboards, account credentials, and local user assets.
- [Voice and AI backends](voice-ai.md) - Gemini Live, Nova Sonic, offline mode, Home Assistant Voice, custom LLMs, tool calling, wake words, profiles, and TTS routing.
- [Offline voice models](offline-voice-models.md) - local TTS engines and bundled model assets.
- [Notifications and routines](design-routines-notifications-dashboard.md) - proactive alerts, notification center, routine triggers, routine steps, and dashboard sync.
- [Deployment guide](deployment.md) - web/PWA, Electron, Firebase, Home Assistant, and Raspberry Pi.
- [GitHub publishing checklist](github-publishing.md) - what to commit, what to ignore, and how to publish without Git LFS.
- [Ollama setup](ollama-setup.md) - local Ollama server setup for phones, tablets, Safari, and LAN use.

## Screenshots

Screenshots live in [assets/screenshots](assets/screenshots). The current README uses:

- [dashboard-overview.svg](assets/screenshots/dashboard-overview.svg)

Use sanitized screenshots or mock previews when publishing publicly. Dashboard images may show location, calendar, messages, or other live personal context depending on the local state of the app when captured.
