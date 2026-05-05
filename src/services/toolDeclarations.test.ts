import { describe, expect, it } from 'vitest';

import { buildToolsArray } from './toolDeclarations';

const exaSearchMcpTools = [
  {
    name: 'web_search_exa',
    description: 'Search MCP. Use only when the user needs fresh/current public information.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_code_context_exa',
    description: 'Find code examples. Use only when the user needs code/documentation examples.',
    parameters: { type: 'object', properties: {} },
  },
] as any;

describe('buildToolsArray MCP search handling', () => {
  it('keeps Exa search MCP tools out of native Google Search live sessions', () => {
    const toolsArray = buildToolsArray('gemini-2.5-flash-live-preview', exaSearchMcpTools);
    const serialized = JSON.stringify(toolsArray);

    expect(serialized).toContain('googleSearch');
    expect(serialized).not.toContain('web_search_exa');
    expect(serialized).not.toContain('get_code_context_exa');
  });

  it('keeps Exa search MCP tools out of Live proxy Google Search sessions', () => {
    const toolsArray = buildToolsArray('gemini-3.1-flash-live-preview', exaSearchMcpTools);
    const serialized = JSON.stringify(toolsArray);

    expect(serialized).toContain('google_search');
    expect(serialized).not.toContain('web_search_exa');
    expect(serialized).not.toContain('get_code_context_exa');
  });
});
