# Agent Instructions

This is the first file future coding agents should read in this repository. Then
read `PROJECT.md` for the project map. Use the existing docs under `docs/` for
deeper background only when the task touches that area.

## Project Identity

Curio Robot is a React/TypeScript voice-first assistant and dashboard. It runs
as a browser/PWA kiosk, Electron desktop app, Home Assistant add-on, and
Raspberry Pi kiosk image. Core experiences are face mode, dashboard mode,
response cards, settings, routines, notifications, and voice/AI integrations.

## Start Here Every Time

1. Read `PROJECT.md`.
2. Check `git status --short --branch` before editing. This repo often has
   local work in progress. Do not revert user changes.
3. Read only the files relevant to the requested area, using the "Where Things
   Live" and "Common Change Paths" sections below.
4. Keep changes surgical. Match existing patterns instead of inventing new
   ones.
5. When a change affects architecture, commands, dependencies, project
   structure, feature surfaces, deployment, or contributor workflow, update
   this file, `PROJECT.md`, and the relevant GitHub-facing Markdown such as
   `README.md` or `docs/*.md`.
6. Run the narrowest useful verification first, then broader checks when risk
   justifies it.

## Commands

Use npm as the default package manager for scripts.

```bash
npm run dev              # Build worker bundle, start Vite on 0.0.0.0:8080
npm start                # Build worker bundle, start Vite with --host
npm run build            # Worker build plus production Vite build
npm run typecheck        # tsc -p tsconfig.app.json --noEmit
npm test                 # Vitest single run
npm test -- path/to.test.tsx
npm run sync:piper-assets    # Restore bundled Piper TTS voices/phonemizer
npm run sync:tiny-tts-assets # Restore bundled TinyTTS assets
npm run preview          # Preview production build
npm run dev:nova         # Vite dev server plus Nova proxy (scripts/nova-proxy.mjs)
npm run electron:dev     # Electron shell against local Vite server
npm run electron:build   # Build Electron app for current platform
npm run electron:build:win | :mac | :linux | :all  # Platform-specific builds
npm run release:patch | :minor | :major  # Bump version, push main, push tag, trigger release workflow
npm run profile:idle     # Run the scripts/idle-profile.mjs runtime profiler
npm run rpi:deploy       # Production build + scp/ssh hint for Pi kiosks
```

The Vite dev server uses port `8080`, host `0.0.0.0`, and relative base paths
for Home Assistant ingress compatibility.
Firebase Hosting deploys use `functions/` to mirror Vite's market data, quote,
fun-fact, and RSS proxy routes for the Stocks, Portfolio, Quote, Fun Fact, and
News widgets.

## Worktree Rules

- Never run destructive git commands unless explicitly requested.
- Do not clean up, reformat, or refactor unrelated files.
- If unrelated files are already modified, ignore them.
- If a file you need is already modified, read it carefully and build on the
  current content without reverting.
- Keep generated/build output (`dist/`, `output/`, `.firebase/`) out of normal
  edits unless the task specifically asks for it.

## Code Style

- TypeScript, React 19, Vite 6, Tailwind CSS 4, Framer Motion, lucide-react.
- Source code and comments should stay ASCII unless Unicode is genuinely
  required for user-facing text.
- Components should stay thin. Put reusable stateful behavior in hooks and
  integration/business logic in services.
- Prefer typed config objects and existing service APIs over ad hoc strings.
- Avoid speculative abstractions. Add an abstraction only when the local
  pattern already points that way or it removes real duplication.
- Debounce UI-driven writes from color pickers, sliders, text inputs, and
  other rapid controls.
- Clean up intervals, timeouts, listeners, audio nodes, media streams,
  workers, and blob URLs in the same scope that creates them.

## Browser And Platform Constraints

- Keep asset paths relative. The app must work at `/` and under Home Assistant
  ingress paths such as `/api/hassio_ingress/<token>/`.
- Microphone, camera, workers, WebAssembly, and PWA behavior need special care
  on iOS Safari and low-power kiosk hardware.
