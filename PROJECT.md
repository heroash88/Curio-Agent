# Project Map

Curio Robot is a voice-first AI assistant and live dashboard. It combines
real-time conversation, animated robot faces, local wake word detection,
visual response cards, Home Assistant control, routines, proactive
notifications, and a customizable dashboard in a single React app.

Use this file as the fast orientation layer. For coding rules and change
paths, read `AGENTS.md`.

## Product Surfaces

- Face mode: animated Curio, Astro, and Bender personalities for
  conversational use.
- Dashboard mode: profile-aware pages of grid or freeform widgets for kiosk,
  tablet, desktop, and HA panels.
- Response cards: temporary visual cards created by tools, transcript
  analysis, routines, and notifications.
- Settings console: accounts and keys, voice/AI backends, dashboard,
  notifications, routines, profiles, display, robot appearance and behavior,
  backup/restore, and integrations.
- PWA/kiosk: fullscreen browser experience for tablets, phones, Raspberry
  Pi, and Home Assistant.
- Electron desktop: native shell with optional floating face and card
  overlay windows.

## Stack

- React 19 and TypeScript (`~5.8`).
- Vite 6 with ESM and `base: './'`.
- Tailwind CSS 4 through `@tailwindcss/postcss`.
- Framer Motion for animation.
- lucide-react for icons.
- Vitest 4, jsdom, Testing Library.
- Electron 41 and electron-builder 26 for desktop builds.
- `@google/genai` for Gemini Live/Text, `onnxruntime-web` and
  `openwakeword-js` for wake words, `@mediapipe/tasks-vision` for face
  tracking and vision.
- Local TTS through `@realtimex/piper-tts-web` and the custom
  engines in `src/lib/*Tts/`.
- Firebase Hosting support through `functions/` proxy rewrites.

## Main Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm test
npm run preview
npm run electron:dev
npm run electron:build
```

Open the dev app at `http://localhost:8080`. The dev server binds to
`0.0.0.0`, so LAN devices can use `http://<lan-ip>:8080`.

## Runtime Architecture

```text
index.tsx
  -> App.tsx
    -> RootProvider
      -> LiveAPIProvider
        -> CardManagerProvider
          -> AppContent
            -> CurioAgentMode
```

`LiveAPIContext` owns live voice/session state, camera/mic flows, and
backend coordination. `CardManagerContext` owns response card state,
reducer behavior, and auto-dismiss timing.

`CurioAgentMode` chooses which face (Curio, Astro, Bender) to render based
on the `faceStyleId` setting, and orchestrates the face, status stack,
dashboard, transcript overlay, and settings modal.

## Voice And AI

- Primary voice backend: Gemini Live through `src/services/liveApiLive.ts`.
  Default model is `gemini-3.1-flash-live-preview`; a native-audio variant
  is also selectable.
- Secondary voice backend: Amazon Nova Sonic through
  `src/services/novaLive.ts` and `src/services/novaAudioWorklet.ts`.
- Text/offline paths: browser speech, local/offline TTS, direct Gemini
  text, Ollama, and OpenAI-compatible hosted providers via
  `src/services/ai/`. The provider list is Gemini, Ollama, OpenAI, Amazon
  Nova, Claude (Anthropic), Mistral, Groq, OpenRouter, and Custom
  (Advanced) as defined in
  `src/services/ai/openAICompatiblePresets.ts`.
- Hosted/custom text provider keys are encrypted through secret storage and
  scoped by provider, model, and endpoint selection so switching models does
  not reuse another model's key.
- Gemini text mode uses a dedicated Gemini Text API key, separate from the
  Gemini Live key, plus its own text-model selector.
- The AI Chat dashboard widget uses the configured text LLM provider for
  typed chat, optional browser dictation, file/image attachments, rich
  markdown-style replies with images, JSON chart rendering, sanitized
  HTML/CSS previews, in-widget provider/model switching, copyable and
  selectable assistant output, per-widget density and bubble text-size
  controls, default-on app action tool use, and per-widget conversation
  history.
