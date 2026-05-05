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
- Gemini Text API key or hosted/custom provider API key when required. Text provider secrets are encrypted and stored per provider/model/endpoint selection where needed.

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

## Security Notes

- Keep API keys out of screenshots and commits.
- Use HTTPS for production deployments when browser microphone/camera APIs are required.
- Plain HTTP on LAN is useful for development, but Safari/iOS may restrict APIs depending on context.
- Home Assistant ingress can limit microphone/camera behavior; direct access often works better for kiosk/tablet setups.
- Review OAuth scopes before connecting Google, Microsoft, or Slack accounts.