- Local model code and heavy integrations should be lazy-loaded and released
  when idle.
- Do not duplicate Home Assistant ingress auto-login logic. Use the existing
  `useHaIngressAutoLogin` and HA proxy/runtime helpers.

## Documentation Maintenance

Keep the orientation docs current as part of normal work. Future agents
should be able to answer common project questions from docs before crawling
the whole repo.

Update these when facts change:

- `AGENTS.md`: agent workflow, coding rules, verification, and change paths.
- `PROJECT.md`: high-level product, architecture, stack, integrations, and
  tests.
- `README.md` and `docs/*.md`: GitHub-facing product, setup, development,
  implementation, deployment, and publishing guidance.

Note: there is no `steering/` directory or `.kiro/steering/` directory in this
repo. Earlier revisions referenced one; treat `AGENTS.md`, `PROJECT.md`, and
`docs/` as the only orientation sources.

At minimum, revisit this section after changing commands, package/dependency
versions, deployment targets, AI/voice backends, card/widget architecture,
settings patterns, Home Assistant/PWA behavior, or public publish rules.

## Release Flow

Curio publishes Electron installers to the GitHub Releases page through a
tag-triggered workflow. Understand this before the user asks you to cut a
release, re-run a failed release, or respond to release-related errors.

### Two workflows, two triggers

- `.github/workflows/ci.yml` — runs on every push to `main` and every PR.
  Typecheck, Vitest, production web build. Does **not** produce installers.
- `.github/workflows/release.yml` — runs only when a tag matching `v*` is
  pushed to `origin`, or when the user clicks "Run workflow" in the Actions
  tab. Matrix-builds Electron installers on `macos-latest`,
  `windows-latest`, `ubuntu-latest`, then publishes a single GitHub Release
  with the `.dmg`, `.exe`, `.AppImage`, and `.deb` attached. macOS builds
  both x64 and arm64 DMGs. Windows and Linux build x64 only: the bundled
  ONNX models make combined/arm64 payloads too large for NSIS (32-bit
  mmap limit) and fpm (tar/xz limit). Windows arm64 users run the x64
  installer natively; Linux arm64 users use the `rpi-image/` kiosk path.
  Typical total runtime is 10-20 minutes.

Regular commits never produce installers. Only `v*` tag pushes do. Do not
change this without the user explicitly asking.

### Cutting a release (easiest path)

From a clean `main` with all changes committed and pushed:

```bash
npm run release:patch   # 0.1.0 -> 0.1.1
npm run release:minor   # 0.1.0 -> 0.2.0
npm run release:major   # 0.1.0 -> 1.0.0
```

These call `scripts/release.mjs`, which bumps the version everywhere (see
below), commits as `Release v<version>`, pushes `main`, then creates and
pushes a `v<version>` annotated tag. The tag push triggers
`release.yml` on GitHub. The workflow lives on GitHub's infrastructure so
the local machine can close after the push.

Watch progress at:

```
https://github.com/<owner>/<repo>/actions
```

Finished Release lands at:

```
https://github.com/<owner>/<repo>/releases/tag/v<version>
```

### Release without bumping the version

For re-runs, explicit versions, or special markers (for example cutting
`v0.1.0` against a commit that already has the right version strings):

```bash
git tag -a v0.1.0 -m "Curio Robot v0.1.0"
git push origin v0.1.0
```

That single tag push wakes the workflow. No code changes required.

### Re-running a failed release

Options, in order of preference:

1. GitHub UI: Actions -> Release -> Run workflow -> supply the existing
   tag name. The manual dispatch path re-runs the matrix against the tag.
2. Delete the tag locally and remotely, then retag:
   ```bash
   git push origin --delete v0.1.0
   git tag -d v0.1.0
   git tag -a v0.1.0 -m "Curio Robot v0.1.0"
   git push origin v0.1.0
   ```
   Only do this when the user explicitly asks, because anyone who
   downloaded the previous release binaries would be looking at a tag
   that now points somewhere else.

