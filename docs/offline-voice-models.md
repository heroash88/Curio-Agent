# Offline Voice Models

Curio includes several speech output engines so the app can run on desktops, tablets, kiosks, and local-first setups. Engines are selected in **Settings > Voice & AI**.

The TTS router lives in `src/services/pocketTtsService.ts`. Model-specific code lives under `src/lib/` and `src/services/*TtsClient.ts`.

## Engine Summary

| Engine | Best for | Local model | Notes |
| --- | --- | --- | --- |
| Browser | Maximum compatibility | No | Uses `speechSynthesis`; quality depends on the device/browser. |
| TinyTTS | Very small local voice | Yes | Lightweight English TTS, good fallback for constrained devices. |
| Piper TTS | Local Piper voices with selectable model weights | Yes | Bundles a curated US/UK English ONNX voice catalog plus phonemizer WASM. Runtime Piper model fetches are offline-only. |
| Kitten TTS | Phones, tablets, Raspberry Pi | Yes | Small ONNX models with multiple sizes and voices. |
| Pocket TTS | Desktop quality and voice cloning | Yes | Heavier ONNX pipeline with custom voice profiles. |
| Remote | External TTS server | No local model | Provider presets for ElevenLabs, Gemini, OpenAI, Amazon Polly, Azure Speech, and Custom OpenAI-compatible endpoints. |

## Browser TTS

Browser TTS uses the built-in Web Speech API. It is the broadest fallback and does not need bundled model files.

Use it when:

- You want the fastest setup.
- The device cannot load larger WASM/ONNX models.
- You are testing on a new browser.

Limitations:

- Voice quality depends on the OS/browser.
- Available voices vary across platforms.
- It is not fully offline if the browser/OS voice implementation depends on remote services.

## TinyTTS

TinyTTS is Curio's smallest local TTS path.

Assets:

- `public/models/tiny-tts/tinytts.onnx`
- `public/models/tiny-tts/config.json`
- `public/models/tiny-tts/cmudict.json`
- `public/models/tiny-tts/g2p_model.json`

Runtime files:

- `src/services/tinyTtsClient.ts`
- `src/lib/tinyTts/tinyEngine.ts`
- `src/lib/tinyTts/text.ts`
- `src/lib/tinyTts/g2pPredict.ts`

Use it when:

- You need a small fully local voice.
- You are running on constrained hardware.
- You want a predictable fallback before trying larger engines.

## Piper TTS

Piper TTS runs local Piper ONNX voices in the browser through `@realtimex/piper-tts-web`. Curio redirects supported Piper model URLs to bundled files under `public/models/piper-tts/` and rejects unbundled Piper voice downloads at runtime so selected Piper voices stay offline-only.

Bundled voices:

| Voice | Best for |
| --- | --- |
| `en_US-lessac-low` | Fast US English Lessac voice. |
| `en_US-lessac-medium` | Default US English Lessac balance of quality and size. |
| `en_US-amy-low` | Fast US English female voice. |
| `en_US-amy-medium` | Balanced US English female voice. |
| `en_US-kathleen-low` | Compact US English female voice. |
| `en_US-hfc_female-medium` | Additional US English female medium voice. |
| `en_US-hfc_male-medium` | Additional US English male medium voice. |
| `en_GB-alba-medium` | British English female voice. |
| `en_GB-cori-medium` | Balanced British English Cori voice. |

Assets:

- `public/models/piper-tts/wasm/piper_phonemize.wasm`
- `public/models/piper-tts/wasm/piper_phonemize.data`
- `public/models/piper-tts/voices/<voice>/<voice>.onnx`
- `public/models/piper-tts/voices/<voice>/<voice>.onnx.json`

Runtime files:

- `src/services/piperTtsClient.ts`
- `src/lib/piperTts/localAssets.ts`

Performance behavior:

- Settings prewarms the selected Piper voice instead of only the default voice.
- The runtime keeps up to three recently used Piper sessions hot and releases them after inactivity.
- Longer responses are sentence-chunked, and synthesis of the next chunk starts while the current chunk is playing.
- Playback speed is clamped to a useful range so voice speed changes do not create unstable audio.

Restore assets with:

```bash
npm run sync:piper-assets
```

## Kitten TTS

Kitten TTS is a lightweight ONNX TTS engine from KittenML-style exports. It is a good default for phones, tablets, and Raspberry Pi.

Model variants:

| Model | Best for |
| --- | --- |
| Nano | Phones, tablets, Raspberry Pi, and low-power devices. |
| Micro | Balanced quality and speed. |
| Mini | Higher quality on desktops and stronger tablets. |

Each variant expects:

- `model.onnx`
- `voices.npz`
- `kitten_config.json`

Runtime files:

- `src/services/kittenTtsClient.ts`
- `src/lib/kittenTts/kittenEngine.ts`
- `src/lib/kittenTts/modelCatalog.ts`
- `src/lib/kittenTts/preprocess.ts`
- `src/lib/kittenTts/tokenizer.ts`
- `src/lib/kittenTts/npz.ts`

Built-in friendly voice aliases include Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki, and Leo.

How it works:

1. Text is normalized and chunked.
2. Text is phonemized.
3. Phonemes are tokenized.
4. ONNX inference produces 24 kHz PCM audio.
5. Audio chunks are streamed for playback.

