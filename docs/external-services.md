# External Services and Dependencies

Every external data source, API, and service the Curio Robot app depends on,
grouped by feature. For each one: where the data comes from, whether a key is
needed, and what the fallback chain looks like.

Most HTTP data sources are routed through a local proxy so browsers can reach
APIs that lack CORS headers. The same proxy paths exist in three places:

- Vite dev server (`vite.config.ts`)
- Firebase Functions (`functions/index.js`)
- HA add-on nginx (`ha-addon/nginx.conf`) and the Raspberry Pi kiosk image

See the [proxy table](#proxies) at the end for the full list.

## Table of Contents

- [Weather, AQI, forecast](#weather-aqi-forecast)
- [Stocks and portfolio](#stocks-and-portfolio)
- [Music (YouTube and Spotify)](#music)
- [Places, maps, address autocomplete](#places-and-maps)
- [Directions and routes](#directions-and-routes)
- [News and RSS](#news-and-rss)
- [Flights](#flights)
- [Quotes](#quotes)
- [Fun facts](#fun-facts)
- [Voice and AI backends](#voice-and-ai)
- [Google integrations](#google-integrations)
- [Microsoft integrations](#microsoft-integrations)
- [Slack](#slack)
- [Obsidian](#obsidian)
- [Home Assistant](#home-assistant)
- [iCal files](#ical-files)
- [Bookmarks](#bookmarks)
- [Summary: what needs a key](#summary-what-needs-a-key)
- [Proxies](#proxies)

---

## Weather, AQI, forecast

Service file: `src/services/weatherService.ts`

**Primary: Open-Meteo**

- Website: <https://open-meteo.com/>
- API key: not required
- Current conditions, 7-day forecast, wind, humidity, apparent temperature.
- WMO weather codes are mapped to icons locally.

**Geocoding (city name to lat/lon): Open-Meteo Geocoding**

- `geocoding-api.open-meteo.com/v1/search`
- Tries the full query first, then the portion before the first comma.

**Reverse geocoding (lat/lon to city name): OpenStreetMap Nominatim**

- Website: <https://nominatim.openstreetmap.org/>
- Used only when GPS/IP does not include a city.

**Approximate location when GPS is unavailable: ipapi.co**

- Website: <https://ipapi.co/>
- Browser `navigator.geolocation` is tried first.

**Air Quality (US AQI): Open-Meteo Air Quality**

- `air-quality-api.open-meteo.com/v1/air-quality`
- Categorized locally: Good, Moderate, Sensitive, Unhealthy, Very Unhealthy, Hazardous.

**Location resolution order**

1. User-entered city name, geocoded through Open-Meteo.
2. Browser `navigator.geolocation`.
3. `ipapi.co` GeoIP.
4. Default: San Francisco.

**Cache**

- Full power: 10 minutes. Low power: 30 minutes.
- Stored in `localStorage` as `curio-weather-cache-v3`.
- Last-known-good result is returned on failure.

---

## Stocks and portfolio

Service files: `src/services/stockMarketService.ts`, `src/services/portfolioTrackerService.ts`

**Primary: Yahoo Finance**

- Website: <https://finance.yahoo.com/>
- Routed through `/stock-proxy` -> `query1.finance.yahoo.com`
- Quotes, history, and symbol search.
- On HTTP 429 the client honors `Retry-After` and enters a 5-minute cooldown.

**Fallback: Stooq**

- Website: <https://stooq.com/>
- Routed through `/stooq-proxy`
- Quotes via CSV (`/q/l/`), history via HTML (`/q/d/`, parsed from `table#fth1`).
- US equities get the `.US` suffix; crypto has the hyphen dropped (`BTC-USD` -> `BTCUSD`).

**Symbol search**

- Primary: Yahoo `/v1/finance/search`.
- Local always-available catalog of 24 common tickers (AAPL, MSFT, TSLA, NVDA, SPY, QQQ, BTC-USD, ETH-USD, and others).
- If Yahoo is rate-limited, only the local catalog is returned.

**History ranges**

- `1d`, `1w`, `1m`, `3m`, `ytd`, `1y`, `5y`. Each has a mapped Yahoo range/interval and a Stooq lookback window.

**Portfolio widget**

- Reuses the stock service for per-holding quotes and history.
- Aggregates into totals (value, daily gain, currency).
- If per-symbol history is missing, an estimated curve is drawn from the current snapshot so the chart still has shape.

**Default Stocks widget symbols**: `AAPL,TSLA,BTC-USD`.

---

## Music

Two sources. Users pick per query; some paths use both in sequence.

### YouTube (default)

Files: `src/services/musicSearchService.ts` (search), `musicPlaybackService.ts` (playback), `youtubeApi.ts` (key resolver).

**Preferred search: YouTube Data API v3**

- Website: <https://developers.google.com/youtube/v3>
- `googleapis.com/youtube/v3/search`
- API key: required. Uses a dedicated YouTube key when provided, otherwise the shared Google API key.

**Search fallback 1: Invidious public instances**

- Docs: <https://docs.invidious.io/instances/>
- Used when no key is configured, or when YouTube returns HTTP 403.
- Instance list fetched from `api.invidious.io/instances.json` and cached for 30 minutes.
- Up to 5 instances are tried in order, 8-second timeout each.

**Search fallback 2: hardcoded Invidious list**

- Used only when the instances API itself is unreachable.
- Current list: `vid.puffyan.us`, `invidious.fdn.fr`, `yt.artemislena.eu`.

**Playback: YouTube IFrame Player API**

- Docs: <https://developers.google.com/youtube/iframe_api_reference>
- `www.youtube.com/iframe_api` and `www.youtube.com/embed/<videoId>`.
- No key required.
- iOS WebKit blocks autoplay; the service surfaces `autoplayBlocked: true` and the widget shows a "tap to play" state.

**Ranking**

- Boosts: titles with `official`, `audio`, `lyric`, and Topic / Vevo channels.
- Penalties: `live`, `cover`, `reaction`, `karaoke`, `shorts`, `nightcore`.

### Spotify

File: `src/services/spotifyApi.ts`

**Auth: Spotify Authorization Code + PKCE**

- Docs: <https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow>
- Endpoints: `accounts.spotify.com/authorize` and `accounts.spotify.com/api/token`.
- Scopes: `user-read-currently-playing`, `user-read-playback-state`, `user-modify-playback-state`.
- Tokens are stored encrypted under `curio_spotify_token`.

**Catalog search: Spotify Web API**

- `api.spotify.com/v1/search`
- Returns tracks, albums, artists, and playlists merged into a single ranked list.

**Playback control**

- `api.spotify.com/v1/me/player/(play|pause|seek|volume|currently-playing)`
- Requires a Spotify Premium account.
- HTTP 403 surfaces as "Premium required".
- HTTP 404 surfaces as "open Spotify on a device first".

### Music event bus

`musicPlaybackService` emits `curio:music-event` DOM events (`play_start`, `play_stop`) that routines and notifications listen to.

---

## Places and maps

### Places search (POIs, restaurants, businesses)

File: `src/services/placesApi.ts`

**Primary: Google Places API (New) Text Search**

- Docs: <https://developers.google.com/maps/documentation/places/web-service/text-search>
- `places.googleapis.com/v1/places:searchText`
- API key: required (Google API key with Places API (New) enabled).
- Returns formatted address, rating, opening hours, price level, website, phone, Google Maps URL.

**Fallback: Photon by komoot**

- Website: <https://photon.komoot.io/>
- Used when no key is configured, when the key returns 403 (blacklisted for the session), or on any 4xx/network error.
- Generates OpenStreetMap permalinks instead of Google Maps URLs.

### Address autocomplete in Settings

File: `src/components/curio/settings/LocationsWeatherSection.tsx`

- Uses **Photon by komoot** directly (no Google key needed).
- Debounced at 400 ms.
- Covers home address, work address, and custom locations.

### Map widget

File: `src/components/curio/dashboard/MapWidget.tsx`

- Resolves addresses through `placesApi.searchPlaces`.
- Falls back to current weather location coordinates when no address is set.
- Map links point to OpenStreetMap (`openstreetmap.org/?mlat=...&mlon=...`).

---

## Directions and routes

File: `src/services/routesApi.ts`

**Primary: Google Routes API**

- Docs: <https://developers.google.com/maps/documentation/routes>
- `routes.googleapis.com/directions/v2:computeRoutes`
- API key: required (Google API key with Routes API enabled).
- Driving uses `TRAFFIC_AWARE`.
- Traffic condition is computed locally as the ratio of live duration to static duration: `< 1.15` light, `< 1.4` moderate, else heavy.

**Fallback geocoding: Photon by komoot**

- Resolves origin and destination names when the primary path fails.

**Fallback routing: OSRM public demo server**

- Website: <http://project-osrm.org/>
- `router.project-osrm.org/route/v1/<profile>`
- Profiles: `driving`, `foot`, `bike`.
- Directions URL points to OpenStreetMap.

---

## News and RSS

File: `src/services/newsFeedService.ts`

Three providers in the News widget:

**1. New York Times RSS** (`nytimes`)

- Official section feeds at `rss.nytimes.com/services/xml/rss/nyt/<Section>.xml`.
- Sections: Top Stories, World, U.S., Business, Technology, Science, Health, Sports, Arts, Opinion.

**2. World News combined** (`combined_world`, default)

- Curated public RSS feeds merged by topic (world, business, technology, science, health, sports):
  - [New York Times](https://www.nytimes.com/)
  - [BBC News / BBC Sport](https://www.bbc.com/news)
  - [The Guardian](https://www.theguardian.com/)
  - [NPR](https://www.npr.org/) (World)
  - [Al Jazeera](https://www.aljazeera.com/) (World)
- Users can add their own additional public RSS feeds in widget settings. User feeds are merged into the curated set for the selected category.

**3. Custom RSS** (`custom_rss`)

- Any user-specified RSS or Atom feed URL.

**Proxy and SSRF protection**

- All feeds are routed through `/rss-proxy` to bypass CORS.
- Implementations: Vite plugin `createRssProxyPlugin`, Firebase Cloud Function `rssProxy`, HA add-on nginx.
- The proxy blocks requests to private hosts: `localhost`, `127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `::1`.

**Parsing**

- Supports both RSS and Atom.
- Image is taken from `media:content`, `media:thumbnail`, `enclosure`, `image`, or an `<img>` inside description HTML.

---

## Flights

File: `src/services/flightApi.ts`

**Flight number lookup (for example `AA123`)**

- Primary: [AviationStack](https://aviationstack.com/) at `api.aviationstack.com/v1/flights?flight_iata=...`
  - API key: AviationStack key. Default is empty, so the primary path is effectively "no key" unless the user sets one.
- Fallback: [OpenSky Network](https://opensky-network.org/) at `opensky-network.org/api/states/all?callsign=...`
  - No key required. Returns only position data (altitude, speed).

**Route lookup (origin to destination)**

- AviationStack `dep_iata` / `arr_iata` query.
- No fallback. If no AviationStack key is configured, route queries return an empty list.

**Bundled data**

- Static IATA code to airport name map (~80 common airports worldwide) for display when only a 3-letter code is available.

---

## Quotes

File: `src/services/quoteService.ts`

**Primary: ZenQuotes**

- Website: <https://zenquotes.io/>
- Routed through `/quotes-proxy` -> `zenquotes.io/api/quotes`.
- No key required.
- Cached for 60 minutes in `localStorage` as `curio:quotes:zenquotes-cache:v1`.
- Stale cache is returned if a refresh fails.

**Offline fallback**

- Built-in list of 10 quotes (Alan Kay, Leonardo da Vinci, Linus Torvalds, Steve Jobs, and others).
- Used when no cache exists and the network request fails.

---

## Fun facts

File: `src/services/funFactService.ts`

**Primary: Useless Facts**

- Website: <https://uselessfacts.jsph.pl/>
- Routed through `/facts-proxy` -> `uselessfacts.jsph.pl/api/v2/facts/random?language=en`.
- No key required.
- Cached for 60 minutes as `curio:fun-facts:uselessfacts-cache:v1`.

**Offline fallback**

- Built-in list of 8 fun facts.
- A different local fact is picked per hour block to avoid repeats.

---

## Voice and AI

### Live voice (conversational)

**Gemini Live (primary)**

- File: `src/services/liveApiLive.ts`
- Models: `gemini-3.1-flash-live-preview` (default) or `gemini-3.1-flash-live-native-audio-preview`.
- Audio: 16 kHz PCM capture.
- Requires: Gemini Live API key.

**Amazon Nova Sonic (secondary)**

- Files: `src/services/novaLive.ts`, `novaAudioWorklet.ts`
- Model: `nova-2-sonic-v1`
- Audio: 24 kHz PCM capture.
- Transport: `wss://api.nova.amazon.com/v1/realtime`.
- Requires: Amazon Nova API key and a local proxy. In dev, start it with `npm run dev:nova` (`scripts/nova-proxy.mjs`). In Electron, HA add-on, and the RPi kiosk image the proxy is bundled.

**Home Assistant Voice pipeline**

- File: `src/services/haVoicePipelineService.ts`
- Uses whatever pipeline HA has configured. Requires an active HA connection.

### Gemini search grounding proxy

File: `src/services/geminiSearchProxy.ts`

Gemini 3.1 Live does not support native Google Search grounding reliably on the free tier, so `google_search` tool calls are routed to `gemini-2.5-flash-lite` with grounding enabled.

Local guards before the network call:

- Minimum 4 characters and a shape check. Rejects greetings and trivial one-word queries.
- 60-second dedupe window for identical queries.
- 8 calls per minute rate limit.

### Text LLM providers

Files: `src/services/ai/openAICompatiblePresets.ts`, `customLlmRuntime.ts`, `llmToolAgent.ts`, `toolSchema.ts`.

All providers except Gemini and Ollama use an OpenAI-compatible chat completions endpoint. Hosted presets route through `/openai-compatible-proxy` so browser and Electron builds can call providers that do not allow direct frontend CORS requests. Custom endpoints stay direct unless they use one of the hosted preset domains.

- **Gemini text** — `@google/genai` SDK. Uses its own key, separate from Gemini Live.
- **Ollama** — <https://ollama.com/>. Default base URL `http://localhost:11434`, user-configurable.
- **OpenAI** — `api.openai.com`. Default model `gpt-4o-mini`.
- **Amazon Nova** — `api.nova.amazon.com/v1`. Default model `nova-2-lite-v1`.
- **Anthropic Claude** — `api.anthropic.com/v1`. Default model `claude-sonnet-4-5-20250929`.
- **Groq** — `api.groq.com/openai/v1`. Default model `openai/gpt-oss-20b`.
- **OpenRouter** — `openrouter.ai/api/v1`. Default model `openai/gpt-4o-mini`.
- **Mistral** — `api.mistral.ai/v1`. Default model `mistral-small-latest`.
- **Custom (Advanced)** — user-provided base URL and model.

Text tool catalogs are rebuilt per turn. Tools for Home Assistant, Gmail, Outlook, Slack, Obsidian, and connected calendars are omitted while their account is disconnected.

### Offline dictation

- Files: `src/services/offlineSpeechService.ts`, `webSpeechDictation.ts`.
- Uses the browser's [Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API) (`SpeechRecognition` / `webkitSpeechRecognition`).
- No network key required. Availability depends on the browser: Chromium and recent Safari work; iOS Safari is limited.

### Wake word detection

- Files: `src/services/wakeWordService.ts`, `wakeWordCatalog.ts`.
- Runs entirely in-browser via [openwakeword-js](https://github.com/dscripka/openWakeWord) on [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/).
- No network access.
- Bundled models under `public/models/`: `Hey_Curio.onnx`, `BIMO.onnx`, `Robot.onnx`, `jarvis_v2.onnx`, `hello_deepa.onnx`, `namaste_deepa.onnx`, `Hey_Bender.onnx`, plus the shared `melspectrogram.onnx` and `embedding_model.onnx` feature extractors.
- Custom wake words are stored in IndexedDB via `customWakeWordStore.ts`.

### Text-to-speech

When the TTS engine is set to `auto`, preference order (see `src/services/pocketTtsService.ts`):

1. **Pocket TTS** — local WASM plus embedded ONNX. Primary offline voice. `src/lib/pocketTts/`.
2. **Kitten TTS** — local ONNX. `src/lib/kittenTts/`, client `kittenTtsClient.ts`.
3. **Tiny TTS** — local ONNX plus G2P. `src/lib/tinyTts/`, client `tinyTtsClient.ts`.
4. **Piper TTS** — local ONNX via `@realtimex/piper-tts-web`. Bundled voices and phonemizer under `public/`. Run `npm run sync:piper-assets` after cloning.
5. **Browser TTS** — `SpeechSynthesis`. Depends on OS-installed voices.
6. **Remote TTS** — preset-driven external TTS. Provider presets: ElevenLabs (`api.elevenlabs.io`, `xi-api-key`), Gemini (`generativelanguage.googleapis.com` with AUDIO response modality), OpenAI (`api.openai.com/v1/audio/speech`), Amazon Polly (SigV4-signed calls to `polly.<region>.amazonaws.com` via `src/services/awsSigV4.ts`), Azure Speech (`<region>.tts.speech.microsoft.com/cognitiveservices/v1` with SSML), and Custom (Advanced) for any OpenAI-compatible `/audio/speech` server. Preset catalog: `src/services/remoteTtsPresets.ts`. Credentials are stored per preset (`curio_tts_remote_api_key:<preset>`, `curio_tts_remote_secondary_key:<preset>`, `curio_tts_remote_region:<preset>`) in encrypted secret storage.
7. **Voice clone** — local embedding plus engine. Profiles in `voiceProfileStore.ts`.

### Face and speaker recognition

All runs locally, no network.

- **Face tracking / landmarks**: [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision) (`@mediapipe/tasks-vision`). `src/services/faceTracking.ts` plus a worker.
- **Face identity**: local ONNX embeddings. Profiles in IndexedDB via `faceProfileStore.ts`.
- **Speaker identity**: local WebRTC audio analysis. Profiles in `speakerProfileStore.ts`.

---

## Google integrations

All Google OAuth goes through `src/services/googleOAuth.ts` (auth endpoint `accounts.google.com/o/oauth2/v2/auth`). Tokens are stored in encrypted secret storage. Each API reuses the same OAuth token if its scope was granted.

- **Google Calendar** — `googleCalendarApi.ts` — `googleapis.com/calendar/v3`. Scope: `auth/calendar`.
- **Gmail** — `gmailApi.ts` — `googleapis.com/gmail/v1/users/me`. Scopes: `auth/gmail.readonly`, `auth/gmail.send`.
- **Google Tasks** — `googleTasksAPI.ts` — `tasks.googleapis.com/tasks/v1`. Scope: `auth/tasks`.
- **Google Keep** — `googleKeepAPI.ts` — `keep.googleapis.com/v1`. Scope: `auth/keep`.
- **Google Photos (legacy Library)** — `googlePhotosAPI.ts` — `photoslibrary.googleapis.com/v1`. Kept for legacy albums where still accessible.
- **Google Photos Picker** — `googlePhotosPickerAPI.ts` — `photospicker.googleapis.com/v1`. Scope: `auth/photospicker.mediaitems.readonly`.

The Google **API key** (distinct from OAuth tokens) is also used by Places API, Routes API, and YouTube Data API when no dedicated YouTube key is set.

---

## Microsoft integrations

OAuth flow: `src/services/microsoftOAuth.ts` (`login.microsoftonline.com/common/oauth2/v2.0/authorize`). Both APIs go through Microsoft Graph at `graph.microsoft.com/v1.0`.

- **Outlook Calendar** — `outlookCalendarApi.ts`. Scopes: `Calendars.Read`, `Calendars.ReadWrite`.
- **Outlook Mail** — `outlookMailApi.ts`. Scopes: `Mail.Read`, `Mail.Send`.

---

## Slack

- File: `src/services/slackApi.ts`. OAuth helper: `slackOAuth.ts`.
- Website: <https://slack.com/api>
- Slack blocks browser CORS, so requests are routed through `/slack-proxy` (Vite dev, HA add-on nginx, RPi kiosk nginx).
- Requires a user or bot token, entered via OAuth or pasted in Settings > Accounts & Keys.
- Used to list channels, read messages, and send messages from the Messages widget.

---

## Obsidian

- File: `src/services/obsidianApi.ts`. Recent notes cache: `obsidianRecentNotesStore.ts`.
- Talks directly to the user's Obsidian via the [Local REST API plugin](https://github.com/coddingtonbear/obsidian-local-rest-api) at `https://<host>:<port>/vault/<path>`.
- Requires the plugin enabled in Obsidian, plus a user-configured base URL and bearer token.
- Supports listing vault files, reading notes, creating or overwriting notes (PUT), appending to notes (POST), and searching notes.
- All traffic stays on the user's LAN.

---

## Home Assistant

Files: `haMcpService.ts`, `haWidgetSupport.ts`, `haCameraManager.ts`, `haDeviceDisplay.ts`, `haVoicePipelineService.ts`, `haSmartHomeMock.ts`.

**Connection**

- Long-lived access token (pasted in Settings), or
- HA ingress auto-login when running as an add-on (`useHaIngressAutoLogin`, `haAuthUtils.ts`).

**What the app uses**

- HA entities exposed as tools via the HA [MCP integration](https://www.home-assistant.io/integrations/mcp/) when enabled.
- Camera streams via the HA camera proxy at `/api/camera_proxy/<entity_id>`.
- The camera widget shares a single live-frame manager (`haCameraManager.ts`) to avoid duplicate streams.

**Mock/review mode**

- The `/?curioHaSmartHomeReview=1` route renders `haSmartHomeMock.ts` data for layout QA without touching the real HA connection.

---

## iCal files

- File: `src/services/icalCalendarApi.ts`
- Imports user-provided `.ics` calendar files into `localStorage` under `curio_ical_calendar_sources`.
- **No network access.** The file content is parsed locally: VEVENT, VTIMEZONE, RRULE (`freq`, `interval`, `count`, `until`, `byDay`).
- Events are merged into the Calendar widget alongside Google and Outlook events.

---

## Bookmarks

- File: `src/components/curio/dashboard/BookmarksWidget.tsx`. Persistence: `bookmarksPersistence.ts`.
- Favicons are fetched from `google.com/s2/favicons?domain=<host>&sz=32`.
- Everything else is local.

---

## Summary: what needs a key

**Works fully without any key**

- Weather, AQI, forecast (Open-Meteo, OpenStreetMap)
- Stocks quote, history, and search (Yahoo, Stooq)
- Portfolio
- Address autocomplete in Settings (Photon)
- News and RSS (curated public feeds)
- Quotes (ZenQuotes + local)
- Fun facts (Useless Facts + local)
- Wake word, local TTS engines, face and speaker recognition

**Partially works without a key**

- Music search: Invidious fallback works with no key; a YouTube API key or Spotify account gives better coverage.
- Music playback: YouTube iframe works keyless; Spotify needs Premium.
- Places search: Photon fallback works keyless; a Google API key unlocks Google Maps quality.
- Directions and routes: OSRM plus Photon work keyless; a Google API key unlocks traffic-aware routing and turn-by-turn.
- Flights: OpenSky gives position data with no key; AviationStack key unlocks schedules and route search.
- Ollama text: works with no cloud key if Ollama is running locally or on LAN.

**Requires a user key or account**

- Gemini Live voice (API key).
- Gemini text and all hosted text LLM providers (OpenAI, Claude, Nova, Groq, OpenRouter, Mistral, Custom).
- Google, Outlook, Slack, Obsidian, Home Assistant, Spotify — each requires its own authentication.

---

## Proxies

Local paths and upstream hosts. Dev: `vite.config.ts`. Firebase: `functions/index.js`. Electron packaged builds mirror the dynamic MCP and text-provider proxies in `electron/main.cjs`. HA add-on and RPi kiosk nginx configs mirror the fixed upstream proxies.

- `/stock-proxy` -> `https://query1.finance.yahoo.com`
- `/stooq-proxy` -> `https://stooq.com`
- `/quotes-proxy` -> `https://zenquotes.io`
- `/facts-proxy` -> `https://uselessfacts.jsph.pl`
- `/slack-proxy` -> `https://slack.com/api`
- `/rss-proxy?url=<encoded>` -> any `http(s)://` RSS or Atom feed (private hosts blocked)
- `/mcp-proxy?url=<encoded>` -> public `https://` MCP Streamable HTTP endpoints (private hosts blocked)
- `/mcp-oauth-proxy?url=<encoded>` -> public `https://` MCP OAuth discovery, dynamic registration, token exchange, and refresh endpoints (private hosts blocked)
- `/openai-compatible-proxy?url=<encoded>` -> hosted text LLM preset domains: OpenAI, Claude, Nova, Groq, OpenRouter, and Mistral
- `/nova-proxy` -> `wss://api.nova.amazon.com/v1/realtime` (optional, only for Amazon Nova Sonic voice)

Home Assistant ingress auto-prefixes these with `/api/hassio_ingress/<token>` when running as an HA add-on. Services in `src/services/` handle the prefix automatically via `getIngressPrefix()`.
