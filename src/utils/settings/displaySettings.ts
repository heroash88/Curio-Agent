import { useEffect, useMemo } from 'react';
import { DEFAULT_WAKE_WORD_ID } from '../../services/wakeWordCatalog';
import { createBrowserDeviceProfile, isAutoLowPowerBrowserDevice } from '../../services/browserDeviceProfile';
import { useSettingsStorageValue } from './core';
import { getSelectedWakeWordId, setSelectedWakeWordId } from './basicSettings';
import { getPersonalityId, setPersonalityId, type PersonalityId } from './personalitySettings';

// --- App Background ---
export type AppBackgroundStyle = 'default' | 'solid' | 'gradient' | 'image' | 'animated';

export interface AppBackgroundPreset {
    id: string;
    label: string;
    value: string;
    style: Exclude<AppBackgroundStyle, 'default'>;
    preview?: string;
    dark?: boolean;
}

// Signature face backgrounds -- exported so setFaceStyleId can auto-apply them
// and so CurioAgentMode can fall back to the same value when bg is 'default'.
export const KIRO_BG_VALUE = 'radial-gradient(circle at 50% 50%, #8E48FF, #3E1087)';
export const BENDER_BG_VALUE = 'radial-gradient(circle, #a6b4c4, #59798e)';

export const APP_BACKGROUND_PRESETS: AppBackgroundPreset[] = [
    { id: 'curio-studio-light', label: 'Studio Light', value: '/assets/backgrounds/curio-studio-light.png', style: 'image', dark: false },
    { id: 'curio-lab-dark', label: 'Lab Dark', value: '/assets/backgrounds/curio-lab-dark.png', style: 'image', dark: true },
    { id: 'curio-atrium-neutral', label: 'Atrium', value: '/assets/backgrounds/curio-atrium-neutral.png', style: 'image', dark: false },
    { id: 'dashboard-morning-glass', label: 'Morning Glass', value: '/assets/backgrounds/dashboard-morning-glass-light.svg', style: 'image', dark: false },
    { id: 'dashboard-paper-sky', label: 'Paper Sky', value: '/assets/backgrounds/dashboard-paper-sky-light.svg', style: 'image', dark: false },
    { id: 'dashboard-sage-atelier', label: 'Sage Atelier', value: '/assets/backgrounds/dashboard-sage-atelier-light.svg', style: 'image', dark: false },
    { id: 'dashboard-midnight-mesh', label: 'Midnight Mesh', value: '/assets/backgrounds/dashboard-midnight-mesh-dark.svg', style: 'image', dark: true },
    { id: 'dashboard-aurora-noir', label: 'Aurora Noir', value: '/assets/backgrounds/dashboard-aurora-noir-dark.svg', style: 'image', dark: true },
    { id: 'dashboard-ember-noir', label: 'Ember Noir', value: '/assets/backgrounds/dashboard-ember-noir-dark.svg', style: 'image', dark: true },
    { id: 'aurora-glass', label: 'Aurora Glass', value: 'radial-gradient(circle at 18% 20%, #d8f3ff 0%, transparent 30%), radial-gradient(circle at 82% 18%, #f4d8ff 0%, transparent 28%), linear-gradient(135deg, #102033 0%, #263c54 46%, #eef4ef 100%)', style: 'gradient', dark: true },
    { id: 'paper-lantern', label: 'Paper Lantern', value: 'radial-gradient(circle at 24% 18%, #fff7d6 0%, transparent 34%), linear-gradient(135deg, #f7eee2 0%, #e6d7c3 48%, #9fb6bf 100%)', style: 'gradient', dark: false },
    { id: 'night-garden', label: 'Night Garden', value: 'radial-gradient(circle at 78% 22%, rgba(129, 230, 217, 0.34) 0%, transparent 28%), linear-gradient(140deg, #091816 0%, #18322d 52%, #1f2a44 100%)', style: 'gradient', dark: true },
    { id: 'dawn-studio', label: 'Dawn Studio', value: 'linear-gradient(140deg, #f8efe3 0%, #dceaf0 44%, #bfc8d8 100%)', style: 'gradient', dark: false },
    { id: 'copper-blue', label: 'Copper Blue', value: 'radial-gradient(circle at 20% 18%, rgba(245, 158, 11, 0.34), transparent 30%), linear-gradient(145deg, #18202a 0%, #27435a 48%, #806047 100%)', style: 'gradient', dark: true },
    { id: 'slate', label: 'Slate', value: '#475569', style: 'solid', dark: true },
    { id: 'storm', label: 'Storm', value: '#64748b', style: 'solid', dark: false },
    { id: 'navy', label: 'Navy', value: '#3b5998', style: 'solid', dark: true },
    { id: 'ocean', label: 'Ocean', value: '#2563eb', style: 'solid', dark: true },
    { id: 'teal', label: 'Teal', value: '#0d9488', style: 'solid', dark: true },
    { id: 'forest', label: 'Forest', value: '#16a34a', style: 'solid', dark: true },
    { id: 'wine', label: 'Wine', value: '#9f1239', style: 'solid', dark: true },
    { id: 'plum', label: 'Plum', value: '#7c3aed', style: 'solid', dark: true },
    { id: 'sky', label: 'Sky', value: '#7dd3fc', style: 'solid', dark: false },
    { id: 'lavender', label: 'Lavender', value: '#c4b5fd', style: 'solid', dark: false },
    { id: 'peach', label: 'Peach', value: '#fdba74', style: 'solid', dark: false },
    { id: 'mint', label: 'Mint', value: '#86efac', style: 'solid', dark: false },
    { id: 'cream', label: 'Cream', value: '#fef3c7', style: 'solid', dark: false },
    { id: 'blush', label: 'Blush', value: '#fecdd3', style: 'solid', dark: false },
    { id: 'kiro-purple', label: 'Kiro Purple', value: KIRO_BG_VALUE, style: 'gradient', dark: true },
    { id: 'bender-gray', label: 'Bender Gray', value: BENDER_BG_VALUE, style: 'gradient', dark: true },
];