### Version sources of truth

`scripts/bump-version.mjs` is the canonical bumper and updates:

- `package.json` `version`
- `package-lock.json` top-level `version` and `packages[""]` version
- `ha-addon/config.yaml` `version`
- `ha-addon/build.yaml` `io.hass.version`
- `ha-addon/Dockerfile` and `ha-addon/Dockerfile.prebuilt`
  `ARG BUILD_VERSION`
- `ha-addon/CHANGELOG.md` (prepends a new entry)

Never bump these by hand unless you are specifically asked to. If you do,
update all of them together or builds will disagree.

### Signing

Installers are unsigned. Users see a Gatekeeper warning on macOS and a
SmartScreen warning on Windows the first time they launch. This is
intentional for the v0.1.x line. Do not enable signing unless the user
supplies certificate credentials and explicitly asks to wire them up.

If/when signing is added, the relevant places are:

- `electron-builder.config.cjs` for cert references and entitlements.
- `.github/workflows/release.yml` `Build installers` step for environment
  variables (for example `CSC_LINK`, `CSC_KEY_PASSWORD`,
  `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` for macOS
  notarization, or `AZURE_KEY_VAULT_*` / `SSL_COM_*` for Windows cloud
  HSM signing).
- GitHub repository **Settings -> Secrets and variables -> Actions** for
  the secrets the workflow reads.

### What not to do on release days

- Do not force-push `main` while a release is in flight; the workflow
  clones `main` for the final publish job.
- Do not delete the `release/` directory entries from `.gitignore`; CI
  builds must not commit binaries.
- Do not add `publish` config to `electron-builder.config.cjs` that
  points at the GitHub provider. The workflow handles publishing; double
  publishing causes API conflicts.
- Do not turn on the release workflow's `push` trigger for every branch.
  Stay tag-only.

## Where Things Live

```text
src/index.tsx                         React root and service worker registration
src/App.tsx                           Root component shell
src/index.css                         Tailwind import and @layer base root reset
src/styles/                           Focused CSS partials imported by index.tsx
                                      (tokens, cards, dashboard widgets, face,
                                      settings modal, widget-specific themes)
src/components/AppContent.tsx         Main app layout into CurioAgentMode
src/providers/RootProvider.tsx        Top provider wrapper
src/contexts/LiveAPIContext.tsx       Gemini Live, voice session, camera, mic
src/contexts/CardManagerContext.tsx   Response card state and reducer
src/components/cards/                 Response card components
src/components/curio/                 Face mode, dashboard, settings, runtime UI
src/components/curio/dashboard/       Dashboard widgets and registry
src/components/curio/settings/        Settings modal sections
src/components/common/                Shared UI primitives (WeatherIcon, ...)
src/components/desktop/               Electron face/card overlay apps
src/hooks/                            Reusable runtime hooks
src/services/                         Tool router, APIs, cards, routines, AI, TTS
src/services/ai/                      Text LLM runtime, providers, tool agent
src/services/aiChatWidgetStore.ts     Per-widget dashboard AI chat history
src/services/transcriptAnalyzer/      Transcript intent detectors
src/lib/                              Local model engines, sketch store, utils
src/utils/                            Settings, secrets, migrations, PWA helpers
src/utils/settings/                   Settings submodules (barrel re-exported
                                      via settingsStorage.ts)
src/desktop/                          Electron renderer bridge/types
electron/                             Electron main process and preload script
public/                               Static assets, service worker, local models
scripts/                              Build helpers, release/publish scripts,
                                      local proxies, asset sync scripts
docs/                                 User/developer documentation
ha-addon/                             Home Assistant add-on packaging
rpi-image/                            Raspberry Pi kiosk image builder
functions/                            Firebase Functions proxy for Hosting
```

## Common Change Paths

### Response Cards

Read:

