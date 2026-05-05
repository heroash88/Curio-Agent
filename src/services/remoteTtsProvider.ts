import {
    getRemoteTtsProviderPresetId,
    getTtsRemoteApiKeyAsync,
    getTtsRemoteModel,
    getTtsRemoteRegion,
    getTtsRemoteSecondaryKeyAsync,
    getTtsRemoteUrl,
} from '../utils/settingsStorage';
import { getSharedAudioContext } from './audioContext';
import {
    getRemoteTtsProviderPreset,
    type RemoteTtsProviderPresetId,
} from './remoteTtsPresets';
import { signAwsRequest } from './awsSigV4';
import { stripEmojiForSpeech } from './ttsTextSanitizer';

export interface RemoteTtsVoice {
    id: string;
    label: string;
}

export interface RemoteTtsSpeakOptions {
    voiceId?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    /** Preset id. Defaults to the stored preset when omitted. */
    presetId?: RemoteTtsProviderPresetId;
    /** Region (Polly, Azure). Defaults to the stored region for the preset. */
    region?: string;
    /** Secondary credential (Polly secret access key). */
    secondaryKey?: string;
}

export interface RemoteTtsListOptions {
    baseUrl?: string;
    apiKey?: string;
    presetId?: RemoteTtsProviderPresetId;
    region?: string;
    secondaryKey?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const trimTrailingSlash = (value: string): string => value.trim().replace(/\/+$/, '');

const resolvePresetId = (override?: RemoteTtsProviderPresetId): RemoteTtsProviderPresetId =>
    override ?? getRemoteTtsProviderPresetId();

const resolveApiKey = async (
    presetId: RemoteTtsProviderPresetId,
    override?: string,
): Promise<string> => {
    if (override !== undefined) return override;
    return (await getTtsRemoteApiKeyAsync(presetId)) || '';
};

const resolveRegion = (presetId: RemoteTtsProviderPresetId, override?: string): string => {
    const preset = getRemoteTtsProviderPreset(presetId);
    const value = (override ?? getTtsRemoteRegion(presetId)).trim();
    return value || preset.defaultRegion || '';
};

const resolveSecondaryKey = async (
    presetId: RemoteTtsProviderPresetId,
    override?: string,
): Promise<string> => {
    if (override !== undefined) return override;
    return (await getTtsRemoteSecondaryKeyAsync(presetId)) || '';
};

const resolveBaseUrl = (presetId: RemoteTtsProviderPresetId, override?: string): string => {
    const preset = getRemoteTtsProviderPreset(presetId);
    // Polly + Azure always build their URL from region, so ignore stored base URL.
    if (presetId === 'amazon_polly' || presetId === 'azure_speech') {
        return '';
    }
    const stored = (override ?? getTtsRemoteUrl()).trim();
    if (stored) return trimTrailingSlash(stored);
    return preset.baseUrl ? trimTrailingSlash(preset.baseUrl) : '';
};

const resolveModel = (presetId: RemoteTtsProviderPresetId, override?: string): string => {
    const preset = getRemoteTtsProviderPreset(presetId);
    const value = override ?? getTtsRemoteModel();
    return value || preset.defaultModel || '';
};

const resolveVoiceId = (presetId: RemoteTtsProviderPresetId, override?: string): string => {
    if (override) return override;
    const preset = getRemoteTtsProviderPreset(presetId);
    return preset.defaultVoiceId || '';
};

const escapeSsml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const decodeBase64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

// Gemini TTS returns raw PCM in base64; wrap in a minimal WAV container so
// AudioContext.decodeAudioData can handle it uniformly with the mp3/opus
// responses from the other providers.
const wrapPcmInWav = (
    pcm: ArrayBuffer,
    sampleRate: number,
    channels = 1,
    bitsPerSample = 16,
): ArrayBuffer => {
    const pcmBytes = new Uint8Array(pcm);
    const byteRate = (sampleRate * channels * bitsPerSample) / 8;
    const blockAlign = (channels * bitsPerSample) / 8;
    const buffer = new ArrayBuffer(44 + pcmBytes.length);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i += 1) {
            view.setUint8(offset + i, value.charCodeAt(i));
        }
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, pcmBytes.length, true);
    new Uint8Array(buffer, 44).set(pcmBytes);
    return buffer;
};

