# Integrations and Configuration

Curio's integrations are configured from Settings. Most credentials are stored locally through the app's settings and secret-storage helpers.

## Required Setup

At least one assistant backend is needed:

- Gemini API key for Gemini Live and a separate Gemini Text API key for Gemini text LLM mode.
- Nova Sonic API key for Nova Sonic.
- Home Assistant connection for HA Voice.
- Gemini, Ollama, hosted provider, or custom endpoint settings for Custom LLM mode.

Open **Settings > Voice & AI** to choose the backend and enter the required key or URL.

## Home Assistant

Home Assistant powers smart home widgets, tools, cameras, entity filters, HA Voice, and routines that call HA services.

Typical settings:

- Home Assistant URL.
- Long-lived access token, or Home Assistant OAuth. OAuth connections store the access token and refresh token in secret storage and refresh expired access tokens before widget/API calls.
- MCP/HA integration enabled.
- Entity filters for which devices appear in widgets.
- Optional HA Voice pipeline ID.

Supported dashboard widgets include lights, sensors, cameras, climate, covers, media players, selects, button stacks, calendars, vacuums, printers, energy, and general home snapshots.

Routine support includes:

- HA state triggers such as `binary_sensor.front_door` becoming `on`.
- HA service steps such as `light.turn_on` or `script.good_night`.

## Google

Google integrations use OAuth and API keys depending on the feature.

Supported areas:

- Gemini API key for Gemini Live and a separate Gemini Text API key for Gemini text LLM mode.
- Google OAuth Client ID for Calendar, Tasks, Gmail, and Photos.
- Google Calendar agenda and event tools.
- Google Tasks widgets and tools.
- Gmail inbox, checks, and replies.
- Google Photos picker for screensaver/photo surfaces.
- Places and Routes APIs for places, maps, directions, and commute behavior.

OAuth redirect URLs must exactly match the URL used to open Curio, including protocol, host, port, and `/oauth-callback.html`.

## Microsoft Outlook

Outlook integrations use Microsoft OAuth:

- Outlook Calendar event listing, create, update, and delete.
- Outlook Mail inbox checks, replies, and send support.
- Dedicated Outlook dashboard widgets.

## Slack

Slack support includes:

- Slack channel list.
- Recent channel messages.
- Slack dashboard widgets.
- Proactive Slack alerts by channel, person, mention, or keyword.
- Sending Slack messages through tool calls when configured.

Slack alerts can use near-push style polling, but they still run through safe browser-side intervals rather than uncontrolled continuous polling.

## GitHub

GitHub support surfaces repos, pull requests, issues, notifications, workflow runs, projects, releases, and profile stats through a dedicated dashboard widget, the `check_github` AI tool, and proactive notifications.

Authentication has three modes, configured in **Settings > Accounts & Keys > GitHub**:

- **Personal access token (recommended).** Create a fine-grained or classic token at `github.com/settings/tokens`. Suggested scopes: `repo`, `read:user`, `notifications`, `read:project`. The token is stored encrypted through Curio's secret storage.
- **OAuth access token.** Paste a token obtained from a GitHub OAuth app or device flow. Same header shape as a personal access token.
- **MCP.** Route requests through the built-in `github-remote` MCP server. Enable and connect that server in the Generic MCP section of the same settings page, then set the GitHub auth mode to MCP. The widget, proactive engine, and `check_github` tool all dispatch through the MCP binding instead of talking to `api.github.com` directly.

Optional helper fields:

- **Username.** Used to shortlist pull requests and issues involving you without an extra lookup.
- **Default repo.** `owner/repo`. The widget and the `check_github` tool fall back to this when no explicit repo is passed. Required for workflow run, release, and per-repo pull request/issue views when the widget is in "repo" scope.