- `src/services/cardTypes.ts`
- `src/services/cardRegistry.ts`
- `src/services/cardInterceptor.ts`
- `src/services/toolDeclarations.ts`
- `src/services/toolCallRouter.ts`
- Closest existing card in `src/components/cards/`

Expected pattern:

1. Add or update the card payload type.
2. Implement the card component in `src/components/cards/`.
3. Register the lazy-loaded component in `cardRegistry.ts`.
4. Add or update tool declarations and routing if the AI should trigger it.
5. Emit structured card events and handle incomplete payloads gracefully.
6. Add focused tests for parsing, routing, or non-trivial rendering.

### Dashboard Widgets

Read:

- `src/services/dashboardTypes.ts`
- `src/utils/settingsStorage.ts` (barrel) and
  `src/utils/settings/dashboardSettings.ts`
- `src/components/curio/Dashboard.tsx`
- `src/components/curio/dashboard/dashboardRegistry.tsx`
- Closest existing widget in `src/components/curio/dashboard/`
- `src/services/notionMcpWidgetService.ts` when adding or changing
  Notion-backed dashboard notes/projects.
- `src/services/zapierMcpWidgetService.ts` when adding or changing Zapier
  Actions or generic `mcp`-provider widget data. Server-aware helpers
  (`listMcpMailMessages`, `listMcpCalendarEvents`, `listMcpWidgetItems`,
  `listMcpMessages`) accept an optional `serverId` so widgets configured
  with the `"mcp"` provider can target a specific enabled general MCP.
- `src/services/githubApi.ts` and
  `src/services/githubMcpWidgetService.ts` when adding or changing the
  GitHub widget, the `check_github` tool, or GitHub proactive rules.

Expected pattern:

1. Add the widget type and catalog metadata (category, default size, min/max
   bounds, keywords) in `dashboardTypes.ts`.
2. Implement the widget under `src/components/curio/dashboard/`.
3. Register the lazy loader/component in `dashboardRegistry.tsx`.
4. Add settings controls and search metadata only when needed.
5. Persist widget-specific local data in a focused store/service when the
   data should survive independent of widget config (such as
   `aiChatWidgetStore` for chat history, `freeformSketchStore` for sketches,
   or the HA camera manager for live frames).
   Notion-backed widgets should call the connected Notion MCP server through
   `notionMcpWidgetService` and normalize to widget-friendly item shapes;
   do not ask the LLM to decide widget refreshes.
6. Respect `WidgetShell`, `useWidgetSize`, refresh settings, themes, and
   grid/freeform bounds. Frame-level visual effects such as widget glow belong
   in `DashboardWidgetFrame` and shared dashboard preferences, with per-widget
   opt-in/opt-out flags in `DashboardWidgetConfig`.
   Page-level generative themes use `dashboardThemeGenerator.ts`,
   `generate_dashboard_theme`, `reset_dashboard_theme`, and
   `AnimatedBackgroundRenderer`; animated backgrounds are full-dashboard
   canvas layers behind the board and must respect the shared reduced-motion
   preference.
   Widgets that intentionally leave the board, such as Robot Face's fixed
   floating overlay mode, should persist their own viewport position in
   widget config and render outside the scrollable board from `Dashboard.tsx`.
   Robot Face starts floating by default and exposes its Float toggle in both
   widget settings and the 3-dot contextual menu. Its Floating Motion setting
   supports Still, Idle only, and Full wander; autonomous movement should use
   temporary above-board visual positions, respect reduced motion, pause while
   users interact or bubbles are visible, and avoid persisting non-user
   positions.
7. Compose the shared primitives in
   `src/components/curio/dashboard/widgetPrimitives/` (`WidgetBody`,
   `WidgetText`, `FitText`, `WidgetHero`, `WidgetStatGrid`, `WidgetList`,
   `WidgetEmptyState`, `WidgetFooter`, `WidgetContent`) instead of
   hand-rolling body layout, typography, scroll, pinned-footer rows, or
   empty-state panels. The primitives enforce the dashboard guardrails
   (no hidden scroll, no text cutoffs, no runaway wide boxes, no
   compact-size button overflow, consistent empty/loading/error states)
   in one place. For "hero + stats + list + footer" shaped widgets,
   prefer a `WidgetContentSpec` passed to `WidgetContent`. See the
   "Authoring new widgets" and "Authoring rules for small widget sizes"
   sections of `docs/dashboard.md`.