const parseGeminiMimeSampleRate = (mimeType: string | undefined, fallback = 24000): number => {
    if (!mimeType) return fallback;
    const match = /rate=(\d+)/i.exec(mimeType);
    if (!match) return fallback;
    const rate = parseInt(match[1], 10);
    return Number.isFinite(rate) && rate > 0 ? rate : fallback;
};

// ── Provider dispatch ──────────────────────────────────────────────

interface FetchSpeechArgs {
    presetId: RemoteTtsProviderPresetId;
    text: string;
    voiceId: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    region: string;
    secondaryKey: string;
}

interface SpeechResponse {
    arrayBuffer: ArrayBuffer;
    /** Optional sampleRate hint (used for raw-PCM responses like Gemini). */
    pcmSampleRate?: number;
}

const fetchOpenAICompatibleSpeech = async (args: FetchSpeechArgs): Promise<SpeechResponse> => {
    if (!args.baseUrl) throw new Error('Remote TTS URL is not configured.');
    const response = await fetch(`${args.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {}),
        },
        body: JSON.stringify({
            model: args.model || 'tts-1',
            input: args.text,
            voice: args.voiceId || 'alloy',
            response_format: 'mp3',
        }),
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
            `OpenAI TTS failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
    }
    return { arrayBuffer: await response.arrayBuffer() };
};

const fetchElevenLabsSpeech = async (args: FetchSpeechArgs): Promise<SpeechResponse> => {
    const baseUrl = args.baseUrl || 'https://api.elevenlabs.io/v1';
    if (!args.apiKey) throw new Error('ElevenLabs API key is required.');
    const voiceId = args.voiceId || '21m00Tcm4TlvDq8ikWAM';
    const response = await fetch(`${baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': args.apiKey,
            Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
            text: args.text,
            model_id: args.model || 'eleven_multilingual_v2',
        }),
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
            `ElevenLabs TTS failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
    }
    return { arrayBuffer: await response.arrayBuffer() };
};

const fetchGeminiSpeech = async (args: FetchSpeechArgs): Promise<SpeechResponse> => {
    if (!args.apiKey) throw new Error('Gemini API key is required.');
    const baseUrl = args.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const model = args.model || 'gemini-2.5-flash-preview-tts';
    const voiceName = args.voiceId || 'Kore';
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: args.text }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                    },
                },
            },
        }),
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
            `Gemini TTS failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
    }
    const data = await response.json();
    const part = data?.candidates?.[0]?.content?.parts?.find(
        (p: any) => p?.inlineData?.data,
    );
    const inline = part?.inlineData;
    if (!inline?.data) {
        throw new Error('Gemini TTS response did not include audio data.');
    }
    const pcm = decodeBase64ToArrayBuffer(inline.data as string);
    const sampleRate = parseGeminiMimeSampleRate(inline.mimeType);
    return {
        arrayBuffer: wrapPcmInWav(pcm, sampleRate),
        pcmSampleRate: sampleRate,
    };
};

const fetchAmazonPollySpeech = async (args: FetchSpeechArgs): Promise<SpeechResponse> => {
    if (!args.apiKey || !args.secondaryKey) {
        throw new Error('Amazon Polly requires both Access Key ID and Secret Access Key.');
    }
    const region = args.region || 'us-east-1';
    const body = JSON.stringify({
        Text: args.text,
        TextType: 'text',
        VoiceId: args.voiceId || 'Joanna',
        OutputFormat: 'mp3',
        Engine: args.model || 'standard',
    });
    const signed = await signAwsRequest({
        method: 'POST',
        url: `https://polly.${region}.amazonaws.com/v1/speech`,
        service: 'polly',
        region,
        credentials: {
            accessKeyId: args.apiKey,
            secretAccessKey: args.secondaryKey,
        },
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    const response = await fetch(signed.url, signed.init);
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
            `Amazon Polly TTS failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
    }
    return { arrayBuffer: await response.arrayBuffer() };
};

const fetchAzureSpeechSpeech = async (args: FetchSpeechArgs): Promise<SpeechResponse> => {
    if (!args.apiKey) throw new Error('Azure Speech subscription key is required.');
    const region = args.region || 'eastus';
    const voice = args.voiceId || 'en-US-JennyNeural';
    const localeMatch = /^([a-z]{2,3}(?:-[A-Za-z0-9]+)+)/.exec(voice);
    const locale = localeMatch ? localeMatch[1] : 'en-US';
    const ssml = `<speak version="1.0" xml:lang="${locale}"><voice xml:lang="${locale}" name="${voice}">${escapeSsml(args.text)}</voice></speak>`;
    const format = args.model || 'audio-24khz-48kbitrate-mono-mp3';
    const response = await fetch(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': args.apiKey,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': format,
                'User-Agent': 'curio-robot',
            },
            body: ssml,
        },
    );
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
            `Azure Speech TTS failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
    }
    return { arrayBuffer: await response.arrayBuffer() };
};

