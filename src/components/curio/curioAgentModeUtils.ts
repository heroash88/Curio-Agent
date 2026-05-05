import type { CurioState } from '../../services/emotionDetection';

export type EffectiveTranscriptInput = {
    isConnected: boolean;
    haVoiceActive: boolean;
    offlineActive: boolean;
    textOnlyActive: boolean;
    customLlmVoiceActive: boolean;
    isSpeaking: boolean;
    offlineSpeaking: boolean;
    userTranscript: string | null | undefined;
    modelTranscript: string | null | undefined;
    offlineUserTranscript: string | null;
    offlineModelTranscript: string | null;
    haUserTranscript: string | null;
    haModelTranscript: string | null;
};

export type EffectiveTranscriptState = {
    effectiveUserTranscript: string | null;
    effectiveModelTranscript: string | null;
    effectiveIsSpeaking: boolean;
    anySessionActive: boolean;
};

export function getEffectiveTranscriptState(input: EffectiveTranscriptInput): EffectiveTranscriptState {
    const liveHasResponse = input.isConnected && input.modelTranscript != null;

    const effectiveUserTranscript =
        input.haVoiceActive && input.haUserTranscript != null ? input.haUserTranscript
        : liveHasResponse ? (input.userTranscript ?? null)
        : (input.offlineActive || input.textOnlyActive) && input.offlineUserTranscript != null ? input.offlineUserTranscript
        : input.haVoiceActive ? input.haUserTranscript
        : input.isConnected ? (input.userTranscript ?? null)
        : input.offlineUserTranscript;

    const effectiveModelTranscript =
        input.haVoiceActive && input.haModelTranscript != null ? input.haModelTranscript
        : liveHasResponse ? (input.modelTranscript ?? null)
        : (input.offlineActive || input.textOnlyActive) && input.offlineModelTranscript != null ? input.offlineModelTranscript
        : input.haVoiceActive ? input.haModelTranscript
        : input.isConnected ? (input.modelTranscript ?? null)
        : input.offlineModelTranscript;

    const effectiveIsSpeaking =
        input.haVoiceActive ? false
        : liveHasResponse ? input.isSpeaking
        : (input.offlineActive || input.textOnlyActive) ? input.offlineSpeaking
        : input.isSpeaking;

    return {
        effectiveUserTranscript: effectiveUserTranscript ?? null,
        effectiveModelTranscript: effectiveModelTranscript ?? null,
        effectiveIsSpeaking,
        anySessionActive: input.isConnected
            || input.haVoiceActive
            || input.offlineActive
            || input.textOnlyActive
            || input.customLlmVoiceActive,
    };
}

export type CurioRuntimeStateInput = {
    playbackState: string;
    isConnecting: boolean;
    haVoiceConnecting: boolean;
    isConnected: boolean;
    haVoiceActive: boolean;
    isSpeaking: boolean;
    offlineActive: boolean;
    textOnlyActive: boolean;
    customLlmVoiceActive: boolean;
    offlineSpeaking: boolean;
    error: string | null | undefined;
    cameraEnabled: boolean;
};

export function getCurioRuntimeState(input: CurioRuntimeStateInput): CurioState {
    if (input.playbackState === 'playing') return 'dancing';
    if (input.isConnecting || input.haVoiceConnecting) return 'warmup';
    if (input.isConnected || input.haVoiceActive) return input.isSpeaking ? 'speaking' : 'listening';
    if (input.offlineActive || input.textOnlyActive || input.customLlmVoiceActive) {
        return input.offlineSpeaking ? 'speaking' : 'listening';
    }
    if (input.error) return 'error';
    if (input.cameraEnabled) return 'capturing';
    return 'idle';
}

export function stripFencedTranscriptBlocks(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/```[\s\S]*$/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const PAREN_MARKDOWN_CITATIONS_RE = /\s*\((?:\s*\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)]+\)\s*)+\)/gi;
const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi;
const BARE_URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

export function sanitizeTextForSpokenTranscript(text: string): string {
    return stripFencedTranscriptBlocks(text)
        .replace(PAREN_MARKDOWN_CITATIONS_RE, '')
        .replace(MARKDOWN_LINK_RE, '$1')
        .replace(/\s*\((?:https?:\/\/|www\.)[^)\s]+[^)]*\)/gi, '')
        .replace(BARE_URL_RE, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\s+([,.!?;:])/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
