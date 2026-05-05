import { getApiKeyAsync } from '../services/ai/config';
import { useSettingsStorageValue } from './settingsStorage';

export const getActiveAiApiKey = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    // Synchronous fallback — returns '' if encrypted.
    // Callers that need the real key should use getActiveAiApiKeyAsync().
    return '';
};

export const getActiveAiApiKeyAsync = async (): Promise<string> => {
    return (await getApiKeyAsync()) || '';
};

export const useActiveAiApiKey = () => useSettingsStorageValue(getActiveAiApiKey, '');