- Custom LLM sessions cache rolling conversation history locally;
  follow-up turns send compact app-context digests instead of replaying
  the full static system prompt.
- Hosted OpenAI-compatible text provider presets route through the
  same-origin `/openai-compatible-proxy` in browser, Firebase Hosting, and
  Electron builds to avoid provider CORS blocks. Ollama, Gemini text, and
  arbitrary Custom endpoints stay direct unless they use a known hosted
  preset domain.
- Text tool-agent requests use prompt-relevant tool-definition subsets by
  default, retry once with the full tool catalog when a shortlisted
  response appears tool-blocked, and enforce provider request budgets by
  pruning stale session history and compacting oversized tool results before
  model calls. If a turn reaches the tool-call round limit after useful tool
  results, the agent makes one final no-tool summary pass so users hear the
  gathered result instead of a generic tool-limit failure.
- Text LLM tool definitions are rebuilt from current integration settings
  each turn. Tools for Home Assistant, Gmail, Outlook, Slack, Obsidian,
  and connected calendars are omitted while their account/service is
  disconnected.
- External MCP servers are configured as a multi-server list in Accounts &
  Keys. `src/services/genericMcpService.ts` prepares those tools for Gemini
  Live, Nova Sonic, Custom LLM text turns, and the AI Chat widget, with
  per-tool routing back to the server that declared it. Generic MCP auth
  supports no auth, bearer tokens, API-key headers, or OAuth PKCE with
  dynamic client registration; tokens and OAuth client credentials are stored
  in secret storage. Public HTTPS MCPs can route through `/mcp-proxy`, and
  OAuth discovery, registration, token exchange, and refresh can route
  through `/mcp-oauth-proxy` when servers fail browser preflight.
  Private/local MCP endpoints stay direct.
  External MCP servers can also use a **local stdio transport** in the
  Electron desktop app. When a server is configured with
  `transport: 'stdio'`, Curio spawns the given `command` as a child process
  through the Electron IPC bridge (`electron/main.cjs` +
  `src/services/genericMcpStdioTransport.ts`) and talks to it with
  newline-delimited JSON-RPC. Browsers and PWAs cannot spawn local
  processes, so stdio servers are silently skipped outside Electron. Stdio
  env values flagged as secret are stored encrypted under
  `curio_generic_mcp_env:<serverId>:<NAME>` and merged in at launch.
  Accounts & Keys includes disabled-by-default presets
  from `GENERIC_MCP_SERVER_PRESETS` for Exa search, OlyPort public data
  providers such as weather alerts, wildfires, earthquakes, water monitoring,
  air quality, economic indicators, energy, PubMed, and FDA safety, plus
  authenticated SaaS providers such as Notion Workspace, Linear, GitHub
  Remote MCP, Sentry, Stripe, Zapier, Firecrawl, Context7, Jina AI Reader,
  and Cloudflare Radar. The Notion Workspace preset uses the official hosted
  Notion MCP OAuth flow. The built-in Exa preset
  preserves the LobeHub `openclaw-skills-exa-web-search-free` search skill
  identity and uses the Exa MCP endpoint for web, code, and company research.
  Search MCP tools are
  fallback-only: they are exposed to backends without native or Curio-provided
  search and filtered out when Gemini Live or a native-search text provider
  already has search. Gemini text uses native Google Search, OpenAI search
  models use OpenAI web search, and Amazon Nova text uses Nova Grounding via
  `system_tools: ["nova_grounding"]`; Nova Sonic still receives search MCP
  fallback unless its realtime API exposes native grounding. Text tool-agent
  turns add date-scoped fresh lookup guardrails for current/latest/live/today
  requests, keep native search available before a tool call, then disable it
  after Curio tool results return so final replies rely on the returned
  card/tool data instead of re-searching stale web pages. Notion text turns
  bias toward search/list/query tools before ID-only fetch tools, extract IDs
  from Notion URLs when present, and retry once if the model tries to ask the
  user for a Notion page/database/project/task UUID before lookup.
