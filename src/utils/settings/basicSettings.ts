import { useSyncExternalStore } from 'react';
import { DEFAULT_GEMINI_LIVE_VOICE_ID, normalizeGeminiLiveVoiceId } from '../../services/geminiVoiceCatalog';
import { DEFAULT_WAKE_WORD_ENABLED, DEFAULT_WAKE_WORD_ID, resolveWakeWordId } from '../../services/wakeWordCatalog';
import { setSecret } from '../secretStorage';
import { subscribeToSettingsStorage, useSettingsStorageValue } from './core';

export const getLiveApiVoiceId = () => {
    if (typeof window === 'undefined') {
        return DEFAULT_GEMINI_LIVE_VOICE_ID;
    }
    return normalizeGeminiLiveVoiceId(localStorage.getItem('curio_liveapi_voice'));
};

export const useLiveApiVoiceId = () => useSettingsStorageValue(getLiveApiVoiceId, DEFAULT_GEMINI_LIVE_VOICE_ID);

export const getWakeWordEnabled = () => {
    if (typeof window === 'undefined') {
        return DEFAULT_WAKE_WORD_ENABLED;
    }
    return localStorage.getItem('curio_enable_wake_word') === 'true';
};

export const useWakeWordEnabled = () =>
    useSettingsStorageValue(getWakeWordEnabled, DEFAULT_WAKE_WORD_ENABLED);

export const getSelectedWakeWordId = () => {
    if (typeof window === 'undefined') {
        return DEFAULT_WAKE_WORD_ID;
    }
    return resolveWakeWordId(localStorage.getItem('curio_wake_word_id'));
};

export const useSelectedWakeWordId = () =>
    useSettingsStorageValue(getSelectedWakeWordId, DEFAULT_WAKE_WORD_ID);

export const getGeminiApiKey = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    return localStorage.getItem('gemini_live_api_key') || '';
};

export const useGeminiApiKey = () =>
    useSettingsStorageValue(getGeminiApiKey, '');

export const getUserName = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    return localStorage.getItem('curio_user_name') || '';
};

export const useUserName = () =>
    useSettingsStorageValue(getUserName, '');

export const getUserAvatarDataUrl = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    return localStorage.getItem('curio_user_avatar_data_url') || '';
};

export const useUserAvatarDataUrl = () =>
    useSettingsStorageValue(getUserAvatarDataUrl, '');

export const getDashboardTitle = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_dashboard_title') || '';
};

export const setDashboardTitle = (title: string) => {
    localStorage.setItem('curio_dashboard_title', title);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useDashboardTitle = () => useSettingsStorageValue(getDashboardTitle, '');

export const getWeatherCity = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    return localStorage.getItem('curio-weather-city') || '';
};

export const useWeatherCity = () =>
    useSettingsStorageValue(getWeatherCity, '');

export const getTempUnit = () => {
    if (typeof window === 'undefined') {
        return 'F';
    }
    return (localStorage.getItem('curio-temp-unit') as 'F' | 'C') || 'F';
};

export const useTempUnit = () =>
    useSettingsStorageValue(getTempUnit, 'F');

export const getHomeLocation = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_home_location') || '';
};

export const setHomeLocation = (val: string) => {
    localStorage.setItem('curio_home_location', val);
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useHomeLocation = () => useSettingsStorageValue(getHomeLocation, '');

export const getWorkLocation = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_work_location') || '';
};

export const setWorkLocation = (val: string) => {
    localStorage.setItem('curio_work_location', val);
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useWorkLocation = () => useSettingsStorageValue(getWorkLocation, '');

export interface CustomLocationEntry {
    label: string;
    address: string;
}

export const getCustomLocations = (): CustomLocationEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem('curio_custom_locations');
        if (!raw) {
            // Migrate legacy single custom location
            const legacyLabel = localStorage.getItem('curio_custom_location_label') || '';
            const legacyAddr = localStorage.getItem('curio_custom_location') || '';
            if (legacyLabel && legacyAddr) {
                const migrated = [{ label: legacyLabel, address: legacyAddr }];
                localStorage.setItem('curio_custom_locations', JSON.stringify(migrated));
                localStorage.removeItem('curio_custom_location_label');
                localStorage.removeItem('curio_custom_location');
                return migrated;
            }
            return [];
        }
        return JSON.parse(raw) as CustomLocationEntry[];
    } catch { return []; }
};

export const setCustomLocations = (entries: CustomLocationEntry[]) => {
    localStorage.setItem('curio_custom_locations', JSON.stringify(entries));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// Cached snapshot for useSyncExternalStore
let _cachedLocationsJson = '';
let _cachedLocations: CustomLocationEntry[] = [];

const getCustomLocationsSnapshot = (): CustomLocationEntry[] => {
    const entries = getCustomLocations();
    const json = JSON.stringify(entries);
    if (json !== _cachedLocationsJson) {
        _cachedLocationsJson = json;
        _cachedLocations = entries;
    }
    return _cachedLocations;
};

export const useCustomLocations = () =>
    useSyncExternalStore(subscribeToSettingsStorage, getCustomLocationsSnapshot, () => _cachedLocations);

// Keep legacy exports as thin wrappers for backward compat during transition
export const getCustomLocation = () => getCustomLocations()[0]?.address || '';
export const setCustomLocation = (_val: string) => { /* no-op, use setCustomLocations */ };
export const useCustomLocation = () => useSettingsStorageValue(getCustomLocation, '');
export const getCustomLocationLabel = () => getCustomLocations()[0]?.label || '';
export const setCustomLocationLabel = (_val: string) => { /* no-op, use setCustomLocations */ };
export const useCustomLocationLabel = () => useSettingsStorageValue(getCustomLocationLabel, '');


export const setApiKey = async (key: string) => {
    await setSecret('gemini_live_api_key', key);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setWakeWordEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_enable_wake_word', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setSelectedWakeWordId = (id: string) => {
    localStorage.setItem('curio_wake_word_id', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setLiveApiVoiceId = (id: string) => {
    localStorage.setItem('curio_liveapi_voice', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setUserName = (name: string) => {
    localStorage.setItem('curio_user_name', name);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setUserAvatarDataUrl = (value: string) => {
    if (value) {
        localStorage.setItem('curio_user_avatar_data_url', value);
    } else {
        localStorage.removeItem('curio_user_avatar_data_url');
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setWeatherCity = (city: string) => {
    localStorage.setItem('curio-weather-city', city);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setTempUnit = (unit: 'F' | 'C') => {
    localStorage.setItem('curio-temp-unit', unit);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

