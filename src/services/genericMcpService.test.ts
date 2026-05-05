import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXA_FREE_MCP_SERVER_ID,
  EXA_FREE_MCP_SKILL_URL,
  type GenericMcpServerConfig,
} from '../utils/settingsStorage';

import {
  filterPreparedGenericMcpToolsForSearchCapability,
  parseSseResponse,
  prepareGenericMcpTools,
} from './genericMcpService';

const sseResponse = (payload: unknown) => new Response(
  `event: message\ndata: ${JSON.stringify({ result: payload, jsonrpc: '2.0', id: 1 })}\n\n`,
  {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'Mcp-Session-Id': `session-${Math.random().toString(36).slice(2)}`,
    },
  },
);

const makeServer = (overrides: Partial<GenericMcpServerConfig>): GenericMcpServerConfig => ({
  id: 'server',
  name: 'Server',
  url: 'https://example.test/mcp',
  enabled: true,
  kind: 'general',
  ...overrides,
});

describe('genericMcpService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('parses SSE JSON-RPC message payloads even without a trailing blank line', () => {
    expect(parseSseResponse('event: message\ndata: {"result":{"ok":true},"id":1}')).toEqual({
      result: { ok: true },
      id: 1,
    });
  });

  it('prepares multiple MCP servers and routes duplicate tool names to the right endpoint', async () => {
    const calls: Array<{ url: string; method: string; params: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, method: body.method, params: body.params });

      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }

      if (body.method === 'tools/list') {
        if (url.includes('alpha')) {
          return sseResponse({
            tools: [
              { name: 'lookup', description: 'Alpha lookup', inputSchema: { type: 'object', properties: {} } },
              { name: 'bad.tool', description: 'Needs a valid function name', inputSchema: { type: 'object', properties: {} } },
            ],
          });
        }
        return sseResponse({
          tools: [
            { name: 'lookup', description: 'Beta lookup', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }

      if (body.method === 'tools/call') {
        return sseResponse({ called: body.params.name, args: body.params.arguments, url });
      }

      throw new Error(`Unexpected method ${body.method}`);
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({ id: 'alpha', name: 'Alpha', url: 'https://alpha.test/mcp' }),
      makeServer({ id: 'beta', name: 'Beta', url: 'https://beta.test/mcp' }),
    ]);

    expect(prepared.toolNames).toEqual(['lookup', 'bad_tool', 'beta__lookup']);
    expect(prepared.bindings.get('lookup')?.server.url).toBe('https://alpha.test/mcp');
    expect(prepared.bindings.get('beta__lookup')?.server.url).toBe('https://beta.test/mcp');
    expect(prepared.bindings.get('bad_tool')?.originalName).toBe('bad.tool');

    const result = await prepared.callTool('beta__lookup', { q: 'hello' });

    expect(result).toEqual({ called: 'lookup', args: { q: 'hello' }, url: 'https://beta.test/mcp' });
    expect(calls.some((call) => call.url === 'https://beta.test/mcp' && call.method === 'tools/call')).toBe(true);
  });

  it('uses the same-origin MCP proxy first for OlyPort servers to avoid browser preflight failures', async () => {
    const fetchUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      fetchUrls.push(url);
      const body = JSON.parse(String(init.body));

      expect(url).toMatch(/^\/mcp-proxy\?url=/);
      expect(decodeURIComponent(url.split('url=')[1])).toBe('https://mcp.olyport.com/nws-alerts/mcp');

      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }
      if (body.method === 'tools/list') {
        return sseResponse({
          tools: [
            { name: 'get_alerts', description: 'Get alerts.', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }
      return sseResponse({ ok: true });
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: 'olyport-nws-alerts',
        name: 'NWS Weather Alerts',
        url: 'https://mcp.olyport.com/nws-alerts/mcp',
      }),
    ]);

    expect(prepared.toolNames).toEqual(['get_alerts']);
    expect(fetchUrls).toHaveLength(2);
  });

  it('falls back to the MCP proxy when a public MCP endpoint fails like a browser CORS request', async () => {
    const fetchUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      fetchUrls.push(url);
      if (url === 'https://public-mcp.example.com/mcp') {
        throw new TypeError('Failed to fetch');
      }

      const body = JSON.parse(String(init.body));
      expect(url).toMatch(/^\/mcp-proxy\?url=/);
      expect(decodeURIComponent(url.split('url=')[1])).toBe('https://public-mcp.example.com/mcp');
      if (body.method === 'tools/list') {
        return sseResponse({
          tools: [
            { name: 'lookup_public_data', description: 'Lookup data.', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }
      return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: 'public-mcp',
        name: 'Public MCP',
        url: 'https://public-mcp.example.com/mcp',
      }),
    ]);

    expect(prepared.toolNames).toEqual(['lookup_public_data']);
    expect(fetchUrls).toEqual([
      'https://public-mcp.example.com/mcp',
      '/mcp-proxy?url=https%3A%2F%2Fpublic-mcp.example.com%2Fmcp',
      'https://public-mcp.example.com/mcp',
      '/mcp-proxy?url=https%3A%2F%2Fpublic-mcp.example.com%2Fmcp',
    ]);
  });

  it('does not proxy private MCP endpoints after a browser fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(prepareGenericMcpTools([
      makeServer({
        id: 'local-mcp',
        name: 'Local MCP',
        url: 'http://127.0.0.1:8999/mcp',
      }),
    ])).resolves.toMatchObject({
      toolNames: [],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as any).mock.calls.map(([url]: [string]) => url)).toEqual([
      'http://127.0.0.1:8999/mcp',
      'http://127.0.0.1:8999/mcp',
    ]);
  });

  it('sends configured auth headers to MCP list and call requests', async () => {
    const requestHeaders: Headers[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      requestHeaders.push(new Headers(init.headers));
      const body = JSON.parse(String(init.body));
      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }
      if (body.method === 'tools/list') {
        return sseResponse({
          tools: [
            { name: 'send_message', description: 'Send a work message.', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }
      return sseResponse({ ok: true });
    }));

    localStorage.setItem('curio_generic_mcp_auth_token:work-slack', 'work-token');

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: 'work-slack',
        name: 'Work Slack',
        url: 'https://slack.internal/mcp',
        authType: 'bearer',
      }),
    ]);
    await prepared.callTool('send_message', { text: 'hi' });

    expect(requestHeaders.map((headers) => headers.get('authorization'))).toEqual([
      'Bearer work-token',
      'Bearer work-token',
      'Bearer work-token',
    ]);
  });

  it('marks the LobeHub Exa Free preset as a search MCP with restrictive instructions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }
      return sseResponse({
        tools: [
          { name: 'web_search_exa', description: 'Search the web.', inputSchema: { type: 'object', properties: {} } },
          { name: 'get_code_context_exa', description: 'Find code examples.', inputSchema: { type: 'object', properties: {} } },
          { name: 'company_research_exa', description: 'Research companies.', inputSchema: { type: 'object', properties: {} } },
        ],
      });
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: EXA_FREE_MCP_SERVER_ID,
        name: 'Exa Web Search Free',
        url: 'https://mcp.exa.ai/mcp?tools=web_search_exa,get_code_context_exa,company_research_exa',
        kind: 'search',
        sourceUrl: EXA_FREE_MCP_SKILL_URL,
      }),
    ]);

    expect(prepared.toolNames).toEqual(['web_search_exa', 'get_code_context_exa', 'company_research_exa']);
    expect(prepared.searchToolNames).toEqual(['web_search_exa', 'get_code_context_exa', 'company_research_exa']);
    expect(prepared.tools[0].description).toContain('Do not call for greetings');
    expect(prepared.instructionSuffix).toContain('LobeHub Exa Web Search Free');
    expect(prepared.instructionSuffix).toContain(EXA_FREE_MCP_SKILL_URL);
  });

  it('can remove search MCP tools while keeping non-search MCP tools routed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }
      if (body.method === 'tools/list') {
        if (url.includes('exa')) {
          return sseResponse({
            tools: [
              { name: 'web_search_exa', description: 'Search the web.', inputSchema: { type: 'object', properties: {} } },
            ],
          });
        }
        return sseResponse({
          tools: [
            { name: 'send_message', description: 'Send a Slack message.', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }
      return sseResponse({ called: body.params.name, args: body.params.arguments, url });
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: EXA_FREE_MCP_SERVER_ID,
        name: 'Exa Web Search Free',
        url: 'https://exa.test/mcp',
        kind: 'search',
        sourceUrl: EXA_FREE_MCP_SKILL_URL,
      }),
      makeServer({
        id: 'work-slack',
        name: 'Work Slack',
        url: 'https://slack.internal/mcp',
        kind: 'general',
      }),
    ]);

    const filtered = filterPreparedGenericMcpToolsForSearchCapability(prepared, {
      allowSearchTools: false,
    });

    expect(filtered.toolNames).toEqual(['send_message']);
    expect(filtered.searchToolNames).toEqual([]);
    expect(filtered.instructionSuffix).toContain('Work Slack');
    expect(filtered.instructionSuffix).not.toContain('Exa Web Search Free');
    expect(filtered.bindings.has('web_search_exa')).toBe(false);

    await expect(filtered.callTool('send_message', { text: 'hi' })).resolves.toMatchObject({
      called: 'send_message',
      args: { text: 'hi' },
    });
    await expect(filtered.callTool('web_search_exa', { query: 'today scores' }))
      .rejects.toThrow('No generic MCP server is registered for tool: web_search_exa');
  });

  it('keeps Notion workspace search and fetch tools even when public search fallback is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }
      if (body.method === 'tools/list') {
        return sseResponse({
          tools: [
            { name: 'search', description: 'Search Notion pages and databases.', inputSchema: { type: 'object', properties: {} } },
            { name: 'fetch', description: 'Fetch a Notion page or database by ID.', inputSchema: { type: 'object', properties: {} } },
            { name: 'create_page', description: 'Create a Notion page.', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }
      return sseResponse({ called: body.params.name, args: body.params.arguments });
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: 'notion-workspace',
        name: 'Notion Workspace',
        url: 'https://mcp.notion.com/mcp',
        kind: 'general',
      }),
    ]);

    expect(prepared.searchToolNames).toEqual([]);
    expect(prepared.toolNames).toEqual([
      'notion_workspace__search',
      'notion_workspace__fetch',
      'create_page',
    ]);
    expect(prepared.tools.find((tool) => tool.name === 'notion_workspace__search')?.description)
      .toContain('search or list Notion first');
    expect(prepared.instructionSuffix).toContain('Do not ask the user for a Notion UUID first');

    const filtered = filterPreparedGenericMcpToolsForSearchCapability(prepared, {
      allowSearchTools: false,
    });

    expect(filtered.toolNames).toEqual(['notion_workspace__search', 'notion_workspace__fetch', 'create_page']);
    await expect(filtered.callTool('notion_workspace__search', { query: 'Curio project' })).resolves.toMatchObject({
      called: 'search',
      args: { query: 'Curio project' },
    });
  });

  it('server-scopes ambiguous tools so GitHub and Notion searches cannot be confused', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method === 'initialize') {
        return sseResponse({ protocolVersion: '2024-11-05', capabilities: {} });
      }
      if (body.method === 'tools/list') {
        return sseResponse({
          tools: [
            { name: 'search', description: 'Search this service.', inputSchema: { type: 'object', properties: {} } },
            { name: 'fetch', description: 'Fetch an item by ID.', inputSchema: { type: 'object', properties: {} } },
          ],
        });
      }
      return sseResponse({ called: body.params.name, url });
    }));

    const prepared = await prepareGenericMcpTools([
      makeServer({
        id: 'notion-workspace',
        name: 'Notion Workspace',
        url: 'https://mcp.notion.com/mcp',
        kind: 'general',
      }),
      makeServer({
        id: 'github-remote',
        name: 'GitHub Remote MCP',
        url: 'https://api.githubcopilot.com/mcp/',
        kind: 'general',
      }),
    ]);

    expect(prepared.toolNames).toEqual([
      'notion_workspace__search',
      'notion_workspace__fetch',
      'github_remote__search',
      'github_remote__fetch',
    ]);
    expect(prepared.tools.find((tool) => tool.name === 'github_remote__search')?.description)
      .toContain('MCP server: GitHub Remote MCP.');
    expect(prepared.tools.find((tool) => tool.name === 'notion_workspace__search')?.description)
      .toContain('MCP server: Notion Workspace.');

    await expect(prepared.callTool('github_remote__search', { query: 'projects' })).resolves.toMatchObject({
      called: 'search',
      url: 'https://api.githubcopilot.com/mcp/',
    });
  });
});

