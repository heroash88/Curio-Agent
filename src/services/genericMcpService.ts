import type { FunctionDeclaration } from '@google/genai';

import {
    EXA_FREE_MCP_SERVER_ID,
    type GenericMcpServerConfig,
    getEnabledGenericMcpServers,
    getGenericMcpAuthHeaders,
} from '../utils/settingsStorage';

import {
    GenericMcpStdioBridgeUnavailableError,
    closeStdioSession,
    isStdioBridgeAvailable,
    stdioRpcCall,
} from './genericMcpStdioTransport';

type JsonObject = Record<string, unknown>;

export interface GenericMcpToolBinding {
    server: GenericMcpServerConfig;
    exposedName: string;
    originalName: string;
}

export interface PreparedGenericMcpTools {
    tools: FunctionDeclaration[];
    bindings: Map<string, GenericMcpToolBinding>;
    toolNames: string[];
    searchToolNames: string[];
    instructionSuffix: string;
    callTool: (name: string, args: any) => Promise<any>;
}

const mcpSessionIds = new Map<string, string>();
/** In-flight initialize promises, keyed by sessionKey, to serialize handshakes. */
const mcpInitializePromises = new Map<string, Promise<void>>();
/** Monotonic counter for JSON-RPC request IDs, avoids Date.now() collisions. */
let mcpRequestCounter = 0;
/** Default per-RPC timeout in ms. Prevents hung servers from blocking the AI turn. */
const MCP_RPC_TIMEOUT_MS = 30_000;

type McpRpcOptions = {
    headers?: Record<string, string>;
    sessionKey?: string;
    /** Override the default RPC timeout (ms). Pass 0 to disable. */
    timeoutMs?: number;
};

const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i,
    /\.localhost$/i,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
];

const isPrivateMcpProxyHost = (hostname: string): boolean => {
    const normalized = hostname.toLowerCase();
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
    const private172Match = normalized.match(/^172\.(\d+)\./);
    return private172Match ? Number(private172Match[1]) >= 16 && Number(private172Match[1]) <= 31 : false;
};

const canUseGenericMcpProxy = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && !isPrivateMcpProxyHost(parsed.hostname);
    } catch {
        return false;
    }
};

const shouldUseGenericMcpProxyFirst = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase() === 'mcp.olyport.com';
    } catch {
        return false;
    }
};

const getGenericMcpProxyUrl = (url: string): string =>
    `/mcp-proxy?url=${encodeURIComponent(url)}`;

const isFetchNetworkFailure = (error: unknown): boolean =>
    error instanceof TypeError && /fetch|network|load/i.test(error.message);

/**
 * Parses SSE lines for `event: message` and `data: {...}`.
 * Some MCP servers like Exa return SSE formatted responses for POST requests.
 */
export function parseSseResponse(text: string): any {
    const lines = text.split('\n');
    let currentEvent = '';
    let dataPayload = '';

    const flush = () => {
        if ((currentEvent === 'message' || !currentEvent) && dataPayload) {
            try {
                return JSON.parse(dataPayload);
            } catch (e) {
                console.error('[GenericMcpService] Failed to parse SSE data payload:', dataPayload);
            }
        }
        return null;
    };

    for (const line of lines) {
        if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
        } else if (line.startsWith('data: ')) {
            dataPayload += line.substring(6).trim();
        } else if (line.trim() === '') {
            const parsed = flush();
            if (parsed) return parsed;
            currentEvent = '';
            dataPayload = '';
        }
    }

    return flush();
}

/**
 * Helper to perform a JSON-RPC request against a generic HTTP MCP endpoint.
 */