- Gemini Live 3.1 search proxy lives at
  `src/services/geminiSearchProxy.ts`; text LLM schemas do not duplicate
  it.
- Tool declarations: `src/services/toolDeclarations.ts`.
- Tool routing: `src/services/toolCallRouter.ts` is a public barrel over
  `src/services/toolRouter/` (registry in `router.ts`; per-domain handlers
  under `handlers/` wired through `handlers/index.ts`).
- System prompt: `src/components/curio/curioSystemPrompt.ts`.
- Remote TTS is preset-driven through
  `src/services/remoteTtsPresets.ts`: ElevenLabs, Gemini, OpenAI, Amazon
  Polly, Azure Speech, or a Custom (Advanced) OpenAI-compatible endpoint.
  Each preset has its own default base URL, default model/voice, and
  credential set. The primary key, region, and secondary credential are
  scoped by preset id (`curio_tts_remote_api_key:<preset>`,
  `curio_tts_remote_region:<preset>`,
  `curio_tts_remote_secondary_key:<preset>`) so switching providers in
  Settings does not reuse another provider's credentials. The AI
  Personality picker (`PersonalitySelector`) is available under every
  voice backend, including Text LLM, and drives `curioSystemPrompt` for
  all runtimes.

Both live backends emit the same response card events where possible.
Gemini capture uses 16 kHz PCM. Nova uses 24 kHz PCM.

## Cards

Response card types live in `src/services/cardTypes.ts`. Components live in
`src/components/cards/` and are registered in
`src/services/cardRegistry.ts`. Cards are rendered through `CardStack`,
`AnimatedCard`, and individual card components.

Common card-related files:

- `src/services/cardTypes.ts`
- `src/services/cardRegistry.ts`
- `src/services/cardInterceptor.ts`
- `src/services/toolDeclarations.ts`
- `src/services/toolCallRouter.ts`
- `src/components/cards/CardStack.tsx`
- `src/components/cards/AnimatedCard.tsx`
- `src/components/cards/CardErrorBoundary.tsx`
- `src/components/cards/FallbackCard.tsx`

40+ card components cover weather, calendar, timers/alarms, maps, music,
finance, flights, news, recipes, smart home (thermostat, energy, sensor,
security, home status), Gmail, Outlook mail, Slack, Obsidian notes,
YouTube, and more.

## Dashboard

Dashboard widgets live in `src/components/curio/dashboard/`. Types, page
models, and catalog metadata live in `src/services/dashboardTypes.ts`;
runtime registration is in
`src/components/curio/dashboard/dashboardRegistry.tsx`. Dashboard pages
are stored through profile-aware helpers in
`src/utils/settings/dashboardSettings.ts` (re-exported via
`src/utils/settingsStorage.ts`); the legacy single-layout APIs
(`getDashboardLayout`, `setDashboardLayout`) read and write the active
page for compatibility. Each page owns its widgets and visual appearance
such as theme, preset or custom accent color, glass override, background,
optional animated background preset, and safe structured generated
animation specs for custom AI-created canvas effects. Generated animation specs
can use weather, elemental, and layered cinematic effects such as fire, snow,
rain, lightning, fog, embers, bubbles, nebula, wormholes, and data storms with
safe controls for blending, depth, trails, pulse, turbulence, and glow while
still avoiding arbitrary generated code. AI-generated page themes can be reset to profile defaults. Board preferences such as layout mode,
snap-to-grid, widget glow, page switcher visibility, and page keyboard
shortcuts remain shared per profile.
Notion Notes and Notion Projects are deterministic dashboard surfaces over
the connected Notion Workspace MCP server. They use
`src/services/notionMcpWidgetService.ts` to find the enabled Notion MCP
server, call its search tool directly, and normalize flexible Notion results
into widget-friendly items without asking an LLM to refresh the widget.
Widget settings can fetch and save selected Notion note/project sources, and
widget rows fetch selected item details into Curio with a separate external
Notion link when available.
Zapier-backed widget providers use
`src/services/zapierMcpWidgetService.ts` to pull email, calendar, task, and
note data directly from the enabled Zapier Actions MCP server. The Mail,
Calendar, Tasks, Notes, and Daily Summary surfaces can use explicit Zapier
providers when the user has exposed matching Zapier actions, with optional
per-widget Zapier queries for inboxes, date ranges, open tasks, and notes.