Kitten is designed to avoid the heavier repeated inference pattern used by Pocket TTS.

## Pocket TTS

Pocket TTS is the most feature-rich local engine and supports voice cloning.

Core assets:

- `public/models/pocket-tts-onnx/text_conditioner.onnx`
- `public/models/pocket-tts-onnx/flow_lm_main_int8.onnx`
- `public/models/pocket-tts-onnx/flow_lm_flow_int8.onnx`
- `public/models/pocket-tts-onnx/mimi_decoder_int8.onnx`
- `public/models/pocket-tts-onnx/mimi_encoder.onnx`

Runtime files:

- `src/services/pocketTtsEngine.ts`
- `src/lib/pocketTts/workerClient.ts`
- `src/lib/pocketTts/inference.worker.ts`
- `src/lib/pocketTts/mimiEncoder.ts`
- `src/services/voiceCloneService.ts`
- `src/services/voiceProfileStore.ts`

Built-in voice IDs include Alba, Azelma, Cosette, Eponine, Fantine, Javert, Jean, and Marius.

Use Pocket TTS when:

- You are on desktop Chrome or a strong desktop runtime.
- You want custom voice profile support.
- Higher voice quality is more important than fast cold-start.

Avoid Pocket TTS on low-memory mobile devices if it causes heat, slow generation, or WebAssembly memory issues.

## Voice Cloning

Pocket-style voice cloning lets the user record or upload a voice sample and store an embedding locally.

Flow:

1. Open **Settings > Voice & AI**.
2. Select a TTS engine that supports profiles.
3. Record or upload a clean sample.
4. Curio extracts a voice embedding.
5. The profile is saved in IndexedDB.
6. The raw sample is not kept as the normal saved profile payload.

Relevant files:

- `src/components/curio/settings/VoiceRecordingModal.tsx`
- `src/services/voiceCloneService.ts`
- `src/services/voiceProfileStore.ts`

## Remote TTS

Remote TTS lets Curio call an external TTS endpoint. The provider is chosen from a preset picker in Settings > Voice & AI; each preset comes pre-configured with the right base URL, credential fields, and default voice/model.

Built-in presets:

| Preset | Endpoint shape | Credentials |
| --- | --- | --- |
| OpenAI | `/audio/speech` on `api.openai.com/v1` | API key (`sk-...`) |
| ElevenLabs | `POST /v1/text-to-speech/{voice_id}` | `xi-api-key` |
| Gemini | `generateContent` with AUDIO response modality | Gemini API key |
| Amazon Polly | SigV4-signed `POST /v1/speech` on `polly.<region>.amazonaws.com` | AWS access key id, secret access key, region |
| Azure Speech | SSML `POST /cognitiveservices/v1` on `<region>.tts.speech.microsoft.com` | Subscription key, region |
| Custom (Advanced) | OpenAI-compatible `/audio/speech` on any user-provided URL | Optional API key |

Common settings per preset:

- Base URL (shown only for Custom; built in for all other presets).
- Region selector (Amazon Polly, Azure Speech).
- Model or audio format picker.
- Primary credential (API key or subscription key).
- Secondary credential (AWS Secret Access Key for Polly).
- Fetch Voices button populates the voice picker using each preset's own voice endpoint.

Settings storage notes:

- The primary credential is stored per preset at `curio_tts_remote_api_key:<preset>`, so an ElevenLabs key does not leak into the Azure subscription-key field when you switch providers.
- The secondary credential (Polly) is stored at `curio_tts_remote_secondary_key:<preset>`.
- The region is stored per preset at `curio_tts_remote_region:<preset>`.
- Switching the preset in Settings clears both credential fields and then loads whatever is saved for the newly selected preset.

Use remote TTS when:

- You want provider-quality voices.
- The device is too constrained for local model inference.
- You already run a local or private TTS server.

## Wake Word Models

Wake word detection is separate from TTS. Wake word models are stored in `public/models/` and loaded by `src/services/wakeWordService.ts`.

Bundled wake/model assets include:

- `Hey_Curio.onnx`
- `Curio.onnx`
- `Robot.onnx`
- `BIMO.onnx`
- Additional custom wake word assets present in `public/models/`

## Model Loading and Caching

Local engines fetch model assets from the app's own origin under `public/models/`.

Production behavior:

- Assets are served with the app.
- The service worker can cache fetched model bytes.
- Engines are lazy-loaded only when selected/used.
- Heavier models are released when the runtime decides they are no longer needed.

## Troubleshooting

**No voices appear.** Try Browser TTS first, then refresh available voices from Settings.

**A local engine hangs on iOS Safari.** Switch to Browser, TinyTTS, Kitten TTS, or Remote TTS. Large WASM/model paths are less reliable on iOS.

**Piper or Pocket TTS is slow or hot on mobile.** Use Kitten, TinyTTS, Browser, or Remote TTS.

**Model files 404.** Check that the expected files exist under `public/models/` and that your hosting path serves static files correctly.

**Audio is choppy.** Try a smaller engine, reduce other dashboard activity, or use a remote TTS endpoint.

**Voice cloning fails.** Use a clean 10-20 second sample, avoid background noise, and confirm the browser has microphone permission if recording.
