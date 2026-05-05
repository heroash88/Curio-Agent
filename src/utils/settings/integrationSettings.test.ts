import { beforeEach, describe, expect, it } from 'vitest';

import {
  GENERIC_MCP_SERVER_PRESETS,
  EXA_FREE_MCP_SKILL_URL,
  EXA_FREE_MCP_URL,
  createExaFreeMcpServer,
  createGenericMcpServer,
  createGenericMcpServerFromPreset,
  getEnabledGenericMcpServers,
  getGenericMcpAuthHeaders,
  getGenericMcpOAuthTokenStorageKey,
  getGenericMcpServers,
  setGenericMcpServers,
  setGenericMcpAuthToken,
} from './integrationSettings';

describe('generic MCP integration settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates the legacy single Exa MCP URL into the multi-server shape', () => {
    localStorage.setItem('curio_generic_mcp_enabled', 'true');
    localStorage.setItem('curio_generic_mcp_url', 'https://mcp.exa.ai/mcp');

    const servers = getGenericMcpServers();

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: 'Exa Web Search Free',
      url: 'https://mcp.exa.ai/mcp',
      enabled: true,
      kind: 'search',
      sourceUrl: EXA_FREE_MCP_SKILL_URL,
    });
    expect(getEnabledGenericMcpServers()).toHaveLength(1);
  });

  it('stores multiple MCP servers and ignores empty URLs', () => {
    setGenericMcpServers([
      createGenericMcpServer({
        id: 'alpha',
        name: 'Alpha',
        url: 'https://alpha.test/mcp',
        enabled: true,
      }),
      createGenericMcpServer({
        id: 'empty',
        name: 'Empty',
        url: '',
        enabled: true,
      }),
      createGenericMcpServer({
        id: 'beta',
        name: 'Beta',
        url: 'https://beta.test/mcp',
        enabled: false,
      }),
    ]);

    expect(getGenericMcpServers().map((server) => server.id)).toEqual(['alpha', 'beta']);
    expect(getEnabledGenericMcpServers().map((server) => server.id)).toEqual(['alpha']);
  });

  it('keeps the LobeHub Exa Free skill identity on the preset', () => {
    expect(createExaFreeMcpServer()).toMatchObject({
      id: 'exa-web-search-free',
      name: 'Exa Web Search Free',
      url: EXA_FREE_MCP_URL,
      enabled: false,
      kind: 'search',
      sourceUrl: EXA_FREE_MCP_SKILL_URL,
    });
  });

  it('ships public MCP presets as disabled addable server options', () => {
    const presetIds = GENERIC_MCP_SERVER_PRESETS.map((preset) => preset.id);

    expect(new Set(presetIds).size).toBe(presetIds.length);
    expect(presetIds).toEqual(expect.arrayContaining([
      'exa-web-search-free',
      'olyport-nws-alerts',
      'olyport-earthquake',
      'olyport-wildfire',
      'olyport-epa-air-quality',
      'olyport-fred-economic-data',
    ]));

    for (const preset of GENERIC_MCP_SERVER_PRESETS) {
      const server = createGenericMcpServerFromPreset(preset);
      expect(server).toMatchObject({
        id: preset.id,
        name: preset.name,
        url: preset.url,
        enabled: false,
        kind: preset.kind,
        authType: preset.authType || 'none',
      });
      expect(preset.description.length).toBeGreaterThan(20);
    }
  });

  it('ships direct-auth and OAuth MCP presets with the right auth hints', () => {
    const presetById = new Map(GENERIC_MCP_SERVER_PRESETS.map((preset) => [preset.id, preset]));

    expect(presetById.get('notion-workspace')).toMatchObject({
      name: 'Notion Workspace',
      url: 'https://mcp.notion.com/mcp',
      authType: 'oauth',
      category: 'Workspace',
    });
    expect(presetById.get('stripe-payments')).toMatchObject({
      url: 'https://mcp.stripe.com',
      authType: 'bearer',
      category: 'Finance',
    });
    expect(presetById.get('context7-docs')).toMatchObject({
      url: 'https://mcp.context7.com/mcp',
      authType: 'api_key',
      authHeaderName: 'CONTEXT7_API_KEY',
    });
    expect(presetById.get('firecrawl-web-data')?.url).toContain('{FIRECRAWL_API_KEY}');

    for (const id of [
      'notion-workspace',
      'linear-workspace',
      'github-remote',
      'sentry-issues',
      'stripe-payments',
      'zapier-actions',
      'firecrawl-web-data',
      'context7-docs',
      'jina-ai-reader',
      'cloudflare-radar',
    ]) {
      const preset = presetById.get(id);
      expect(preset).toBeTruthy();
      expect(preset?.authInstructions?.length).toBeGreaterThan(20);
      expect(createGenericMcpServerFromPreset(preset!)).toMatchObject({
        enabled: false,
        authType: preset?.authType || 'none',
      });
    }
  });

  it('builds auth headers from encrypted per-server MCP tokens', async () => {
    await setGenericMcpAuthToken('work-slack', 'slack-secret');
    await setGenericMcpAuthToken('work-outlook', 'outlook-secret');
    localStorage.setItem(getGenericMcpOAuthTokenStorageKey('notion-workspace'), JSON.stringify({
      accessToken: 'notion-access',
      expiresAt: Date.now() + 120_000,
    }));

    await expect(getGenericMcpAuthHeaders(createGenericMcpServer({
      id: 'work-slack',
      url: 'https://slack.internal/mcp',
      authType: 'bearer',
    }))).resolves.toEqual({ Authorization: 'Bearer slack-secret' });

    await expect(getGenericMcpAuthHeaders(createGenericMcpServer({
      id: 'work-outlook',
      url: 'https://outlook.internal/mcp',
      authType: 'api_key',
      authHeaderName: 'x-work-token',
    }))).resolves.toEqual({ 'x-work-token': 'outlook-secret' });

    await expect(getGenericMcpAuthHeaders(createGenericMcpServer({
      id: 'notion-workspace',
      url: 'https://mcp.notion.com/mcp',
      authType: 'oauth',
    }))).resolves.toEqual({ Authorization: 'Bearer notion-access' });
  });

  it('accepts stdio servers (command instead of url) and treats them as enabled', () => {
    setGenericMcpServers([
      createGenericMcpServer({
        id: 'local-outlook',
        name: 'Work Outlook',
        url: '',
        enabled: true,
        transport: 'stdio',
        command: '/usr/local/bin/work-mcp',
        args: ['--mode', 'inbox'],
        env: { HOME_REGION: 'us-west-2' },
      }),
      createGenericMcpServer({
        id: 'stdio-missing-command',
        name: 'Broken',
        url: '',
        enabled: true,
        transport: 'stdio',
      }),
    ]);

    const stored = getGenericMcpServers();
    expect(stored.map((server) => server.id)).toEqual(['local-outlook']);
    expect(stored[0]).toMatchObject({
      transport: 'stdio',
      command: '/usr/local/bin/work-mcp',
      args: ['--mode', 'inbox'],
      env: { HOME_REGION: 'us-west-2' },
    });
    expect(getEnabledGenericMcpServers().map((server) => server.id)).toEqual(['local-outlook']);
  });

  it('drops env entries with invalid names and strips stdio fields from HTTP servers', () => {
    setGenericMcpServers([
      createGenericMcpServer({
        id: 'http-server',
        name: 'HTTP',
        url: 'https://ok.test/mcp',
        enabled: true,
        transport: 'http',
        // The sanitizer should drop any accidental stdio leftovers.
        command: '/should/be/dropped',
        env: { LEAKED: 'nope' },
      }),
      createGenericMcpServer({
        id: 'stdio-server',
        name: 'stdio',
        url: '',
        enabled: true,
        transport: 'stdio',
        command: '/bin/true',
        env: {
          OK_NAME: 'yes',
          'bad-name': 'drop',
          '1leading': 'drop',
        } as Record<string, string>,
        secretEnvNames: ['OK_NAME', 'another bad', ''],
      }),
    ]);

    const [http, stdio] = getGenericMcpServers();
    expect(http.transport).toBe('http');
    expect(http.command).toBeUndefined();
    expect(http.env).toBeUndefined();

    expect(stdio.transport).toBe('stdio');
    expect(stdio.env).toEqual({ OK_NAME: 'yes' });
    expect(stdio.secretEnvNames).toEqual(['OK_NAME']);
  });
});