Mail, Calendar, Tasks, Notes, and Messages also expose a generic `mcp`
provider that routes through any enabled non-search external MCP server,
including internal stdio servers like `amzn-mcp`. `zapierMcpWidgetService`
ships server-aware helpers (`listMcpMailMessages`, `listMcpCalendarEvents`,
`listMcpWidgetItems`, `listMcpMessages`) that pick a tool by domain/action
name matching from the prepared tool set and normalize results into the
widget item shapes. Widget settings expose an MCP server dropdown and an
`mcpQuery`/`mcpChannelQuery` input. Create/reply/compose is intentionally
disabled for `mcp` because upstream tool contracts vary per server.

Important dashboard files:

- `src/components/curio/Dashboard.tsx`
- `src/services/dashboardTypes.ts`
- `src/services/dashboardRuntimeProps.ts`
- `src/services/dashboardRefresh.ts`
- `src/services/dashboardProviderUtils.ts`
- `src/services/dashboardSearch.ts`
- `src/services/dashboardVisualPresets.ts`
- `src/services/dashboardThemeGenerator.ts`
- `src/services/dashboardImageStore.ts`
- `src/services/dashboardToastBus.ts` (toast bus for undo, retry, and
  status toasts across widgets)
- `src/services/dashboardIntents.ts` (drop intent registry and hover bus)
- `src/services/dashboardCommandPaletteService.ts` (Cmd+K palette sources)
- `src/services/dashboardLayoutPresets.ts` (save/restore/export/import presets)
- `src/services/dashboardSparklineStore.ts` (sparkline ring buffer store)
- `src/services/aiChatWidgetStore.ts`
- `src/lib/freeformSketchStore.ts` and `freeformSketchOperations.ts`
- `src/components/curio/dashboard/WidgetShell.tsx`
- `src/components/curio/dashboard/DashboardToastHost.tsx`
- `src/components/curio/dashboard/DashboardCommandPalette.tsx`
- `src/components/curio/dashboard/AnimatedBackgroundRenderer.tsx`
- `src/components/curio/dashboard/animatedBackgrounds/`
- `src/components/curio/dashboard/widgetPrimitives/` (shared widget body
  primitives: `WidgetBody`, `WidgetText`, `FitText`, `WidgetHero`,
  `WidgetStatGrid`, `WidgetList`, `WidgetEmptyState`, `WidgetFooter`,
  `WidgetContent`, `WidgetCounter`, `WidgetSkeleton`, `WidgetInlineError`,
  `WidgetIconButton`, `InlineQuickAdd`)
- `src/components/curio/dashboard/dashboardLayout.ts`
- `src/components/curio/dashboard/dashboardRegistry.tsx`
- `src/components/curio/settings/DashboardSection.tsx`
- `src/hooks/useMotionProfile.ts` (motion profile resolution)
- `src/hooks/useWidgetPersistentState.ts` (per-widget localStorage state)
- `src/utils/settings/dashboardSettings.ts` (InteractivitySettings,
  effectiveToggle, board preferences)

The catalog covers 60+ widgets across Personal, Productivity,
Communication, Context, Media, Smart Home, and System categories. See
`docs/dashboard.md` for the full widget list. Widgets respect widget
size, refresh settings, light/dark theme variables, responsive bounds,
and Home Assistant ingress constraints. The GitHub widget (category
Communication) supports overview, pull requests, issues, repositories,
notifications, workflow runs, projects, releases, and profile views; it
authenticates through a personal access token (recommended), an OAuth
access token, or the built-in `github-remote` MCP server, and plugs into
both routines (via the `check_github` tool) and proactive notifications
(via the `app` rule kind with `appSource: 'github'`). New Robot Face widgets start in
a draggable fixed overlay, with Float available from the 3-dot widget menu
and settings; the overlay stays visible while scrolling or switching
dashboard pages, and Floating Motion can be Still, Idle only, or Full
wander with temporary above-board visits that respect reduced motion and
return to the saved position.
Home Assistant camera widgets use
Push refresh for shared live frames, quick snapshot fallback, and
in-widget camera switching. The Smart Home review route
`/?curioHaSmartHomeReview=1` renders mocked Home Assistant widgets for
layout and clickability checks without changing saved dashboard pages.

