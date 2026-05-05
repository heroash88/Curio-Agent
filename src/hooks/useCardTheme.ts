import { useSyncExternalStore } from 'react';
import { useThemeMode } from '../utils/settingsStorage';

/**
 * Response cards render in a `position: fixed` stack outside the current
 * screen subtree, so they can't just inherit a scoped `data-theme` from a
 * parent (such as the Dashboard, which owns its own per-page theme). To keep
 * cards in sync with whichever surface the user is looking at, surfaces may
 * broadcast an override by setting `document.documentElement.dataset.cardTheme`
 * to `'light'` or `'dark'`. When no override is set, cards fall back to the
 * app-level theme.
 *
 * Surfaces should clear their override on unmount so the default global theme
 * takes over (e.g. when the user switches from dashboard back to face mode).
 */

const CARD_THEME_ATTRIBUTE = 'data-card-theme';
const CARD_THEME_EVENT = 'curio:card-theme-changed';

export const setCardThemeOverride = (mode: 'light' | 'dark' | null) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (mode === 'light' || mode === 'dark') {
        if (root.getAttribute(CARD_THEME_ATTRIBUTE) !== mode) {
            root.setAttribute(CARD_THEME_ATTRIBUTE, mode);
            window.dispatchEvent(new Event(CARD_THEME_EVENT));
        }
    } else if (root.hasAttribute(CARD_THEME_ATTRIBUTE)) {
        root.removeAttribute(CARD_THEME_ATTRIBUTE);
        window.dispatchEvent(new Event(CARD_THEME_EVENT));
    }
};

const readCardThemeOverride = (): 'light' | 'dark' | null => {
    if (typeof document === 'undefined') return null;
    const value = document.documentElement.getAttribute(CARD_THEME_ATTRIBUTE);
    return value === 'light' || value === 'dark' ? value : null;
};

const subscribeCardThemeOverride = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(CARD_THEME_EVENT, onStoreChange);
    return () => window.removeEventListener(CARD_THEME_EVENT, onStoreChange);
};

const useCardThemeOverride = (): 'light' | 'dark' | null =>
    useSyncExternalStore(subscribeCardThemeOverride, readCardThemeOverride, () => null);

/**
 * Resolves the active surface theme by combining the global `themeMode`
 * setting with any broadcast override set via `setCardThemeOverride`.
 * This mirrors the fallback logic used by response cards, so any surface
 * that needs to follow the "currently visible" theme (e.g. settings modal)
 * stays in sync with the dashboard page's scoped theme while still
 * honoring the global mode when no override is active.
 */
export const useResolvedSurfaceTheme = (): 'light' | 'dark' => {
    const globalThemeMode = useThemeMode();
    const overrideMode = useCardThemeOverride();
    return overrideMode ?? (globalThemeMode === 'dark' ? 'dark' : 'light');
};

// Card design token hook
// Provides Tailwind class strings that adapt to dark/light mode.
// The CSS custom properties (--ether-*) are defined in index.css.
export const useCardTheme = () => {
    const globalThemeMode = useThemeMode();
    const overrideMode = useCardThemeOverride();
    const themeMode = overrideMode ?? globalThemeMode;
    const dark = themeMode === 'dark';
    const lightOnSurface = 'text-[var(--ether-on-surface)]';
    const lightOnSurfaceVariant = 'text-[var(--ether-on-surface-variant)]';

    return {
        dark,

        // Card Containers
        cardBg: dark
            ? 'bg-[var(--ether-glass-bg)] backdrop-blur-[24px] shadow-[var(--ether-glass-shadow)] border border-[var(--ether-glass-border)]'
            : 'bg-[var(--ether-glass-bg)] backdrop-blur-[24px] shadow-[var(--ether-glass-shadow)] border border-[var(--ether-glass-border)]',
        cardTitle: dark ? 'text-[var(--ether-on-surface)]' : 'text-[var(--ether-on-surface)]',

        // Typography families
        headline: 'font-headline',
        display: 'font-display',
        label: 'font-[Inter,sans-serif]',

        // Semantic text (EtherOS tokens)
        onSurface: dark
            ? 'text-[var(--ether-on-surface)] [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]'
            : lightOnSurface,
        onSurfaceVariant: dark
            ? 'text-[var(--ether-on-surface-variant)] [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'
            : lightOnSurfaceVariant,
        primary: dark ? 'text-[#39b8fd]' : 'text-[#0284c7]',
        tertiary: dark ? 'text-[#10b981]' : 'text-[#059669]',

        // Surface containers
        surfaceContainerLow: 'bg-[var(--ether-surface-container-low)]',
        surfaceContainer: 'bg-[var(--ether-surface-container)]',
        surfaceContainerHigh: 'bg-[var(--ether-surface-container-high)]',

        // Legacy fallbacks — kept for components not yet migrated
        text: dark
            ? 'text-[var(--ether-on-surface)] [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]'
            : lightOnSurface,
        text2: dark
            ? 'text-[var(--ether-on-surface-variant)] [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'
            : lightOnSurfaceVariant,
        muted: dark
            ? 'text-[var(--ether-on-surface-variant)] [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'
            : lightOnSurfaceVariant,
        faint: dark ? 'text-[#736b60]' : 'text-[#b8b0a2]',
        panel: 'bg-[var(--ether-surface-container-low)] backdrop-blur-md',
        panelBorder: 'border border-[var(--ether-glass-border)]',
        btn: dark
            ? 'bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)] active:bg-[var(--ether-surface-bright)] transition-all'
            : 'bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)] transition-all',
        btnText: 'text-[var(--ether-on-surface)] font-medium',
    };
};
