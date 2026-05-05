import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import {
  getAiChatWidgetHistory,
  createAiChatWidgetConversation,
  saveAiChatWidgetHistory,
  type AiChatWidgetMessage,
} from '../../../services/aiChatWidgetStore';
import AiChatWidget from './AiChatWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';

const {
  settingsState,
  buildCustomLLMToolDefinitionsMock,
  runLLMToolAgentMock,
  setCustomLLMModelMock,
  setCustomLLMProviderTypeMock,
  setOpenAIBaseUrlMock,
  setOpenAICompatibleProviderPresetIdMock,
  widgetSizeState,
} = vi.hoisted(() => {
  const settingsState = {
    providerType: 'gemini',
    geminiModel: 'gemini-test',
    ollamaModel: 'llama3',
    openAIModel: 'gpt-4o-mini',
    openAIProviderPresetId: 'openai',
    ollamaBaseUrl: 'http://localhost:11434',
    openAIBaseUrl: 'https://api.openai.com',
  };
  const widgetSizeState = {
    pixelHeight: 520,
  };
  return {
    settingsState,
    widgetSizeState,
    buildCustomLLMToolDefinitionsMock: vi.fn(() => [
      {
        name: 'setTimer',
        description: 'Set a timer',
        parameters: { type: 'object', properties: {} },
      },
    ]),
    runLLMToolAgentMock: vi.fn(async () => 'Here is **bold** text and https://example.com.\n\n![Diagram](data:image/png;base64,reply)'),
    setCustomLLMProviderTypeMock: vi.fn((providerType: string) => {
      settingsState.providerType = providerType;
    }),
    setCustomLLMModelMock: vi.fn((model: string) => {
      if (settingsState.providerType === 'gemini') {
        settingsState.geminiModel = model;
      } else if (settingsState.providerType === 'ollama') {
        settingsState.ollamaModel = model;
      } else {
        settingsState.openAIModel = model;
      }
    }),
    setOpenAICompatibleProviderPresetIdMock: vi.fn((presetId: string) => {
      settingsState.openAIProviderPresetId = presetId;
    }),
    setOpenAIBaseUrlMock: vi.fn((baseUrl: string) => {
      settingsState.openAIBaseUrl = baseUrl;
    }),
  };
});

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 4,
    h: 4,
    area: 16,
    sizeClass: 'large',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 560,
    pixelHeight: widgetSizeState.pixelHeight,
  }),
}));

vi.mock('../../../services/ai/customLlmRuntime', () => ({
  createConfiguredCustomLLMProvider: vi.fn(async () => ({
    name: 'test-provider',
    generateText: vi.fn(async () => 'Here is **bold** text and https://example.com.\n\n![Diagram](data:image/png;base64,reply)'),
    generateVisionText: vi.fn(async () => 'I can see the uploaded image.'),
    generateToolResponse: vi.fn(async () => ({ text: 'Tool response', toolCalls: [] })),
  })),
  customLLMProviderConfigHasNativeSearch: vi.fn(() => false),
  getConfiguredCustomLLMProviderConfig: vi.fn(async () => ({
    type: 'gemini',
    model: 'gemini-test',
    apiKey: 'test-key',
  })),
  hasConfiguredCustomLLMCredential: vi.fn(() => true),
}));

vi.mock('../../../services/ai/llmToolAgent', () => ({
  runLLMToolAgent: runLLMToolAgentMock,
}));

vi.mock('../../../services/ai/toolSchema', () => ({
  buildCustomLLMToolDefinitions: buildCustomLLMToolDefinitionsMock,
}));