## Settings And Persistence

`src/utils/settingsStorage.ts` is a barrel that re-exports the domain
modules under `src/utils/settings/`:

- `core.ts` - storage subscriptions and cached hook factory.
- `basicSettings.ts` - name, greeting, misc user options.
- `displaySettings.ts` - theme, density, backgrounds.
- `integrationSettings.ts` - accounts, keys, and connected services.
- `voiceSettings.ts` - LLM providers, TTS engine, voice thresholds.
- `personalitySettings.ts` - face style, personality audio.
- `dashboardSettings.ts` - pages, layouts, preferences, active page.
- `automationSettings.ts` - routines and proactive notification options.
- `settingsStore.ts` - aggregate `useSettingsStore()` and helpers.

Encrypted full backup/restore lives in
`src/services/curioBackupService.ts` and is surfaced from Settings >
Backup & Restore. Backups are password-protected `.curio-backup` files
that capture Curio-owned localStorage entries, decrypted secret-storage
values, and user-owned IndexedDB assets such as dashboard gallery images,
offline screensaver images, custom wake words, and custom TTS voice
profiles.

Most settings follow this shape:

```ts
getThing()
setThing(value)
useThing()
```

Use individual hooks when possible. The aggregate `useSettingsStore()`
subscribes to many values and should usually be limited to lazy-loaded
settings surfaces.

Secrets and API tokens use secret storage helpers:

- `src/utils/secretStorage.ts`
- `src/utils/settingsStorageSecrets.ts`

Settings migrations live in `src/utils/settingsMigrations.ts`.

## Integrations

Home Assistant:

- `src/services/haMcpService.ts`
- `src/services/haWidgetSupport.ts`
- `src/services/haCameraManager.ts`
- `src/services/haDeviceDisplay.ts`
- `src/services/haSmartHomeMock.ts`
- `src/services/haVoicePipelineService.ts`
- `src/hooks/useHaIngressAutoLogin.ts`
- `src/hooks/useHaOAuthCallback.ts`
- `src/utils/haAuthUtils.ts`
- `src/utils/haMcpRuntimeStatus.ts`

Google and Microsoft:

- `src/services/googleOAuth.ts`
- `src/services/googleCalendarApi.ts`
- `src/services/googleTasksAPI.ts`
- `src/services/googleKeepAPI.ts`
- `src/services/googlePhotosAPI.ts`
- `src/services/googlePhotosPickerAPI.ts`
- `src/services/gmailApi.ts`
- `src/services/microsoftOAuth.ts`
- `src/services/outlookCalendarApi.ts`
- `src/services/outlookMailApi.ts`
- `src/hooks/useGoogleRedirectCallback.ts`
- `src/utils/googleApiErrors.ts`

Other providers:

- `src/services/slackApi.ts`, `slackOAuth.ts`
- `src/services/obsidianApi.ts`, `obsidianRecentNotesStore.ts`
- `src/services/spotifyApi.ts` (catalog search and playback control)
- `src/services/youtubeApi.ts`
- `src/services/musicSearchService.ts` (YouTube + Spotify search fanout)
- `src/services/musicPlaybackService.ts`
- `src/services/githubApi.ts` (REST/GraphQL client for repos, PRs, issues,
  notifications, workflow runs, releases, and Projects v2)
- `src/services/githubMcpWidgetService.ts` (routes GitHub widget and
  proactive checks through the enabled `github-remote` MCP server)
