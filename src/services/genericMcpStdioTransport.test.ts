// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenericMcpServerConfig } from '../utils/settingsStorage';
import type {
  CurioDesktopMcpStdio,
  McpStdioCloseEvent,
  McpStdioIncomingMessage,
} from '../desktop/desktopTypes';

import {
  __resetStdioSessionsForTests,
  GenericMcpStdioBridgeUnavailableError,
  closeAllStdioSessions,
  isStdioBridgeAvailable,
  stdioRpcCall,
} from './genericMcpStdioTransport';

type BridgeHandlers = {
  onMessage: (message: McpStdioIncomingMessage) => void;
  onClose: (event: McpStdioCloseEvent) => void;
};

type SentPayload = { id: number; method: string; params: unknown };

const makeServer = (overrides: Partial<GenericMcpServerConfig> = {}): GenericMcpServerConfig => ({
  id: 'local',
  name: 'Local MCP',
  url: '',
  enabled: true,
  kind: 'general',
  transport: 'stdio',
  command: '/bin/true',
  ...overrides,
});

const setupBridge = (): { handlers: BridgeHandlers; sent: SentPayload[] } => {
  const handlers: BridgeHandlers = {
    onMessage: () => {},
    onClose: () => {},
  };
  const sent: SentPayload[] = [];

  const bridge: CurioDesktopMcpStdio = {
    start: vi.fn(async ({ serverId }) => ({ sessionId: `session-${serverId}` })),
    send: vi.fn(async (_sessionId, payload) => {
      sent.push(payload as SentPayload);
      return true;
    }),
    close: vi.fn(async () => {}),
    onMessage: (listener) => {
      handlers.onMessage = listener;
      return () => { handlers.onMessage = () => {}; };
    },
    onClose: (listener) => {
      handlers.onClose = listener;
      return () => { handlers.onClose = () => {}; };
    },
  };

  (window as unknown as { curioDesktop?: unknown }).curioDesktop = { mcpStdio: bridge };
  return { handlers, sent };
};

const respond = (
  handlers: BridgeHandlers,
  payload: SentPayload,
  result: unknown,
) => {
  handlers.onMessage({
    sessionId: 'session-local',
    data: { jsonrpc: '2.0', id: payload.id, result },
  });
};

const respondError = (
  handlers: BridgeHandlers,
  payload: SentPayload,
  code: number,
  message: string,
) => {
  handlers.onMessage({
    sessionId: 'session-local',
    data: { jsonrpc: '2.0', id: payload.id, error: { code, message } },
  });
};

describe('genericMcpStdioTransport', () => {
  beforeEach(() => {
    __resetStdioSessionsForTests();
  });

  afterEach(() => {
    closeAllStdioSessions();
    delete (window as { curioDesktop?: unknown }).curioDesktop;
  });

  it('reports when the desktop stdio bridge is missing', async () => {
    delete (window as { curioDesktop?: unknown }).curioDesktop;
    expect(isStdioBridgeAvailable()).toBe(false);
    await expect(stdioRpcCall(makeServer(), 'tools/list')).rejects.toBeInstanceOf(
      GenericMcpStdioBridgeUnavailableError,
    );
  });

  it('sends an initialize handshake, then dispatches tools/list and resolves the matching JSON-RPC response', async () => {
    const { handlers, sent } = setupBridge();

    const pending = stdioRpcCall(makeServer(), 'tools/list');

    await vi.waitFor(() => expect(sent[0]?.method).toBe('initialize'));
    respond(handlers, sent[0], { ok: true });

    await vi.waitFor(() => expect(sent[1]?.method).toBe('tools/list'));
    respond(handlers, sent[1], { tools: [{ name: 'email_inbox' }] });

    await expect(pending).resolves.toEqual({ tools: [{ name: 'email_inbox' }] });
  });

  it('rejects when the child process closes mid-request with stderr context', async () => {
    const { handlers, sent } = setupBridge();

    const pending = stdioRpcCall(makeServer(), 'tools/list');
    await vi.waitFor(() => expect(sent[0]?.method).toBe('initialize'));
    respond(handlers, sent[0], {});

    await vi.waitFor(() => expect(sent[1]?.method).toBe('tools/list'));

    handlers.onClose({
      sessionId: 'session-local',
      serverId: 'local',
      code: 1,
      signal: null,
      stderrTail: 'boom',
    });

    await expect(pending).rejects.toThrow(/closed.*boom/);
  });

  it('surfaces JSON-RPC errors returned by the server', async () => {
    const { handlers, sent } = setupBridge();

    const pending = stdioRpcCall(makeServer(), 'tools/call', { name: 'missing' });
    await vi.waitFor(() => expect(sent[0]?.method).toBe('initialize'));
    respond(handlers, sent[0], {});

    await vi.waitFor(() => expect(sent[1]?.method).toBe('tools/call'));
    respondError(handlers, sent[1], -32601, 'Method not found');

    await expect(pending).rejects.toThrow(/Method not found/);
  });

  it('invalidates the cached session when env or args change so new spawn params take effect', async () => {
    const handlers: BridgeHandlers = { onMessage: () => {}, onClose: () => {} };
    const sent: SentPayload[] = [];
    const starts: Array<{ env?: Record<string, string>; args?: string[] }> = [];
    const closedSessions: string[] = [];
    let sessionCounter = 0;

    const bridge: CurioDesktopMcpStdio = {
      start: vi.fn(async ({ env, args }) => {
        sessionCounter += 1;
        starts.push({ env, args });
        return { sessionId: `session-${sessionCounter}` };
      }),
      send: vi.fn(async (_sessionId, payload) => {
        sent.push(payload as SentPayload);
        return true;
      }),
      close: vi.fn(async (sessionId) => { closedSessions.push(sessionId); }),
      onMessage: (listener) => {
        handlers.onMessage = listener;
        return () => { handlers.onMessage = () => {}; };
      },
      onClose: (listener) => {
        handlers.onClose = listener;
        return () => { handlers.onClose = () => {}; };
      },
    };
    (window as unknown as { curioDesktop?: unknown }).curioDesktop = { mcpStdio: bridge };

    const runCall = async (server: GenericMcpServerConfig) => {
      const before = sent.length;
      const pending = stdioRpcCall(server, 'tools/list');
      // Respond to each send the transport makes until the call resolves.
      const interval = setInterval(() => {
        for (let i = before; i < sent.length; i += 1) {
          const payload = sent[i];
          // Respond with an empty result set so the call resolves cleanly.
          handlers.onMessage({
            sessionId: `session-${starts.length}`,
            data: { jsonrpc: '2.0', id: payload.id, result: { tools: [] } },
          });
        }
      }, 5);
      try {
        return await pending;
      } finally {
        clearInterval(interval);
      }
    };

    await runCall(makeServer({ env: { FLAG: 'one' } }));
    expect(starts).toHaveLength(1);

    // Same fingerprint → reuse, no new spawn.
    await runCall(makeServer({ env: { FLAG: 'one' } }));
    expect(starts).toHaveLength(1);

    // Env changed → old session torn down, new process spawned.
    await runCall(makeServer({ env: { FLAG: 'two' } }));
    expect(starts).toHaveLength(2);
    expect(closedSessions).toContain('session-1');
    expect(starts[1]?.env).toMatchObject({ FLAG: 'two' });
  });
});