vi.mock('../../../utils/settingsStorage', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/settingsStorage')>(
    '../../../utils/settingsStorage',
  );
  return {
    ...actual,
    getCustomLLMProviderType: () => settingsState.providerType,
    setCustomLLMProviderType: setCustomLLMProviderTypeMock,
    getCustomLLMModel: () => {
      if (settingsState.providerType === 'gemini') return settingsState.geminiModel;
      if (settingsState.providerType === 'ollama') return settingsState.ollamaModel;
      return settingsState.openAIModel;
    },
    setCustomLLMModel: setCustomLLMModelMock,
    getCustomLLMBaseUrl: () => {
      if (settingsState.providerType === 'ollama') return settingsState.ollamaBaseUrl;
      if (settingsState.providerType === 'openai') return settingsState.openAIBaseUrl;
      return '';
    },
    getCustomLLMApiKeyAsync: vi.fn(async () => ''),
    getOllamaBaseUrl: () => settingsState.ollamaBaseUrl,
    getOllamaModel: () => settingsState.ollamaModel,
    getOpenAIBaseUrl: () => settingsState.openAIBaseUrl,
    setOpenAIBaseUrl: setOpenAIBaseUrlMock,
    getOpenAIModel: () => settingsState.openAIModel,
    getOpenAICompatibleProviderPresetId: () => settingsState.openAIProviderPresetId,
    setOpenAICompatibleProviderPresetId: setOpenAICompatibleProviderPresetIdMock,
    getOpenaiApiKeyAsync: vi.fn(async () => 'provider-key'),
    getOpenAIApiKeyAsync: vi.fn(async () => 'provider-key'),
  };
});

const widget: DashboardWidget = {
  id: 'chat-widget-test',
  type: 'ai_chat',
  position: 0,
  size: 'xlarge',
  enabled: true,
  config: {
    w: 4,
    h: 4,
    aiChatTitle: 'Studio Bot',
    aiChatSystemPrompt: 'Be concise.',
    aiChatHistoryLimit: 12,
    aiChatShowTimestamps: true,
  },
};

const assistantMessage = (content: string): AiChatWidgetMessage => ({
  id: 'assistant-1',
  role: 'assistant',
  content,
  createdAt: Date.UTC(2026, 3, 30, 19, 45),
  attachments: [],
});

