import { describe, expect, it } from 'vitest';

import type { GenericMcpServerConfig } from '../utils/settingsStorage';

import {
  applyProfileEnvDefaults,
  detectMcpProfile,
  profileSupportsDomain,
  profileToolName,
} from './mcpProfiles';

const makeServer = (overrides: Partial<GenericMcpServerConfig> = {}): GenericMcpServerConfig => ({
  id: 'server',
  name: 'Server',
  url: '',
  enabled: true,
  kind: 'general',
  transport: 'stdio',
  command: '',
  ...overrides,
});

describe('mcpProfiles', () => {
  it('only matches stdio servers (HTTP servers never resolve to a profile)', () => {
    expect(detectMcpProfile(makeServer({
      transport: 'http',
      url: 'https://example.test/mcp',
    }))).toBeNull();
  });

  it('recognizes the Outlook stdio executable by basename, ignoring path and extension', () => {
    const cases = [
      'C:\\Users\\me\\AppData\\Local\\Toolbox\\bin\\aws-outlook-mcp.exe',
      '/usr/local/bin/aws-outlook-mcp',
      'AWS-Outlook-MCP.EXE',
    ];
    for (const command of cases) {
      const profile = detectMcpProfile(makeServer({ command }));
      expect(profile?.id).toBe('outlook-stdio');
    }
  });

  it('recognizes the corporate stdio executable the same way', () => {
    const profile = detectMcpProfile(makeServer({
      command: 'C:\\Users\\me\\AppData\\Local\\Toolbox\\bin\\amzn-mcp.exe',
    }));
    expect(profile?.id).toBe('corp-stdio');
  });

  it('does not recognize unrelated executables', () => {
    expect(detectMcpProfile(makeServer({ command: '/usr/bin/node' }))).toBeNull();
  });

  it('exposes exact tool names per domain/action for Outlook profile', () => {
    const profile = detectMcpProfile(makeServer({ command: 'aws-outlook-mcp.exe' }))!;
    expect(profileSupportsDomain(profile, 'mail')).toBe(true);
    expect(profileSupportsDomain(profile, 'calendar')).toBe(true);
    expect(profileSupportsDomain(profile, 'tasks')).toBe(true);
    expect(profileSupportsDomain(profile, 'notes')).toBe(false);
    expect(profileToolName(profile, 'mail', 'list')).toBe('email_inbox');
    expect(profileToolName(profile, 'mail', 'search')).toBe('email_search');
    expect(profileToolName(profile, 'mail', 'send')).toBe('email_send');
    expect(profileToolName(profile, 'mail', 'reply')).toBe('email_reply');
    expect(profileToolName(profile, 'mail', 'read')).toBe('email_read');
    expect(profileToolName(profile, 'calendar', 'list')).toBe('calendar_view');
    expect(profileToolName(profile, 'tasks', 'lists')).toBe('todo_lists');
  });

  it('applies env defaults on test when profile declares them, never clobbering user values', () => {
    const server = makeServer({ command: 'aws-outlook-mcp' });
    const result = applyProfileEnvDefaults(server, 'test');
    expect(result.changed).toBe(true);
    expect(result.addedNames).toContain('OUTLOOK_MCP_ENABLE_WRITES');
    expect(result.nextEnv.OUTLOOK_MCP_ENABLE_WRITES).toBe('true');

    // Re-applying is a no-op (already set).
    const second = applyProfileEnvDefaults({ ...server, env: result.nextEnv }, 'test');
    expect(second.changed).toBe(false);
    expect(second.addedNames).toEqual([]);

    // User override is preserved.
    const third = applyProfileEnvDefaults({
      ...server,
      env: { OUTLOOK_MCP_ENABLE_WRITES: 'false' },
    }, 'test');
    expect(third.changed).toBe(false);
    expect(third.nextEnv.OUTLOOK_MCP_ENABLE_WRITES).toBe('false');
  });

  it('env defaults are empty for corporate profile (no writes flag required)', () => {
    const result = applyProfileEnvDefaults(makeServer({ command: 'amzn-mcp' }), 'test');
    expect(result.changed).toBe(false);
  });

  it('returns no change for unrecognized servers', () => {
    const result = applyProfileEnvDefaults(makeServer({ command: '/usr/bin/node' }), 'test');
    expect(result.changed).toBe(false);
    expect(result.profile).toBeNull();
  });
});
