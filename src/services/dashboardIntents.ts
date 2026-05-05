/**
 * DashboardIntents
 *
 * Event bus helpers for cross-widget dashboard interactions. Owns three
 * CustomEvent contracts (design §"Event bus contracts"):
 *
 *  - `curio:dashboard-item-drop` — emitted by a source widget when an
 *    item is dropped on a target widget. Targets validate against
 *    `DROP_INTENT_REGISTRY` before acting (design Requirement 10.1).
 *  - `curio:dashboard-hover`    — emitted by a source widget when the
 *    user hovers an item. Consumers highlight matching items. A hover
 *    event with `itemId === null` clears highlights (design Req 12.4).
 *  - `curio:dashboard-select`   — emitted when an item is selected.
 *
 * The registry defines the supported (source → target) pairs from the
 * design (Requirement 10.2–10.6):
 *
 *   - Bookmarks → Notes / RichNote / Obsidian
 *   - Task      → Pomodoro
 *   - Stocks    → Portfolio
 *   - Map       → Commute
 *   - News      → RichNote / Obsidian
 *
 * This module is pure and side-effect-free at import time. Every
 * dispatch helper is SSR-safe — it no-ops when `window` is undefined.
 */

import type { DashboardWidget, DashboardWidgetType } from './dashboardTypes';

export const DASHBOARD_ITEM_DROP_EVENT = 'curio:dashboard-item-drop';
export const DASHBOARD_HOVER_EVENT = 'curio:dashboard-hover';
export const DASHBOARD_SELECT_EVENT = 'curio:dashboard-select';

/**
 * Custom MIME type used by cross-widget drag sources so only Curio
 * drop targets respond and external drag interactions (files, links,
 * text) pass through unchanged. Keep this in sync with the
 * `setDragPayload` / `readDragPayload` helpers below.
 */
export const DASHBOARD_DRAG_MIME = 'application/x-curio-drop-intent';

/**
 * Shape written to `DataTransfer` by a drag source and read by the
 * matching target's `onDrop` handler. `kind` is the payload
 * discriminator; everything else is source-specific.
 */
export interface DashboardDragPayload {
  kind: string;
  sourceWidgetId: string;
  sourceWidgetType: DashboardWidgetType;
  data: Record<string, unknown>;
}

/**
 * Write a `DashboardDragPayload` onto a `DataTransfer`. SSR-safe: no-op
 * when `dataTransfer` is nullish.
 */
export const setDashboardDragPayload = (
  dataTransfer: DataTransfer | null | undefined,
  payload: DashboardDragPayload,
): void => {
  if (!dataTransfer) return;
  try {
    dataTransfer.setData(DASHBOARD_DRAG_MIME, JSON.stringify(payload));
    // Best-effort fallback so native drag images and text/plain
    // consumers still get something sensible. We never rely on this
    // for drop dispatch — targets only read the custom MIME.
    const fallbackText =
      typeof payload.data.title === 'string'
        ? String(payload.data.title)
        : payload.kind;
    dataTransfer.setData('text/plain', fallbackText);
    dataTransfer.effectAllowed = 'copyMove';
  } catch {
    // Some browsers (old Safari) throw from setData when the drag
    // store is locked. Ignore — the drop will silently no-op.
  }
};

/**
 * Read a `DashboardDragPayload` from a `DataTransfer`. Returns `null`
 * when the payload is missing or malformed so targets can bail
 * without throwing.
 */
export const readDashboardDragPayload = (
  dataTransfer: DataTransfer | null | undefined,
): DashboardDragPayload | null => {
  if (!dataTransfer) return null;
  try {
    const raw = dataTransfer.getData(DASHBOARD_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.kind === 'string' &&
      typeof parsed.sourceWidgetId === 'string' &&
      typeof parsed.sourceWidgetType === 'string' &&
      parsed.data &&
      typeof parsed.data === 'object'
    ) {
      return parsed as DashboardDragPayload;
    }
    return null;
  } catch {
    return null;
  }
};

export interface DropIntentPayload {
  sourceWidgetId: string;
  sourceWidgetType: DashboardWidgetType;
  payload: Record<string, unknown>;
  targetWidgetId: string;
  targetWidgetType: DashboardWidgetType;
  position?: { x: number; y: number };
}

export interface DropIntentRule {
  sourceType: DashboardWidgetType;
  targetTypes: DashboardWidgetType[];
  /** Optional per-rule validator. When present, must return true for the
   *  drop to be considered supported. Targets still own the final
   *  business-level validation. */
  validate?: (p: DropIntentPayload) => boolean;
}

/**
 * Design-defined (source → targets) registry. The ordering mirrors the
 * task spec:
 *  - Bookmarks → Notes / RichNote / Obsidian
 *  - Task      → Pomodoro
 *  - Stocks    → Portfolio
 *  - Map       → Commute
 *  - News      → RichNote / Obsidian
 */