8. Universal guardrails scoped to `.dashboard-widget-body` in
   `src/styles/dashboard-widgets.css` enforce `min-width: 0`,
   `overflow-x: clip`, safe text wrapping,
   compact-size heading clamps, and bottom-padding reservation for any
   `WidgetFooter`. They also neutralize `flex flex-col justify-between`
   on top-level body children, which was the root cause of the
   Music-widget 2x2 overflow bug. Widgets that really need
   `justify-between` must opt in with
   `data-layout-allow-between="true"`, but `WidgetFooter` is the
   recommended replacement.

   Rules for small widget sizes (1x1, 2x2, narrow freeform rects):
   - Never use `justify-between` on the outer body column.
   - Scale hero titles conditionally on `!size.isCompact` or pixel
     thresholds; do not hard-code `text-2xl+` on bodies that render
     below ~300px tall.
   - Hide decorative middle blocks (waveforms, meters, secondary icon
     badges) when `size.isCompact`.
   - Put every primary action in a `WidgetFooter`, even when it is the
     only footer row, so future secondary actions do not collide.
   - `WidgetBody` and `WidgetFooter` both accept an `actionSafeArea`
     prop. Use it on `bare` or `padded={false}` widgets that draw their
     own chrome near the 3-dot menu.

Dashboard pages are profile-scoped containers of widgets. Use
`getProfileDashboardPages` / `setProfileDashboardPages` and the active-page
helpers in `settings/dashboardSettings.ts`; the legacy single-layout helpers
(`getDashboardLayout`, `setDashboardLayout`) read and write the active page
for compatibility. Page appearance such as theme, accent, glass, background,
and animation preset belongs on the page model rather than shared board
preferences.
Board-level page controls, including switcher visibility and keyboard
shortcuts, belong in dashboard preferences.

#### Interactivity primitives and services

When adding or modifying interactive behavior in dashboard widgets:

- Gate every animation/interaction behind `effectiveToggle(toggleName,
  boardInteractivity, widget.config)` from `dashboardSettings.ts`. This
  resolves per-widget overrides over board-level defaults.
- Use `useMotionProfile()` to scale durations and decide whether to animate.
  Never hard-code animation durations without consulting the profile.
- Route destructive actions (delete, archive, complete) through
  `useOptimisticAction` and emit undo toasts via `dashboardToastBus.show()`.
- Use `useWidgetPersistentState(widgetId, key, initial)` for small per-widget
  UI state that should survive reloads (collapse, tab, display mode).
- Cross-widget communication uses the event bus in `dashboardIntents.ts`:
  `dispatchDropIntent` for drag-and-drop, `dispatchHover`/`dispatchSelect`
  for hover highlights. Register supported drop pairs in
  `DROP_INTENT_REGISTRY`. Current pairs: tasks→pomodoro,
  reminders→pomodoro, stocks→portfolio, news→rich_note/obsidian/bookmarks,
  bookmarks→notes/rich_note/obsidian, map→commute.
- Toast notifications go through `dashboardToastBus` (not raw DOM events).
  The `DashboardToastHost` renders them; widgets never render their own
  toast UI.
- Compose `WidgetCounter` for animated numbers, `WidgetSkeleton` for loading,
  `WidgetInlineError` for error states, `WidgetIconButton` for accessible
  icon buttons (44px min), and `InlineQuickAdd` for inline text inputs with
  parser validation.
- Sparkline data goes through `dashboardSparklineStore.ts`
  (`appendWidgetSparklineSample`, `getWidgetSparklineHistory`).