const fetchSpeech = async (args: FetchSpeechArgs): Promise<SpeechResponse> => {
    switch (args.presetId) {
        case 'elevenlabs':
            return fetchElevenLabsSpeech(args);
        case 'gemini':
            return fetchGeminiSpeech(args);
        case 'amazon_polly':
            return fetchAmazonPollySpeech(args);
        case 'azure_speech':
            return fetchAzureSpeechSpeech(args);
        case 'openai':
        case 'custom':
        default:
            return fetchOpenAICompatibleSpeech(args);
    }
};

// ── Voice / model listing ──────────────────────────────────────────

const listElevenLabsVoices = async (
    baseUrl: string,
    apiKey: string,
): Promise<RemoteTtsVoice[]> => {
    if (!apiKey) return [];
    const response = await fetch(`${baseUrl || 'https://api.elevenlabs.io/v1'}/voices`, {
        headers: { 'xi-api-key': apiKey },
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    const voices: any[] = Array.isArray(data?.voices) ? data.voices : [];
    return voices
        .map((v: any) => ({
            id: v.voice_id || v.id,
            label: v.name || v.voice_id || 'Unnamed',
        }))
        .filter((v: RemoteTtsVoice) => v.id);
};

const GEMINI_BUILTIN_VOICES: RemoteTtsVoice[] = [
    { id: 'Aoede', label: 'Aoede' },
    { id: 'Charon', label: 'Charon' },
    { id: 'Fenrir', label: 'Fenrir' },
    { id: 'Kore', label: 'Kore' },
    { id: 'Leda', label: 'Leda' },
    { id: 'Orus', label: 'Orus' },
    { id: 'Puck', label: 'Puck' },
    { id: 'Zephyr', label: 'Zephyr' },
];

const listPollyVoices = async (
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
): Promise<RemoteTtsVoice[]> => {
    if (!accessKeyId || !secretAccessKey) return [];
    const signed = await signAwsRequest({
        method: 'GET',
        url: `https://polly.${region}.amazonaws.com/v1/voices`,
        service: 'polly',
        region,
        credentials: { accessKeyId, secretAccessKey },
        body: '',
    });
    const response = await fetch(signed.url, signed.init);
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    const voices: any[] = Array.isArray(data?.Voices) ? data.Voices : [];
    return voices
        .map((v: any) => ({
            id: v.Id,
            label: `${v.Name} (${v.LanguageCode}${v.Gender ? ` - ${v.Gender}` : ''})`,
        }))
        .filter((v: RemoteTtsVoice) => v.id);
};

const listAzureVoices = async (
    region: string,
    apiKey: string,
): Promise<RemoteTtsVoice[]> => {
    if (!apiKey) return [];
    const response = await fetch(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        { headers: { 'Ocp-Apim-Subscription-Key': apiKey } },
    );
    if (!response.ok) return [];
    const data = await response.json().catch(() => []);
    return (Array.isArray(data) ? data : [])
        .map((v: any) => ({
            id: v.ShortName || v.Name,
            label: `${v.DisplayName || v.ShortName} (${v.Locale || ''}${v.Gender ? ` - ${v.Gender}` : ''})`,
        }))
        .filter((v: RemoteTtsVoice) => v.id);
};

const listOpenAICompatibleVoices = async (
    baseUrl: string,
    apiKey: string,
): Promise<RemoteTtsVoice[]> => {
    if (!baseUrl) return [];
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const endpoints = ['/audio/voices', '/voices'];
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`${baseUrl}${endpoint}`, { headers });
            if (!response.ok) continue;
            const data = await response.json();
            const voices = Array.isArray(data) ? data : data?.data || [];
            return voices
                .map((v: any) => ({
                    id: v.id || v.voice_id,
                    label: v.name || v.id || 'Unnamed Voice',
                }))
                .filter((v: RemoteTtsVoice) => v.id);
        } catch (error) {
            console.warn(`[RemoteTTS] Failed to fetch voices from ${endpoint}:`, error);
        }
    }
    return [];
};

