import { beforeEach, describe, expect, it, vi } from 'vitest';

const genaiMock = vi.hoisted(() => {
  const generateContent = vi.fn();
  return {
    generateContent,
    GoogleGenAI: vi.fn(function GoogleGenAIMock() {
      return {
      models: {
        generateContent,
      },
      };
    }),
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: genaiMock.GoogleGenAI,
}));

import {
  OpenAICompatibleProvider,
  OllamaProvider,
  createLLMProvider,
  fetchAvailableModels,
  sanitizeLLMVisibleText,
} from './llmProvider';

const fetchMock = vi.fn();

const createJsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as Response;

const createStreamResponse = (chunks: string[], status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    text: vi.fn().mockResolvedValue(chunks.join('')),
  }) as unknown as Response;

describe('llmProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    genaiMock.generateContent.mockReset();
    genaiMock.GoogleGenAI.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.useRealTimers();
  });

  it('removes hidden reasoning text before it can be shown to the user', () => {
    expect(
      sanitizeLLMVisibleText('<think>I should call a weather tool first.</think>It is 57 degrees.'),
    ).toBe('It is 57 degrees.');

    expect(
      sanitizeLLMVisibleText('Thought: I need to inspect tools.\nFinal: The kitchen light is on.'),
    ).toBe('The kitchen light is on.');

    expect(
      sanitizeLLMVisibleText('```thinking\nUse the sensor tool.\n```\nThe sensor reads 43%.'),
    ).toBe('The sensor reads 43%.');

    expect(
      sanitizeLLMVisibleText('### Analysis\nI should inspect the available tools.\n### Final\nThe kitchen light is on.'),
    ).toBe('The kitchen light is on.');
  });

  it('creates an OpenAI-compatible provider and posts chat completion payloads', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{ message: { content: 'Hello from OpenAI-compatible.' } }],
      }),
    );

    const provider = createLLMProvider({
      type: 'openai',
      baseUrl: 'http://llm.local/',
      apiKey: 'test',
      model: 'local-model',
    });

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);

    const text = await provider.generateText({
      prompt: 'Say hello',
      systemPrompt: 'Be brief.',
      temperature: 0.25,
    });

    expect(text).toBe('Hello from OpenAI-compatible.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://llm.local/v1/chat/completions');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test',
    });

    const payload = JSON.parse(String(requestInit.body));
    expect(payload).toMatchObject({
      model: 'local-model',
      temperature: 0.25,
      stream: false,
    });
    expect(payload.messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Say hello' },
    ]);
  });

  it('enables Chat Completions native web search when the OpenAI provider is configured for it', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Searched answer.' } }],
    }), { status: 200 }));

    const provider = createLLMProvider({
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o-search-preview',
      nativeSearch: { type: 'openai-web-search' },
      openAICompatible: {
        auth: { type: 'bearer', token: 'test-key' },
        nativeSearch: { type: 'openai-web-search' },
      },
    } as never);

    await provider.generateText({
      prompt: 'Who won today?',
      systemPrompt: 'Be brief.',
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({
      model: 'gpt-4o-search-preview',
      web_search_options: {
        search_context_size: 'medium',
      },
    });
  });

  it('enables Nova native grounding when the Amazon Nova provider is configured for it', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Grounded answer.' } }],
    }), { status: 200 }));

    const provider = createLLMProvider({
      type: 'openai',
      baseUrl: 'https://api.nova.amazon.com/v1',
      apiKey: 'nova-key',
      model: 'nova-2-lite-v1',
      nativeSearch: { type: 'nova-grounding' },
      openAICompatible: {
        auth: { type: 'bearer', token: 'nova-key' },
        nativeSearch: { type: 'nova-grounding' },
      },
    } as never);

    await provider.generateText({
      prompt: 'Who won today?',
      systemPrompt: 'Be brief.',
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({
      model: 'nova-2-lite-v1',
      system_tools: ['nova_grounding'],
    });
    expect(payload.web_search_options).toBeUndefined();
  });

  it('routes Amazon Nova OpenAI-compatible text requests through the same-origin proxy', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Nova proxied answer.' } }],
    }), { status: 200 }));

    const provider = createLLMProvider({
      type: 'openai',
      baseUrl: 'https://api.nova.amazon.com/v1',
      apiKey: 'nova-key',
      model: 'nova-2-lite-v1',
      nativeSearch: { type: 'nova-grounding' },
      openAICompatible: {
        auth: { type: 'bearer', token: 'nova-key' },
        nativeSearch: { type: 'nova-grounding' },
      },
    } as never);

    await expect(provider.generateText({
      prompt: 'Say hello',
      systemPrompt: 'Be brief.',
    })).resolves.toBe('Nova proxied answer.');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/openai-compatible-proxy?url=https%3A%2F%2Fapi.nova.amazon.com%2Fv1%2Fchat%2Fcompletions',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer nova-key',
    });
  });

  it.each([
    ['OpenAI', 'https://api.openai.com', 'https://api.openai.com/v1/chat/completions'],
    ['Claude', 'https://api.anthropic.com/v1', 'https://api.anthropic.com/v1/chat/completions'],
    ['Groq', 'https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1/chat/completions'],
    ['OpenRouter', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/chat/completions'],
    ['Mistral', 'https://api.mistral.ai/v1', 'https://api.mistral.ai/v1/chat/completions'],
  ])('routes %s hosted text requests through the same-origin proxy', async (_label, baseUrl, upstreamUrl) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hosted proxied answer.' } }],
    }), { status: 200 }));

    const provider = createLLMProvider({
      type: 'openai',
      baseUrl,
      apiKey: 'provider-key',
      model: 'provider-model',
    });

    await expect(provider.generateText({
      prompt: 'Say hello',
    })).resolves.toBe('Hosted proxied answer.');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/openai-compatible-proxy?url=${encodeURIComponent(upstreamUrl)}`,
    );
  });

  it('can suppress OpenAI-compatible native search fields on tool follow-up requests', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Tool-grounded answer.' } }],
    }), { status: 200 }));

    const provider = createLLMProvider({
      type: 'openai',
      baseUrl: 'https://api.nova.amazon.com/v1',
      apiKey: 'nova-key',
      model: 'nova-2-lite-v1',
      nativeSearch: { type: 'nova-grounding' },
      openAICompatible: {
        auth: { type: 'bearer', token: 'nova-key' },
        nativeSearch: { type: 'nova-grounding' },
      },
    } as never);

    await provider.generateToolResponse?.({
      messages: [
        { role: 'user', content: 'Who is winning?' },
        {
          role: 'tool',
          name: 'show_sports_score',
          toolCallId: 'call_1',
          content: '{"homeTeam":"Tottenham","awayTeam":"Aston Villa","homeScore":1,"awayScore":2,"status":"In Progress"}',
        },
      ],
      tools: [
        {
          name: 'show_sports_score',
          description: 'Show a live sports score card.',
          parameters: { type: 'object', properties: {} },
        },
      ],
      allowNativeSearch: false,
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.system_tools).toBeUndefined();
    expect(payload.web_search_options).toBeUndefined();
    expect(payload.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'show_sports_score' }),
      }),
    ]);
  });

  it('creates a direct Gemini provider and calls the Gemini SDK', async () => {
    genaiMock.generateContent.mockResolvedValue({
      text: 'Hello from Gemini.',
    });

    const provider = createLLMProvider({
      type: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-2.5-flash',
    } as never);

    expect(provider.name).toBe('gemini');

    const text = await provider.generateText({
      prompt: 'Say hello',
      systemPrompt: 'Be brief.',
      temperature: 0.25,
    });

    expect(text).toBe('Hello from Gemini.');
    expect(genaiMock.GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'gemini-key' });
    expect(genaiMock.generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'Say hello',
      config: {
        systemInstruction: 'Be brief.',
        temperature: 0.25,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses direct Gemini function calls into tool calls', async () => {
    genaiMock.generateContent.mockResolvedValue({
      text: '',
      functionCalls: [
        {
          id: 'call_1',
          name: 'get_weather',
          args: { city: 'Tokyo' },
        },
      ],
    });

    const provider = createLLMProvider({
      type: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-2.5-flash',
    } as never);

    const response = await provider.generateToolResponse?.({
      messages: [
        { role: 'system', content: 'Use tools when helpful.' },
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
      ],
      temperature: 0.2,
    });

    expect(response).toEqual({
      text: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'get_weather',
          arguments: { city: 'Tokyo' },
        },
      ],
    });

    expect(genaiMock.generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'What is the weather in Tokyo?' }],
        },
      ],
      config: {
        systemInstruction: 'Use tools when helpful.',
        temperature: 0.2,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: 'Fetch weather.',
                parameters: {
                  type: 'object',
                  properties: {
                    city: { type: 'string' },
                  },
                  required: ['city'],
                },
              },
            ],
          },
        ],
      },
    });
  });

  it('preserves Gemini thought signatures when replaying function calls', async () => {
    genaiMock.generateContent
      .mockResolvedValueOnce({
        text: '',
        functionCalls: [
          {
            id: 'call_1',
            name: 'get_weather',
            args: { city: 'Tokyo' },
          },
        ],
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    id: 'call_1',
                    name: 'get_weather',
                    args: { city: 'Tokyo' },
                  },
                  thoughtSignature: 'opaque-gemini-signature',
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'It is 72 degrees.',
        functionCalls: [],
      });

    const provider = createLLMProvider({
      type: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-2.5-flash-lite',
    } as never);

    const firstResponse = await provider.generateToolResponse?.({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
          },
        },
      ],
    });

    expect(firstResponse?.toolCalls[0]).toMatchObject({
      id: 'call_1',
      name: 'get_weather',
      thoughtSignature: 'opaque-gemini-signature',
    });

    await provider.generateToolResponse?.({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: firstResponse?.toolCalls || [],
        },
        {
          role: 'tool',
          name: 'get_weather',
          toolCallId: 'call_1',
          content: '{"tempF":72}',
        },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
          },
        },
      ],
    });

    const secondPayload = genaiMock.generateContent.mock.calls[1]?.[0];
    expect(secondPayload.contents[1].parts[0]).toMatchObject({
      functionCall: {
        id: 'call_1',
        name: 'get_weather',
        args: { city: 'Tokyo' },
      },
      thoughtSignature: 'opaque-gemini-signature',
    });
  });

  it('streams OpenAI-compatible responses token by token', async () => {
    fetchMock.mockResolvedValue(
      createStreamResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'local-model');
    const tokens: string[] = [];

    await provider.streamText({
      prompt: 'Say hello',
      systemPrompt: 'Be brief.',
      temperature: 0.3,
      onToken: (token) => tokens.push(token),
    });

    expect(tokens).toEqual(['Hel', 'lo']);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.stream).toBe(true);
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'Say hello' });
  });

  it('filters hidden reasoning from OpenAI-compatible streamed tokens', async () => {
    fetchMock.mockResolvedValue(
      createStreamResponse([
        'data: {"choices":[{"delta":{"content":"<think>call"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" tools</think>Done."}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'local-model');
    const tokens: string[] = [];

    await provider.streamText({
      prompt: 'Say done',
      onToken: (token) => tokens.push(token),
    });

    expect(tokens.join('')).toBe('Done.');
  });

  it('filters markdown-style hidden reasoning sections from streamed tokens', async () => {
    fetchMock.mockResolvedValue(
      createStreamResponse([
        'data: {"choices":[{"delta":{"content":"### Analysis\\nI should"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" call a tool.\\n### Final\\nDone."}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'local-model');
    const tokens: string[] = [];

    await provider.streamText({
      prompt: 'Say done',
      onToken: (token) => tokens.push(token),
    });

    expect(tokens.join('')).toBe('Done.');
  });

  it('sanitizes aggregated OpenAI-compatible streamed text', async () => {
    fetchMock.mockResolvedValue(
      createStreamResponse([
        'data: {"choices":[{"delta":{"content":"<think>call"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" tools</think>Done."}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'local-model');

    await expect(provider.generateText({
      prompt: 'Say done',
      stream: true,
    })).resolves.toBe('Done.');
  });

  it('creates an Ollama provider and posts generate payloads', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        response: 'Hello from Ollama.',
      }),
    );

    const provider = createLLMProvider({
      type: 'ollama',
      baseUrl: 'http://ollama.local/',
      model: 'llama3.2',
    });

    expect(provider).toBeInstanceOf(OllamaProvider);

    const text = await provider.generateText({
      prompt: 'Say hello',
      systemPrompt: 'Be brief.',
      temperature: 0.45,
    });

    expect(text).toBe('Hello from Ollama.');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama.local/api/generate');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload).toMatchObject({
      model: 'llama3.2',
      prompt: 'Say hello',
      system: 'Be brief.',
      stream: false,
      options: {
        temperature: 0.45,
      },
    });
  });

  it('streams Ollama responses token by token', async () => {
    fetchMock.mockResolvedValue(
      createStreamResponse([
        '{"response":"Hel","done":false}\n',
        '{"response":"lo","done":false}\n',
        '{"done":true}\n',
      ]),
    );

    const provider = new OllamaProvider('http://ollama.local', 'llama3.2');
    const tokens: string[] = [];

    await provider.streamText({
      prompt: 'Say hello',
      onToken: (token) => tokens.push(token),
    });

    expect(tokens).toEqual(['Hel', 'lo']);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.stream).toBe(true);
  });

  it('filters hidden reasoning from Ollama streamed tokens', async () => {
    fetchMock.mockResolvedValue(
      createStreamResponse([
        '{"response":"Thought: check","done":false}\n',
        '{"response":" tools\\nFinal: Done.","done":false}\n',
        '{"done":true}\n',
      ]),
    );

    const provider = new OllamaProvider('http://ollama.local', 'llama3.2');
    const tokens: string[] = [];

    await provider.streamText({
      prompt: 'Say done',
      onToken: (token) => tokens.push(token),
    });

    expect(tokens.join('')).toBe('Done.');
  });

  it('sends image content to OpenAI-compatible vision models', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{ message: { content: 'That looks like a coffee mug.' } }],
      }),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'vision-model');

    const text = await provider.generateVisionText({
      prompt: 'What is this?',
      image: {
        mimeType: 'image/jpeg',
        base64Data: 'abc123',
      },
    });

    expect(text).toBe('That looks like a coffee mug.');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));

    expect(payload.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/jpeg;base64,abc123',
            },
          },
        ],
      },
    ]);
  });

  it('sends base64 image data to Ollama vision models', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        response: 'That looks like a coffee mug.',
      }),
    );

    const provider = new OllamaProvider('http://ollama.local', 'llama3.2-vision');

    const text = await provider.generateVisionText({
      prompt: 'What is this?',
      image: {
        mimeType: 'image/jpeg',
        base64Data: 'abc123',
      },
    });

    expect(text).toBe('That looks like a coffee mug.');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama.local/api/generate');
    expect(payload.images).toEqual(['abc123']);
    expect(payload.prompt).toBe('What is this?');
  });

  it('parses OpenAI-compatible tool calls and forwards generic tool definitions', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{
          message: {
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"Tokyo"}',
                },
              },
            ],
          },
        }],
      }),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'tool-model');

    const response = await provider.generateToolResponse?.({
      messages: [
        { role: 'system', content: 'Use tools when helpful.' },
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
      ],
      temperature: 0.2,
    });

    expect(response).toEqual({
      text: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'get_weather',
          arguments: { city: 'Tokyo' },
        },
      ],
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
      },
    ]);
  });

  it('includes tool names on OpenAI-compatible tool result messages for harmony-backed providers', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{ message: { content: 'ok', tool_calls: [] } }],
      }),
    );

    const provider = new OpenAICompatibleProvider(
      'https://api.groq.com/openai/v1',
      'test',
      'openai/gpt-oss-20b',
    );

    await provider.generateToolResponse?.({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_weather',
              arguments: { city: 'Tokyo' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'get_weather',
          toolCallId: 'call_1',
          content: '{"tempF":72}',
        },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
          },
        },
      ],
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));

    expect(payload.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'get_weather',
      content: '{"tempF":72}',
    });
  });

  it('fails OpenAI-compatible tool requests locally when bearer auth is blank', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(401, {
        error: {
          message: 'Missing Authentication header',
          code: 401,
        },
      }),
    );

    const provider = new OpenAICompatibleProvider(
      'https://openrouter.ai/api/v1',
      '   ',
      'openai/gpt-4o-mini',
    );

    await expect(provider.generateToolResponse?.({
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [],
    })).rejects.toThrow('OpenAI-compatible API key is missing');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes OpenAI-compatible tool schemas before sending them to strict providers', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{ message: { content: 'ok', tool_calls: [] } }],
      }),
    );

    const provider = new OpenAICompatibleProvider('https://api.groq.com/openai', 'test', 'tool-model');

    await provider.generateToolResponse?.({
      messages: [{ role: 'user', content: 'Security status?' }],
      tools: [
        {
          name: 'show_security',
          description: 'Shows security status.',
          parameters: {
            type: 'OBJECT',
            properties: {
              recentEvents: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    type: { type: 'STRING' },
                    optionalNote: { type: ['STRING', 'NULL'] },
                  },
                  required: ['type'],
                },
              },
            },
          },
        },
      ],
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));

    expect(payload.tools[0].function.parameters).toEqual({
      type: 'object',
      properties: {
        recentEvents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              optionalNote: {
                anyOf: [
                  { type: 'string' },
                  { type: 'null' },
                ],
              },
            },
            required: ['type'],
          },
        },
      },
    });
  });

  it('uses a smaller Groq gpt-oss-20b tool budget to stay below low TPM limits', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{ message: { content: 'ok', tool_calls: [] } }],
      }),
    );

    const provider = new OpenAICompatibleProvider(
      'https://api.groq.com/openai/v1',
      'test',
      'openai/gpt-oss-20b',
    );

    expect(provider.maxToolDefinitionTokens).toBeLessThanOrEqual(900);
    expect(provider.maxToolResponseTokens).toBeLessThanOrEqual(256);

    await provider.generateToolResponse?.({
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [],
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(payload.max_tokens).toBeLessThanOrEqual(256);
  });

  it('retries OpenAI-compatible tool requests after provider rate-limit backoff', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(createJsonResponse(429, {
        error: {
          message: 'Rate limit reached. Please try again in 0.25s.',
          type: 'tokens',
          code: 'rate_limit_exceeded',
        },
      }))
      .mockResolvedValueOnce(createJsonResponse(200, {
        choices: [{ message: { content: 'It is 57 degrees.', tool_calls: [] } }],
      }));

    const provider = new OpenAICompatibleProvider(
      'https://api.groq.com/openai/v1',
      'test',
      'openai/gpt-oss-20b',
    );

    const responsePromise = provider.generateToolResponse?.({
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [],
    });

    await vi.advanceTimersByTimeAsync(250);

    await expect(responsePromise).resolves.toEqual({
      text: 'It is 57 degrees.',
      toolCalls: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sanitizes OpenAI-compatible tool response text', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        choices: [{
          message: {
            content: '<think>I should not show this.</think>The hall switch is off.',
            tool_calls: [],
          },
        }],
      }),
    );

    const provider = new OpenAICompatibleProvider('http://llm.local', 'test', 'tool-model');

    const response = await provider.generateToolResponse?.({
      messages: [{ role: 'user', content: 'Hall switch?' }],
      tools: [],
    });

    expect(response?.text).toBe('The hall switch is off.');
  });

  it('parses Ollama chat tool calls and forwards tool messages', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(200, {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'get_weather',
                arguments: {
                  city: 'Tokyo',
                },
              },
            },
          ],
        },
      }),
    );

    const provider = new OllamaProvider('http://ollama.local', 'qwen3');

    const response = await provider.generateToolResponse?.({
      messages: [
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_weather',
              arguments: { city: 'Tokyo' },
            },
          ],
        },
        {
          role: 'tool',
          name: 'get_weather',
          content: '{"tempF":72}',
          toolCallId: 'call_1',
        },
      ],
      tools: [
        {
          name: 'get_weather',
          description: 'Fetch weather.',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
          },
        },
      ],
    });

    expect(response).toEqual({
      text: '',
      toolCalls: [
        {
          id: 'tool_call_0',
          name: 'get_weather',
          arguments: { city: 'Tokyo' },
        },
      ],
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(requestInit.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama.local/api/chat');
    expect(payload.messages[1]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: { city: 'Tokyo' },
          },
        },
      ],
    });
    expect(payload.messages[2]).toEqual({
      role: 'tool',
      tool_name: 'get_weather',
      content: '{"tempF":72}',
    });
  });
});