describe('genericMcpService stdio dispatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('prepares stdio MCP servers through the Electron desktop bridge without calling fetch', async () => {
    const fetchMock = vi.fn(() => { throw new Error('fetch should not be called for stdio servers'); });
    vi.stubGlobal('fetch', fetchMock);

    type Listener = (value: any) => void;
    const messageListeners = new Set<Listener>();
    const bridge = {
      start: vi.fn(async ({ serverId }: { serverId: string }) => ({ sessionId: `session-${serverId}` })),
      send: vi.fn(async (_sessionId: string, payload: any) => {
        queueMicrotask(() => {
          let result: unknown;
          if (payload.method === 'initialize') {
            result = { protocolVersion: '2024-11-05', capabilities: {} };
          } else if (payload.method === 'tools/list') {
            result = {
              tools: [
                { name: 'email_inbox', description: 'Latest emails.', inputSchema: { type: 'object', properties: {} } },
              ],
            };
          } else {
            result = { called: payload.params.name, args: payload.params.arguments };
          }
          for (const listener of messageListeners) {
            listener({
              sessionId: 'session-local-outlook',
              data: { jsonrpc: '2.0', id: payload.id, result },
            });
          }
        });
        return true;
      }),
      close: vi.fn(async () => {}),
      onMessage: (listener: Listener) => {
        messageListeners.add(listener);
        return () => { messageListeners.delete(listener); };
      },
      onClose: () => () => {},
    };
    (window as unknown as { curioDesktop?: unknown }).curioDesktop = { mcpStdio: bridge };

    try {
      const { __resetStdioSessionsForTests } = await import('./genericMcpStdioTransport');
      __resetStdioSessionsForTests();

      const server: GenericMcpServerConfig = {
        id: 'local-outlook',
        name: 'Work Outlook',
        url: '',
        enabled: true,
        kind: 'general',
        transport: 'stdio',
        command: '/usr/local/bin/work-mcp',
        args: ['--mode', 'inbox'],
      };

      const prepared = await prepareGenericMcpTools([server]);

      expect(prepared.toolNames).toEqual(['email_inbox']);
      expect(bridge.start).toHaveBeenCalledWith(expect.objectContaining({
        serverId: 'local-outlook',
        command: '/usr/local/bin/work-mcp',
        args: ['--mode', 'inbox'],
      }));

      await expect(prepared.callTool('email_inbox', { limit: 3 })).resolves.toMatchObject({
        called: 'email_inbox',
        args: { limit: 3 },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete (window as { curioDesktop?: unknown }).curioDesktop;
    }
  });
});
