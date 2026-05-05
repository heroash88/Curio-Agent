/**
 * JSON-RPC transport for local stdio MCP servers, bridged through the
 * Electron desktop app (`window.curioDesktop.mcpStdio`). Browsers and PWA
 * kiosks do not expose the bridge, so callers must treat stdio as
 * desktop-only.
 *
 * Lifetime model:
 * - A session maps 1:1 to a spawned child process and is keyed by
 *   `serverId`. Callers share the same session for all requests to one
 *   configured server.
 * - Sessions are lazy: the first `rpcCall` starts the process.
 * - Sessions are cached per serverId and torn down when the process
 *   exits, errors, or `closeStdioSession(serverId)` is called.
 * - Request/response correlation uses the JSON-RPC `id` field. Timed-out
 *   requests reject but leave the session alive (the next call may still
 *   succeed).
 */

import {
    type GenericMcpServerConfig,
    resolveGenericMcpEnv,
} from '../utils/settingsStorage';
import type {
    CurioDesktopMcpStdio,
    McpStdioCloseEvent,
    McpStdioIncomingMessage,
} from '../desktop/desktopTypes';

const DEFAULT_STDIO_RPC_TIMEOUT_MS = 30_000;

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
};

type StdioSession = {
    serverId: string;
    sessionId: string;
    bridge: CurioDesktopMcpStdio;
    unsubscribeMessage: () => void;
    unsubscribeClose: () => void;
    pending: Map<number, PendingRequest>;
    closed: boolean;
    startupError?: Error;
    initialized: boolean;
    initializePromise?: Promise<void>;
    nextRequestId: number;
    /**
     * Fingerprint of the spawn parameters that started this session.
     * When the renderer supplies a server config whose fingerprint
     * differs, the cached session is torn down and replaced so the
     * new command/args/env actually take effect.
     */
    fingerprint: string;
};

const sessionsByServerId = new Map<string, StdioSession>();
/** In-flight `start` calls, shared by concurrent callers for one serverId. */
const startingSessions = new Map<string, Promise<StdioSession>>();

const JSON_RPC_CLIENT_INFO = {
    name: 'curio-robot',
    version: '1.0.0',
};

const PROTOCOL_VERSION = '2024-11-05';

export class GenericMcpStdioBridgeUnavailableError extends Error {
    constructor() {
        super('Local (stdio) MCP servers require the Curio desktop app.');
        this.name = 'GenericMcpStdioBridgeUnavailableError';
    }
}

export const getStdioBridge = (): CurioDesktopMcpStdio | null => {
    if (typeof window === 'undefined') return null;
    const bridge = window.curioDesktop?.mcpStdio;
    if (!bridge) return null;
    return bridge;
};

export const isStdioBridgeAvailable = (): boolean => getStdioBridge() !== null;

const ensureBridge = (): CurioDesktopMcpStdio => {
    const bridge = getStdioBridge();
    if (!bridge) throw new GenericMcpStdioBridgeUnavailableError();
    return bridge;
};

const failAllPending = (session: StdioSession, error: Error) => {
    for (const pending of session.pending.values()) {
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        pending.reject(error);
    }
    session.pending.clear();
};

const cleanupSession = (session: StdioSession, error?: Error) => {
    if (session.closed) return;
    session.closed = true;
    try { session.unsubscribeMessage(); } catch { /* noop */ }
    try { session.unsubscribeClose(); } catch { /* noop */ }
    const rejection = error || new Error(`MCP stdio session closed for "${session.serverId}".`);
    failAllPending(session, rejection);
    const current = sessionsByServerId.get(session.serverId);
    if (current === session) sessionsByServerId.delete(session.serverId);
};

const handleIncomingMessage = (session: StdioSession, message: McpStdioIncomingMessage) => {
    if (message.sessionId !== session.sessionId) return;
    if (message.parseError) {
        console.warn(
            `[GenericMcpStdioTransport] Unparseable line from "${session.serverId}":`,
            message.parseError,
            message.raw,
        );
        return;
    }
    const data = message.data as { id?: unknown; method?: unknown } | null;
    if (!data || typeof data !== 'object') return;
    const rawId = (data as { id?: unknown }).id;
    const id = typeof rawId === 'number' ? rawId : null;
    if (id === null) {
        // No id means notification (no response expected). MCP servers may
        // emit logging/notification frames; ignore them.
        return;
    }
    const pending = session.pending.get(id);
    if (!pending) return;
    session.pending.delete(id);
    if (pending.timeoutId) clearTimeout(pending.timeoutId);

    const error = (data as { error?: { code?: unknown; message?: unknown } }).error;
    if (error && typeof error === 'object') {
        const code = typeof error.code === 'number' ? error.code : -1;
        const messageText = typeof error.message === 'string' ? error.message : 'MCP error';
        pending.reject(new Error(`MCP Error [${code}]: ${messageText}`));
        return;
    }
    pending.resolve((data as { result?: unknown }).result);
};

const handleCloseEvent = (session: StdioSession, event: McpStdioCloseEvent) => {
    if (event.sessionId !== session.sessionId) return;
    const parts: string[] = [];
    if (event.error) parts.push(event.error);
    if (typeof event.code === 'number') parts.push(`exit code ${event.code}`);
    if (event.signal) parts.push(`signal ${event.signal}`);
    if (event.stderrTail) parts.push(`stderr: ${event.stderrTail.trim()}`);
    const reason = parts.length > 0 ? parts.join(' | ') : 'process exited';
    cleanupSession(session, new Error(`MCP stdio server "${session.serverId}" closed: ${reason}`));
};