async function rpcCall(
    url: string,
    method: string,
    params: any = {},
    options: McpRpcOptions = {},
): Promise<any> {
    mcpRequestCounter = (mcpRequestCounter + 1) % Number.MAX_SAFE_INTEGER;
    const requestId = mcpRequestCounter;
    const payload = {
        jsonrpc: '2.0',
        id: requestId,
        method,
        params,
    };
    const sessionKey = options.sessionKey || url;
    const sessionId = mcpSessionIds.get(sessionKey);
    const timeoutMs = options.timeoutMs ?? MCP_RPC_TIMEOUT_MS;
    const buildRequestInit = (signal?: AbortSignal): RequestInit => ({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2024-11-05',
            ...(options.headers || {}),
            ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
        },
        body: JSON.stringify(payload),
        ...(signal ? { signal } : {}),
    });
    const initialUrl = shouldUseGenericMcpProxyFirst(url) ? getGenericMcpProxyUrl(url) : url;

    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = controller
        ? setTimeout(() => controller.abort(new Error(`MCP ${method} timed out after ${timeoutMs}ms`)), timeoutMs)
        : null;

    try {
        let res: Response;
        try {
            res = await fetch(initialUrl, buildRequestInit(controller?.signal));
        } catch (error) {
            if (initialUrl === url && isFetchNetworkFailure(error) && canUseGenericMcpProxy(url)) {
                res = await fetch(getGenericMcpProxyUrl(url), buildRequestInit(controller?.signal));
            } else {
                throw error;
            }
        }

        const nextSessionId = res.headers.get('Mcp-Session-Id');
        if (nextSessionId) {
            mcpSessionIds.set(sessionKey, nextSessionId);
        }

        if (!res.ok) {
            throw new Error(`MCP Server returned HTTP ${res.status} ${res.statusText}`);
        }

        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();

        let jsonResponse;
        if (contentType.includes('text/event-stream') || text.startsWith('event:')) {
            jsonResponse = parseSseResponse(text);
            if (!jsonResponse) {
                throw new Error('Failed to parse SSE response from MCP server.');
            }
        } else {
            try {
                jsonResponse = JSON.parse(text);
            } catch {
                throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}...`);
            }
        }

        if (jsonResponse.error) {
            throw new Error(`MCP Error [${jsonResponse.error.code}]: ${jsonResponse.error.message}`);
        }

        return jsonResponse.result;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

const initializeGenericMcpServer = async (
    url: string,
    options: McpRpcOptions = {},
): Promise<void> => {
    const sessionKey = options.sessionKey || url;
    if (mcpSessionIds.has(sessionKey)) return;

    // Serialize concurrent initialize calls for the same server so only one
    // handshake actually runs. Subsequent callers wait for the first to settle.
    const existing = mcpInitializePromises.get(sessionKey);
    if (existing) return existing;

    const promise = (async () => {
        try {
            await rpcCall(url, 'initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'curio-robot',
                    version: '1.0.0',
                },
            }, options);
        } catch (error) {
            console.debug('[GenericMcpService] MCP initialize skipped or failed; trying tools/list directly:', error);
        }
    })();

    mcpInitializePromises.set(sessionKey, promise);
    try {
        await promise;
    } finally {
        mcpInitializePromises.delete(sessionKey);
    }
};

const normalizeSchemaForModel = (schema: unknown): unknown => {
    if (Array.isArray(schema)) {
        return schema.map((entry) => normalizeSchemaForModel(entry));
    }

    if (!schema || typeof schema !== 'object') {
        return schema;
    }

    const input = schema as JsonObject;
    const output: JsonObject = {};
    for (const [key, value] of Object.entries(input)) {
        if (key === '$schema') continue;
        output[key] = normalizeSchemaForModel(value);
    }
    return output;
};

const sanitizeToolName = (name: string | undefined, fallback: string): string => {
    const raw = (name || fallback || 'mcp_tool').trim();
    const normalized = raw
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/^([^A-Za-z_])/, '_$1')
        .slice(0, 63);

    return normalized || 'mcp_tool';
};

const AMBIGUOUS_MCP_TOOL_NAMES = new Set([
    'create',
    'delete',
    'fetch',
    'get',
    'list',
    'query',
    'read',
    'search',
    'update',
]);

const slugForServer = (server: GenericMcpServerConfig): string =>
    sanitizeToolName(server.id || server.name || 'mcp', 'mcp')
        .replace(/_?mcp_?/gi, '')
        .slice(0, 24) || 'mcp';

const prefixedToolName = (baseName: string, server: GenericMcpServerConfig): string => {
    const prefix = slugForServer(server);
    return sanitizeToolName(`${prefix}__${baseName}`, `${prefix}__mcp_tool`).slice(0, 63);
};

const shouldScopeMcpToolName = (
    originalName: string | undefined,
    server: GenericMcpServerConfig,
): boolean => {
    if (server.kind === 'search' || isExaFreeMcpServer(server)) return false;
    return AMBIGUOUS_MCP_TOOL_NAMES.has(sanitizeToolName(originalName, '').toLowerCase());
};

const uniqueToolName = (
    originalName: string | undefined,
    server: GenericMcpServerConfig,
    usedNames: Set<string>,
): string => {
    const baseName = sanitizeToolName(originalName, 'mcp_tool');
    if (!shouldScopeMcpToolName(originalName, server) && !usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
    }

    const prefixed = prefixedToolName(baseName, server);
    if (!usedNames.has(prefixed)) {
        usedNames.add(prefixed);
        return prefixed;
    }

    for (let index = 2; index < 100; index += 1) {
        const suffix = `_${index}`;
        const candidate = `${prefixed.slice(0, 63 - suffix.length)}${suffix}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
    }

    usedNames.add(`${prefixed.slice(0, 60)}_x`);
    return `${prefixed.slice(0, 60)}_x`;
};