describe('AiChatWidget', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsState.providerType = 'gemini';
    settingsState.geminiModel = 'gemini-test';
    settingsState.ollamaModel = 'llama3';
    settingsState.openAIModel = 'gpt-4o-mini';
    settingsState.openAIProviderPresetId = 'openai';
    settingsState.ollamaBaseUrl = 'http://localhost:11434';
    settingsState.openAIBaseUrl = 'https://api.openai.com';
    widgetSizeState.pixelHeight = 520;
    setCustomLLMModelMock.mockClear();
    setCustomLLMProviderTypeMock.mockClear();
    setOpenAIBaseUrlMock.mockClear();
    setOpenAICompatibleProviderPresetIdMock.mockClear();
    buildCustomLLMToolDefinitionsMock.mockClear();
    runLLMToolAgentMock.mockClear();
    runLLMToolAgentMock.mockResolvedValue('Here is **bold** text and https://example.com.\n\n![Diagram](data:image/png;base64,reply)');
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:curio-code'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('renders timestamped history with rich text links, images, and delete controls', async () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage('Visit https://example.com\n\n![Chart](data:image/png;base64,abc123)'),
    ]);

    render(<AiChatWidget widget={widget} />);

    expect(screen.getByText('Studio Bot')).toBeInTheDocument();
    expect(screen.getByText(/Apr 30, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.com' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByRole('img', { name: 'Chart' })).toHaveAttribute('src', 'data:image/png;base64,abc123');

    fireEvent.click(screen.getByRole('button', { name: 'Delete assistant message' }));

    await waitFor(() => {
      expect(getAiChatWidgetHistory(widget.id)).toEqual([]);
    });
  });

  it('renders the widget title in natural case without wide title tracking', () => {
    render(<AiChatWidget widget={widget} />);

    const title = screen.getByText('Studio Bot');
    expect(title).toHaveClass('normal-case');
    expect(title).toHaveClass('tracking-normal');
    expect(title).not.toHaveClass('uppercase');
    expect(title).not.toHaveClass('tracking-[0.16em]');
  });

  it('uses Google Sans as the widget font family', () => {
    render(<AiChatWidget widget={widget} />);

    let node: HTMLElement | null = screen.getByText('Studio Bot');
    while (node && !node.className.includes("font-['Google_Sans','Google_Sans_Text','Product_Sans',Arial,sans-serif]")) {
      node = node.parentElement;
    }

    expect(node).not.toBeNull();
  });

  it('uses the shared body and empty-state primitives for the chat transcript', () => {
    const { container } = render(<AiChatWidget widget={widget} />);

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-primitive="empty-state"]')).toHaveTextContent(
      'Start a chat',
    );
  });

  it('sends typed prompts through the configured text LLM and stores the assistant reply', async () => {
    render(<AiChatWidget widget={widget} />);

    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Draft a launch checklist' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send chat message' }));

    await screen.findByText(/Here is/);

    const history = getAiChatWidgetHistory(widget.id);
    expect(history).toEqual([
      expect.objectContaining({ role: 'user', content: 'Draft a launch checklist' }),
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('https://example.com') }),
    ]);
    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Diagram' })).toBeInTheDocument();
  });

  it('uses app action tools by default when sending chat turns', async () => {
    render(<AiChatWidget widget={{ ...widget, id: 'chat-widget-tools-default' }} />);

    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Set a 5 minute timer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send chat message' }));

    await screen.findByText(/Here is/);

    expect(buildCustomLLMToolDefinitionsMock).toHaveBeenCalled();
    expect(runLLMToolAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Set a 5 minute timer'),
      toolDefinitions: expect.arrayContaining([
        expect.objectContaining({ name: 'setTimer' }),
      ]),
      context: expect.objectContaining({
        disconnect: expect.any(Function),
        startHaCameraStream: expect.any(Function),
        stopHaCameraStream: expect.any(Function),
      }),
    }));
  });

  it('anchors the widget prompt to Curio Robot instead of an analytics platform', async () => {
    render(<AiChatWidget widget={{ ...widget, id: 'chat-widget-identity' }} />);

    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'What are you?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send chat message' }));

    await screen.findByText(/Here is/);

    expect(runLLMToolAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining('Curio Robot'),
    }));
    expect(runLLMToolAgentMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining('not a data analytics platform'),
    }));
  });

  it('uses plain text generation when widget action tools are disabled', async () => {
    render(
      <AiChatWidget
        widget={{
          ...widget,
          id: 'chat-widget-tools-disabled',
          config: {
            ...widget.config,
            aiChatToolUse: false,
          },
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Set a 5 minute timer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send chat message' }));

    await screen.findByText(/Here is/);

    expect(runLLMToolAgentMock).not.toHaveBeenCalled();
  });

  it('attaches images/files and shows image-aware provider status in the composer', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    render(<AiChatWidget widget={widget} />);

    const composer = screen.getByLabelText('Chat attachments');
    fireEvent.change(composer, { target: { files: [file] } });

    const attachmentList = await screen.findByLabelText('Pending chat attachments');
    expect(within(attachmentList).getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Images supported' })).toBeInTheDocument();
    expect(screen.queryByText(/Images supported/)).not.toBeInTheDocument();
  });

  it('opens the dashboard focused widget overlay from the shared header icon trigger', () => {
    let expandedWidgetId: string | null = null;
    const handleFocusWidget = (event: Event) => {
      expandedWidgetId = (event as CustomEvent<{ widgetId: string }>).detail?.widgetId || null;
    };
    window.addEventListener('curio-focus-widget', handleFocusWidget);

    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button" aria-label="Widget actions">...</button>}>
        <AiChatWidget widget={widget} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    const expandButton = screen.getByRole('button', { name: 'Expand Studio Bot widget' });
    expect(screen.getByRole('button', { name: 'Widget actions' })).toBeInTheDocument();

    fireEvent.click(expandButton);
    expect(expandedWidgetId).toBe(widget.id);

    window.removeEventListener('curio-focus-widget', handleFocusWidget);
  });

  it('renders header icon actions as circular icon-only controls', () => {
    createAiChatWidgetConversation(widget.id, {
      title: 'Kitchen plan',
      messages: [assistantMessage('Kitchen answer')],
      now: 10,
    });

    render(<AiChatWidget widget={widget} />);

    const historyButton = screen.getByRole('button', { name: 'Open chat history' });
    const newChatButton = screen.getByRole('button', { name: 'New chat' });

    expect(historyButton).toHaveClass('dashboard-widget-control-button');
    expect(newChatButton).toHaveClass('dashboard-widget-control-button');
    expect(newChatButton).toHaveTextContent('');
    expect(screen.queryByText(/^New$/)).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-chat-history-count')).toHaveTextContent('1');

    fireEvent.click(historyButton);
    const panelNewChatButton = screen.getByRole('button', { name: 'New chat conversation' });
    expect(panelNewChatButton).toHaveClass('dashboard-widget-control-button');
    expect(panelNewChatButton).toHaveTextContent('');
  });

  it('lets users copy selectable assistant output and renders richer markdown blocks', async () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage([
        '> Important context',
        '',
        '| Item | Status |',
        '| --- | --- |',
        '| Links | Done |',
        '',
        '1. First',
        '2. Second',
      ].join('\n')),
    ]);

    render(<AiChatWidget widget={widget} />);

    expect(screen.getByText('Important context').closest('blockquote')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('First').tagName.toLowerCase()).toBe('li');

    const copyButton = screen.getByRole('button', { name: 'Copy assistant message' });
    expect(copyButton.textContent).toBe('');
    expect(copyButton).toHaveClass('absolute', 'opacity-0', 'group-hover/message:opacity-100');
    expect(screen.queryByText(/^Copy$/i)).not.toBeInTheDocument();

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('| Item | Status |'));
    });
    expect(screen.getByTestId('assistant-message-content')).toHaveClass('select-text');
    expect(screen.getByTestId('assistant-message-content')).toHaveClass('pr-8');
  });

  it('reveals the assistant copy icon when the message text is tapped for mobile use', async () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage('Tap this answer on a phone to reveal copy.'),
    ]);

    render(<AiChatWidget widget={widget} />);

    const copyButton = screen.getByRole('button', { name: 'Copy assistant message' });
    expect(copyButton).toHaveClass('opacity-0');

    fireEvent.pointerUp(screen.getByTestId('assistant-message-content'), {
      pointerType: 'touch',
    });

    expect(copyButton).toHaveClass('opacity-100');
  });

  it('applies compact density to message spacing and controls', () => {
    saveAiChatWidgetHistory('chat-widget-compact-density', [
      assistantMessage('Compact spacing should visibly tighten this bubble.'),
    ]);

    render(
      <AiChatWidget
        widget={{
          ...widget,
          id: 'chat-widget-compact-density',
          config: {
            ...widget.config,
            aiChatDensity: 'compact',
          },
        }}
      />,
    );

    const content = screen.getByTestId('assistant-message-content');
    const row = content.closest('[data-ai-chat-density]');
    expect(row).toHaveAttribute('data-ai-chat-density', 'compact');
    expect(row).toHaveClass('gap-1.5');
    expect(content).toHaveClass('pr-7');
    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toHaveClass('h-6', 'w-6');
  });

  it('honors explicit comfortable density even in a short widget', () => {
    widgetSizeState.pixelHeight = 320;
    saveAiChatWidgetHistory('chat-widget-comfortable-density', [
      assistantMessage('Comfortable spacing should stay roomy when selected.'),
    ]);

    render(
      <AiChatWidget
        widget={{
          ...widget,
          id: 'chat-widget-comfortable-density',
          config: {
            ...widget.config,
            aiChatDensity: 'comfortable',
          },
        }}
      />,
    );

    const content = screen.getByTestId('assistant-message-content');
    const row = content.closest('[data-ai-chat-density]');
    expect(row).toHaveAttribute('data-ai-chat-density', 'comfortable');
    expect(row).toHaveClass('gap-2');
    expect(content).toHaveClass('pr-8');
  });

  it('applies the configured bubble text size to rich text blocks', () => {
    saveAiChatWidgetHistory('chat-widget-large-bubbles', [
      assistantMessage('Large bubble text should be easier to read.'),
    ]);

    render(
      <AiChatWidget
        widget={{
          ...widget,
          id: 'chat-widget-large-bubbles',
          config: {
            ...widget.config,
            aiChatTextSize: 'large',
          },
        }}
      />,
    );

    const content = screen.getByTestId('assistant-message-content');
    const paragraph = within(content).getByText('Large bubble text should be easier to read.').closest('p');
    expect(content).toHaveClass('text-[15px]', 'leading-6');
    expect(paragraph).toHaveClass('text-[15px]', 'leading-6');
  });

  it('renders fenced code snippets with a code header and copy control', async () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage([
        'Here is the helper:',
        '',
        '```js',
        'const total = 2 + 2;',
        '```',
      ].join('\n')),
    ]);

    render(<AiChatWidget widget={widget} />);

    const codeBlock = screen.getByTestId('chat-code-block');
    expect(within(codeBlock).getByText('JavaScript')).toBeInTheDocument();
    expect(within(codeBlock).getByText('1 line')).toBeInTheDocument();
    expect(within(codeBlock).getByText('const total = 2 + 2;').tagName.toLowerCase()).toBe('code');
    expect(within(codeBlock).queryByRole('button', { name: 'Download HTML code snippet' })).not.toBeInTheDocument();

    fireEvent.click(within(codeBlock).getByRole('button', { name: 'Copy JavaScript code snippet' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const total = 2 + 2;');
    });
  });

  it('renders mixed markdown headings, dividers, and lists without exposing raw markers', () => {
    saveAiChatWidgetHistory('chat-widget-mixed-markdown', [
      assistantMessage([
        'Got it. Here is the reminder:',
        '',
        '#### To-Do: Take Out the Trash',
        '- **Date:** Tomorrow',
        '- **Time:** 7 AM',
        '---',
        '#### Reminder Tips',
        '- **Write it down** somewhere visible.',
      ].join('\n')),
    ]);

    const { container } = render(
      <AiChatWidget
        widget={{
          ...widget,
          id: 'chat-widget-mixed-markdown',
        }}
      />,
    );

    expect(screen.getByText('To-Do: Take Out the Trash')).toBeInTheDocument();
    expect(screen.getByText('Reminder Tips')).toBeInTheDocument();
    expect(screen.getByText('Date:').closest('li')).toBeInTheDocument();
    expect(screen.getByText('Write it down').closest('li')).toBeInTheDocument();
    expect(screen.queryByText(/####/)).not.toBeInTheDocument();
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('renders chart code blocks as inline SVG charts', () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage([
        'Here is the current split:',
        '',
        '```chart',
        '{"type":"bar","title":"Task Load","data":[{"label":"Done","value":3},{"label":"Left","value":1}]}',
        '```',
      ].join('\n')),
    ]);

    render(<AiChatWidget widget={widget} />);

    const chart = screen.getByRole('img', { name: 'Task Load chart' });
    expect(chart).toBeInTheDocument();
    expect(within(chart).getByText('Done')).toBeInTheDocument();
    expect(within(chart).getByText('3')).toBeInTheDocument();
  });

  it('renders simple HTML and CSS code blocks in a sanitized preview', () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage([
        '```html',
        '<style>.badge { color: red; background-image: url(https://example.com/bg.png); }</style>',
        '<div class="badge" onclick="alert(1)">Spark card</div>',
        '<script>alert("bad")</script>',
        '```',
      ].join('\n')),
    ]);

    render(<AiChatWidget widget={widget} />);

    const preview = screen.getByTestId('chat-html-preview');
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('Spark card'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('.badge'));
    expect(preview).toHaveAttribute('srcdoc', expect.not.stringContaining('<script'));
    expect(preview).toHaveAttribute('srcdoc', expect.not.stringContaining('onclick'));
    expect(preview).toHaveAttribute('srcdoc', expect.not.stringContaining('alert'));
    expect(preview).toHaveAttribute('srcdoc', expect.not.stringContaining('url('));

    const codeBlock = screen.getByTestId('chat-code-block');
    expect(within(codeBlock).getByText('HTML')).toBeInTheDocument();

    fireEvent.click(within(codeBlock).getByRole('button', { name: 'Copy HTML code snippet' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Spark card'));

    const clickedAnchors: HTMLAnchorElement[] = [];
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });

    fireEvent.click(within(codeBlock).getByRole('button', { name: 'Download HTML code snippet' }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0]).toHaveAttribute('download', 'curio-chat-snippet.html');
  });

  it('combines adjacent HTML and CSS code fences into one styled preview', () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage([
        '```html',
        '<section class="reply-card"><h2>Status</h2><p>Ready to launch</p></section>',
        '```',
        '',
        '```css',
        '.reply-card { display: grid; gap: 8px; color: white; background: linear-gradient(135deg, #111827, #2563eb); }',
        '```',
      ].join('\n')),
    ]);

    render(<AiChatWidget widget={widget} />);

    const preview = screen.getByTestId('chat-html-preview');
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('Ready to launch'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('.reply-card'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('linear-gradient'));
  });

  it('keeps safe inline chart scripts inside the sandboxed HTML preview', () => {
    saveAiChatWidgetHistory(widget.id, [
      assistantMessage([
        '```html',
        '<section><h2>Top Revenue By Location</h2><canvas id="revenue"></canvas></section>',
        '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>',
        '<script>',
        'const ctx = document.getElementById("revenue").getContext("2d");',
        'new Chart(ctx, {',
        '  type: "bar",',
        '  data: { labels: ["Top", "Location"], datasets: [{ label: "Sales", data: [12, 18] }] },',
        '  options: { plugins: { tooltip: { callbacks: { label: function(context) { return `${context.dataset.label}: ${context.parsed.y}`; } } } } }',
        '});',
        '</script>',
        '```',
      ].join('\n')),
    ]);

    render(<AiChatWidget widget={widget} />);

    const preview = screen.getByTestId('chat-html-preview');
    expect(preview).toHaveAttribute('sandbox', 'allow-scripts');
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('Top Revenue By Location'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('window.Chart'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('new Chart'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('function(context)'));
    expect(preview).toHaveAttribute('srcdoc', expect.stringContaining('curio-html-preview-size'));
    expect(preview).toHaveAttribute('srcdoc', expect.not.stringContaining('cdn.jsdelivr'));
    expect(preview).toHaveStyle({ height: '560px' });
  });

  it('switches text LLM models directly inside the widget', async () => {
    render(<AiChatWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chat model' }));

    const modelMenu = screen.getByRole('listbox', { name: 'Chat model options' });
    expect(modelMenu).toHaveClass('bg-[var(--ether-overlay-panel)]');
    fireEvent.click(within(modelMenu).getByRole('option', { name: /gemini-2.5-pro/i }));

    expect(setCustomLLMModelMock).toHaveBeenCalledWith('gemini-2.5-pro');
    await screen.findByText('gemini-2.5-pro');
  });

  it('switches saved LLM providers and resets model options from the widget', async () => {
    render(<AiChatWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chat provider' }));
    const providerMenu = screen.getByRole('listbox', { name: 'Chat provider options' });
    fireEvent.click(within(providerMenu).getByRole('option', { name: /Amazon Nova/i }));

    expect(setCustomLLMProviderTypeMock).toHaveBeenCalledWith('openai');
    expect(setOpenAICompatibleProviderPresetIdMock).toHaveBeenCalledWith('amazon_nova');
    expect(setOpenAIBaseUrlMock).toHaveBeenCalledWith('https://api.nova.amazon.com/v1');
    expect(setCustomLLMModelMock).toHaveBeenCalledWith('nova-2-lite-v1');

    fireEvent.click(screen.getByRole('button', { name: 'Chat model' }));
    expect(screen.getByRole('listbox', { name: 'Chat model options' })).toHaveTextContent('nova-2-lite-v1');
  });

  it('opens and deletes saved conversations from widget history', async () => {
    const first = createAiChatWidgetConversation(widget.id, {
      title: 'Kitchen plan',
      messages: [assistantMessage('Kitchen answer')],
      now: 10,
    });
    createAiChatWidgetConversation(widget.id, {
      title: 'Trip notes',
      messages: [assistantMessage('Trip answer')],
      now: 20,
    });

    render(<AiChatWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open chat history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation Kitchen plan' }));

    expect(await screen.findByText('Kitchen answer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open chat history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete conversation Kitchen plan' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Open conversation Kitchen plan' })).not.toBeInTheDocument();
    });
    expect(first.id).toBeTruthy();
  });

  it('searches saved conversations and opens the selected result', async () => {
    createAiChatWidgetConversation(widget.id, {
      title: 'Kitchen plan',
      messages: [assistantMessage('Kitchen lighting and dinner prep')],
      now: 10,
    });
    createAiChatWidgetConversation(widget.id, {
      title: 'Chart help',
      messages: [
        {
          id: 'assistant-soccer',
          role: 'assistant',
          content: 'The soccer clubs revenue chart should use a horizontal bar chart.',
          createdAt: Date.UTC(2026, 3, 30, 20, 15),
          attachments: [],
        },
      ],
      now: 20,
    });

    render(<AiChatWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open chat history' }));
    fireEvent.change(screen.getByLabelText('Search conversations'), {
      target: { value: 'soccer' },
    });

    expect(screen.getByRole('button', { name: 'Open conversation Chart help' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open conversation Kitchen plan' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open conversation Chart help' }));

    await waitFor(() => {
      expect(getAiChatWidgetHistory(widget.id).map((message) => message.id)).toEqual(['assistant-soccer']);
    });
    expect(screen.getByText(/horizontal bar chart/)).toBeInTheDocument();
  });

  it('shows expanded conversation previews with a last-updated timestamp', async () => {
    createAiChatWidgetConversation(widget.id, {
      title: 'Long preview',
      messages: [
        {
          ...assistantMessage(
            'This response includes a longer planning summary with scope, milestones, risks, owners, rollout notes, and a final checkpoint for review.',
          ),
          id: 'assistant-long-preview',
        },
      ],
      now: 10,
    });

    render(<AiChatWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open chat history' }));

    const conversationButton = screen.getByRole('button', { name: 'Open conversation Long preview' });
    expect(within(conversationButton).getByText(/longer planning summary/)).toBeInTheDocument();
    expect(within(conversationButton).getByText(/final checkpoint for review/)).toBeInTheDocument();
    expect(within(conversationButton).getByText(/Apr 30, 2026/)).toBeInTheDocument();
  });

  it('starts a new chat from a header shortcut', async () => {
    createAiChatWidgetConversation(widget.id, {
      title: 'Kitchen plan',
      messages: [assistantMessage('Kitchen answer')],
      now: 10,
    });

    render(<AiChatWidget widget={widget} />);

    expect(screen.getByText('Kitchen answer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    await waitFor(() => {
      expect(screen.queryByText('Kitchen answer')).not.toBeInTheDocument();
    });
    expect(getAiChatWidgetHistory(widget.id)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Open chat history' })).toHaveTextContent('2');
  });
});