The GitHub widget supports multiple size configurations from a 1x1 unread-notifications badge up to a 6x6 multi-list surface, and widget settings expose the view (overview, pull requests, issues, repos, notifications, workflow runs, projects, releases, profile), scope, item state, involvement filter, transport (API/MCP/auto), max items, stat visibility, label visibility, avatar visibility, and profile visibility.

Proactive GitHub alerts live in the notifications panel as an `app` rule with `appSource: 'github'`. The preset ships with `new_notifications` and `review_requested` checked; additional conditions cover `assigned_issues`, `mentions`, and `workflow_failure` for a chosen `owner/repo`. Alerts fire through the notification center and optionally a `github` response card, respecting the same delivery and cooldown rules as the other app alert sources.

## Obsidian

Obsidian support lets Curio search, read, create, and append notes through the configured Obsidian API flow. The dashboard can show recent Obsidian notes separately from Curio's internal notes.

## iCal and ICS Calendars

Imported `.ics` and `.ical` calendars are read-only calendar sources. They can be selected in calendar widgets and card/tool flows alongside Google and Outlook.

Use them for Apple Calendar exports, shared calendars, school calendars, team calendars, and static event feeds.

## Weather, Places, Routes, and Maps

Weather and air-quality data is loaded through Curio's weather service and used by:

- Weather card.
- Weather dashboard widget.
- Forecast widget.
- Air quality widget.
- Daily Summary.
- Weather notifications.
- Routines and tools.

Places and Routes integrations support maps, directions, commute cards, traffic thresholds, and place search.

## YouTube and Music

Curio can:

- Search YouTube.
- Play YouTube videos in a dashboard widget.
- Search music queries from YouTube or Spotify.
- Search Spotify tracks, albums, artists, and playlists after Spotify sign-in.
- Control in-app playback with play, pause, resume, stop, and state tools.

Spotify setup:

- Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
- Add the exact Redirect URI shown in Curio Settings > Accounts & Keys > Spotify. Spotify requires HTTPS except for loopback IP literals, and `localhost` is not accepted; use `http://127.0.0.1:<port>/oauth-callback.html` for local development.
- Spotify playback control uses the Web API and requires a Spotify Premium account plus an active Spotify device.

## Local LLM Servers

Curio can use direct Gemini text models, a local Ollama server, hosted providers, or a custom endpoint for text LLM mode. Built-in provider choices include Gemini, Ollama, Mistral, Claude, OpenAI, Amazon Nova, Groq, OpenRouter, and Custom (Advanced). See [Ollama setup](ollama-setup.md) for LAN and Safari/iOS notes.

Common settings:

- Provider: Gemini, Ollama, Mistral, Claude, OpenAI, Amazon Nova, Groq, OpenRouter, or Custom (Advanced).
- Hosted provider preset or custom endpoint.
- Model name.
- Gemini Text API key or hosted/custom provider API key when required. Hosted/custom text provider secrets are encrypted and stored per provider/model/endpoint selection so model changes do not inherit another model's key.

Hosted OpenAI-compatible presets route through Curio's same-origin `/openai-compatible-proxy` in browser, Firebase Hosting, and Electron builds so providers such as Amazon Nova, OpenAI, Claude, Groq, OpenRouter, and Mistral do not fail on browser CORS policy. Ollama, Gemini text, and Custom (Advanced) endpoints stay direct unless the user points them at one of those hosted preset domains.

## External MCP Servers

Accounts & Keys can store multiple external MCP providers. Each provider has a name, URL, enabled toggle, and a type:

- Search MCP for web/search/research tools.
- General MCP for other tool servers.

