/**
 * Built-in command palette sources for the dashboard.
 *
 * Sources are registered lazily when the palette first opens. They are
 * lightweight and do not import React components.
 *
 * Note: `recentCardsSource` is skipped because CardManager state lives
 * inside a React context and is not easily accessible from a pure service.
 * A future iteration could expose a `getRecentCards()` helper from the
 * CardManager store if needed.
 */

import {
  WIDGET_CATALOG,
  getDashboardCatalogItem,
  type DashboardWidget,
  type DashboardWidgetType,
} from './dashboardTypes';
import {
  registerSource,
  type CommandPaletteResult,
  type CommandPaletteSource,
} from './dashboardCommandPaletteService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, ...targets: (string | undefined)[]): boolean {
  const q = query.toLowerCase();
  return targets.some((t) => t && t.toLowerCase().includes(q));
}

function fuzzyMatchKeywords(query: string, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const q = query.toLowerCase();
  return keywords.some((kw) => kw.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// 1. On-Board Widgets Source
// ---------------------------------------------------------------------------

let activePageWidgetsGetter: (() => DashboardWidget[]) | null = null;

/**
 * Call this from Dashboard.tsx to provide the current active page widgets
 * so the palette can search them without importing React context.
 */
export function setActivePageWidgetsGetter(getter: (() => DashboardWidget[]) | null): void {
  activePageWidgetsGetter = getter;
}

const onBoardWidgetsSource: CommandPaletteSource = {
  id: 'onBoardWidgets',
  search(query: string): CommandPaletteResult[] {
    const widgets = activePageWidgetsGetter?.() ?? [];
    const results: CommandPaletteResult[] = [];

    for (const widget of widgets) {
      if (!widget.enabled) continue;
      const catalogItem = getDashboardCatalogItem(widget.type);
      if (!catalogItem) continue;

      const label = catalogItem.label;
      const description = catalogItem.description;
      const keywords = catalogItem.keywords;

      if (
        fuzzyMatch(query, label, description, widget.type) ||
        fuzzyMatchKeywords(query, keywords)
      ) {
        results.push({
          id: `onboard-${widget.id}`,
          label,
          description: 'Jump to widget',
          icon: undefined,
          action: () => {
            window.dispatchEvent(
              new CustomEvent('curio:dashboard-scroll-to-widget', {
                detail: { widgetId: widget.id },
              }),
            );
          },
          source: 'onBoardWidgets',
          keywords,
        });
      }
    }

    return results;
  },
};

// ---------------------------------------------------------------------------
// 2. Catalog Source
// ---------------------------------------------------------------------------

const catalogSource: CommandPaletteSource = {
  id: 'catalog',
  search(query: string): CommandPaletteResult[] {
    const results: CommandPaletteResult[] = [];

    for (const item of WIDGET_CATALOG) {
      if (
        fuzzyMatch(query, item.label, item.description, item.type) ||
        fuzzyMatchKeywords(query, item.keywords)
      ) {
        results.push({
          id: `catalog-${item.type}`,
          label: `Add ${item.label}`,
          description: item.description,
          icon: undefined,
          action: () => {
            window.dispatchEvent(
              new CustomEvent('curio:dashboard-widget-intent', {
                detail: { action: 'add', widgetType: item.type },
              }),
            );
          },
          source: 'catalog',
          keywords: item.keywords,
        });
      }
    }

    return results;
  },
};

// ---------------------------------------------------------------------------
// 3. Quick Actions Source
// ---------------------------------------------------------------------------

interface QuickAction {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  action: () => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'quick-add-stock',
    label: 'Add stock',
    description: 'Add a stock symbol to your watchlist',
    keywords: ['stock', 'ticker', 'symbol', 'watchlist', 'market'],
    action: () => {
      window.dispatchEvent(
        new CustomEvent('curio:dashboard-widget-intent', {
          detail: { action: 'add', widgetType: 'stock' as DashboardWidgetType },
        }),
      );
    },
  },
  {
    id: 'quick-set-timer',
    label: 'Set timer 5m',
    description: 'Start a 5-minute timer',
    keywords: ['timer', 'countdown', 'minutes', 'alarm'],
    action: () => {
      window.dispatchEvent(
        new CustomEvent('curio:dashboard-widget-intent', {
          detail: { action: 'add', widgetType: 'timers' as DashboardWidgetType },
        }),
      );
    },
  },
  {
    id: 'quick-toggle-lights',
    label: 'Toggle kitchen lights',
    description: 'Toggle Home Assistant kitchen lights (if connected)',
    keywords: ['lights', 'kitchen', 'home assistant', 'ha', 'toggle', 'smart home'],
    action: () => {
      // Dispatch through the existing HA widget intent bus if HA is connected.
      // This is a best-effort action; if HA is not connected it's a no-op.
      window.dispatchEvent(
        new CustomEvent('curio:dashboard-widget-intent', {
          detail: { action: 'add', widgetType: 'ha_light' as DashboardWidgetType },
        }),
      );
    },
  },
];

const quickActionsSource: CommandPaletteSource = {
  id: 'quickActions',
  search(query: string): CommandPaletteResult[] {
    const results: CommandPaletteResult[] = [];

    for (const qa of QUICK_ACTIONS) {
      if (
        fuzzyMatch(query, qa.label, qa.description) ||
        fuzzyMatchKeywords(query, qa.keywords)
      ) {
        results.push({
          id: qa.id,
          label: qa.label,
          description: qa.description,
          icon: undefined,
          action: qa.action,
          source: 'quickActions',
          keywords: qa.keywords,
        });
      }
    }

    return results;
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let sourcesRegistered = false;

/**
 * Register all built-in sources. Safe to call multiple times (idempotent).
 */
export function registerBuiltInSources(): void {
  if (sourcesRegistered) return;
  sourcesRegistered = true;
  registerSource(onBoardWidgetsSource);
  registerSource(catalogSource);
  registerSource(quickActionsSource);
  // recentCardsSource is skipped — CardManager lives in React context.
}