- `src/services/stockMarketService.ts`
- `src/services/portfolioTrackerService.ts`
- `src/services/quoteService.ts`
- `src/services/funFactService.ts`
- `src/services/newsFeedService.ts`
- `src/services/placesApi.ts`
- `src/services/routesApi.ts`
- `src/services/weatherService.ts`
- `src/services/flightApi.ts`
- `src/services/icalCalendarApi.ts`
- `functions/index.js` mirrors the Vite stock/Stooq market proxies,
  ZenQuotes quote proxy, Useless Facts proxy, RSS proxy, public MCP proxy,
  and hosted OpenAI-compatible text provider proxy for Firebase Hosting
  builds.

## Notifications And Routines

Notification center and proactive alerts:

- `src/services/proactiveTypes.ts`
- `src/services/proactiveAlertOptions.ts`
- `src/services/proactiveEngine.ts`
- `src/services/notificationCenterStore.ts`
- `src/services/notificationPriority.ts`
- `src/components/curio/settings/NotificationsSection.tsx`

Routine automation:

- `src/services/routineTypes.ts`
- `src/services/routineEngine.ts`
- `src/services/routineScheduler.ts`
- `src/components/curio/settings/RoutinesSection.tsx`

Routines can speak, wait, call tools, show cards, and call Home Assistant
services. Triggers include voice phrases, schedules, sessions, HA state,
and music events.

## Local Models, Audio, And Vision

Wake word and voice:

- `src/services/wakeWordService.ts`
- `src/services/wakeWordCatalog.ts`
- `src/services/customWakeWordStore.ts`
- `src/services/offlineSpeechService.ts`
- `src/services/webSpeechDictation.ts`
- `src/services/browserSpeechSynthesis.ts`
- `src/services/remoteTtsProvider.ts`
- `src/services/remoteTtsPresets.ts` — preset catalog for the Remote TTS
  engine (ElevenLabs, Gemini, OpenAI, Amazon Polly, Azure Speech, Custom
  OpenAI-compatible).
- `src/services/awsSigV4.ts` — minimal SigV4 signer used by the Polly
  preset for SynthesizeSpeech and DescribeVoices.
- `src/services/voiceCloneService.ts`
- `src/services/voiceProfileStore.ts`
- Local TTS engines under `src/lib/tinyTts/`, `src/lib/piperTts/`,
  `src/lib/kittenTts/`, `src/lib/pocketTts/`
- Service-level clients: `tinyTtsClient.ts`, `piperTtsClient.ts`,
  `kittenTtsClient.ts`, `pocketTtsService.ts`,
  `pocketTtsEngine.ts`, `pocketTtsText.ts`, `pocketTtsRuntimeMode.ts`,
  `ttsTextSanitizer.ts`, `ttsProgress.ts`

Face, speaker, and vision identity:

- `src/services/faceTracking.ts`, `faceTracking.worker.ts`
- `src/services/faceRecognitionService.ts`
- `src/services/faceProfileStore.ts`
- `src/services/faceIdentityRuntime.ts`
- `src/services/faceIdentityAnimationMap.ts`
- `src/services/faceVisionStreamManager.ts`
- `src/services/visionAssistManager.ts`
- `src/services/speakerIdentity.ts`, `speakerIdentityRuntime.ts`
- `src/services/speakerRecognitionService.ts`
- `src/services/speakerProfileStore.ts`, `speakerSessionStore.ts`
- `src/hooks/useFaceTracking.ts`, `useFaceIdentityMonitor.ts`,
  `useFacePreviewSession.ts`, `useSpeakerIdentityMonitor.ts`
- `src/hooks/useCameraCapture.ts`
- `src/lib/ortWasmConfig.ts` for ONNX Runtime WASM configuration

Assets:

- `public/models/`: ONNX/TFLite/WASM assets.
- `public/audio/`: personality audio clips.
- `public/assets/`: backgrounds, icons, other static UI assets.

## Deployment Targets

