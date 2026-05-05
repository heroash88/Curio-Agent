export interface GeminiLiveVoiceOption {
    id: string;
    name: string;
    style: string;
}

export const GEMINI_LIVE_VOICES: GeminiLiveVoiceOption[] = [
    { id: 'Zephyr', name: 'Zephyr', style: 'Bright' },
    { id: 'Puck', name: 'Puck', style: 'Upbeat' },
    { id: 'Charon', name: 'Charon', style: 'Informative' },
    { id: 'Kore', name: 'Kore', style: 'Firm' },
    { id: 'Fenrir', name: 'Fenrir', style: 'Excitable' },
    { id: 'Leda', name: 'Leda', style: 'Youthful' },
    { id: 'Orus', name: 'Orus', style: 'Firm' },
    { id: 'Aoede', name: 'Aoede', style: 'Breezy' },
    { id: 'Callirrhoe', name: 'Callirrhoe', style: 'Easy-going' },
    { id: 'Autonoe', name: 'Autonoe', style: 'Bright' },
    { id: 'Enceladus', name: 'Enceladus', style: 'Breathy' },
    { id: 'Iapetus', name: 'Iapetus', style: 'Clear' },
    { id: 'Umbriel', name: 'Umbriel', style: 'Easy-going' },
    { id: 'Algieba', name: 'Algieba', style: 'Smooth' },
    { id: 'Despina', name: 'Despina', style: 'Smooth' },
    { id: 'Erinome', name: 'Erinome', style: 'Clear' },
    { id: 'Algenib', name: 'Algenib', style: 'Gravelly' },
    { id: 'Rasalgethi', name: 'Rasalgethi', style: 'Informative' },
    { id: 'Laomedeia', name: 'Laomedeia', style: 'Upbeat' },
    { id: 'Achernar', name: 'Achernar', style: 'Soft' },
    { id: 'Alnilam', name: 'Alnilam', style: 'Firm' },
    { id: 'Schedar', name: 'Schedar', style: 'Even' },
    { id: 'Gacrux', name: 'Gacrux', style: 'Mature' },
    { id: 'Pulcherrima', name: 'Pulcherrima', style: 'Forward' },
    { id: 'Achird', name: 'Achird', style: 'Friendly' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi', style: 'Casual' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix', style: 'Gentle' },
    { id: 'Sadachbia', name: 'Sadachbia', style: 'Lively' },
    { id: 'Sadaltager', name: 'Sadaltager', style: 'Knowledgeable' },
    { id: 'Sulafat', name: 'Sulafat', style: 'Warm' }
];

export const DEFAULT_GEMINI_LIVE_VOICE_ID = 'Aoede';

export const isGeminiLiveVoiceId = (voiceId: string | null | undefined): boolean =>
    GEMINI_LIVE_VOICES.some((voice) => voice.id === voiceId);

export const normalizeGeminiLiveVoiceId = (voiceId: string | null | undefined): string =>
    isGeminiLiveVoiceId(voiceId) ? String(voiceId) : DEFAULT_GEMINI_LIVE_VOICE_ID;
