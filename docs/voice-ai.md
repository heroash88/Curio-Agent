# Voice and AI Backends

Curio supports multiple assistant runtimes. Pick the one that matches the device, latency target, privacy needs, and available accounts.

## Backend Overview

| Backend | Best for | Notes |
| --- | --- | --- |
| Gemini Live | General real-time assistant use | Uses Google Gemini Live and Curio tool declarations. |
| Nova Sonic | Speech-to-speech voice experience | Electron starts a local Nova proxy automatically. |
| Offline | Local wake/listen/speak flow | Uses browser speech recognition plus selected TTS. |
| Home Assistant Voice | Smart home Assist pipeline | Requires HA connection and a pipeline ID. |
| Custom LLM | Local or hosted text models | Uses tool agent context with Gemini, Ollama, hosted providers, and custom endpoints. |

## Gemini Live

Gemini Live is the main real-time conversation mode.

It provides:

- Low-latency microphone streaming.
- Spoken responses.
- Tool calling.
- Response cards.
- Device camera toggle and front/back camera flip when multiple cameras are available.
- Model and voice selection.

Settings:

- Gemini API key.
- Gemini Live model.
- Gemini Live voice.
- Voice activity and connection behavior.

## Nova Sonic

Nova Sonic is a speech-to-speech backend. In Electron, Curio starts a bundled local WebSocket proxy so the renderer does not need direct provider credentials in the browser runtime.

Settings:

- Nova API key.
- Nova voice.
- Backend set to Nova Sonic.

Development helpers:

```bash
npm run nova:proxy
npm run dev:nova
```

## Offline Mode

Offline mode is useful when you want local speech output and a simpler browser speech-recognition flow.

It uses:

- Wake word detection.
- Browser speech recognition for dictation where supported.
- The selected TTS engine for assistant speech.
- Local card/tool routing where available.

Offline mode still needs a model backend if you expect general LLM reasoning.

## Home Assistant Voice

Home Assistant Voice routes speech through a Home Assistant Assist pipeline.

Requirements:

- Home Assistant URL.
- Long-lived access token.
- HA/MCP enabled.
- Voice pipeline selected in settings.

This mode is useful when Home Assistant is the main automation brain and Curio is the visual/front-end assistant surface.

## Custom LLM

Custom LLM mode supports direct Gemini text models, Ollama, hosted providers, and custom endpoints. The provider list covers Gemini, Ollama, Mistral, Claude, OpenAI, Amazon Nova, Groq, OpenRouter, and Custom (Advanced). Hosted OpenAI-compatible presets route through Curio's same-origin proxy in browser and Electron builds so provider CORS policy does not block text turns; local Ollama and arbitrary Custom endpoints stay direct.

Custom LLM turns use an additive local session cache. The first turn sends the full Curio app/system context, while follow-up turns send a compact current-context digest plus a bounded rolling conversation history instead of replaying the full static prompt each time. Before each text turn, Curio rebuilds the tool list from current integration settings and omits tools for disconnected services such as Home Assistant, Gmail, Outlook, Slack, Obsidian, and cloud/imported calendars. Curio does not add its Gemini Live `google_search` proxy to text LLM tool schemas; text providers use their own search or grounding capabilities when configured. Tool-capable providers then receive a prompt-relevant subset of the remaining tool definitions by default, including recent conversation context and recently used tools for follow-ups. If that shortlisted request returns a tool/access-blocked answer, Curio retries once with the full available tool catalog. Providers with tight request budgets, such as Gemini text models and Groq on lower TPM tiers, also receive stale history pruning and compacted tool results before each model call.

It provides:

- Text LLM interaction.
- Tool context construction.
- Tool invocation through Curio's tool router.
- Separate handling for model output and internal tool context, so chain-of-thought style internal text is not returned to the user.

Settings:

- Provider: Gemini, Ollama, Mistral, Claude, OpenAI, Amazon Nova, Groq, OpenRouter, or Custom (Advanced).
- Hosted provider preset or custom endpoint.
- Model name.
- Provider credential when needed. Gemini text uses a dedicated Gemini Text API key, separate from Gemini Live. Hosted/custom provider credentials are encrypted through secret storage and scoped by provider/model/endpoint so switching providers or models does not reuse another model's key.

