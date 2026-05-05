import type { VoiceBackend } from '../../utils/settingsStorage';

interface VoiceConnectionStateInput {
    isConnected: boolean;
    isConnecting: boolean;
    haVoiceActive: boolean;
    haVoiceConnecting: boolean;
    offlineActive: boolean;
    customLlmVoiceActive: boolean;
}

export interface VoiceConnectionUiState {
    active: boolean;
    busy: boolean;
    label: 'Connect' | 'Connecting...' | 'Disconnect';
}

export type VoiceConnectionToggleAction =
    | 'toggle_ha_voice'
    | 'toggle_offline_voice'
    | 'toggle_custom_llm_voice'
    | 'disconnect_live'
    | 'connect_live';

export const getVoiceConnectionUiState = ({
    isConnected,
    isConnecting,
    haVoiceActive,
    haVoiceConnecting,
    offlineActive,
    customLlmVoiceActive,
}: VoiceConnectionStateInput): VoiceConnectionUiState => {
    const busy = isConnecting || haVoiceConnecting;
    const active = isConnected || haVoiceActive || offlineActive || customLlmVoiceActive;

    return {
        active,
        busy,
        label: busy ? 'Connecting...' : active ? 'Disconnect' : 'Connect',
    };
};

export const getVoiceConnectionToggleAction = ({
    voiceBackend,
    isConnected,
    isConnecting,
}: VoiceConnectionStateInput & { voiceBackend: VoiceBackend }): VoiceConnectionToggleAction => {
    if (voiceBackend === 'ha_voice_pipeline') return 'toggle_ha_voice';
    if (voiceBackend === 'offline') return 'toggle_offline_voice';
    if (voiceBackend === 'custom_llm') return 'toggle_custom_llm_voice';
    if (isConnected || isConnecting) return 'disconnect_live';
    return 'connect_live';
};
