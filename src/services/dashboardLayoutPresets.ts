/**
 * DashboardLayoutPresets
 *
 * Pure service for saving, loading, exporting, and importing dashboard
 * layout presets. Presets are profile-scoped JSON arrays stored under
 * `curio_dashboard_presets[_<profileId>]`.
 *
 * Contract (design §Data Models / §22):
 *  - Schema version 1; reject other versions with a descriptive error.
 *  - `saveDashboardLayoutPreset` upserts by `id` and dispatches
 *    `curio:settings-changed`.
 *  - `deleteDashboardLayoutPreset` removes by `id` and dispatches
 *    `curio:settings-changed`.
 *  - `exportDashboardLayoutPreset` returns a JSON string.
 *  - `importDashboardLayoutPreset` parses, validates schemaVersion === 1,
 *    throws a descriptive error on mismatch.
 *  - `normalizePreset` gracefully validates; returns null on invalid.
 *
 * SSR-safe: every branch that touches `window`/`localStorage` is guarded.
 */

import type {
  DashboardBoardPreferences,
  DashboardWidget,
} from './dashboardTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardLayoutPreset {
  id: string;
  name: string;
  description?: string;
  category?: string;
  schemaVersion: 1;
  widgets: DashboardWidget[];
  appearance?: Partial<DashboardBoardPreferences>;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETTINGS_CHANGED_EVENT = 'curio:settings-changed';
const CURRENT_SCHEMA_VERSION = 1;

/** Shared localStorage prefix for preset keys. */
export const PRESETS_KEY_PREFIX = 'curio_dashboard_presets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isBrowser = (): boolean => typeof window !== 'undefined';

/**
 * Compose the localStorage key for a given profileId.
 */
export function getPresetsKey(profileId?: string | null): string {
  return profileId
    ? `${PRESETS_KEY_PREFIX}_${profileId}`
    : PRESETS_KEY_PREFIX;
}

/**
 * Gracefully validate and normalize a raw value into a DashboardLayoutPreset.
 * Returns null when the input is invalid or cannot be coerced.
 */
export function normalizePreset(raw: unknown): DashboardLayoutPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  // Schema version check
  if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;

  // Required fields
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  if (!Array.isArray(record.widgets)) return null;
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return null;

  // Normalize widgets — keep only objects with at least id and type
  const widgets: DashboardWidget[] = (record.widgets as unknown[])
    .filter((w): w is DashboardWidget => {
      if (!w || typeof w !== 'object') return false;
      const widget = w as Record<string, unknown>;
      return typeof widget.id === 'string' && typeof widget.type === 'string';
    })
    .map((w, index) => ({
      id: w.id,
      type: w.type,
      position: typeof w.position === 'number' ? w.position : index,
      size: w.size || 'medium',
      config: (w.config && typeof w.config === 'object' ? w.config : {}) as DashboardWidget['config'],
      enabled: w.enabled ?? true,
      layout: w.layout || {},
    }));

  const preset: DashboardLayoutPreset = {
    id: record.id.trim(),
    name: record.name.trim(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    widgets,
    createdAt: record.createdAt,
  };

  // Optional fields
  if (typeof record.description === 'string' && record.description.trim()) {
    preset.description = record.description.trim();
  }
  if (typeof record.category === 'string' && record.category.trim()) {
    preset.category = record.category.trim();
  }
  if (record.appearance && typeof record.appearance === 'object') {
    preset.appearance = record.appearance as Partial<DashboardBoardPreferences>;
  }

  return preset;
}

// ---------------------------------------------------------------------------
// Storage operations
// ---------------------------------------------------------------------------

/**
 * Read all saved presets for a profile. Returns [] on missing/malformed data.
 */
export function getDashboardLayoutPresets(
  profileId?: string | null,
): DashboardLayoutPreset[] {
  if (!isBrowser()) return [];
  const key = getPresetsKey(profileId);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return [];
  }
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizePreset(item))
      .filter((p): p is DashboardLayoutPreset => p !== null);
  } catch {
    return [];
  }
}

/**
 * Upsert a preset by `id`. If a preset with the same id exists it is
 * replaced; otherwise the new preset is appended. Dispatches
 * `curio:settings-changed`.
 */
export function saveDashboardLayoutPreset(
  preset: DashboardLayoutPreset,
  profileId?: string | null,
): void {
  if (!isBrowser()) return;
  const normalized = normalizePreset(preset);
  if (!normalized) return;

  const current = getDashboardLayoutPresets(profileId);
  const existingIndex = current.findIndex((p) => p.id === normalized.id);
  if (existingIndex >= 0) {
    current[existingIndex] = normalized;
  } else {
    current.push(normalized);
  }

  const key = getPresetsKey(profileId);
  try {
    window.localStorage.setItem(key, JSON.stringify(current));
  } catch {
    // Swallow quota errors
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  } catch {
    // Older environments
  }
}

/**
 * Remove a preset by `id`. Dispatches `curio:settings-changed`.
 */
export function deleteDashboardLayoutPreset(
  presetId: string,
  profileId?: string | null,
): void {
  if (!isBrowser()) return;
  const current = getDashboardLayoutPresets(profileId);
  const filtered = current.filter((p) => p.id !== presetId);
  if (filtered.length === current.length) return; // nothing to remove

  const key = getPresetsKey(profileId);
  try {
    window.localStorage.setItem(key, JSON.stringify(filtered));
  } catch {
    // Swallow quota errors
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  } catch {
    // Older environments
  }
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

/**
 * Serialize a preset to a JSON string for export (clipboard or file).
 */
export function exportDashboardLayoutPreset(
  preset: DashboardLayoutPreset,
): string {
  const normalized = normalizePreset(preset);
  if (!normalized) {
    throw new Error('Cannot export an invalid preset');
  }
  return JSON.stringify(normalized);
}

/**
 * Parse a JSON string into a DashboardLayoutPreset. Validates
 * schemaVersion === 1 and throws a descriptive error on mismatch or
 * malformed input.
 */
export function importDashboardLayoutPreset(
  json: string,
): DashboardLayoutPreset {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(
      'Invalid JSON: the preset data could not be parsed. Please check the format and try again.',
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(
      'Invalid preset format: expected a JSON object with id, name, widgets, and schemaVersion fields.',
    );
  }

  const record = raw as Record<string, unknown>;

  if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const version = record.schemaVersion ?? 'missing';
    throw new Error(
      `Unsupported preset schemaVersion: ${String(version)}. This app supports schemaVersion ${CURRENT_SCHEMA_VERSION}. ` +
        'The preset may have been created by a newer version of the app.',
    );
  }

  const preset = normalizePreset(raw);
  if (!preset) {
    throw new Error(
      'Invalid preset: the data is missing required fields (id, name, widgets, createdAt) or contains malformed values.',
    );
  }

  return preset;
}