See [Ollama setup](ollama-setup.md) for local LAN setup details.

## AI Personality

The AI Personality picker in Settings > Voice & AI is surfaced under every voice backend: Gemini Live, Nova Sonic, and Text LLM. It writes to the same personality store (`src/components/curio/settings/PersonalitySelector.tsx`, `personalitySettings.ts`) and feeds `curioSystemPrompt.ts`, so the chosen personality affects all runtimes consistently.

## Tool Calling

Tool declarations live in `src/services/toolDeclarations.ts`; handlers live in `src/services/toolCallRouter.ts`.

Tool categories include:

- Finance, weather, calendar, alarms, timers, reminders, notes, directions, places, air quality, jokes, trivia, unit conversion, definitions, calculations, translation, sports, quotes, recipes, astronomy, commute, camera, thermostat, Obsidian, routines, notifications, chores, energy, security, flights, Gmail, Outlook, Slack, news, sensor readings, home status, stopwatch, dashboard widgets, music, YouTube, and Google search.

Response cards are emitted through card events and rendered through the card registry.

## Wake Words

Wake word models are bundled in `public/models/` and loaded in the browser through ONNX Runtime. Wake word settings include the selected model and whether wake word listening is enabled.

The project also supports custom wake word storage through `src/services/customWakeWordStore.ts`.

## TTS Engines

TTS is routed through `src/services/pocketTtsService.ts`.

Supported engines:

- Auto
- Browser speech synthesis
- TinyTTS
- Piper TTS
- Kitten TTS
- Pocket TTS
- Remote TTS

Piper uses a bundled offline-only US/UK English ONNX voice catalog and local phonemizer WASM under `public/models/piper-tts/`. The bundled catalog keeps low and medium voices in regular Git without LFS. Curio prewarms the selected Piper voice, keeps a small hot-session cache, chunks long responses for faster perceived playback, and blocks unbundled Piper model downloads at runtime. Run `npm run sync:piper-assets` if those files need to be restored.

Remote TTS (`src/services/remoteTtsProvider.ts`) dispatches per provider preset defined in `src/services/remoteTtsPresets.ts`:

- **OpenAI** — `/audio/speech` endpoint with `Authorization: Bearer`. Default model `tts-1`.
- **ElevenLabs** — `POST /v1/text-to-speech/{voice_id}` with `xi-api-key`. Voices are fetched from `/v1/voices` after the key is saved.
- **Gemini** — `generateContent` on the `v1beta/models/<model>:generateContent` endpoint with `responseModalities: ["AUDIO"]` and a prebuilt voice. Raw PCM is wrapped as WAV before decoding.
- **Amazon Polly** — SigV4-signed `POST /v1/speech` against `polly.<region>.amazonaws.com`. Requires an AWS Access Key ID, Secret Access Key, and region. Voices come from `DescribeVoices`. The signer lives in `src/services/awsSigV4.ts`.
- **Azure Speech** — `POST /cognitiveservices/v1` on `<region>.tts.speech.microsoft.com` with `Ocp-Apim-Subscription-Key` and SSML. Voices come from `/cognitiveservices/voices/list`.
- **Custom (Advanced)** — Any OpenAI-compatible TTS server; user-provided base URL, model, and optional API key.

The primary credential, region (Polly and Azure), and secondary credential (Polly secret access key) are stored per preset under `curio_tts_remote_api_key:<preset>`, `curio_tts_remote_region:<preset>`, and `curio_tts_remote_secondary_key:<preset>` so switching providers in Settings does not leak keys between providers. The Settings modal clears both credential fields when the preset changes and loads whatever is saved for the newly selected preset.

Voice profile and cloning support is available for Pocket-style custom voice profiles.

See [Offline voice models](offline-voice-models.md).

## Identity Context

Curio can use face and speaker profiles to keep the dashboard and assistant context aware of who is present.

Relevant services:

- `speakerRecognitionService.ts`
- `speakerProfileStore.ts`
- `faceRecognitionService.ts`
- `faceProfileStore.ts`
- `faceIdentityRuntime.ts`
- `speakerIdentityRuntime.ts`

Identity features are opt-in and local-first.