const isNotionMcpServer = (server: GenericMcpServerConfig): boolean => {
    if (server.id === 'notion-workspace') return true;
    if (/notion/i.test(server.name || '')) return true;
    try {
        return new URL(server.url).hostname.toLowerCase() === 'mcp.notion.com';
    } catch {
        return false;
    }
};

const isSearchLikeTool = (server: GenericMcpServerConfig, _toolName: string): boolean =>
    server.kind === 'search';

const buildToolDescription = (
    server: GenericMcpServerConfig,
    originalName: string,
    exposedName: string,
    description: string | undefined,
): string => {
    const base = `MCP server: ${server.name}. ${description || `External MCP tool: ${originalName}`}`;
    const routingNote = exposedName === originalName ? '' : ` Original MCP tool name: ${originalName}.`;
    const hintNote = server.usageHint ? ` ${server.usageHint}` : '';
    const notionPolicy = isNotionMcpServer(server)
        ? ' For Notion workspace requests, search or list Notion first to resolve page, database, project, or task names to IDs before using ID-only tools. If the user provides a Notion URL, extract its 32-character or UUID-like ID before asking. Do not ask the user for a Notion UUID first; ask only after lookup fails or returns indistinguishable matches. Keep confirmations short.'
        : '';
    const searchPolicy = isSearchLikeTool(server, originalName)
        ? ' Use only when the user needs fresh/current public information, source-backed web lookup, live sports scores or match results, programming documentation/examples, or company/business research. Do not call for greetings, small talk, math, definitions, trivia, or general knowledge that does not require lookup.'
        : ' Use only when this connected MCP server is directly relevant to the user request.';

    return `${base}${routingNote}${hintNote}${notionPolicy || searchPolicy}`;
};

export async function fetchGenericMcpTools(
    url: string,
    headers: Record<string, string> = {},
    sessionKey = url,
): Promise<FunctionDeclaration[]> {
    if (!url) return [];

    try {
        await initializeGenericMcpServer(url, { headers, sessionKey });
        const result = await rpcCall(url, 'tools/list', {}, { headers, sessionKey });
        const tools = result?.tools || [];

        return tools.map((t: any) => ({
            name: t.name,
            description: t.description || `Generic MCP Tool: ${t.name}`,
            parameters: normalizeSchemaForModel(t.inputSchema || {
                type: 'object',
                properties: {},
            }),
        }));
    } catch (e) {
        console.error('[GenericMcpService] Failed to fetch generic MCP tools:', e);
        throw e;
    }
}

export async function callGenericMcpTool(
    url: string,
    name: string,
    args: any,
    headers: Record<string, string> = {},
    sessionKey = url,
): Promise<any> {
    try {
        await initializeGenericMcpServer(url, { headers, sessionKey });
        return await rpcCall(url, 'tools/call', {
            name,
            arguments: args,
        }, { headers, sessionKey });
    } catch (e) {
        console.error(`[GenericMcpService] Tool call failed [${name}]:`, e);
        throw e;
    }
}

const isStdioServer = (server: GenericMcpServerConfig): boolean =>
    (server.transport || 'http') === 'stdio';

