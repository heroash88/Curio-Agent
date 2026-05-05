// Presets for the "Remote" Custom TTS engine. This mirrors the text LLM
// provider preset shape from src/services/ai/openAICompatiblePresets.ts so
// the Remote TTS UI can render a preset selector with per-provider defaults
// and advanced OpenAI-compatible "Custom" as the escape hatch.
//
// Implementation details for each preset (endpoint, headers, body, response)
// live in src/services/remoteTtsProvider.ts; this file only describes the
// user-visible choices and their default values.

export type RemoteTtsProviderPresetId =
  | 'openai'
  | 'elevenlabs'
  | 'gemini'
  | 'amazon_polly'
  | 'azure_speech'
  | 'custom';

export interface RemoteTtsProviderPreset {
  id: RemoteTtsProviderPresetId;
  label: string;
  description: string;
  /** Default base URL shown in the preset. Empty string for presets that
   *  derive the URL at call time (for example Azure, which embeds the region
   *  in the hostname). */
  baseUrl: string;
  /** Placeholder shown when the base URL field is editable (Custom only). */
  baseUrlPlaceholder?: string;
  /** Preset-specific field visibility: users can always edit the URL for
   *  Custom, but some presets intentionally hide the URL field to reduce
   *  configuration noise. */
  showBaseUrlInput?: boolean;
  defaultModel: string;
  modelOptions: string[];
  modelLabel?: string;
  modelPlaceholder?: string;
  defaultVoiceId?: string;
  voicePlaceholder?: string;
  /** Primary credential label. For presets with a secondary credential
   *  (Polly, Azure) this is the access/subscription key. */
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  /** Some providers also need a secondary credential. */
  secondaryKeyLabel?: string;
  secondaryKeyPlaceholder?: string;
  /** Region field, used by Polly and Azure. */
  regionLabel?: string;
  regionPlaceholder?: string;
  regionOptions?: string[];
  defaultRegion?: string;
  /** Marks the preset as "advanced / expert" so the UI can visually
   *  de-emphasize it in the provider picker. */
  advanced?: boolean;
  /** Hint/help text rendered under the credential section. */
  hint?: string;
}