- Web/PWA: Vite build output in `dist/`.
- Electron: `electron/main.cjs`, `electron/preload.cjs`, and
  `electron-builder.config.cjs`. Per-platform scripts
  (`electron:build:win|:mac|:linux|:all`) drive the build.
- Home Assistant add-on: `ha-addon/` (config.yaml, Dockerfile,
  nginx.conf, run.sh). Deploy helper: `scripts/deploy-ha-addon.mjs`.
- Raspberry Pi kiosk image: `rpi-image/`. Deploy helper:
  `npm run rpi:deploy`.
- Firebase Hosting: `firebase.json`, `.firebaserc.example`, and
  `functions/` for Hosting-backed market, quote, fun-fact, and RSS data
  proxy rewrites.
- Release tooling: `scripts/release.mjs`, `scripts/bump-version.mjs`,
  `scripts/git-release-commit.mjs`, `scripts/git-push-retry.mjs`.
  `npm run release:{patch,minor,major}` runs the full flow: version bump,
  commit, push `main`, and push a `v<version>` tag. The tag push triggers
  `.github/workflows/release.yml`, which matrix-builds Electron installers
  on macOS, Windows, and Linux and publishes them to the GitHub Releases
  page. Regular `main` pushes only run `ci.yml` (typecheck/test/build).
  Installers are intentionally unsigned for the v0.1.x line; users see
  Gatekeeper/SmartScreen warnings on first launch. See the "Release Flow"
  section of `AGENTS.md` for the full runbook.

## Testing

Vitest config: `vitest.config.ts`. Setup: `vitest.setup.ts`.

Included test locations:

- `src/services/**/*.test.ts`
- `src/services/ai/**/*.test.ts`
- `src/utils/**/*.test.ts`
- `src/utils/settings/**/*.test.ts`
- `src/lib/**/*.test.ts`
- `src/components/cards/**/*.test.tsx`
- `src/components/curio/**/*.test.tsx`
- `src/components/curio/dashboard/**/*.test.tsx`
- `src/components/desktop/**/*.test.tsx`
- `src/contexts/__tests__/**/*.test.ts(x)`

Use focused tests for narrow changes. Run `npm run typecheck` and
`npm run build` before publishing broad/shared changes.

## Existing Documentation

- `README.md`: public overview, quick start, feature summary.
- `AGENTS.md`: agent workflow, change paths, verification, and
  maintenance rules.
- `PROJECT.md`: this project map.
- `face-architecture.md`: robot face system layer diagram.
- `docs/README.md`: documentation index.
- `docs/features.md`: feature surface reference.
- `docs/dashboard.md`: dashboard and widget behavior.
- `docs/integrations.md`: account and API configuration.
- `docs/voice-ai.md`: voice and AI backend behavior.
- `docs/offline-voice-models.md`: local TTS and model assets.
- `docs/ollama-setup.md`: Ollama LAN and Safari/iOS notes.
- `docs/deployment.md`: web, Electron, Firebase, HA, and Pi deployment.
- `docs/github-publishing.md`: release and publishing guidance.
- `docs/design-routines-notifications-dashboard.md`: design notes for
  routines, notifications, and dashboard.

There is no `steering/` directory or `.kiro/steering/` directory in this
repo today. Treat `AGENTS.md`, `PROJECT.md`, and `docs/` as the
orientation layer.

## Documentation Maintenance

Whenever project facts change, update the orientation layer in the same
change so future agents do not need to rediscover the whole repository:

- Update `AGENTS.md` for workflow, coding rules, and change paths.
- Update this `PROJECT.md` for product, architecture, stack,
  integrations, and testing facts.
- Update GitHub-facing Markdown such as `README.md`, `docs/README.md`,
  `docs/deployment.md`, and `docs/github-publishing.md` when public
  setup, architecture, deployment, or publishing guidance changes.

This maintenance rule applies especially to changes in commands,
dependencies, deployment targets, AI/voice backends, dashboard/card
architecture, settings storage, Home Assistant/PWA compatibility, and
GitHub publishing rules.