- Layout presets are managed by `dashboardLayoutPresets.ts`. Applying a
  preset replaces the active page and emits an undo toast. Exporting
  downloads a JSON file and copies to clipboard.
- `useDragReorder` supports both single-column lists (vertical drag) and
  multi-column grids (2D drag). It auto-detects grid columns at drag start.
  Visual feedback uses direct DOM manipulation for zero-jitter performance.
- `useSwipeGesture` provides horizontal swipe-to-dismiss on list rows.
  Gate behind `swipeGesturesEnabled`. Emit an undo toast on commit.
- Inline search with autocomplete (Markets, Portfolio) uses debounced
  `searchStockSymbols()` with AbortController cleanup. The search button
  toggles the panel; no separate settings modal needed.
- Face animation loops (AstroFace, KiroFace) use `performance.now()`-based
  timing for frame-rate independence. Never increment phase by a fixed
  constant per frame. Eye tracking lerp uses exponential decay normalized
  to frame delta: `effectiveLerp = 1 - (1 - baseLerp)^(dt / baseDt)`.

### Settings

Read:

- `src/utils/settingsStorage.ts` (barrel re-export)
- `src/utils/settings/*.ts` for the individual domain modules:
  `core`, `basicSettings`, `displaySettings`, `integrationSettings`,
  `voiceSettings`, `personalitySettings`, `dashboardSettings`,
  `automationSettings`, `settingsStore`
- `src/services/curioBackupService.ts` when backup, restore, local
  persistence, or secret portability is affected.
- `src/components/curio/CurioSettingsModal.tsx`
- Relevant file under `src/components/curio/settings/`

Expected pattern:

- Settings usually use `getX()`, `setX(value)`, and `useX()`.
- Prefer individual hooks such as `useUserName()` over the aggregate
  `useSettingsStore()`.
- `useSettingsStore()` is acceptable in lazy-loaded broad settings surfaces.
- Setters should dispatch same-tab settings events (`storage` and
  `curio:settings-changed`) as well as persist state.
- Secret-like values belong in secret storage helpers, not plain
  localStorage.
- Backup/restore must keep full backups password-protected, restore secrets
  through `setSecret`, and skip disposable caches or OAuth-pending state.

### Tools And AI Backends

Read:

- `src/services/toolDeclarations.ts`
- `src/services/toolCallRouter.ts` (thin public barrel)
- `src/services/toolRouter/router.ts` for the registry and dispatch types
- `src/services/toolRouter/handlers/` for per-domain handler modules
- `src/components/curio/curioSystemPrompt.ts`
- `src/services/liveApiLive.ts`
- `src/services/novaLive.ts`
- `src/services/genericMcpService.ts` for external multi-server MCP
  preparation, tool naming, search guidance, and per-server dispatch.
- `src/services/genericMcpStdioTransport.ts` for the stdio transport used
  by local (Electron-only) MCP servers.
- `src/services/ai/` for text LLM behavior:
  `config.ts`, `llmProvider.ts`, `customLlmRuntime.ts`, `llmToolAgent.ts`,
  `toolSchema.ts`, `openAICompatiblePresets.ts`, `cameraVision.ts`

Expected pattern:

- Gemini Live is the primary voice backend. Gemini text, Amazon Nova Sonic,
  and the text LLM paths (Gemini, Ollama, OpenAI, Amazon Nova, Claude,
  Mistral, Groq, OpenRouter, Custom) should keep compatible behavior when
  possible.
- Tool handlers should return structured data and emit response cards when
  useful.
- When adding a new tool, put its handler in the closest existing domain
  file under `src/services/toolRouter/handlers/` or create a new domain
  file and register it in `handlers/index.ts`. Use `register(name, fn)`
  from `../router`. Do not add handlers back to the `toolCallRouter.ts`
  barrel; it only re-exports the public API.
- Update the system prompt only when the model needs human-readable
  guidance.
- Keep audio format differences separate: Gemini uses 16 kHz PCM capture,
  Nova uses 24 kHz PCM.
