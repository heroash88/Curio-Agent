import { createOrtWasmPaths } from '../ortWasmConfig';

export const PIPER_LOCAL_MODEL_PATH = '/models/piper-tts';

export type PiperVoiceQuality = 'low' | 'medium';

export interface PiperVoiceDefinition {
  id: string;
  label: string;
  language: string;
  speaker: string;
  quality: PiperVoiceQuality;
}

const piperVoice = (
  id: string,
  label: string,
  language: string,
  speaker: string,
  quality: PiperVoiceQuality,
): PiperVoiceDefinition => ({ id, label, language, speaker, quality });

export const PIPER_VOICES: PiperVoiceDefinition[] = [
  piperVoice('en_US-lessac-low', 'Lessac - US English (low)', 'English (US)', 'Lessac', 'low'),
  piperVoice('en_US-lessac-medium', 'Lessac - US English (medium)', 'English (US)', 'Lessac', 'medium'),
  piperVoice('en_US-amy-low', 'Amy - US English female (low)', 'English (US)', 'Amy', 'low'),
  piperVoice('en_US-amy-medium', 'Amy - US English female (medium)', 'English (US)', 'Amy', 'medium'),
  piperVoice('en_US-kathleen-low', 'Kathleen - US English female (low)', 'English (US)', 'Kathleen', 'low'),
  piperVoice('en_US-hfc_female-medium', 'HFC Female - US English (medium)', 'English (US)', 'HFC Female', 'medium'),
  piperVoice('en_US-hfc_male-medium', 'HFC Male - US English (medium)', 'English (US)', 'HFC Male', 'medium'),
  piperVoice('en_GB-alba-medium', 'Alba - British English female (medium)', 'English (UK)', 'Alba', 'medium'),
  piperVoice('en_GB-cori-medium', 'Cori - British English (medium)', 'English (UK)', 'Cori', 'medium'),
];

export const DEFAULT_PIPER_VOICE = 'en_US-lessac-medium';

export const PIPER_WASM_PATHS = {
  onnxWasm: createOrtWasmPaths(),
  piperData: `${PIPER_LOCAL_MODEL_PATH}/wasm/piper_phonemize.data`,
  piperWasm: `${PIPER_LOCAL_MODEL_PATH}/wasm/piper_phonemize.wasm`,
} as const;

const PIPER_FETCH_PATCH = Symbol.for('curio.piperLocalVoiceFetchPatch');
const PIPER_REMOTE_PREFIXES = [
  'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/',
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/',
  'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/',
] as const;

type PatchedFetch = typeof fetch & {
  [PIPER_FETCH_PATCH]?: true;
};

const PIPER_VOICE_IDS = new Set(PIPER_VOICES.map((voice) => voice.id));
const isPiperRemoteUrl = (url: string): boolean =>
  PIPER_REMOTE_PREFIXES.some((prefix) => url.startsWith(prefix));

const getFetchInputUrl = (input: Parameters<typeof fetch>[0]): string | null => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return null;
};

export const piperLocalAssetPath = (url: string): string | null => {
  const matchedPrefix = PIPER_REMOTE_PREFIXES.find((prefix) => url.startsWith(prefix));
  if (!matchedPrefix) return null;

  const fileName = url
    .slice(matchedPrefix.length)
    .split(/[?#]/, 1)[0]
    .split('/')
    .at(-1);
  if (!fileName) return null;

  const match = fileName.match(/^([a-z]{2}_[A-Z]{2}-[a-z0-9_]+-(?:low|medium|high))\.onnx(?:\.json)?$/);
  if (!match || !PIPER_VOICE_IDS.has(match[1])) return null;

  return `${PIPER_LOCAL_MODEL_PATH}/voices/${match[1]}/${fileName}`;
};

export const installLocalPiperFetch = (): void => {
  if (typeof fetch !== 'function') return;
  const currentFetch = globalThis.fetch as PatchedFetch;
  if (currentFetch[PIPER_FETCH_PATCH]) return;

  const baseFetch = currentFetch.bind(globalThis);
  const patchedFetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const requestedUrl = getFetchInputUrl(input);
    const localModelUrl = requestedUrl ? piperLocalAssetPath(requestedUrl) : null;
    if (requestedUrl && !localModelUrl && isPiperRemoteUrl(requestedUrl)) {
      return Promise.reject(new Error(`Piper TTS is offline-only. Add ${requestedUrl} to the bundled Piper voice catalog before using it.`));
    }
    return baseFetch(localModelUrl ?? input, init);
  }) as PatchedFetch;
  patchedFetch[PIPER_FETCH_PATCH] = true;
  globalThis.fetch = patchedFetch;
};

const headOk = async (url: string, timeoutMs: number): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.ok && !(response.headers.get('content-type') || '').includes('text/html')) {
      return true;
    }

    const fallback = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    });
    return (fallback.ok || fallback.status === 206) &&
      !(fallback.headers.get('content-type') || '').includes('text/html');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const piperVoiceAssetPaths = (voiceIds: readonly string[]): string[] => Array.from(new Set(
  voiceIds.flatMap((voiceId) => [
    `${PIPER_LOCAL_MODEL_PATH}/voices/${voiceId}/${voiceId}.onnx`,
    `${PIPER_LOCAL_MODEL_PATH}/voices/${voiceId}/${voiceId}.onnx.json`,
  ]),
));

export const assertPiperLocalAssetsAvailable = async (
  voiceIds: readonly string[] = [DEFAULT_PIPER_VOICE],
  options: { includeRuntime?: boolean; timeoutMs?: number } = {},
): Promise<void> => {
  if (typeof fetch !== 'function') return;

  const timeoutMs = Math.max(500, options.timeoutMs ?? 5_000);
  const includeRuntime = options.includeRuntime ?? true;
  const missing: string[] = [];
  const assetPaths = [
    ...(includeRuntime ? [PIPER_WASM_PATHS.piperWasm, PIPER_WASM_PATHS.piperData] : []),
    ...piperVoiceAssetPaths(voiceIds),
  ];

  await Promise.all(assetPaths.map(async (path) => {
    if (!(await headOk(path, timeoutMs))) {
      missing.push(path);
    }
  }));

  if (missing.length > 0) {
    throw new Error(
      `Missing local Piper TTS assets: ${missing.join(', ')}. Run npm run sync:piper-assets to restore them.`,
    );
  }
};