export const getAppBackgroundStyle = (): AppBackgroundStyle => {
    if (typeof window === 'undefined') return 'default';
    const value = localStorage.getItem('curio_app_bg_style') as AppBackgroundStyle | null;
    if (value === 'solid' || value === 'gradient' || value === 'image') return value;
    return 'default';
};
export const setAppBackgroundStyle = (val: AppBackgroundStyle) => {
    localStorage.setItem('curio_app_bg_style', val);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useAppBackgroundStyle = () => useSettingsStorageValue(getAppBackgroundStyle, 'default' as AppBackgroundStyle);

export const getAppBackgroundColor = (): string => {
    if (typeof window === 'undefined') return '#0a0a0a';
    return localStorage.getItem('curio_app_bg_color') || '#0a0a0a';
};
export const setAppBackgroundColor = (val: string) => {
    localStorage.setItem('curio_app_bg_color', val);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useAppBackgroundColor = () => useSettingsStorageValue(getAppBackgroundColor, '#0a0a0a');

export const getAppBackgroundPresetByValue = (value: string) =>
    APP_BACKGROUND_PRESETS.find((preset) => preset.value === value);

/** Returns true when the resolved background is visually dark (widgets should use white text). */
export const isBackgroundDark = (bgStyle: AppBackgroundStyle, bgColor: string, themeMode: string, faceStyle?: string): boolean => {
    // Only force a face-specific dark assumption when the user hasn't picked their own bg.
    if (bgStyle === 'default') {
        if (faceStyle === 'bender' || faceStyle === 'kiro') return true; // default face gradients are dark
        return themeMode === 'dark';
    }
    const preset = getAppBackgroundPresetByValue(bgColor);
    if (typeof preset?.dark === 'boolean') return preset.dark;
    if (bgStyle === 'image') return themeMode === 'dark';
    // Extract the first hex color from bgColor (handles gradients too).
    const match = bgColor.match(/#([0-9a-fA-F]{6})/);
    if (!match) return themeMode === 'dark';
    const hex = match[1];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
};

export const buildAppBackgroundCss = (
    bgStyle: AppBackgroundStyle,
    bgColor: string,
    themeMode: string,
): Record<string, string> | undefined => {
    if (bgStyle === 'default') return undefined;
    if (bgStyle === 'animated') {
        return {
            background: bgColor || (themeMode === 'dark' ? '#05070a' : '#f4f7fb'),
        };
    }
    if (bgStyle === 'image') {
        const dark = isBackgroundDark(bgStyle, bgColor, themeMode);
        return {
            backgroundColor: dark ? '#101113' : '#eef5f0',
            backgroundImage: `${dark ? 'linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.28))' : 'linear-gradient(rgba(255,255,255,0.10), rgba(255,255,255,0.06))'}, url("${bgColor}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        };
    }
    return { background: bgColor };
};

/** Hook version - widgets can call this to determine if they should render light text. */
export const useIsBgDark = (): boolean => {
    const bgStyle = useAppBackgroundStyle();
    const bgColor = useAppBackgroundColor();
    const themeMode = useThemeMode();
    const faceStyle = useFaceStyleId();
    return isBackgroundDark(bgStyle, bgColor, themeMode, faceStyle);
};

export const getLowPowerMode = () => {
    if (typeof window === 'undefined') return false;

    const explicitLowPowerMode = localStorage.getItem('curio_low_power_mode');
    if (explicitLowPowerMode !== null) {
        return explicitLowPowerMode === 'true';
    }

    const legacyPerformanceMode = localStorage.getItem('curio_performance_mode');
    if (legacyPerformanceMode !== null) {
        return legacyPerformanceMode === 'true';
    }

    // Auto-detect low-end devices when user hasn't set a preference.
    // Check hardware concurrency (CPU cores) and deviceMemory (GB).
    // Tablets with <= 2 cores or <= 2GB RAM are likely to struggle.
    const browserDeviceProfile = createBrowserDeviceProfile();
    if (isAutoLowPowerBrowserDevice(browserDeviceProfile)) {
        return true;
    }

    return false;
};

// Backwards-compatible alias while the rest of the app migrates.
export const getPerformanceMode = getLowPowerMode;

export const useLowPowerMode = () => useSettingsStorageValue(getLowPowerMode, false);
export const usePerformanceMode = useLowPowerMode;

export const setLowPowerMode = (enabled: boolean) => {
    localStorage.setItem('curio_low_power_mode', enabled ? 'true' : 'false');
    localStorage.setItem('curio_performance_mode', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setPerformanceMode = setLowPowerMode;

export const getThemeMode = () => {
    if (typeof window === 'undefined') return 'light';
    return (localStorage.getItem('curio_theme_mode') as 'light' | 'dark') || 'light';
};
export const useThemeMode = () => useSettingsStorageValue(getThemeMode, 'light');

export type RobotColorThemeId = 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'red' | 'cyan' | 'amber' | 'custom';

export interface RobotColorTheme {
    id: RobotColorThemeId;
    label: string;
    /** Primary accent (ears, eye rim glow, magnifying glass tint) */
    accent: string;
    /** Eye rim gradient outer stop */
    eyeRimOuter: string;
    /** Eye arc stroke under pupils */
    eyeArc: string;
    /** Swatch preview color (Tailwind class) */
    swatch: string;
}

export const ROBOT_COLOR_THEMES: RobotColorTheme[] = [
    { id: 'blue', label: 'Ocean', accent: '#38bdf8', eyeRimOuter: '#0ea5e9', eyeArc: '#0ea5e9', swatch: 'bg-sky-400' },
    { id: 'purple', label: 'Nebula', accent: '#a78bfa', eyeRimOuter: '#7c3aed', eyeArc: '#8b5cf6', swatch: 'bg-violet-400' },
    { id: 'green', label: 'Forest', accent: '#34d399', eyeRimOuter: '#059669', eyeArc: '#10b981', swatch: 'bg-emerald-400' },
    { id: 'pink', label: 'Sakura', accent: '#f472b6', eyeRimOuter: '#db2777', eyeArc: '#ec4899', swatch: 'bg-pink-400' },
    { id: 'orange', label: 'Sunset', accent: '#fb923c', eyeRimOuter: '#ea580c', eyeArc: '#f97316', swatch: 'bg-orange-400' },
    { id: 'red', label: 'Blaze', accent: '#f87171', eyeRimOuter: '#dc2626', eyeArc: '#ef4444', swatch: 'bg-red-400' },
    { id: 'cyan', label: 'Arctic', accent: '#22d3ee', eyeRimOuter: '#0891b2', eyeArc: '#06b6d4', swatch: 'bg-cyan-400' },
    { id: 'amber', label: 'Honey', accent: '#fbbf24', eyeRimOuter: '#d97706', eyeArc: '#f59e0b', swatch: 'bg-amber-400' },
];

export const getRobotColorThemeId = (): RobotColorThemeId => {
    if (typeof window === 'undefined') return 'blue';
    return (localStorage.getItem('curio_robot_color_theme') as RobotColorThemeId) || 'blue';
};
export const useRobotColorThemeId = () => useSettingsStorageValue(getRobotColorThemeId, 'blue' as RobotColorThemeId);

export const getCustomRobotColor = (): string => {
    if (typeof window === 'undefined') return '#38bdf8';
    return localStorage.getItem('curio_custom_robot_color') || '#38bdf8';
};

export const setCustomRobotColor = (color: string) => {
    localStorage.setItem('curio_custom_robot_color', color);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useCustomRobotColor = () => useSettingsStorageValue(getCustomRobotColor, '#38bdf8');

export const getRobotColorTheme = (): RobotColorTheme => {
    const id = getRobotColorThemeId();
    if (id === 'custom') {
        const color = getCustomRobotColor();
        return {
            id: 'custom',
            label: 'Custom',
            accent: color,
            eyeRimOuter: color,
            eyeArc: color,
            swatch: '', // Custom handling needed in UI
        };
    }
    return ROBOT_COLOR_THEMES.find((t) => t.id === id) ?? ROBOT_COLOR_THEMES[0];
};

export const useRobotColorTheme = (): RobotColorTheme => {
    const id = useRobotColorThemeId();
    const customColor = useCustomRobotColor();
    
    const theme: RobotColorTheme = useMemo(() => {
        if (id === 'custom') {
            return {
                id: 'custom' as RobotColorThemeId,
                label: 'Custom',
                accent: customColor,
                eyeRimOuter: customColor,
                eyeArc: customColor,
                swatch: '',
            };
        }
        return ROBOT_COLOR_THEMES.find((t) => t.id === id) ?? ROBOT_COLOR_THEMES[0];
    }, [id, customColor]);

    // Sync theme to CSS variables for high-performance SVG painting
    useEffect(() => {
        if (typeof document !== 'undefined') {
            const root = document.documentElement;
            root.style.setProperty('--robot-accent', theme.accent);
            root.style.setProperty('--robot-eye-arc', theme.eyeArc);
            root.style.setProperty('--robot-eye-rim-outer', theme.eyeRimOuter);
        }
    }, [theme]);

    return theme;
};

// --- Face Style ---
export type FaceStyleId = 'curio' | 'astro' | 'kiro' | 'bender';

export const FACE_STYLES: { id: FaceStyleId; label: string; emoji: string }[] = [
    { id: 'curio', label: 'Curio', emoji: '' },
    { id: 'astro', label: 'Astro', emoji: '' },
    { id: 'kiro', label: 'Kiro', emoji: '' },
    { id: 'bender', label: 'Bender', emoji: '' },
];

export const getFaceStyleId = (): FaceStyleId => {
    if (typeof window === 'undefined') return 'curio';
    return (localStorage.getItem('curio_face_style') as FaceStyleId) || 'curio';
};
export const useFaceStyleId = () => useSettingsStorageValue(getFaceStyleId, 'curio' as FaceStyleId);

export const setFaceStyleId = (id: FaceStyleId) => {
    const prevFace = getFaceStyleId();
    localStorage.setItem('curio_face_style', id);

    // Auto-switch personality when selecting/deselecting Bender face.
    // Save the previous personality so we can restore it when switching away.
    if (id === 'bender' && prevFace !== 'bender') {
        const currentPersonality = getPersonalityId();
        if (currentPersonality !== 'bender') {
            localStorage.setItem('curio_pre_bender_personality', currentPersonality);
        }
        setPersonalityId('bender');

        // Auto-switch wake word to "Hey Bender"
        const currentWakeWord = getSelectedWakeWordId();
        if (currentWakeWord !== 'hey-bender') {
            localStorage.setItem('curio_pre_bender_wake_word', currentWakeWord);
        }
        setSelectedWakeWordId('hey-bender');
    } else if (id !== 'bender' && prevFace === 'bender') {
        const saved = localStorage.getItem('curio_pre_bender_personality') as PersonalityId | null;
        if (saved && saved !== 'bender') {
            setPersonalityId(saved);
        } else {
            setPersonalityId('default');
        }
        localStorage.removeItem('curio_pre_bender_personality');

        // Restore previous wake word
        const savedWakeWord = localStorage.getItem('curio_pre_bender_wake_word');
        if (savedWakeWord && savedWakeWord !== 'hey-bender') {
            setSelectedWakeWordId(savedWakeWord);
        } else {
            setSelectedWakeWordId(DEFAULT_WAKE_WORD_ID);
        }
        localStorage.removeItem('curio_pre_bender_wake_word');
    }

    // Auto-apply each face's signature background on face switch.
    // - Kiro -> purple, Bender -> gray (always applied so it feels dynamic)
    // - Curio / Astro -> revert to theme default (light/dark)
    // Users can still override the background after switching; the override
    // sticks until they switch faces again.
    if (id !== prevFace) {
        if (id === 'kiro') {
            setAppBackgroundColor(KIRO_BG_VALUE);
            setAppBackgroundStyle('gradient');
        } else if (id === 'bender') {
            setAppBackgroundColor(BENDER_BG_VALUE);
            setAppBackgroundStyle('gradient');
        } else {
            setAppBackgroundStyle('default');
        }
    }

    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// --- Bender Sounds ---
export const getBenderSoundsEnabled = (): boolean => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('curio_bender_sounds_enabled');
    return val === null ? true : val === 'true';
};
export const setBenderSoundsEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_bender_sounds_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useBenderSoundsEnabled = () => useSettingsStorageValue(getBenderSoundsEnabled, true);

export const getScreensaverEnabled = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_screensaver_enabled') === 'true';
};
export const useScreensaverEnabled = () => useSettingsStorageValue(getScreensaverEnabled, false);

export const getScreensaverTimeout = () => {
    if (typeof window === 'undefined') return 300;
    const secsVal = localStorage.getItem('curio_screensaver_timeout_secs');
    if (secsVal) return Math.max(parseInt(secsVal, 10), 10);

    // Migration logic from minutes to seconds
    const minsVal = localStorage.getItem('curio_screensaver_timeout_mins');
    if (minsVal) {
        const secs = Math.max(parseInt(minsVal, 10) * 60, 10);
        localStorage.setItem('curio_screensaver_timeout_secs', secs.toString());
        localStorage.removeItem('curio_screensaver_timeout_mins');
        return secs;
    }

    return 300; // Default 5 mins
};
export const useScreensaverTimeout = () => useSettingsStorageValue(getScreensaverTimeout, 300);

export const getFaceTrackingEnabled = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_face_tracking_enabled') === 'true';
};
export const useFaceTrackingEnabled = () => useSettingsStorageValue(getFaceTrackingEnabled, false);

export const getFaceRecognitionEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_face_recognition_enabled') === 'true';
};
export const useFaceRecognitionEnabled = () =>
    useSettingsStorageValue(getFaceRecognitionEnabled, false);

export const getFacePassiveTrackingEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_face_passive_tracking_enabled') === 'true';
};
export const useFacePassiveTrackingEnabled = () =>
    useSettingsStorageValue(getFacePassiveTrackingEnabled, false);

export const getFaceDefaultProfileId = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('curio_default_face_profile_id') || '';
};
export const useFaceDefaultProfileId = () =>
    useSettingsStorageValue(getFaceDefaultProfileId, '');

export const getAnimationsEnabled = () => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('curio_animations_enabled') !== 'false';
};
export const useAnimationsEnabled = () => useSettingsStorageValue(getAnimationsEnabled, true);

export const getIdleSleepTimeout = () => {
    if (typeof window === 'undefined') return 120;
    const val = localStorage.getItem('curio_idle_sleep_timeout');
    return val ? Math.max(parseInt(val, 10), 10) : 120;
};
export const useIdleSleepTimeout = () => useSettingsStorageValue(getIdleSleepTimeout, 120);

export const setScreensaverEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_screensaver_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setScreensaverTimeout = (secs: number) => {
    const safeSecs = Math.max(secs, 10);
    localStorage.setItem('curio_screensaver_timeout_secs', safeSecs.toString());
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export type ScreensaverSource = 'google' | 'offline' | 'unsplash';

export const getScreensaverSource = (): ScreensaverSource => {
    if (typeof window === 'undefined') return 'unsplash';
    return (localStorage.getItem('curio_screensaver_source') as ScreensaverSource) || 'unsplash';
};
export const useScreensaverSource = () => useSettingsStorageValue(getScreensaverSource, 'unsplash' as ScreensaverSource);

export const setScreensaverSource = (source: ScreensaverSource) => {
    localStorage.setItem('curio_screensaver_source', source);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setFaceTrackingEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_face_tracking_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setFaceRecognitionEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_face_recognition_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setFacePassiveTrackingEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_face_passive_tracking_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setFaceDefaultProfileId = (profileId: string) => {
    if (profileId) {
        localStorage.setItem('curio_default_face_profile_id', profileId);
    } else {
        localStorage.removeItem('curio_default_face_profile_id');
    }
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setAnimationsEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_animations_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

/**
 * setIdleSleepTimeout
 * @param secs The number of seconds of inactivity before Curio goes to sleep.
 */
export const setIdleSleepTimeout = (secs: number) => {
    const safeSecs = Math.max(secs, 10);
    localStorage.setItem('curio_idle_sleep_timeout', safeSecs.toString());
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setThemeMode = (mode: 'light' | 'dark') => {
    localStorage.setItem('curio_theme_mode', mode);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const setRobotColorThemeId = (id: RobotColorThemeId) => {
    localStorage.setItem('curio_robot_color_theme', id);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

// ---------------------------------------------------------------------------
// Homescreen widget settings
// ---------------------------------------------------------------------------
export type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const numericSetting = (key: string, fallback: number) => {
    const get = (): number => {
        if (typeof window === 'undefined') return fallback;
        const v = localStorage.getItem(key);
        return v ? Math.max(50, Math.min(150, parseInt(v, 10) || fallback)) : fallback;
    };
    const set = (val: number) => {
        localStorage.setItem(key, String(Math.max(50, Math.min(150, val))));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    };
    return { get, set };
};

const positionSetting = (key: string, fallback: WidgetPosition) => {
    const get = (): WidgetPosition => {
        if (typeof window === 'undefined') return fallback;
        return (localStorage.getItem(key) as WidgetPosition) || fallback;
    };
    const set = (pos: WidgetPosition) => {
        localStorage.setItem(key, pos);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    };
    return { get, set };
};

const clockScale = numericSetting('curio_clock_widget_scale', 100);
export const getClockWidgetScale = clockScale.get;
export const setClockWidgetScale = clockScale.set;
export const useClockWidgetScale = () => useSettingsStorageValue(getClockWidgetScale, 100);

// Clock display options
export const getClockShowSeconds = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_clock_show_seconds') === 'true';
};
export const setClockShowSeconds = (v: boolean) => {
    localStorage.setItem('curio_clock_show_seconds', String(v));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useClockShowSeconds = () => useSettingsStorageValue(getClockShowSeconds, false);

export const getClockUse24Hour = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_clock_use_24h') === 'true';
};
export const setClockUse24Hour = (v: boolean) => {
    localStorage.setItem('curio_clock_use_24h', String(v));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useClockUse24Hour = () => useSettingsStorageValue(getClockUse24Hour, false);

const weatherScale = numericSetting('curio_weather_widget_scale', 100);
export const getWeatherWidgetScale = weatherScale.get;
export const setWeatherWidgetScale = weatherScale.set;
export const useWeatherWidgetScale = () => useSettingsStorageValue(getWeatherWidgetScale, 100);

const idlePromptScale = numericSetting('curio_idle_prompt_scale', 100);
export const getIdlePromptScale = idlePromptScale.get;
export const setIdlePromptScale = idlePromptScale.set;
export const useIdlePromptScale = () => useSettingsStorageValue(getIdlePromptScale, 100);

export const DEFAULT_ROBOT_FACE_SCALE = 100;
const robotFaceScale = numericSetting('curio_robot_face_scale', DEFAULT_ROBOT_FACE_SCALE);
export const getRobotFaceScale = robotFaceScale.get;
export const setRobotFaceScale = robotFaceScale.set;
export const useRobotFaceScale = () => useSettingsStorageValue(getRobotFaceScale, DEFAULT_ROBOT_FACE_SCALE);

export const DEFAULT_DESKTOP_FACE_SCALE = 100;
const DESKTOP_FACE_SCALE_MIN = 60;
const DESKTOP_FACE_SCALE_MAX = 600;

const clampDesktopFaceScale = (value: number) =>
    Math.max(DESKTOP_FACE_SCALE_MIN, Math.min(DESKTOP_FACE_SCALE_MAX, Math.round(value)));

export const getDesktopFloatingEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_desktop_floating_enabled') === 'true';
};

export const setDesktopFloatingEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_desktop_floating_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useDesktopFloatingEnabled = () =>
    useSettingsStorageValue(getDesktopFloatingEnabled, false);

export const getDesktopFaceScale = (): number => {
    if (typeof window === 'undefined') return DEFAULT_DESKTOP_FACE_SCALE;
    const raw = localStorage.getItem('curio_desktop_face_scale');
    if (!raw) return DEFAULT_DESKTOP_FACE_SCALE;
    return clampDesktopFaceScale(Number(raw) || DEFAULT_DESKTOP_FACE_SCALE);
};

export const setDesktopFaceScale = (scale: number) => {
    localStorage.setItem('curio_desktop_face_scale', String(clampDesktopFaceScale(scale)));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useDesktopFaceScale = () =>
    useSettingsStorageValue(getDesktopFaceScale, DEFAULT_DESKTOP_FACE_SCALE);

export const getDesktopTextInputEnabled = (): boolean => {
    if (typeof window === 'undefined') return true;
    const raw = localStorage.getItem('curio_desktop_text_input_enabled');
    return raw === null ? true : raw === 'true';
};

export const setDesktopTextInputEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_desktop_text_input_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useDesktopTextInputEnabled = () =>
    useSettingsStorageValue(getDesktopTextInputEnabled, true);

export const getDesktopSubtitlesEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('curio_desktop_subtitles_enabled') === 'true';
};

export const setDesktopSubtitlesEnabled = (enabled: boolean) => {
    localStorage.setItem('curio_desktop_subtitles_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useDesktopSubtitlesEnabled = () =>
    useSettingsStorageValue(getDesktopSubtitlesEnabled, false);

const clockPos = positionSetting('curio_clock_widget_position', 'top-left');
export const getClockWidgetPosition = clockPos.get;
export const setClockWidgetPosition = clockPos.set;
export const useClockWidgetPosition = () => useSettingsStorageValue(getClockWidgetPosition, 'top-left' as WidgetPosition);

const weatherPos = positionSetting('curio_weather_widget_position', 'top-right');
export const getWeatherWidgetPosition = weatherPos.get;
export const setWeatherWidgetPosition = weatherPos.set;
export const useWeatherWidgetPosition = () => useSettingsStorageValue(getWeatherWidgetPosition, 'top-right' as WidgetPosition);

export const getShowIdlePrompt = (): boolean => {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem('curio_show_idle_prompt');
    return val === null ? true : val === 'true';
};
export const setShowIdlePrompt = (show: boolean) => {
    localStorage.setItem('curio_show_idle_prompt', show.toString());
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useShowIdlePrompt = () => useSettingsStorageValue(getShowIdlePrompt, true);

export type IdlePromptPosition = 'top' | 'bottom';
export const getIdlePromptPosition = (): IdlePromptPosition => {
    if (typeof window === 'undefined') return 'bottom';
    return (localStorage.getItem('curio_idle_prompt_position') as IdlePromptPosition) || 'bottom';
};
export const setIdlePromptPosition = (pos: IdlePromptPosition) => {
    localStorage.setItem('curio_idle_prompt_position', pos);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
export const useIdlePromptPosition = () => useSettingsStorageValue(getIdlePromptPosition, 'bottom' as IdlePromptPosition);

const boolSetting = (key: string, fallback: boolean) => {
    const get = (): boolean => {
        if (typeof window === 'undefined') return fallback;
        const val = localStorage.getItem(key);
        return val === null ? fallback : val === 'true';
    };
    const set = (v: boolean) => {
        localStorage.setItem(key, v.toString());
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    };
    return { get, set };
};

const clockVisible = boolSetting('curio_clock_widget_visible', false);
export const getShowClockWidget = clockVisible.get;
export const setShowClockWidget = clockVisible.set;
export const useShowClockWidget = () => useSettingsStorageValue(getShowClockWidget, false);

const weatherVisible = boolSetting('curio_weather_widget_visible', false);
export const getShowWeatherWidget = weatherVisible.get;
export const setShowWeatherWidget = weatherVisible.set;
export const useShowWeatherWidget = () => useSettingsStorageValue(getShowWeatherWidget, false);

const voiceWaveformVisible = boolSetting('curio_voice_waveform_visible', true);
export const getShowVoiceWaveform = voiceWaveformVisible.get;
export const setShowVoiceWaveform = voiceWaveformVisible.set;
export const useShowVoiceWaveform = () => useSettingsStorageValue(getShowVoiceWaveform, true);

export type ConnectButtonPosition = 'top' | 'bottom';
const connectBtnScale = numericSetting('curio_connect_btn_scale', 100);
export const getConnectButtonScale = connectBtnScale.get;
export const setConnectButtonScale = connectBtnScale.set;
export const useConnectButtonScale = () => useSettingsStorageValue(getConnectButtonScale, 100);

const connectBtnPos = ((): { get: () => ConnectButtonPosition; set: (v: ConnectButtonPosition) => void } => {
    const get = (): ConnectButtonPosition => {
        if (typeof window === 'undefined') return 'top';
        return (localStorage.getItem('curio_connect_btn_position') as ConnectButtonPosition) || 'top';
    };
    const set = (v: ConnectButtonPosition) => {
        localStorage.setItem('curio_connect_btn_position', v);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('curio:settings-changed'));
    };
    return { get, set };
})();
export const getConnectButtonPosition = connectBtnPos.get;
export const setConnectButtonPosition = connectBtnPos.set;
export const useConnectButtonPosition = () => useSettingsStorageValue(getConnectButtonPosition, 'top' as ConnectButtonPosition);

