import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../..');
const readProjectFile = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('AccountsKeysSection MCP settings', () => {
  it('uses a dedicated MCP icon and exposes the public preset catalog', () => {
    const source = readProjectFile('src/components/curio/settings/AccountsKeysSection.tsx');

    expect(source).toContain('function McpIcon');
    // Compact UI: catalog lives behind a Browse button, preset entries show auth instructions
    expect(source).toContain('Browse');
    expect(source).toContain('catalogOpen');
    expect(source).toContain('authInstructions');
    // OAuth MCP flow: Connect/Reconnect button and backing service import
    expect(source).toMatch(/'Reconnect' : 'Connect'|Connect OAuth|Connect'/);
    expect(source).toContain('startGenericMcpOAuth');
    expect(source).toContain('GENERIC_MCP_SERVER_PRESETS');
    expect(source).not.toContain('Network');
    expect(source).not.toContain('ha-brand.png" alt="MCP"');
  });
});