- Text LLM tool definitions are rebuilt from current integration settings
  each turn via `toolSchema.ts`. Tools for Home Assistant, Gmail, Outlook,
  Slack, Obsidian, and connected calendars are omitted while their
  account/service is disconnected.
- Hosted OpenAI-compatible text provider presets use
  `/openai-compatible-proxy` to avoid browser CORS blocks. Keep Ollama,
  Gemini text, and arbitrary Custom endpoints direct unless they point at a
  known hosted preset domain.
- Hosted/custom text provider API keys are secret-stored per
  provider/model/endpoint. Do not reintroduce provider-level or legacy
  fallback reads that make one model inherit another model's key.
- External MCP servers live in Accounts & Keys as a multi-server list.
  `genericMcpService.ts` prepares enabled servers for Gemini Live, Nova
  Sonic, Custom LLM text turns, and the AI Chat widget. Route calls through
  the prepared binding map so each tool goes back to the server that
  declared it. Generic MCP auth supports no auth, bearer tokens, API-key
  headers, and OAuth PKCE with dynamic client registration. Bearer/API-key
  tokens are stored in secret storage under
  `curio_generic_mcp_auth_token:<serverId>`; OAuth tokens and dynamically
  registered client credentials are stored under
  `curio_generic_mcp_oauth_token:<serverId>` and
  `curio_generic_mcp_oauth_client:<serverId>`. Add built-in public or
  authenticated options through `GENERIC_MCP_SERVER_PRESETS`; presets must
  be added disabled by default so users can add credentials, test, and enable
  them intentionally. Include `authInstructions` when a preset needs a token,
  API-key header, URL placeholder, OAuth flow, or other provider-specific
  setup. Public HTTPS MCPs may route through `/mcp-proxy`; OAuth discovery,
  registration, token exchange, and refresh may route through
  `/mcp-oauth-proxy` when servers block browser preflight. Private and local
  MCP endpoints stay direct. External MCP servers also support a
  **local stdio transport** for CLI MCP binaries. When
  `transport === 'stdio'`, Curio spawns `command` through the Electron
  bridge (`electron/main.cjs` exposes `curioDesktop.mcpStdio`) and
  communicates over newline-delimited JSON-RPC via
  `genericMcpStdioTransport.ts`. Stdio is desktop-only and silently skipped
  in browsers/PWAs. Non-secret env vars live on the server config; secret
  env values are stored encrypted under
  `curio_generic_mcp_env:<serverId>:<NAME>` and merged in at spawn time.
  Search MCP tools,
  including the LobeHub `openclaw-skills-exa-web-search-free` Exa preset,
  should be described restrictively and only used for fresh/current public
  lookup, code/docs examples, or company research. Search MCPs are
  fallback-only: expose them
  to providers without native or Curio-provided search, and filter them out
  for Gemini Live or native-search text providers. Gemini text uses native
  Google Search, OpenAI search models use OpenAI web search, and Amazon Nova
  text uses Nova Grounding via `system_tools: ["nova_grounding"]`; Nova Sonic
  still receives search MCP fallback unless its realtime API exposes native
  grounding.
- Text tool-agent requests use prompt-relevant tool subsets by default,
  retry once with the full catalog when a shortlisted response appears
  tool-blocked, and enforce provider request budgets by pruning stale
  history and compacting oversized tool results before calls.
- Gemini Live 3.1 search proxy is `src/services/geminiSearchProxy.ts`. Do
  not duplicate it in text LLM schemas.

### Notifications And Routines

Notifications:

- `src/services/proactiveTypes.ts`
- `src/services/proactiveAlertOptions.ts`
- `src/services/proactiveEngine.ts`
- `src/services/notificationCenterStore.ts`
- `src/services/notificationPriority.ts`
- `src/components/curio/settings/NotificationsSection.tsx`

Routines:

- `src/services/routineTypes.ts`
- `src/services/routineEngine.ts`
- `src/services/routineScheduler.ts`
- `src/components/curio/settings/RoutinesSection.tsx`

