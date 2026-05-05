import { describe, expect, it, vi } from 'vitest';

import { runLLMToolAgent, selectLLMToolDefinitionsForPrompt } from './llmToolAgent';

describe('runLLMToolAgent', () => {
  it('keeps relevant tool definitions when a provider has a tight request budget', () => {
    const tools = [
      {
        name: 'show_finance_card',
        description: 'Shows stock quotes, market prices, portfolio finance, and investment data. '.repeat(30),
        parameters: { type: 'object', properties: { symbol: { type: 'string' } } },
      },
      {
        name: 'get_weather',
        description: 'Gets weather, forecast, temperature, humidity, and conditions for a city. '.repeat(30),
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
      {
        name: 'check_gmail',
        description: 'Checks Gmail messages, email inbox summaries, and unread mail. '.repeat(30),
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ];

    const selected = selectLLMToolDefinitionsForPrompt(
      tools,
      'What is the weather in Tokyo?',
      250,
    );

    const selectedNames = selected.map((tool) => tool.name);
    expect(selectedNames).toContain('get_weather');
    expect(selectedNames).not.toContain('show_finance_card');
    expect(selected.length).toBeLessThan(tools.length);
  });

  it('includes external search and sports card tools for same-day match result prompts', () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Gets weather, forecast, temperature, humidity, and conditions for a city. '.repeat(30),
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
      {
        name: 'web_search_exa',
        description: 'External MCP search tool. Use only when the user needs fresh/current public information, source-backed web lookup, programming documentation/examples, or company/business research.',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'show_sports_score',
        description: 'Shows a sports score card. Use when user asks about game scores, match results, what was the score of the game, who won the match. Search for the latest score first, then display it.',
        parameters: {
          type: 'object',
          properties: {
            homeTeam: { type: 'string' },
            awayTeam: { type: 'string' },
            homeScore: { type: 'number' },
            awayScore: { type: 'number' },
            status: { type: 'string' },
          },
        },
      },
    ];

    const selected = selectLLMToolDefinitionsForPrompt(
      tools,
      'Did Manchester United win today?',
      350,
    );
    const selectedNames = selected.map((tool) => tool.name);

    expect(selectedNames).toContain('web_search_exa');
    expect(selectedNames).toContain('show_sports_score');
  });

  it('prefers server-scoped GitHub MCP tools over Notion tools for GitHub project prompts', () => {
    const tools = [
      {
        name: 'notion_workspace__search',
        description: 'MCP server: Notion Workspace. Search pages, databases, projects, notes, and tasks in Notion. '.repeat(15),
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'github_remote__search',
        description: 'MCP server: GitHub Remote MCP. Search GitHub repositories, issues, pull requests, projects, organizations, and code.',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'github_remote__fetch',
        description: 'MCP server: GitHub Remote MCP. Fetch GitHub repositories, issues, pull requests, projects, and project details.',
        parameters: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ];

    const selected = selectLLMToolDefinitionsForPrompt(
      tools,
      'Check my GitHub projects',
      260,
    );
    const selectedNames = selected.map((tool) => tool.name);

    expect(selectedNames).toContain('github_remote__search');
    expect(selectedNames).toContain('github_remote__fetch');
    expect(selectedNames).not.toContain('notion_workspace__search');
  });

  it('does not force stale recent Notion tools into a GitHub-specific turn', () => {
    const tools = [
      {
        name: 'notion_workspace__search',
        description: 'MCP server: Notion Workspace. Search pages, databases, projects, notes, and tasks in Notion. '.repeat(15),
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'github_remote__search',
        description: 'MCP server: GitHub Remote MCP. Search GitHub repositories, issues, pull requests, projects, organizations, and code.',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'github_remote__fetch',
        description: 'MCP server: GitHub Remote MCP. Fetch GitHub repositories, issues, pull requests, projects, and project details.',
        parameters: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ];

    const selected = selectLLMToolDefinitionsForPrompt(
      tools,
      'Check my GitHub projects',
      260,
      ['notion_workspace__search'],
    );
    const selectedNames = selected.map((tool) => tool.name);

    expect(selectedNames).toContain('github_remote__search');
    expect(selectedNames).toContain('github_remote__fetch');
    expect(selectedNames).not.toContain('notion_workspace__search');
  });

  it('does not select another workspace MCP when a named service is missing', () => {
    const selected = selectLLMToolDefinitionsForPrompt(
      [
        {
          name: 'notion_workspace__search',
          description: 'MCP server: Notion Workspace. Search pages, databases, projects, notes, and tasks in Notion.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
      'Check my GitHub projects',
      260,
    );

    expect(selected).toEqual([]);
  });

  it('prioritizes Notion search tools before ID-only fetch tools for Notion lookup prompts', () => {
    const selected = selectLLMToolDefinitionsForPrompt(
      [
        {
          name: 'notion_workspace__fetch',
          description: 'MCP server: Notion Workspace. Fetch a Notion page, database, project, or task only when a page ID, database ID, project ID, or UUID is already known.',
          parameters: { type: 'object', properties: { id: { type: 'string' } } },
        },
        {
          name: 'notion_workspace__search',
          description: 'MCP server: Notion Workspace. Search Notion pages, databases, projects, notes, and tasks by title or name.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
      'Search for the Curio project in Notion',
      95,
    );

    expect(selected.map((tool) => tool.name)).toEqual(['notion_workspace__search']);
  });

  it('adds a live sports lookup guardrail before ongoing score requests', async () => {
    const generateToolResponse = vi.fn().mockResolvedValue({
      text: 'I found the live score.',
      toolCalls: [],
    });
    const provider = {
      name: 'openai-compatible',
      nativeSearch: { type: 'nova-grounding' as const },
      generateText: vi.fn(),
      generateToolResponse,
    };

    await runLLMToolAgent({
      provider,
      prompt: 'Who is winning Tottenham vs Aston Villa today?',
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'show_sports_score',
          description: 'Shows a sports score card for live scores and match results.',
          parameters: { type: 'object', properties: {} },
        },
      ],
    });

    const request = generateToolResponse.mock.calls[0]?.[0];
    const systemMessages = request.messages
      .filter((message: any) => message.role === 'system')
      .map((message: any) => message.content)
      .join('\n');

    expect(systemMessages).toContain('live/current sports score lookup');
    expect(systemMessages).toContain('live score');
    expect(systemMessages.toLowerCase()).toContain('ignore prediction, preview, odds, kickoff, tv-channel, and pre-match pages');
    expect(request.tools.map((tool: any) => tool.name)).toContain('show_sports_score');
    expect(request.allowNativeSearch).toBe(true);
  });

  it('adds a fresh lookup guardrail for non-sports live data requests', async () => {
    const generateToolResponse = vi.fn().mockResolvedValue({
      text: 'Here is the latest.',
      toolCalls: [],
    });
    const provider = {
      name: 'openai-compatible',
      nativeSearch: { type: 'nova-grounding' as const },
      generateText: vi.fn(),
      generateToolResponse,
    };

    await runLLMToolAgent({
      provider,
      prompt: 'What is the latest news about Amazon Nova today?',
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'web_search_exa',
          description: 'External MCP search tool. Use only when the user needs fresh/current public information.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    });

    const request = generateToolResponse.mock.calls[0]?.[0];
    const systemMessages = request.messages
      .filter((message: any) => message.role === 'system')
      .map((message: any) => message.content)
      .join('\n');

    expect(systemMessages).toContain('fresh/current lookup');
    expect(systemMessages).toContain('current local date');
    expect(systemMessages).toContain('Do not rely on old articles');
    expect(request.tools.map((tool: any) => tool.name)).toContain('web_search_exa');
    expect(request.allowNativeSearch).toBe(true);
  });

  it('uses a default tool definition budget when a provider has no provider-specific cap', async () => {
    const generateToolResponse = vi.fn().mockResolvedValue({
      text: 'It is rainy in Tokyo.',
      toolCalls: [],
    });
    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };
    const tools = [
      {
        name: 'show_finance_card',
        description: 'Shows stock quotes, market prices, portfolio finance, and investment data. '.repeat(120),
        parameters: { type: 'object', properties: { symbol: { type: 'string' } } },
      },
      {
        name: 'get_weather',
        description: 'Gets weather, forecast, temperature, humidity, and conditions for a city. '.repeat(30),
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
      {
        name: 'check_gmail',
        description: 'Checks Gmail messages, email inbox summaries, unread mail, attachments, and threads. '.repeat(120),
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ];

    await runLLMToolAgent({
      provider,
      prompt: 'What is the weather in Tokyo?',
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: tools,
    });

    const request = generateToolResponse.mock.calls[0]?.[0];
    const selectedNames = request.tools.map((tool: any) => tool.name);
    expect(selectedNames).toContain('get_weather');
    expect(selectedNames).not.toContain('show_finance_card');
    expect(selectedNames).not.toContain('check_gmail');
  });

  it('retries once with all tools when a shortlisted request appears tool-blocked', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: "I don't have access to that device.",
        toolCalls: [],
      })
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'ha_1',
            name: 'homeassistant__light__turn_on',
            arguments: { entity_id: 'kitchen lamp' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'Kitchen lamp is on.',
        toolCalls: [],
      });
    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };
    const tools = [
      {
        name: 'get_weather',
        description: 'Gets weather, forecast, temperature, humidity, and conditions for a city. '.repeat(120),
        parameters: { type: 'object', properties: { city: { type: 'string' } } },
      },
      {
        name: 'homeassistant__light__turn_on',
        description: 'Call a Home Assistant service.',
        parameters: {
          type: 'object',
          properties: {
            entity_id: { type: 'string', description: 'Entity ID or friendly name.' },
          },
        },
      },
    ];
    const onMcpToolCall = vi.fn().mockResolvedValue({ success: true });

    const text = await runLLMToolAgent({
      provider,
      prompt: 'Activate the kitchen lamp.',
      context: {
        onMcpToolCall,
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: tools,
    });

    expect(text).toBe('Kitchen lamp is on.');
    expect(generateToolResponse).toHaveBeenCalledTimes(3);
    expect(generateToolResponse.mock.calls[0]?.[0].tools.map((tool: any) => tool.name))
      .not.toContain('homeassistant__light__turn_on');
    expect(generateToolResponse.mock.calls[1]?.[0].tools.map((tool: any) => tool.name))
      .toContain('homeassistant__light__turn_on');
    expect(onMcpToolCall).toHaveBeenCalledWith('homeassistant__light__turn_on', {
      entity_id: 'kitchen lamp',
    });
  });

  it('retries Notion page-ID refusals with lookup guidance before showing the response', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: 'I need your actual Notion page ID to proceed.',
        toolCalls: [],
      })
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'notion_1',
            name: 'notion_workspace__search',
            arguments: { query: 'Curio project' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'Found the Curio project.',
        toolCalls: [],
      });
    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };
    const onMcpToolCall = vi.fn().mockResolvedValue({
      results: [
        {
          id: 'abc123',
          title: 'Curio project',
        },
      ],
    });

    const text = await runLLMToolAgent({
      provider,
      prompt: 'Search for the Curio project in Notion.',
      context: {
        onMcpToolCall,
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'notion_workspace__fetch',
          description: 'MCP server: Notion Workspace. Fetch a Notion page or database by ID.',
          parameters: { type: 'object', properties: { id: { type: 'string' } } },
        },
        {
          name: 'notion_workspace__search',
          description: 'MCP server: Notion Workspace. Search Notion pages, databases, projects, notes, and tasks by title or name.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    });

    expect(text).toBe('Found the Curio project.');
    expect(generateToolResponse).toHaveBeenCalledTimes(3);
    expect(onMcpToolCall).toHaveBeenCalledWith('notion_workspace__search', {
      query: 'Curio project',
    });

    const retryRequest = generateToolResponse.mock.calls[1]?.[0];
    const retrySystemText = retryRequest.messages
      .filter((message: any) => message.role === 'system')
      .map((message: any) => message.content)
      .join('\n');
    expect(retrySystemText).toContain('Do not ask for Notion page, database, project, task, or UUID IDs first');
    expect(retryRequest.tools.map((tool: any) => tool.name)).toContain('notion_workspace__search');
  });

  it('passes Notion URL ID candidates into the hidden turn context', async () => {
    const generateToolResponse = vi.fn().mockResolvedValue({
      text: 'I found it.',
      toolCalls: [],
    });
    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };

    await runLLMToolAgent({
      provider,
      prompt: 'Open this Notion project https://www.notion.so/acme/Curio-Project-0123456789abcdef0123456789abcdef?pvs=4',
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'notion_workspace__fetch',
          description: 'MCP server: Notion Workspace. Fetch a Notion page or database by ID.',
          parameters: { type: 'object', properties: { id: { type: 'string' } } },
        },
      ],
    });

    const request = generateToolResponse.mock.calls[0]?.[0];
    const systemText = request.messages
      .filter((message: any) => message.role === 'system')
      .map((message: any) => message.content)
      .join('\n');
    expect(systemText).toContain('Detected Notion URL ID candidate');
    expect(systemText).toContain('0123456789abcdef0123456789abcdef');
  });

  it('summarizes existing tool results instead of returning a tool-limit failure', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'notion_1',
            name: 'notion_workspace__search',
            arguments: { query: 'Test Curio' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'Test Curio contains a project brief and two open tasks.',
        toolCalls: [],
      });
    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };

    const text = await runLLMToolAgent({
      provider,
      prompt: 'Check Notion MCP for Test Curio and tell me what it contains.',
      maxRounds: 1,
      context: {
        onMcpToolCall: vi.fn().mockResolvedValue({
          results: [
            {
              title: 'Test Curio',
              content: 'Project brief. Tasks: wire Notion widget, test MCP lookup.',
            },
          ],
        }),
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'notion_workspace__search',
          description: 'MCP server: Notion Workspace. Search Notion pages and projects by title.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    });

    expect(text).toBe('Test Curio contains a project brief and two open tasks.');
    expect(generateToolResponse).toHaveBeenCalledTimes(2);
    const finalRequest = generateToolResponse.mock.calls[1]?.[0];
    expect(finalRequest.tools).toEqual([]);
    expect(finalRequest.allowNativeSearch).toBe(false);
    expect(finalRequest.messages.map((message: any) => message.content).join('\n'))
      .toContain('Tool-call limit reached');
  });

  it('can persist additive session history without resending the first full system prompt', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: 'Sure, I will remember that.',
        toolCalls: [],
      })
      .mockResolvedValueOnce({
        text: 'You asked me to remember the blue notebook.',
        toolCalls: [],
      });

    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };

    let cachedMessages: any[] = [];

    const firstText = await runLLMToolAgent({
      provider,
      prompt: 'Remember the blue notebook.',
      systemPrompt: 'FULL CONTEXT '.repeat(100),
      persistSystemPromptInSession: false,
      onSessionMessagesChange: (messages) => {
        cachedMessages = messages;
      },
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
    });

    expect(firstText).toBe('Sure, I will remember that.');
    expect(cachedMessages.some((message) => message.role === 'system')).toBe(false);

    await runLLMToolAgent({
      provider,
      prompt: 'What did I ask you to remember?',
      systemPrompt: 'SHORT FOLLOWUP CONTEXT',
      sessionMessages: cachedMessages,
      persistSystemPromptInSession: false,
      onSessionMessagesChange: (messages) => {
        cachedMessages = messages;
      },
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
    });

    const secondCall = generateToolResponse.mock.calls[1]?.[0];
    expect(secondCall.messages.map((message: any) => message.content)).not.toContain('FULL CONTEXT '.repeat(100));
    expect(secondCall.messages[0]).toEqual({
      role: 'system',
      content: 'SHORT FOLLOWUP CONTEXT',
    });
    expect(secondCall.messages).toEqual(expect.arrayContaining([
      { role: 'user', content: 'Remember the blue notebook.' },
      { role: 'assistant', content: 'Sure, I will remember that.' },
      { role: 'user', content: 'What did I ask you to remember?' },
    ]));
  });

  it('drops stale session history when a provider has a total request budget', async () => {
    const generateToolResponse = vi.fn().mockResolvedValue({
      text: 'The answer uses recent context.',
      toolCalls: [],
    });

    const provider = {
      name: 'gemini',
      maxToolRequestTokens: 95,
      generateText: vi.fn(),
      generateToolResponse,
    };

    await runLLMToolAgent({
      provider,
      prompt: 'What should I use?',
      systemPrompt: 'Short system prompt.',
      sessionMessages: [
        { role: 'user', content: 'STALE_USER '.repeat(300) },
        { role: 'assistant', content: 'STALE_ASSISTANT '.repeat(300) },
        { role: 'user', content: 'Recent preference: use the blue notebook.' },
      ],
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [],
    });

    const request = generateToolResponse.mock.calls[0]?.[0];
    const requestText = request.messages.map((message: any) => message.content).join('\n');
    expect(requestText).not.toContain('STALE_USER');
    expect(requestText).not.toContain('STALE_ASSISTANT');
    expect(requestText).toContain('Recent preference: use the blue notebook.');
    expect(request.messages.at(-1)).toEqual({
      role: 'user',
      content: 'What should I use?',
    });
  });

  it('compacts oversized tool results before replaying them to a capped provider', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'Tokyo' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'It is sunny in Tokyo.',
        toolCalls: [],
      });

    const provider = {
      name: 'gemini',
      maxToolRequestTokens: 220,
      generateText: vi.fn(),
      generateToolResponse,
    };

    await runLLMToolAgent({
      provider,
      prompt: 'What is the weather in Tokyo?',
      context: {
        handler: {
          get_weather: vi.fn().mockResolvedValue({
            city: 'Tokyo',
            payload: 'TOOL_RESULT '.repeat(900),
          }),
        },
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'get_weather',
          description: 'Get weather.',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
    });

    const secondRequest = generateToolResponse.mock.calls[1]?.[0];
    const toolMessage = secondRequest.messages.at(-1);
    expect(toolMessage.role).toBe('tool');
    expect(toolMessage.content).toContain('[Result truncated');
    expect(toolMessage.content.length).toBeLessThan(1200);
  });

  it('does not persist orphaned tool messages when trimming session history', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'Tokyo' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'It is sunny in Tokyo.',
        toolCalls: [],
      })
      .mockResolvedValueOnce({
        text: 'Still sunny.',
        toolCalls: [],
      });

    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };

    let cachedMessages: any[] = [];

    await runLLMToolAgent({
      provider,
      prompt: 'What is the weather in Tokyo?',
      maxSessionMessages: 2,
      onSessionMessagesChange: (messages) => {
        cachedMessages = messages;
      },
      context: {
        handler: {
          get_weather: vi.fn().mockResolvedValue({ tempF: 72 }),
        },
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'get_weather',
          description: 'Get weather.',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      ],
    });

    expect(cachedMessages[0]?.role).not.toBe('tool');

    await runLLMToolAgent({
      provider,
      prompt: 'What about tomorrow?',
      sessionMessages: cachedMessages,
      onSessionMessagesChange: (messages) => {
        cachedMessages = messages;
      },
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [],
    });

    const followUpRequest = generateToolResponse.mock.calls[2]?.[0];
    expect(followUpRequest.messages.find((message: any, index: number) =>
      message.role === 'tool' && followUpRequest.messages[index - 1]?.role !== 'assistant',
    )).toBeUndefined();
  });

  it('does not replay orphaned tool messages when fitting a tight request budget', async () => {
    const generateToolResponse = vi.fn().mockResolvedValue({
      text: 'Use the most recent answer.',
      toolCalls: [],
    });

    const provider = {
      name: 'openai-compatible',
      maxToolRequestTokens: 170,
      generateText: vi.fn(),
      generateToolResponse,
    };

    await runLLMToolAgent({
      provider,
      prompt: 'What should I remember?',
      sessionMessages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_weather',
              arguments: { city: 'Tokyo', detail: 'LONG_ARGUMENT '.repeat(180) },
            },
          ],
        },
        {
          role: 'tool',
          name: 'get_weather',
          toolCallId: 'call_1',
          content: '{"tempF":72}',
        },
        { role: 'assistant', content: 'It is sunny in Tokyo.' },
      ],
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [],
    });

    const request = generateToolResponse.mock.calls[0]?.[0];
    expect(request.messages.find((message: any, index: number) =>
      message.role === 'tool' && request.messages[index - 1]?.role !== 'assistant',
    )).toBeUndefined();
  });

  it('executes built-in tools and feeds their results back to the provider', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'Tokyo' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'It is sunny and 72 degrees in Tokyo.',
        toolCalls: [],
      });

    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };

    const getWeather = vi.fn().mockResolvedValue({
      city: 'Tokyo',
      weather: {
        tempF: 72,
        desc: 'Sunny',
      },
      tempUnit: 'F',
    });

    const text = await runLLMToolAgent({
      provider,
      prompt: 'What is the weather in Tokyo?',
      context: {
        handler: {
          get_weather: getWeather,
        },
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
    });

    expect(text).toBe('It is sunny and 72 degrees in Tokyo.');
    expect(getWeather).toHaveBeenCalledWith('Tokyo');
    expect(generateToolResponse).toHaveBeenCalledTimes(2);

    const secondCall = generateToolResponse.mock.calls[1]?.[0];
    expect(secondCall.messages.at(-1)).toEqual({
      role: 'tool',
      name: 'get_weather',
      toolCallId: 'call_1',
      content: JSON.stringify({
        city: 'Tokyo',
        weather: {
          tempF: 72,
          desc: 'Sunny',
        },
        tempUnit: 'F',
      }),
    });
  });

  it('keeps native search available for score lookup but disables it after score card tools return', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'score_1',
            name: 'show_sports_score',
            arguments: {
              homeTeam: 'Tottenham',
              awayTeam: 'Aston Villa',
              homeScore: 1,
              awayScore: 2,
              status: 'In Progress',
              homeLogoUrl: 'https://example.com/tottenham.png',
              awayLogoUrl: 'https://example.com/aston-villa.png',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'Aston Villa are leading Tottenham 2-1, and the match is in progress.',
        toolCalls: [],
      });

    const provider = {
      name: 'openai-compatible',
      nativeSearch: { type: 'nova-grounding' as const },
      generateText: vi.fn(),
      generateToolResponse,
    };

    const cardEvent = vi.fn();
    const text = await runLLMToolAgent({
      provider,
      prompt: 'Who is winning Tottenham vs Aston Villa today?',
      context: {
        onCardEvent: cardEvent,
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      toolDefinitions: [
        {
          name: 'show_sports_score',
          description: 'Shows a sports score card. Use when user asks about game scores, match results, what was the score of the game, who won the match. Search for the latest score first, then display it.',
          parameters: {
            type: 'object',
            properties: {
              homeTeam: { type: 'string' },
              awayTeam: { type: 'string' },
              homeScore: { type: 'number' },
              awayScore: { type: 'number' },
              status: { type: 'string' },
            },
          },
        },
      ],
    });

    expect(text).toBe('Aston Villa are leading Tottenham 2-1, and the match is in progress.');
    expect(generateToolResponse).toHaveBeenCalledTimes(2);
    expect(generateToolResponse.mock.calls[0]?.[0].allowNativeSearch).toBe(true);
    expect(generateToolResponse.mock.calls[1]?.[0].allowNativeSearch).toBe(false);
    expect(cardEvent).toHaveBeenCalledWith({
      type: 'sportsScore',
      data: expect.objectContaining({
        homeTeam: 'Tottenham',
        awayTeam: 'Aston Villa',
        homeScore: 1,
        awayScore: 2,
        status: 'In Progress',
      }),
    });
  });

  it('captures a single camera image for the custom camera tool', async () => {
    const generateVisionText = vi.fn().mockResolvedValue('A blue ceramic mug on a desk.');
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'camera_1',
            name: 'inspect_camera_view',
            arguments: { prompt: 'What is this object?' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'It looks like a blue ceramic mug.',
        toolCalls: [],
      });

    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateVisionText,
      generateToolResponse,
    };

    const stop = vi.fn();

    const text = await runLLMToolAgent({
      provider,
      prompt: 'Look at this.',
      context: {
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
      cameraDependencies: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop }],
        }) as unknown as MediaStream),
        captureFrameFromStream: vi.fn(async () => ({
          mimeType: 'image/jpeg',
          base64Data: 'jpg-data',
          width: 640,
          height: 480,
        })),
      },
    });

    expect(text).toBe('It looks like a blue ceramic mug.');
    expect(generateVisionText).toHaveBeenCalledWith({
      prompt: 'What is this object?',
      systemPrompt: expect.stringContaining('single camera image'),
      image: {
        mimeType: 'image/jpeg',
        base64Data: 'jpg-data',
        width: 640,
        height: 480,
      },
    });
    expect(stop).toHaveBeenCalledTimes(1);

    const secondCall = generateToolResponse.mock.calls[1]?.[0];
    expect(secondCall.messages.at(-1)).toEqual({
      role: 'tool',
      name: 'inspect_camera_view',
      toolCallId: 'camera_1',
      content: JSON.stringify({
        success: true,
        imageWidth: 640,
        imageHeight: 480,
        description: 'A blue ceramic mug on a desk.',
      }),
    });
  });

  it('keeps hidden reasoning out of tool-agent replies and follow-up messages', async () => {
    const generateToolResponse = vi.fn()
      .mockResolvedValueOnce({
        text: '<think>I should call the weather tool.</think>Checking weather.',
        toolCalls: [
          {
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'Tokyo' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'Thought: summarize the tool result.\nFinal: It is sunny and 72 degrees in Tokyo.',
        toolCalls: [],
      });

    const provider = {
      name: 'openai-compatible',
      generateText: vi.fn(),
      generateToolResponse,
    };

    const text = await runLLMToolAgent({
      provider,
      prompt: 'What is the weather in Tokyo?',
      context: {
        handler: {
          get_weather: vi.fn().mockResolvedValue({
            city: 'Tokyo',
            weather: {
              tempF: 72,
              desc: 'Sunny',
            },
            tempUnit: 'F',
          }),
        },
        disconnect: vi.fn(),
        startHaCameraStream: vi.fn(),
        stopHaCameraStream: vi.fn(),
        isHaCameraStreaming: false,
      },
    });

    expect(text).toBe('It is sunny and 72 degrees in Tokyo.');

    const secondCall = generateToolResponse.mock.calls[1]?.[0];
    expect(secondCall.messages[1]).toEqual({
      role: 'assistant',
      content: 'Checking weather.',
      toolCalls: [
        {
          id: 'call_1',
          name: 'get_weather',
          arguments: { city: 'Tokyo' },
        },
      ],
    });
  });
});