const normalizeMcpToolList = (raw: any): FunctionDeclaration[] => {
    const tools = raw?.tools || [];
    return tools.map((t: any) => ({
        name: t.name,
        description: t.description || `Generic MCP Tool: ${t.name}`,
        parameters: normalizeSchemaForModel(t.inputSchema || {
            type: 'object',
            properties: {},
        }) as FunctionDeclaration['parameters'],
    }));
};

/**
 * Server-aware variant of `fetchGenericMcpTools`. Dispatches to HTTP or
 * stdio depending on `server.transport` (defaults to HTTP). Stdio servers
 * require the Electron desktop bridge; when unavailable the function
 * throws `GenericMcpStdioBridgeUnavailableError`.
 */
export async function fetchGenericMcpToolsForServer(
    server: GenericMcpServerConfig,
): Promise<FunctionDeclaration[]> {
    if (isStdioServer(server)) {
        if (!isStdioBridgeAvailable()) {
            throw new GenericMcpStdioBridgeUnavailableError();
        }
        try {
            const result = await stdioRpcCall(server, 'tools/list');
            return normalizeMcpToolList(result);
        } catch (e) {
            console.error('[GenericMcpService] Failed to fetch stdio MCP tools:', e);
            throw e;
        }
    }

    const headers = await getGenericMcpAuthHeaders(server);
    return fetchGenericMcpTools(server.url, headers, server.id || server.url);
}

/**
 * Server-aware variant of `callGenericMcpTool` with transport dispatch.
 */
export async function callGenericMcpToolForServer(
    server: GenericMcpServerConfig,
    name: string,
    args: any,
): Promise<any> {
    if (isStdioServer(server)) {
        if (!isStdioBridgeAvailable()) {
            throw new GenericMcpStdioBridgeUnavailableError();
        }
        try {
            return await stdioRpcCall(server, 'tools/call', {
                name,
                arguments: args,
            });
        } catch (e) {
            console.error(`[GenericMcpService] Stdio tool call failed [${name}]:`, e);
            throw e;
        }
    }

    const headers = await getGenericMcpAuthHeaders(server);
    return callGenericMcpTool(server.url, name, args, headers, server.id || server.url);
}

/** Close any background stdio session associated with a server. */
export const closeGenericMcpServerSession = (server: GenericMcpServerConfig): void => {
    if (isStdioServer(server)) closeStdioSession(server.id);
};

const buildInstructionSuffix = (
    servers: GenericMcpServerConfig[],
    bindings: Map<string, GenericMcpToolBinding>,
): string => {
    if (bindings.size === 0) return '';

    const toolsByServer = new Map<string, string[]>();
    for (const binding of bindings.values()) {
        const list = toolsByServer.get(binding.server.id) || [];
        list.push(binding.exposedName);
        toolsByServer.set(binding.server.id, list);
    }

    const serverLines = servers
        .filter((server) => toolsByServer.has(server.id))
        .map((server) => {
            const tools = toolsByServer.get(server.id)?.join(', ') || 'no tools';
            const source = server.sourceUrl ? ` Source: ${server.sourceUrl}.` : '';
            const searchNote = server.kind === 'search'
                ? ' Treat this as a search/research MCP.'
                : '';
            const hint = server.usageHint ? ` ${server.usageHint}` : '';
            return `- ${server.name}: ${tools}.${hint}${searchNote}${source}`;
        });

    const exposedBindings = [...bindings.values()];
    const hasSearchTools = exposedBindings.some((binding) => isSearchLikeTool(binding.server, binding.originalName));
    const hasExaTools = exposedBindings.some((binding) => isExaFreeMcpServer(binding.server));
    const hasNotionTools = exposedBindings.some((binding) => isNotionMcpServer(binding.server));
    const searchPolicy = hasSearchTools
        ? ' For search MCPs, call them only for fresh/current public information, source-backed lookup, live sports scores or match results, code/documentation examples, or company research. Do not use search MCPs for greetings, small talk, definitions, math, trivia, or general knowledge.'
        : '';
    const exaPolicy = hasExaTools
        ? ' For the LobeHub Exa Web Search Free skill, use web_search_exa for current web/news/facts/sports results, get_code_context_exa for code/docs/examples, and company_research_exa for company/business background.'
        : '';
    const notionPolicy = hasNotionTools
        ? ' For Notion Workspace, search or list Notion first when the user gives a title/name like a project, page, note, task, or database. If the user provides a Notion URL, extract its 32-character or UUID-like ID before asking. Do not ask the user for a Notion UUID first. Ask only one short clarifying question if lookup fails or returns indistinguishable matches.'
        : '';

    return `\n\n[EXTERNAL MCP TOOLS]\nExternal MCP tools are available through connected servers.\n${serverLines.join('\n')}\nUse external MCP tools only when they materially help.${searchPolicy}${exaPolicy}${notionPolicy}\n`;
};