Keep dashboard, settings, cards, sidebar, and routines on shared stores. Do
not create hidden duplicate state.

### Voice, Wake Word, TTS, Vision

Read:

- `src/components/curio/settings/VoiceAISection.tsx`
- `src/services/liveApiLive.ts`
- `src/services/novaLive.ts`
- `src/services/offlineSpeechService.ts`
- `src/services/webSpeechDictation.ts`
- `src/services/wakeWordService.ts`
- `src/services/wakeWordCatalog.ts`
- `src/services/customWakeWordStore.ts`
- `src/services/faceTracking.ts`
- `src/services/faceRecognitionService.ts`
- `src/services/faceVisionStreamManager.ts`
- `src/services/visionAssistManager.ts`
- `src/services/speakerIdentity.ts`
- `src/services/speakerRecognitionService.ts`
- `src/services/speakerProfileStore.ts`
- `src/services/speakerSessionStore.ts`
- `src/services/faceIdentityRuntime.ts`
- `src/services/faceProfileStore.ts`
- `src/services/voiceCloneService.ts`
- `src/services/voiceProfileStore.ts`
- `src/services/remoteTtsProvider.ts` and `src/services/remoteTtsPresets.ts`
  for the Remote TTS provider preset catalog (ElevenLabs, Gemini, OpenAI,
  Amazon Polly, Azure Speech, Custom). The provider dispatches per preset:
  OpenAI and Custom use the shared `/audio/speech` path, ElevenLabs uses
  `xi-api-key`, Gemini uses `generateContent` with an AUDIO response
  modality, Polly uses SigV4-signed requests via `src/services/awsSigV4.ts`,
  and Azure uses SSML over `cognitiveservices/v1`.
- Local TTS engines under `src/lib/*Tts/` and client wrappers in
  `src/services/*TtsClient.ts`

Remote TTS settings are preset-scoped. The primary credential, region
(Polly, Azure), and secondary credential (Polly secret access key) are
stored under preset-keyed secret storage slots
(`curio_tts_remote_api_key:<preset>`,
`curio_tts_remote_secondary_key:<preset>`,
`curio_tts_remote_region:<preset>`) so switching providers in Settings
does not leak credentials across providers. Update
`SENSITIVE_KEYS`/`migrateSecretsToEncrypted` in `src/utils/secretStorage.ts`
and `getSecretKeys` in `src/services/curioBackupService.ts` when
introducing new preset-scoped secret prefixes. `AI Personality` selection
lives in `PersonalitySelector` and is surfaced under every voice backend,
including the Text LLM panel.

Keep model assets under `public/models/` and personality audio under
`public/audio/`. Add Bender sounds through `src/services/benderAudioCatalog.ts`.

## Verification Guide

- Service or utility change: run the relevant `npm test -- path/to.test.ts`.
- Component change: run the closest component test, then inspect in browser
  if UI behavior changed.
- Settings/storage change: test serialization, migrations, and hook
  behavior.
- Tool/card routing change: test the handler and the rendered card when
  practical.
- Broad/shared change: run `npm test`, `npm run typecheck`, and usually
  `npm run build`.
- UI/PWA/tablet changes should be checked at desktop and mobile widths on
  `http://localhost:8080`.

## Useful Docs

- `PROJECT.md`: concise project map for future agents.
- `README.md`: public product and setup overview.
- `docs/README.md`: documentation index.
- `docs/dashboard.md`: dashboard/widget behavior.
- `docs/voice-ai.md`: voice and AI backends.
- `docs/integrations.md`: external service configuration.
- `docs/features.md`: feature surface reference.
- `docs/offline-voice-models.md`: local TTS and model assets.
- `docs/deployment.md`: web, Electron, Firebase, HA, and Pi deployment.
- `docs/ollama-setup.md`: Ollama setup notes for LAN and Safari/iOS.
- `docs/github-publishing.md`: release and publishing guidance.
- `face-architecture.md`: robot face system layer diagram.