const createSessionForServer = async (server: GenericMcpServerConfig): Promise<StdioSession> => {
    const bridge = ensureBridge();
    const command = server.command?.trim();
    if (!command) {
        throw new Error(`MCP stdio server "${server.name}" is missing a command.`);
    }

    const env = await resolveGenericMcpEnv(server);
    const fingerprint = JSON.stringify({
        command,
        args: server.args || [],
        cwd: server.cwd || '',
        env,
    });
    const { sessionId } = await bridge.start({
        serverId: server.id,
        command,
        args: server.args,
        cwd: server.cwd,
        env,
    });

    const pending = new Map<number, PendingRequest>();
    const session: StdioSession = {
        serverId: server.id,
        sessionId,
        bridge,
        unsubscribeMessage: () => { /* set below */ },
        unsubscribeClose: () => { /* set below */ },
        pending,
        closed: false,
        initialized: false,
        nextRequestId: 1,
        fingerprint,
    };

    session.unsubscribeMessage = bridge.onMessage((message) =>
        handleIncomingMessage(session, message),
    );
    session.unsubscribeClose = bridge.onClose((event) =>
        handleCloseEvent(session, event),
    );
    return session;
};

const fingerprintForServer = async (server: GenericMcpServerConfig): Promise<string> => {
    const env = await resolveGenericMcpEnv(server);
    return JSON.stringify({
        command: server.command?.trim() || '',
        args: server.args || [],
        cwd: server.cwd || '',
        env,
    });
};

const getOrStartSession = async (server: GenericMcpServerConfig): Promise<StdioSession> => {
    const existing = sessionsByServerId.get(server.id);
    if (existing && !existing.closed) {
        // Invalidate the cached session when the spawn parameters change,
        // so env/args/cwd edits in Settings actually take effect without
        // requiring the user to relaunch the app.
        const nextFingerprint = await fingerprintForServer(server);
        if (nextFingerprint === existing.fingerprint) return existing;
        closeStdioSession(server.id);
    }

    const starting = startingSessions.get(server.id);
    if (starting) return starting;

    const promise = (async () => {
        const session = await createSessionForServer(server);
        sessionsByServerId.set(server.id, session);
        return session;
    })();
    startingSessions.set(server.id, promise);

    try {
        return await promise;
    } finally {
        startingSessions.delete(server.id);
    }
};

const sendRequest = async (
    session: StdioSession,
    method: string,
    params: unknown,
    options: { timeoutMs?: number } = {},
): Promise<unknown> => {
    if (session.closed) {
        throw new Error(`MCP stdio session for "${session.serverId}" is closed.`);
    }
    const id = session.nextRequestId;
    session.nextRequestId = (session.nextRequestId + 1) % Number.MAX_SAFE_INTEGER;

    const timeoutMs = options.timeoutMs ?? DEFAULT_STDIO_RPC_TIMEOUT_MS;

    return new Promise<unknown>((resolve, reject) => {
        const pending: PendingRequest = { resolve, reject, timeoutId: null };
        if (timeoutMs > 0) {
            pending.timeoutId = setTimeout(() => {
                if (!session.pending.has(id)) return;
                session.pending.delete(id);
                reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms (stdio: ${session.serverId}).`));
            }, timeoutMs);
        }
        session.pending.set(id, pending);

        const payload = {
            jsonrpc: '2.0',
            id,
            method,
            params: params ?? {},
        };
        void session.bridge.send(session.sessionId, payload).then(
            (sent) => {
                if (sent) return;
                if (!session.pending.has(id)) return;
                session.pending.delete(id);
                if (pending.timeoutId) clearTimeout(pending.timeoutId);
                reject(new Error(`Failed to write to MCP stdio session for "${session.serverId}".`));
            },
            (error) => {
                if (!session.pending.has(id)) return;
                session.pending.delete(id);
                if (pending.timeoutId) clearTimeout(pending.timeoutId);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        );
    });
};

const initializeSession = async (session: StdioSession): Promise<void> => {
    if (session.initialized) return;
    if (session.initializePromise) return session.initializePromise;
    const promise = (async () => {
        try {
            await sendRequest(session, 'initialize', {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: JSON_RPC_CLIENT_INFO,
            });
        } catch (error) {
            console.debug(
                `[GenericMcpStdioTransport] initialize for "${session.serverId}" failed; proceeding anyway:`,
                error,
            );
        } finally {
            session.initialized = true;
        }
    })();
    session.initializePromise = promise;
    try {
        await promise;
    } finally {
        session.initializePromise = undefined;
    }
};

export const stdioRpcCall = async (
    server: GenericMcpServerConfig,
    method: string,
    params: unknown = {},
    options: { timeoutMs?: number; skipInitialize?: boolean } = {},
): Promise<unknown> => {
    const session = await getOrStartSession(server);
    if (!options.skipInitialize && method !== 'initialize') {
        await initializeSession(session);
    }
    return sendRequest(session, method, params, options);
};

export const closeStdioSession = (serverId: string): void => {
    const session = sessionsByServerId.get(serverId);
    if (!session) return;
    const bridge = session.bridge;
    cleanupSession(session);
    try { void bridge.close(session.sessionId); } catch { /* noop */ }
};

export const closeAllStdioSessions = (): void => {
    for (const serverId of [...sessionsByServerId.keys()]) {
        closeStdioSession(serverId);
    }
};

/**
 * Test-only helper: clears the in-memory session cache without touching
 * the bridge. Never call this from production code.
 */
export const __resetStdioSessionsForTests = (): void => {
    sessionsByServerId.clear();
    startingSessions.clear();
};