export const DROP_INTENT_REGISTRY: DropIntentRule[] = [
  {
    sourceType: 'bookmarks',
    targetTypes: ['notes', 'rich_note', 'obsidian_notes'],
  },
  {
    sourceType: 'tasks',
    targetTypes: ['pomodoro'],
  },
  {
    sourceType: 'reminders',
    targetTypes: ['pomodoro'],
  },
  {
    sourceType: 'stock',
    targetTypes: ['portfolio'],
  },
  {
    sourceType: 'map',
    targetTypes: ['commute'],
  },
  {
    sourceType: 'news',
    targetTypes: ['rich_note', 'obsidian_notes', 'bookmarks'],
  },
];

/**
 * Returns true when the registry contains a rule whose `sourceType`
 * matches `src` and whose `targetTypes` include `tgt`. Does not run
 * per-rule validators — callers that need payload validation should
 * look up the rule and invoke `rule.validate` themselves.
 */
export const isDropTargetSupported = (
  src: DashboardWidgetType,
  tgt: DashboardWidgetType,
): boolean =>
  DROP_INTENT_REGISTRY.some(
    (rule) => rule.sourceType === src && rule.targetTypes.includes(tgt),
  );

/**
 * Dispatches a `curio:dashboard-item-drop` CustomEvent on `window`.
 * No-ops when `window` is undefined (SSR) or when `CustomEvent` is
 * unavailable in the host environment.
 */
export const dispatchDropIntent = (p: DropIntentPayload): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<DropIntentPayload>(DASHBOARD_ITEM_DROP_EVENT, {
        detail: p,
      }),
    );
  } catch {
    // Silently ignore environments without CustomEvent support.
  }
};

/**
 * Extensible hover item kind. The union covers the built-in surfaces
 * documented in the design; the trailing `string` branch keeps the
 * type open for widgets that introduce new kinds without requiring a
 * central edit.
 */
export type HoverItemKind =
  | 'calendar-event'
  | 'task'
  | 'mail-thread'
  | 'stock'
  | 'bookmark'
  | (string & {});

export interface HoverEventDetail {
  widgetId: string;
  itemKind: HoverItemKind | null;
  itemId: string | null;
  /**
   * Optional metadata the source widget can attach so downstream
   * consumers can match without a round-trip query. Kept to
   * JSON-serialisable values so events survive CustomEvent detail
   * cloning in older browsers.
   *
   * Conventions:
   *  - `calendar-event`: `{ start?: string; end?: string; title?: string;
   *                        attendees?: string[] }`
   *  - `task`:            `{ dueDate?: string; title?: string }`
   *
   * Consumers MUST treat every field as optional and gracefully fall
   * back to rendering no highlight when the data is missing (design
   * Requirement 12.5 — highlight is a hint, not a contract).
   */
  meta?: Record<string, unknown>;
}

export interface SelectEventDetail {
  widgetId: string;
  itemKind: HoverItemKind;
  itemId: string;
}

/**
 * Dispatches a `curio:dashboard-hover` CustomEvent. Passing
 * `{ itemId: null, itemKind: null }` signals the end of a hover and
 * clears all downstream highlights (design Requirement 12.4/12.7).
 */
export const dispatchHover = (detail: HoverEventDetail): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<HoverEventDetail>(DASHBOARD_HOVER_EVENT, { detail }),
    );
  } catch {
    // Silently ignore environments without CustomEvent support.
  }
};

/**
 * Dispatches a `curio:dashboard-select` CustomEvent. Unlike hover, a
 * select event always carries a concrete `itemKind` + `itemId`.
 */
export const dispatchSelect = (detail: SelectEventDetail): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<SelectEventDetail>(DASHBOARD_SELECT_EVENT, { detail }),
    );
  } catch {
    // Silently ignore environments without CustomEvent support.
  }
};

/**
 * Resolve a `LinkedWidgetId` reference against a live widgets list.
 *
 * Returns `null` when `id` is nullish/empty or `widgets` is
 * nullish/empty. Otherwise returns the first widget whose `id`
 * equals `id`, or `null` when no such widget exists
 * (Requirement 11.2 - 11.5).
 *
 * Invariant (Property 8): the returned widget's `id` always equals
 * the query id, or the return value is `null`. The function SHALL
 * NEVER return a widget with a different id.
 */
export function resolveLinkedWidget(
  id: string | null | undefined,
  widgets: readonly DashboardWidget[] | null | undefined,
): DashboardWidget | null {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!widgets || widgets.length === 0) return null;
  for (const widget of widgets) {
    if (widget && widget.id === id) {
      return widget;
    }
  }
  return null;
}