const buildPreparedGenericMcpTools = (
    servers: GenericMcpServerConfig[],
    tools: FunctionDeclaration[],
    bindings: Map<string, GenericMcpToolBinding>,
): PreparedGenericMcpTools => {
    const searchToolNames = [...bindings.values()]
        .filter((binding) => isSearchLikeTool(binding.server, binding.originalName))
        .map((binding) => binding.exposedName);

    return {
        tools,
        bindings,
        toolNames: tools.map((tool) => tool.name || '').filter(Boolean),
        searchToolNames,
        instructionSuffix: buildInstructionSuffix(servers, bindings),
        callTool: async (name: string, args: any) => {
            const binding = bindings.get(name);
            if (!binding) {
                throw new Error(`No generic MCP server is registered for tool: ${name}`);
            }
            return callGenericMcpToolForServer(binding.server, binding.originalName, args);
        },
    };
};

export const filterPreparedGenericMcpToolsForSearchCapability = (
    prepared: PreparedGenericMcpTools,
    options: { allowSearchTools: boolean },
): PreparedGenericMcpTools => {
    if (options.allowSearchTools) {
        return prepared;
    }

    const filteredTools: FunctionDeclaration[] = [];
    const filteredBindings = new Map<string, GenericMcpToolBinding>();
    const filteredServers = new Map<string, GenericMcpServerConfig>();

    for (const tool of prepared.tools) {
        const name = tool.name || '';
        const binding = prepared.bindings.get(name);
        if (!binding) continue;
        if (isSearchLikeTool(binding.server, binding.originalName)) continue;

        filteredTools.push(tool);
        filteredBindings.set(name, binding);
        filteredServers.set(binding.server.id, binding.server);
    }

    return buildPreparedGenericMcpTools(
        [...filteredServers.values()],
        filteredTools,
        filteredBindings,
    );
};

export async function prepareGenericMcpTools(
    servers: GenericMcpServerConfig[] = getEnabledGenericMcpServers(),
): Promise<PreparedGenericMcpTools> {
    const enabledServers = servers.filter((server) => {
        if (!server.enabled) return false;
        if (isStdioServer(server)) return Boolean(server.command?.trim());
        return Boolean(server.url.trim());
    });
    const usedNames = new Set<string>();
    const tools: FunctionDeclaration[] = [];
    const bindings = new Map<string, GenericMcpToolBinding>();

    for (const server of enabledServers) {
        try {
            const serverTools = await fetchGenericMcpToolsForServer(server);
            for (const tool of serverTools) {
                const originalName = tool.name || 'mcp_tool';
                const exposedName = uniqueToolName(originalName, server, usedNames);
                const declaration: FunctionDeclaration = {
                    ...tool,
                    name: exposedName,
                    description: buildToolDescription(server, originalName, exposedName, tool.description),
                    parameters: (tool.parameters || {
                        type: 'object',
                        properties: {},
                    }) as FunctionDeclaration['parameters'],
                };
                tools.push(declaration);
                bindings.set(exposedName, {
                    server,
                    exposedName,
                    originalName,
                });
            }
        } catch (error) {
            console.warn(`[GenericMcpService] Failed to prepare MCP server "${server.name}":`, error);
        }
    }

    // Only pass servers that actually contributed tools (connected successfully)
    const connectedServers = enabledServers.filter((server) => {
        for (const binding of bindings.values()) {
            if (binding.server.id === server.id) return true;
        }
        return false;
    });

    return buildPreparedGenericMcpTools(connectedServers, tools, bindings);
}

export const isExaFreeMcpServer = (server: GenericMcpServerConfig): boolean =>
    server.id === EXA_FREE_MCP_SERVER_ID || server.sourceUrl?.includes('openclaw-skills-exa-web-search-free') === true;