// ── Public class ───────────────────────────────────────────────────

export class RemoteTtsProvider {
    private activeSources = new Map<AudioBufferSourceNode, () => void>();

    private async getAudioContext(): Promise<AudioContext> {
        const audioContext = getSharedAudioContext(true);
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        return audioContext;
    }

    async speak(text: string, options: RemoteTtsSpeakOptions = {}): Promise<void> {
        const speechText = stripEmojiForSpeech(text);
        if (!speechText) return;

        const presetId = resolvePresetId(options.presetId);
        const baseUrl = resolveBaseUrl(presetId, options.baseUrl);
        const model = resolveModel(presetId, options.model);
        const voiceId = resolveVoiceId(presetId, options.voiceId);
        const apiKey = await resolveApiKey(presetId, options.apiKey);
        const region = resolveRegion(presetId, options.region);
        const secondaryKey = await resolveSecondaryKey(presetId, options.secondaryKey);

        const { arrayBuffer } = await fetchSpeech({
            presetId,
            text: speechText,
            voiceId,
            model,
            baseUrl,
            apiKey,
            region,
            secondaryKey,
        });

        const ctx = await this.getAudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        return new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                this.activeSources.delete(source);
                source.onended = null;
                try {
                    source.disconnect();
                } catch {
                    // Source may already be disconnected by the browser.
                }
            };
            const settle = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };

            this.activeSources.set(source, settle);
            source.onended = settle;

            try {
                source.start(0);
            } catch (error) {
                if (!settled) {
                    settled = true;
                    cleanup();
                    reject(error);
                }
            }
        });
    }

    async listModels(options: RemoteTtsListOptions = {}): Promise<string[]> {
        const presetId = resolvePresetId(options.presetId);
        const preset = getRemoteTtsProviderPreset(presetId);
        // Most presets expose a fixed, documented set of models rather than a
        // listing endpoint. For OpenAI-compatible custom endpoints, try the
        // same /v1/models + /models shape as the text LLM flow.
        if (presetId === 'openai' || presetId === 'custom') {
            const baseUrl = resolveBaseUrl(presetId, options.baseUrl);
            if (!baseUrl) return preset.modelOptions;
            const apiKey = await resolveApiKey(presetId, options.apiKey);
            const headers: Record<string, string> = apiKey
                ? { Authorization: `Bearer ${apiKey}` }
                : {};
            for (const endpoint of ['/models', '/v1/models']) {
                try {
                    const response = await fetch(`${baseUrl}${endpoint}`, { headers });
                    if (!response.ok) continue;
                    const data = await response.json();
                    const models = Array.isArray(data) ? data : data?.data || [];
                    const ids = models
                        .map((m: any) => (typeof m === 'string' ? m : m.id || m.name || m.model_id))
                        .filter(Boolean);
                    if (ids.length > 0) return ids;
                } catch (error) {
                    console.warn(`[RemoteTTS] Failed to fetch models from ${endpoint}:`, error);
                }
            }
        }
        return preset.modelOptions;
    }

    async listVoices(options: RemoteTtsListOptions = {}): Promise<RemoteTtsVoice[]> {
        const presetId = resolvePresetId(options.presetId);
        const apiKey = await resolveApiKey(presetId, options.apiKey);

        switch (presetId) {
            case 'elevenlabs': {
                const baseUrl = resolveBaseUrl(presetId, options.baseUrl);
                return listElevenLabsVoices(baseUrl, apiKey);
            }
            case 'gemini':
                return GEMINI_BUILTIN_VOICES;
            case 'amazon_polly': {
                const region = resolveRegion(presetId, options.region);
                const secondaryKey = await resolveSecondaryKey(presetId, options.secondaryKey);
                return listPollyVoices(region, apiKey, secondaryKey);
            }
            case 'azure_speech': {
                const region = resolveRegion(presetId, options.region);
                return listAzureVoices(region, apiKey);
            }
            case 'openai':
            case 'custom':
            default: {
                const baseUrl = resolveBaseUrl(presetId, options.baseUrl);
                return listOpenAICompatibleVoices(baseUrl, apiKey);
            }
        }
    }

    async stop(): Promise<void> {
        const activeSources = [...this.activeSources.entries()];
        this.activeSources.clear();

        for (const [source, settle] of activeSources) {
            source.onended = null;
            try {
                source.stop();
            } catch {
                // Ignore sources that have already ended or cannot be stopped.
            }
            settle();
        }
    }
}
