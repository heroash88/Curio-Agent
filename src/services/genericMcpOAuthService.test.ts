import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSecret } from '../utils/secretStorage';
import type { GenericMcpServerConfig } from '../utils/settingsStorage';

import {
  discoverGenericMcpOAuthMetadata,
  getGenericMcpOAuthAuthHeaders,
  getGenericMcpOAuthConnectionStatus,
  getGenericMcpOAuthTokenStorageKey,
  startGenericMcpOAuth,
} from './genericMcpOAuthService';

const makeServer = (overrides: Partial<GenericMcpServerConfig> = {}): GenericMcpServerConfig => ({
  id: 'notion-workspace',
  name: 'Notion Workspace',
  url: 'https://mcp.notion.com/mcp',
  enabled: true,
  kind: 'general',
  authType: 'oauth',
  ...overrides,
});

const jsonResponse = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  ...init,
});

describe('genericMcpOAuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('discovers OAuth metadata from an MCP protected resource URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === 'https://mcp.notion.com/.well-known/oauth-protected-resource/mcp') {
        return jsonResponse({
          resource: 'https://mcp.notion.com/mcp',
          authorization_servers: ['https://mcp.notion.com'],
        });
      }
      if (url === 'https://mcp.notion.com/.well-known/oauth-authorization-server') {
        return jsonResponse({
          issuer: 'https://mcp.notion.com',
          authorization_endpoint: 'https://mcp.notion.com/authorize',
          token_endpoint: 'https://mcp.notion.com/token',
          registration_endpoint: 'https://mcp.notion.com/register',
          code_challenge_methods_supported: ['S256'],
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const discovery = await discoverGenericMcpOAuthMetadata('https://mcp.notion.com/mcp');

    expect(discovery.resource).toBe('https://mcp.notion.com/mcp');
    expect(discovery.authorizationEndpoint).toBe('https://mcp.notion.com/authorize');
    expect(discovery.tokenEndpoint).toBe('https://mcp.notion.com/token');
    expect(discovery.registrationEndpoint).toBe('https://mcp.notion.com/register');
  });

  it('registers a public client, opens PKCE OAuth, stores tokens, and returns bearer headers', async () => {
    const popup = { location: { href: 'about:blank' }, close: vi.fn(), closed: false } as unknown as Window;
    const fetchBodies: Array<{ url: string; body: any }> = [];

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      fetchBodies.push({ url, body: init?.body });
      if (url === 'https://mcp.notion.com/.well-known/oauth-protected-resource/mcp') {
        return jsonResponse({
          resource: 'https://mcp.notion.com/mcp',
          authorization_servers: ['https://mcp.notion.com'],
        });
      }
      if (url === 'https://mcp.notion.com/.well-known/oauth-authorization-server') {
        return jsonResponse({
          issuer: 'https://mcp.notion.com',
          authorization_endpoint: 'https://mcp.notion.com/authorize',
          token_endpoint: 'https://mcp.notion.com/token',
          registration_endpoint: 'https://mcp.notion.com/register',
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (url === 'https://mcp.notion.com/register') {
        return jsonResponse({ client_id: 'curio-client-id' });
      }
      if (url === 'https://mcp.notion.com/token') {
        return jsonResponse({
          access_token: 'notion-access-token',
          refresh_token: 'notion-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const signIn = startGenericMcpOAuth(makeServer(), popup);

    await vi.waitFor(() => {
      expect(popup.location.href).toContain('https://mcp.notion.com/authorize?');
    });

    const authUrl = new URL(popup.location.href);
    expect(authUrl.searchParams.get('client_id')).toBe('curio-client-id');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/oauth-callback.html`);
    expect(authUrl.searchParams.get('resource')).toBe('https://mcp.notion.com/mcp');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');

    window.localStorage.setItem('curio_oauth_result', JSON.stringify({
      type: 'oauth-callback',
      code: 'notion-code',
      state: authUrl.searchParams.get('state'),
    }));

    await expect(signIn).resolves.toMatchObject({ connected: true });
    await expect(getSecret(getGenericMcpOAuthTokenStorageKey('notion-workspace'))).resolves.toContain('notion-access-token');
    await expect(getGenericMcpOAuthAuthHeaders(makeServer())).resolves.toEqual({
      Authorization: 'Bearer notion-access-token',
    });

    const tokenBody = fetchBodies.find((entry) => entry.url === 'https://mcp.notion.com/token')?.body as URLSearchParams;
    expect(tokenBody.get('grant_type')).toBe('authorization_code');
    expect(tokenBody.get('resource')).toBe('https://mcp.notion.com/mcp');
  });

  it('refreshes expired OAuth tokens before building MCP auth headers', async () => {
    localStorage.setItem(getGenericMcpOAuthTokenStorageKey('notion-workspace'), JSON.stringify({
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000,
      tokenEndpoint: 'https://mcp.notion.com/token',
      resource: 'https://mcp.notion.com/mcp',
    }));
    localStorage.setItem('curio_generic_mcp_oauth_client:notion-workspace', JSON.stringify({
      clientId: 'curio-client-id',
    }));

    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://mcp.notion.com/token') {
        const body = init?.body as URLSearchParams;
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('refresh-token');
        expect(body.get('resource')).toBe('https://mcp.notion.com/mcp');
        return jsonResponse({
          access_token: 'new-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    await expect(getGenericMcpOAuthAuthHeaders(makeServer())).resolves.toEqual({
      Authorization: 'Bearer new-token',
    });
    await expect(getGenericMcpOAuthConnectionStatus('notion-workspace')).resolves.toMatchObject({
      connected: true,
      hasRefreshToken: true,
    });
  });
});
