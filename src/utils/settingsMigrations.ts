/**
 * Settings schema versioning and migration system.
 * Runs once on app load to migrate localStorage settings when the schema changes.
 *
 * Each migration is a function that transforms localStorage from version N to N+1.
 * Migrations run sequentially and are idempotent (safe to re-run).
 */

import { DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS } from '../services/dashboardTypes';

const SETTINGS_VERSION_KEY = 'curio_settings_version';

/** Current schema version — bump this when adding a new migration. */
const CURRENT_VERSION = 2;

interface Migration {
    version: number;
    description: string;
    migrate: () => void;
}

/**
 * Migration registry — add new migrations here.
 * Each migration runs when the stored version is less than the migration's version.
 */
const migrations: Migration[] = [
    {
        version: 1,
        description: 'Normalize wake word IDs and voice IDs to current catalog',
        migrate: () => {
            // Ensure wake word ID is valid against current catalog
            const wakeWordId = localStorage.getItem('curio_wake_word_id');
            if (wakeWordId && !['hey_curio', 'hey-curio', 'curio', 'bimo', 'hello_deepa', 'hello-deepa', 'namaste_deepa', 'namaste-deepa', 'jarvis', 'robot', 'hey-bender'].includes(wakeWordId)) {
                console.log(`[SettingsMigration] Resetting invalid wake word ID: "${wakeWordId}"`);
                localStorage.removeItem('curio_wake_word_id');
            }

            // Ensure face style is valid
            const faceStyle = localStorage.getItem('curio_face_style');
            if (faceStyle && !['curio', 'astro', 'kiro', 'bender'].includes(faceStyle)) {
                console.log(`[SettingsMigration] Resetting invalid face style: "${faceStyle}"`);
                localStorage.removeItem('curio_face_style');
            }

            // Ensure color theme is valid
            const colorTheme = localStorage.getItem('curio_robot_color_theme');
            if (colorTheme && !['blue', 'purple', 'green', 'pink', 'orange', 'red', 'cyan', 'amber', 'custom'].includes(colorTheme)) {
                console.log(`[SettingsMigration] Resetting invalid color theme: "${colorTheme}"`);
                localStorage.removeItem('curio_robot_color_theme');
            }
        },
    },
    {
        version: 2,
        description: 'Fill dashboard preferences with Interactivity defaults',
        migrate: () => {
            // Walk every dashboard preferences key (default + per-profile) and
            // ensure `interactivity` is populated with defaults without
            // clobbering user-set values. Idempotent: a fully-populated
            // preferences object results in no write.
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key !== 'curio_dashboard_prefs' && !key.startsWith('curio_dashboard_prefs_')) {
                    continue;
                }
                try {
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

                    const existingInteractivity = (parsed as Record<string, unknown>).interactivity;
                    const nextInteractivity =
                        existingInteractivity && typeof existingInteractivity === 'object' && !Array.isArray(existingInteractivity)
                            ? { ...DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS, ...(existingInteractivity as Record<string, unknown>) }
                            : { ...DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS };

                    const next = { ...(parsed as Record<string, unknown>), interactivity: nextInteractivity };
                    const nextSerialized = JSON.stringify(next);
                    if (nextSerialized === raw) continue;
                    localStorage.setItem(key, nextSerialized);
                } catch {
                    // Skip malformed entries silently — they will be rewritten
                    // when the user next saves preferences.
                    continue;
                }
            }
        },
    },
];

/**
 * Run all pending migrations. Safe to call multiple times — only runs
 * migrations newer than the stored version.
 */
export function runSettingsMigrations(): void {
    if (typeof window === 'undefined') return;

    let storedVersion = 0;
    try {
        const raw = localStorage.getItem(SETTINGS_VERSION_KEY);
        if (raw) storedVersion = parseInt(raw, 10) || 0;
    } catch {
        // localStorage may be unavailable in some contexts
        return;
    }

    if (storedVersion >= CURRENT_VERSION) return;

    console.log(`[SettingsMigrations] Running migrations from v${storedVersion} to v${CURRENT_VERSION}...`);

    for (const migration of migrations) {
        if (migration.version > storedVersion) {
            try {
                console.log(`[SettingsMigrations] v${migration.version}: ${migration.description}`);
                migration.migrate();
            } catch (e) {
                console.error(`[SettingsMigrations] v${migration.version} failed:`, e);
                // Continue with remaining migrations — don't block the app
            }
        }
    }

    try {
        localStorage.setItem(SETTINGS_VERSION_KEY, String(CURRENT_VERSION));
        console.log(`[SettingsMigrations] Complete. Now at v${CURRENT_VERSION}.`);
    } catch {
        // Ignore write failures
    }
}