Providers can use no auth, a bearer token, an API-key header, or OAuth. Tokens are stored through Curio secret storage under the provider id. OAuth MCPs use PKCE, OAuth protected-resource discovery, authorization-server discovery, dynamic client registration when advertised, encrypted token storage, and refresh-token rotation when possible. Public HTTPS MCPs can route through Curio's same-origin `/mcp-proxy` when the MCP server does not pass browser CORS preflight; OAuth metadata, registration, token exchange, and refresh can route through `/mcp-oauth-proxy`. Private, local, and LAN MCP endpoints stay direct. Curio prepares enabled MCP tools for Gemini Live, Amazon Nova Sonic, Custom LLM text turns, and the AI Chat widget. Tool calls are routed back to the specific MCP server that declared the tool, so multiple providers can be enabled at the same time. Ambiguous generic tool names such as `search` and `fetch` are exposed with a server prefix for general MCPs, while named-service prompts such as "GitHub projects" or "Notion notes" are guarded so unrelated workspace MCPs are not selected just because terms like "project" overlap. Notion text turns prefer search/list/query before ID-only fetch tools, extract IDs from Notion URLs when present, and retry once if the model asks the user for a Notion page/database/project/task UUID before lookup. Zapier Actions can also be used as explicit dashboard providers: Mail, Calendar, Tasks, Notes, and Daily Summary call the enabled Zapier MCP directly through `zapierMcpWidgetService` when the user selects `zapier` and has exposed matching email, calendar, task, or note actions in Zapier MCP. Search MCP tools are described restrictively and exposed only when the selected backend lacks a native or Curio-provided search path. Gemini Live uses Curio's Google Search path, Gemini text uses native Google Search, OpenAI search models use OpenAI web search, and Amazon Nova text uses Nova Grounding via `system_tools: ["nova_grounding"]`. Nova Sonic still receives search MCP fallback unless its realtime API exposes native grounding. In text tool-agent turns, current/latest/live/today prompts get date-scoped fresh lookup guidance, native search stays available before a tool call, and native search is disabled after Curio tool results return so the final reply uses the returned card/tool data instead of re-searching stale pages. If a text tool-agent turn reaches its tool-call round limit after collecting results, Curio makes one final no-tool summary pass instead of showing a generic limit failure. General MCPs, such as internal Slack or Outlook/work servers, are exposed as action/data tools and should rely on their own tool names and descriptions to signal when the AI should use them.

The Exa preset is the LobeHub `openclaw-skills-exa-web-search-free` skill. It keeps the skill URL in settings and uses the Exa MCP transport URL with the skill's core tools: `web_search_exa`, `get_code_context_exa`, and `company_research_exa`. No Exa API key is required for that free preset.

### Local (stdio) MCP servers

Every external MCP server also has a **transport** selector: Remote (HTTP/HTTPS) or Local (stdio command). Remote is the default and keeps all existing behavior, including HTTP to private hosts for development and LAN kiosks. Local is for MCP servers shipped as a command-line executable on your machine. Curio spawns the process, writes JSON-RPC requests as newline-delimited JSON on stdin, and reads responses from stdout. This transport is only available inside the Curio Electron desktop app; browsers and PWAs cannot spawn local processes, so stdio servers are ignored there.

Local MCP fields:

- **Executable path** - full path to the server binary (for example `C:\\path\\to\\server.exe` or `/usr/local/bin/my-mcp-server`).
- **Arguments** - space-separated, double/single-quoted groups preserved as a single argument.
- **Working directory** - optional; inherits Curio's cwd when left blank.
- **Environment variables** - arbitrary `NAME=value` pairs. Variables flagged as Secret are stored encrypted through Curio secret storage under the `curio_generic_mcp_env:<serverId>:<NAME>` slot, merged in at launch, and scrubbed from the renderer-visible config. Non-secret values are stored alongside the server config.

Stdio sessions are lazy. The first tool-list or tool-call through a configured stdio server starts its process and keeps it alive for later calls. The process is terminated when the app exits. If the server prints a trailing stderr line before exiting, Curio surfaces that in the Settings "Test" status so you can diagnose auth or path issues.

### Exposed tool list

After a successful "Test" on an external MCP server, the Settings card shows a compact count (for example `160 tools available`). Click the count to expand a scrollable list of every exposed tool with its description. The list is hidden by default so very chatty internal MCP servers like `amzn-mcp` do not flood the settings view.