export const REMOTE_TTS_PROVIDER_PRESETS: RemoteTtsProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI /audio/speech endpoint.',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'tts-1',
    modelOptions: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'],
    defaultVoiceId: 'alloy',
    voicePlaceholder: 'alloy, nova, shimmer, echo, fable, onyx',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyPlaceholder: 'sk-...',
    hint: 'Uses the standard OpenAI Text-to-Speech API.',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'ElevenLabs text-to-speech API.',
    baseUrl: 'https://api.elevenlabs.io/v1',
    defaultModel: 'eleven_multilingual_v2',
    modelOptions: [
      'eleven_multilingual_v2',
      'eleven_flash_v2_5',
      'eleven_turbo_v2_5',
      'eleven_v3',
    ],
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
    voicePlaceholder: 'ElevenLabs voice_id...',
    apiKeyLabel: 'ElevenLabs API Key',
    apiKeyPlaceholder: 'xi-api-key...',
    hint: 'Fetch voices after saving the key to populate the voice picker.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini TTS preview models.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash-preview-tts',
    modelOptions: [
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
    ],
    defaultVoiceId: 'Kore',
    voicePlaceholder: 'Kore, Puck, Charon, ...',
    apiKeyLabel: 'Gemini API Key',
    apiKeyPlaceholder: 'AIza...',
    hint: 'Uses the Gemini generateContent endpoint with audio response modality.',
  },
  {
    id: 'amazon_polly',
    label: 'Amazon Polly',
    description: 'AWS Polly SynthesizeSpeech (SigV4).',
    // The Polly hostname embeds the region; the provider builds the real URL
    // from region at call time. The baseUrl below is only a display hint.
    baseUrl: 'https://polly.<region>.amazonaws.com',
    defaultModel: 'standard',
    modelOptions: ['standard', 'neural', 'long-form', 'generative'],
    modelLabel: 'Engine',
    defaultVoiceId: 'Joanna',
    voicePlaceholder: 'Joanna, Matthew, Ivy, Amy, ...',
    apiKeyLabel: 'AWS Access Key ID',
    apiKeyPlaceholder: 'AKIA...',
    secondaryKeyLabel: 'AWS Secret Access Key',
    secondaryKeyPlaceholder: 'aws secret access key...',
    regionLabel: 'Region',
    regionPlaceholder: 'us-east-1',
    regionOptions: [
      'us-east-1',
      'us-east-2',
      'us-west-1',
      'us-west-2',
      'eu-central-1',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
      'eu-north-1',
      'ap-northeast-1',
      'ap-northeast-2',
      'ap-south-1',
      'ap-southeast-1',
      'ap-southeast-2',
      'ca-central-1',
      'sa-east-1',
    ],
    defaultRegion: 'us-east-1',
    hint: 'Uses SigV4-signed requests directly from the browser. Create an IAM user with polly:SynthesizeSpeech and polly:DescribeVoices.',
  },
  {
    id: 'azure_speech',
    label: 'Azure Speech',
    description: 'Azure Cognitive Services Speech (TTS).',
    baseUrl: 'https://<region>.tts.speech.microsoft.com',
    defaultModel: 'audio-24khz-48kbitrate-mono-mp3',
    modelOptions: [
      'audio-16khz-32kbitrate-mono-mp3',
      'audio-24khz-48kbitrate-mono-mp3',
      'audio-24khz-96kbitrate-mono-mp3',
      'audio-48khz-96kbitrate-mono-mp3',
      'audio-48khz-192kbitrate-mono-mp3',
    ],
    modelLabel: 'Audio Format',
    defaultVoiceId: 'en-US-JennyNeural',
    voicePlaceholder: 'en-US-JennyNeural, en-US-GuyNeural, ...',
    apiKeyLabel: 'Subscription Key',
    apiKeyPlaceholder: 'Azure Speech subscription key...',
    regionLabel: 'Region',
    regionPlaceholder: 'eastus',
    regionOptions: [
      'eastus',
      'eastus2',
      'westus',
      'westus2',
      'westus3',
      'centralus',
      'northcentralus',
      'southcentralus',
      'westeurope',
      'northeurope',
      'uksouth',
      'francecentral',
      'switzerlandnorth',
      'germanywestcentral',
      'eastasia',
      'southeastasia',
      'japaneast',
      'japanwest',
      'koreacentral',
      'australiaeast',
      'brazilsouth',
      'canadacentral',
      'centralindia',
    ],
    defaultRegion: 'eastus',
    hint: 'SSML-based synthesis; the voice id encodes locale (for example en-US-JennyNeural).',
  },
  {
    id: 'custom',
    label: 'Custom (Advanced)',
    description: 'OpenAI-compatible /audio/speech endpoint on a custom server.',
    baseUrl: '',
    defaultModel: 'tts-1',
    modelOptions: ['tts-1'],
    modelPlaceholder: 'tts-1, piper, ...',
    defaultVoiceId: 'alloy',
    voicePlaceholder: 'voice id',
    baseUrlPlaceholder: 'https://your-tts-server.com/v1',
    showBaseUrlInput: true,
    apiKeyLabel: 'API Key (optional)',
    apiKeyPlaceholder: 'Provider API key...',
    advanced: true,
    hint: 'Any OpenAI-compatible TTS server. Leave the key blank for unauthenticated servers.',
  },
];

const PRESET_BY_ID = new Map(
  REMOTE_TTS_PROVIDER_PRESETS.map((preset) => [preset.id, preset]),
);

export const getRemoteTtsProviderPreset = (
  id?: string | null,
): RemoteTtsProviderPreset =>
  (PRESET_BY_ID.get(id as RemoteTtsProviderPresetId) ??
    PRESET_BY_ID.get('openai')) as RemoteTtsProviderPreset;

export const isRemoteTtsProviderPresetId = (
  value: string | null | undefined,
): value is RemoteTtsProviderPresetId =>
  Boolean(value && PRESET_BY_ID.has(value as RemoteTtsProviderPresetId));

export const DEFAULT_REMOTE_TTS_PROVIDER_PRESET_ID: RemoteTtsProviderPresetId =
  'openai';
