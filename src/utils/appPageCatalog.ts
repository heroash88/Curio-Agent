import { AppMode } from '../hooks/useAppMode';

export interface AppPageCatalogEntry {
    id: string;
    subject: string | null;
    label: string;
    summary: string;
    pagePatterns: string[];
    aliases: string[];
    capabilities: string[];
    interactionHints: string[];
}

export interface ResolvedAppPageCatalogEntry extends AppPageCatalogEntry {
    pageId: string;
    matchedPattern: string | null;
    known: boolean;
}

const normalizeToken = (value: string): string =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');

const normalizePageId = (value: string): string =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');

const titleCase = (value: string): string =>
    value
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

export const humanizePageId = (pageId: string): string => {
    const normalized = normalizePageId(pageId);
    if (!normalized) return 'Unknown Page';
    return titleCase(normalized.replace(/-/g, ' '));
};

export const GLOBAL_MASCOT_SUBJECTS = [
    'HOME',
    'CURIO_MODE'
] as const;

const SUBJECT_ALIAS_MAP: Record<string, AppMode | 'BACK'> = {
    back: 'BACK',
    go_back: 'BACK',
    close: 'BACK',
    exit: 'BACK',
    home: 'BACK',
    overview: 'BACK',
    overview_back: 'BACK',

    curio: AppMode.CURIO_MODE,
    robot: AppMode.CURIO_MODE,
    companion: AppMode.CURIO_MODE,
    voice_assistant: AppMode.CURIO_MODE
};

export const resolveGlobalSubjectToMode = (subject: string): AppMode | 'BACK' | null => {
    const normalized = normalizeToken(subject);
    if (!normalized) return null;

    if (normalized in AppMode) {
        return AppMode[normalized as keyof typeof AppMode];
    }

    return SUBJECT_ALIAS_MAP[normalized] ?? null;
};

export const navigateGlobalMascotSubject = (
    subject: string,
    navigate: ((mode: AppMode) => void) | null | undefined
): void => {
    if (!navigate) return;

    const target = resolveGlobalSubjectToMode(subject);
    if (target === 'BACK') {
        navigate(AppMode.HOME);
        return;
    }

    if (typeof target === 'number') {
        navigate(target);
    }
};

export const createGlobalMascotHandler = (
    navigate: ((mode: AppMode) => void) | null | undefined,
    toggleCamera?: (enabled: boolean) => unknown
) => ({
    getAvailableSubjects: (): string[] => [...GLOBAL_MASCOT_SUBJECTS],
    navigateToSubject: (subject: string) => navigateGlobalMascotSubject(subject, navigate),
    ...(toggleCamera ? { toggleCamera } : {}),
    get_weather: (): unknown => ({}) // Default placeholder
});

export const APP_PAGE_CATALOG: AppPageCatalogEntry[] = [
    {
        id: 'home',
        subject: 'HOME',
        label: 'Home',
        summary: 'Main launcher for the Curio Robot Agent.',
        pagePatterns: ['home'],
        aliases: ['start', 'main menu', 'launcher'],
        capabilities: ['Open Curio Agent', 'Open settings'],
        interactionHints: ['Lock the interface to the Curio Robot persona.']
    },
    {
        id: 'settings-modal',
        subject: null,
        label: 'Settings',
        summary: 'Overlay for API keys and voice configuration.',
        pagePatterns: ['settings-modal'],
        aliases: ['settings', 'preferences', 'config'],
        capabilities: ['Change AI voice', 'Update API keys'],
        interactionHints: ['The modal can appear above any page']
    },
    {
        id: 'curio-agent',
        subject: 'CURIO_MODE',
        label: 'Curio Robot',
        summary: 'Voice-first companion with animated robot face.',
        pagePatterns: ['curio-agent', 'curio-*'],
        aliases: ['curio agent', 'robot agent', 'voice assistant', 'companion'],
        capabilities: ['Connect to Gemini Live', 'Enable camera vision', 'Talk hands-free'],
        interactionHints: ['The robot responds to "Hey Curio" wake word.']
    }
];

const matchPattern = (pageId: string, pattern: string): boolean => {
    const normalizedPageId = normalizePageId(pageId);
    const normalizedPattern = normalizePageId(pattern);
    if (!normalizedPageId || !normalizedPattern) return false;

    if (normalizedPattern.endsWith('*')) {
        return normalizedPageId.startsWith(normalizedPattern.slice(0, -1));
    }

    return normalizedPageId === normalizedPattern;
};

export const getAppPageCatalog = (): AppPageCatalogEntry[] =>
    APP_PAGE_CATALOG.map((entry) => ({
        ...entry,
        pagePatterns: [...entry.pagePatterns],
        aliases: [...entry.aliases],
        capabilities: [...entry.capabilities],
        interactionHints: [...entry.interactionHints]
    }));

export const describeAppPage = (pageId: string): ResolvedAppPageCatalogEntry => {
    const normalized = normalizePageId(pageId);

    let bestEntry: AppPageCatalogEntry | null = null;
    let bestPattern: string | null = null;
    let bestScore = -1;

    for (const entry of APP_PAGE_CATALOG) {
        for (const pattern of entry.pagePatterns) {
            if (!matchPattern(normalized, pattern)) continue;

            const specificity = normalizePageId(pattern).replace(/\*$/, '').length;
            if (specificity > bestScore) {
                bestEntry = entry;
                bestPattern = pattern;
                bestScore = specificity;
            }
        }
    }

    if (bestEntry) {
        return {
            ...bestEntry,
            pageId: normalized || pageId || 'unknown-page',
            matchedPattern: bestPattern,
            known: true
        };
    }

    const fallbackId = normalized || 'unknown-page';
    return {
        id: fallbackId,
        pageId: fallbackId,
        subject: null,
        label: humanizePageId(fallbackId),
        summary: 'Uncataloged page.',
        pagePatterns: [fallbackId],
        aliases: [],
        capabilities: [],
        interactionHints: [],
        matchedPattern: null,
        known: false
    };
};

export const buildCurrentPageGuide = (activePageId: string, visiblePageIds: string[]) => {
    const dedupedVisible = Array.from(
        new Set(
            [activePageId, ...visiblePageIds]
                .map((pageId) => normalizePageId(pageId))
                .filter(Boolean)
            )
        );
    
        const activePage = describeAppPage(activePageId);
        const visiblePageStack = dedupedVisible.map((pageId) => describeAppPage(pageId));
    
        return {
            activePageId: activePage.pageId,
            activeSubject: activePage.subject,
            activePage,
            visiblePageStack,
            knownCatalogEntries: APP_PAGE_CATALOG.length,
            availableSubjects: [...GLOBAL_MASCOT_SUBJECTS] as any[],
            note: activePage.known
                ? 'Matched.'
                : 'Uncataloged.'
        };
    };