### Widget "mcp" provider

Mail, Calendar, Tasks, Notes, and Messages widgets expose a generic **`mcp`** provider in addition to the provider-specific options. Pick `mcp` in the widget settings and, when multiple general MCP servers are enabled, use the "MCP server" dropdown to route the widget to a specific server. A free-form query input (or channel query for Messages) passes intent down to the MCP tool finder.

The dashboard code stays decoupled from any specific server: it asks `zapierMcpWidgetService` for a prepared tool set from the selected server, finds a domain-matching tool by name/description (email/calendar/task/note/message + list/read), and normalizes the result into the widget's existing item shape. This is what lets an internal `amzn-mcp` stdio server power the Mail widget with its Outlook tools, or the Messages widget with Slack tools, without any widget-specific glue. Create/reply/compose paths stay disabled for `mcp` because upstream tool contracts vary; only read/list actions are wired.

Accounts & Keys also ships a "Suggested MCPs" catalog. Presets are added
disabled so the user can add credentials, test the connection, and
intentionally enable them. Current OAuth/token/API-key presets include
Notion Workspace, Linear, GitHub Remote MCP, Sentry, Stripe, Zapier,
Firecrawl, Context7, Jina AI Reader, and Cloudflare Radar. The Notion
Workspace preset uses the official hosted Notion MCP URL with OAuth connect
and encrypted token refresh support.
Current no-auth presets include Exa Web Search Free plus OlyPort data
providers for NWS weather alerts, NIFC wildfire data, USGS earthquakes, USGS
water monitoring, EPA air quality, FRED economic data, EIA energy data,
PubMed literature, and FDA safety reports.

## Remote TTS

Remote TTS uses a preset picker to pre-fill provider defaults:

- **ElevenLabs** - `xi-api-key`; fetch the voice list after saving the key.
- **Gemini** - Gemini API key; uses `generateContent` with an AUDIO response modality.
- **OpenAI** - API key; standard `/audio/speech` endpoint.
- **Amazon Polly** - AWS Access Key ID, Secret Access Key, and region. Uses SigV4-signed calls to `polly.<region>.amazonaws.com` for `SynthesizeSpeech` and `DescribeVoices`.
- **Azure Speech** - subscription key and region; SSML-based synthesis against `<region>.tts.speech.microsoft.com`.
- **Custom (Advanced)** - any OpenAI-compatible `/audio/speech` endpoint with an optional API key.

Each preset ships with sensible default models/voices and only shows the fields it actually needs. Credentials are scoped per preset, so switching providers does not leak keys between them.

Remote TTS is optional. Curio also ships several local/browser TTS paths.

## Backup and Restore

Settings > Backup & Restore creates encrypted `.curio-backup` files for moving
or recovering a Curio setup. A full backup includes Curio-owned local settings,
dashboard pages and preferences, locally stored account credentials, secret
storage values, and user-owned local assets such as dashboard gallery images,
offline screensaver uploads, custom wake words, and custom TTS voice profiles.

Backups require a password with at least six digits. Restore requires the same
password before Curio decrypts the file and shows a preview summary. Confirming
the preview replaces Curio-owned local state on the current device; unrelated
browser storage is left alone. External services may still ask for sign-in again
if a restored token has expired or was revoked.

## Security Notes

- Keep API keys out of screenshots and commits.
- Treat `.curio-backup` files like passwords because they can restore account
  access and API keys when the backup password is known.
- Use HTTPS for production deployments when browser microphone/camera APIs are required.
- Plain HTTP on LAN is useful for development, but Safari/iOS may restrict APIs depending on context.
- Home Assistant ingress can limit microphone/camera behavior; direct access often works better for kiosk/tablet setups.
- Review OAuth scopes before connecting Google, Microsoft, or Slack accounts.
