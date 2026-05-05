/**
 * Fetches and caches the tools exposed by a specific enabled generic
 * MCP server so widget settings pickers can show clickable tool lists
 * alongside the free-form `mcpToolName` input.
 *
 * Rationale:
 * - Widgets route through `fetchGenericMcpToolsForServer(server)` already
 *   for actual data, so reusing it here guarantees the settings picker
 *   sees the same tool set (including the stdio transport and any scoped
 *   `{server}__{name}` aliases the preparer may emit).
 * - Tool lists rarely change during a session, so we cache the last
 *   successful fetch per server id. Users can force a refetch through
 *   the returned `reload` callback.
 */

import { useEffect, useMemo, useState } from 'react';

import { fetchGenericMcpToolsForServer } from '../services/genericMcpService';
import {
    type GenericMcpServerConfig,
    useGenericMcpServers,
} from '../utils/settingsStorage';

export interface McpServerTool {
    name: string;
    description: string;
}

type CacheEntry = {
    tools: McpServerTool[];
    error: string | null;
};

const toolsCache = new Map<string, CacheEntry>();

const normalizeTools = (tools: Awaited<ReturnType<typeof fetchGenericMcpToolsForServer>>): McpServerTool[] =>
    tools
        .map((tool) => ({
            name: typeof tool.name === 'string' ? tool.name : '',
            description: typeof tool.description === 'string' ? tool.description : '',
        }))
        .filter((tool) => tool.name.length > 0);

export interface UseMcpServerToolsResult {
    server: GenericMcpServerConfig | null;
    tools: McpServerTool[];
    loading: boolean;
    error: string | null;
    reload: () => void;
}

export function useMcpServerTools(serverId: string | undefined): UseMcpServerToolsResult {
    const servers = useGenericMcpServers();
    const server = useMemo(() => {
        if (!serverId) {
            return servers.find((entry) => entry.enabled && entry.kind !== 'search') || null;
        }
        return servers.find((entry) => entry.id === serverId && entry.enabled) || null;
    }, [servers, serverId]);

    // Fingerprint the spawn-relevant bits so config edits invalidate both
    // the renderer-side tool cache and the underlying stdio session.
    // Secret env values are excluded from the fingerprint because they
    // can't be read synchronously from secret storage; when a secret
    // rotates without the non-secret config changing, users can still
    // click the Reload button on the tool picker.
    const configFingerprint = useMemo(() => {
        if (!server) return '';
        return JSON.stringify({
            transport: server.transport || 'http',
            command: server.command || '',
            args: server.args || [],
            cwd: server.cwd || '',
            env: server.env || {},
            secretEnvNames: server.secretEnvNames || [],
            url: server.url,
            authType: server.authType,
            authHeaderName: server.authHeaderName,
        });
    }, [server]);

    const cacheKey = server ? `${server.id}::${configFingerprint}` : '';

    const initial = cacheKey ? toolsCache.get(cacheKey) : undefined;
    const [tools, setTools] = useState<McpServerTool[]>(initial?.tools || []);
    const [error, setError] = useState<string | null>(initial?.error || null);
    const [loading, setLoading] = useState<boolean>(!initial && Boolean(server));
    const [reloadTick, setReloadTick] = useState(0);

    useEffect(() => {
        if (!server) {
            setTools([]);
            setError(null);
            setLoading(false);
            return;
        }
        const cached = toolsCache.get(cacheKey);
        if (cached && reloadTick === 0) {
            setTools(cached.tools);
            setError(cached.error);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        void fetchGenericMcpToolsForServer(server)
            .then((list) => {
                if (cancelled) return;
                const normalized = normalizeTools(list);
                toolsCache.set(cacheKey, { tools: normalized, error: null });
                setTools(normalized);
                setError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : String(err);
                toolsCache.set(cacheKey, { tools: [], error: message });
                setTools([]);
                setError(message);
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [server, cacheKey, reloadTick]);

    return {
        server,
        tools,
        loading,
        error,
        reload: () => {
            if (cacheKey) toolsCache.delete(cacheKey);
            setReloadTick((tick) => tick + 1);
        },
    };
}

/** Test-only helper to clear the module-level cache between tests. */
export const __resetMcpServerToolsCacheForTests = (): void => {
    toolsCache.clear();
};
