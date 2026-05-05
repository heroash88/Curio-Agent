/**
 * Dashboard Command Palette Service
 *
 * Pure service (no React dependencies) that manages a registry of search
 * sources and fans out queries to all registered sources in parallel.
 *
 * Consumers (hooks/components) call `search(query)` and receive a merged,
 * deduplicated list of results.
 */

import type React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandPaletteResult {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
  source: string;
  keywords?: string[];
}

export interface CommandPaletteSource {
  id: string;
  search(query: string): CommandPaletteResult[] | Promise<CommandPaletteResult[]>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const sources = new Map<string, CommandPaletteSource>();

export function registerSource(source: CommandPaletteSource): void {
  sources.set(source.id, source);
}

export function unregisterSource(id: string): void {
  sources.delete(id);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Fan out `query` to all registered sources in parallel, merge results,
 * and deduplicate by `id` (first occurrence wins).
 */
export async function search(query: string): Promise<CommandPaletteResult[]> {
  if (!query.trim()) return [];

  const promises = Array.from(sources.values()).map(async (source) => {
    try {
      const results = await source.search(query);
      return results;
    } catch {
      // Swallow per-source errors so one broken source doesn't block others.
      return [] as CommandPaletteResult[];
    }
  });

  const settled = await Promise.all(promises);
  const merged: CommandPaletteResult[] = [];
  const seenIds = new Set<string>();

  for (const batch of settled) {
    for (const result of batch) {
      if (seenIds.has(result.id)) continue;
      seenIds.add(result.id);
      merged.push(result);
    }
  }

  return merged;
}
