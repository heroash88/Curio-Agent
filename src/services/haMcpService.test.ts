import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeAssistantMCPClient } from './haMcpService';
import type { HAEntity } from './haMcpService';

function createEntity(overrides: Partial<HAEntity>): HAEntity {
  return {
    entity_id: 'light.kitchen',
    name: 'Kitchen Light',
    domain: 'light',
    state: 'off',
    ...overrides,
  };
}

function createResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('HomeAssistantMCPClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('refreshes entity state after an empty success result', async () => {
    const client = new HomeAssistantMCPClient('http://ha.local', 'token', 'mcp');
    client.entityCache = [createEntity({ entity_id: 'light.kitchen', state: 'off' })];

    fetchMock.mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/mcp')) {
        return Promise.resolve(createResponse({ result: { content: [] } }));
      }

      if (url.endsWith('/api/states/light.kitchen')) {
        return Promise.resolve(createResponse({
          entity_id: 'light.kitchen',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Light' },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await client.callTool('homeassistant__light__turn_on', {
      entity_id: 'light.kitchen',
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.params.arguments).toMatchObject({
      entity_id: 'light.kitchen',
    });
    expect(payload.params.arguments.target).toBeUndefined();
    expect(result.content[0].text).toContain('Successfully called light.turn_on');
    expect(result.__curio).toMatchObject({
      status: 'success',
      resolvedEntityIds: ['light.kitchen'],
    });
    expect(result.__curio.refreshedEntities[0]).toMatchObject({
      entity_id: 'light.kitchen',
      state: 'on',
    });
  });

  it('fuzzy-resolves friendly names before calling HA', async () => {
    const client = new HomeAssistantMCPClient('http://ha.local', 'token', 'mcp');
    client.entityCache = [
      createEntity({
        entity_id: 'light.kitchen_main',
        name: 'Kitchen Main Light',
        state: 'off',
      }),
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/mcp')) {
        return Promise.resolve(createResponse({ result: { content: [{ type: 'text', text: 'ok' }] } }));
      }

      if (url.endsWith('/api/states/light.kitchen_main')) {
        return Promise.resolve(createResponse({
          entity_id: 'light.kitchen_main',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Main Light' },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await client.callTool('homeassistant__light__turn_on', {
      name: 'kitchen main light',
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.params.arguments).toMatchObject({
      name: 'Kitchen Main Light',
      entity_id: 'light.kitchen_main',
    });
    expect(payload.params.arguments.target).toBeUndefined();
  });

  it('fails safe on ambiguous device names instead of controlling an arbitrary entity', async () => {
    const client = new HomeAssistantMCPClient('http://ha.local', 'token', 'mcp');
    client.entityCache = [
      createEntity({
        entity_id: 'light.kitchen_main',
        name: 'Kitchen Main Light',
      }),
      createEntity({
        entity_id: 'light.kitchen_accent',
        name: 'Kitchen Accent Light',
      }),
    ];

    const result = await client.callTool('homeassistant__light__turn_on', {
      name: 'kitchen light',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toContain('Ambiguous device match');
    expect(result.__curio.status).toBe('no_match');
  });

  it('classifies backend no-match errors and does not emit success metadata', async () => {
    const client = new HomeAssistantMCPClient('http://ha.local', 'token', 'mcp');

    fetchMock.mockResolvedValue(
      createResponse({
        error: { message: 'MatchFailed: no match found' },
      }),
    );

    const result = await client.callTool('homeassistant__homeassistant__turn_on', {
      name: 'mystery lamp',
    });

    expect(result.__curio).toMatchObject({
      status: 'no_match',
      refreshedEntities: [],
    });
    expect(result.error).toContain('MatchFailed');
  });

  it('filters HA tools through the explicit widget allowlist', async () => {
    const client = new HomeAssistantMCPClient('http://ha.local', 'token', 'mcp');

    fetchMock.mockResolvedValue(
      createResponse({
        result: {
          tools: [
            { name: 'light.turn_on', description: 'Light on', inputSchema: { type: 'object', properties: {} } },
            { name: 'cover.open_cover', description: 'Open cover', inputSchema: { type: 'object', properties: {} } },
            { name: 'weather.get_forecast', description: 'Forecast', inputSchema: { type: 'object', properties: {} } },
            { name: 'switch.toggle', description: 'Toggle switch', inputSchema: { type: 'object', properties: {} } },
          ],
        },
      }),
    );

    const tools = await client.getTools({ silent: true });

    expect(tools.map((tool) => tool.name)).toEqual([
      'homeassistant__light__turn_on',
      'homeassistant__cover__open_cover',
      'homeassistant__switch__toggle',
    ]);
  });

  it('accepts legacy Hass-style tool names and preserves them on tool calls', async () => {
    const client = new HomeAssistantMCPClient('http://ha.local', 'token', 'mcp');
    client.entityCache = [createEntity({ entity_id: 'light.kitchen_main', name: 'Kitchen Main Light' })];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/mcp')) {
        const body = JSON.parse(String(init?.body));
        if (body.method === 'tools/list') {
          return Promise.resolve(createResponse({
            result: {
              tools: [
                { name: 'HassTurnOn', description: 'Turn on a device', inputSchema: { type: 'object', properties: {} } },
                { name: 'HassMediaPause', description: 'Pause media', inputSchema: { type: 'object', properties: {} } },
                { name: 'HassGetState', description: 'Get state', inputSchema: { type: 'object', properties: {} } },
              ],
            },
          }));
        }

        if (body.method === 'tools/call') {
          expect(body.params.name).toBe('HassTurnOn');
          return Promise.resolve(createResponse({ result: { content: [{ type: 'text', text: 'ok' }] } }));
        }
      }

      if (url.endsWith('/api/states/light.kitchen_main')) {
        return Promise.resolve(createResponse({
          entity_id: 'light.kitchen_main',
          state: 'on',
          attributes: { friendly_name: 'Kitchen Main Light' },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const tools = await client.getTools({ silent: true });
    expect(tools.map((tool) => tool.name)).toEqual([
      'homeassistant__HassTurnOn',
      'homeassistant__HassMediaPause',
    ]);

    const result = await client.callTool('homeassistant__HassTurnOn', {
      name: 'Kitchen Main Light',
    });

    expect(result.__curio.status).toBe('success');
  });
});
