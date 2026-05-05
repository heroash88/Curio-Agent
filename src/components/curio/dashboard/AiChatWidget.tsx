import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eraser,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { CardManagerContext } from '../../../contexts/CardManagerContext';
import type { DashboardAiChatTextSize, DashboardWidget } from '../../../services/dashboardTypes';
import {
  appendAiChatWidgetMessages,
  clearAiChatWidgetHistory,
  createAiChatWidgetConversation,
  deleteAiChatWidgetConversation,
  deleteAiChatWidgetMessage,
  getAiChatWidgetActiveConversationId,
  getAiChatWidgetConversations,
  getAiChatWidgetHistory,
  setAiChatWidgetActiveConversationId,
  saveAiChatWidgetHistory,
  type AiChatWidgetAttachment,
  type AiChatWidgetConversation,
  type AiChatWidgetMessage,
} from '../../../services/aiChatWidgetStore';
import { GEMINI_TEXT_MODELS, getGeminiTextModel } from '../../../services/ai/config';
import {
  OPENAI_COMPATIBLE_PROVIDER_PRESETS,
  TEXT_LLM_PROVIDER_OPTIONS,
  getOpenAICompatibleProviderPreset,
  getTextLLMProviderOptionValue,
  resolveTextLLMProviderOption,
  type TextLLMProviderOptionId,
} from '../../../services/ai/openAICompatiblePresets';
import {
  createConfiguredCustomLLMProvider,
  customLLMProviderConfigHasNativeSearch,
  getConfiguredCustomLLMProviderConfig,
  hasConfiguredCustomLLMCredential,
} from '../../../services/ai/customLlmRuntime';
import {
  getCustomLLMModel,
  getCustomLLMProviderType,
  getOllamaBaseUrl,
  getOllamaModel,
  getOpenAIBaseUrl,
  getOpenAICompatibleProviderPresetId,
  getOpenAIModel,
  getOpenaiApiKeyAsync,
  getTempUnit,
  getWeatherCity,
  setCustomLLMModel,
  setCustomLLMProviderType,
  setOpenAIBaseUrl,
  setOpenAICompatibleProviderPresetId,
} from '../../../utils/settingsStorage';
import { isWebSpeechSupported, startDictation, type DictationHandle } from '../../../services/webSpeechDictation';
import WidgetShell from './WidgetShell';
import { WidgetBody, WidgetEmptyState } from './widgetPrimitives';

const DEFAULT_SYSTEM_PROMPT =
  'You are Curio Robot, a voice-first personal assistant inside the Curio Robot app. You are not a data analytics platform, BI dashboard, reporting product, or SaaS analytics tool, and you should not describe yourself that way. Help the user with conversation, files, images, app actions, smart home/control integrations, reminders, routines, and dashboard context. Answer naturally, keep formatting readable, and use markdown links, lists, code blocks, image markdown, charts, and simple HTML/CSS examples when helpful.';
const DEFAULT_HISTORY_LIMIT = 40;
const TEXT_PREVIEW_LIMIT = 16000;
const HISTORY_CONTEXT_LIMIT = 12;
const CONVERSATION_PREVIEW_LIMIT = 240;

const AI_CHAT_TEXT_SIZE_CLASSES: Record<DashboardAiChatTextSize, {
  body: string;
  headingPrimary: string;
  headingSecondary: string;
  quote: string;
  list: string;
}> = {
  small: {
    body: 'text-[12px] leading-5',
    headingPrimary: 'text-[13px]',
    headingSecondary: 'text-[12px]',
    quote: 'text-[12px] leading-5',
    list: 'text-[12px] leading-5',
  },
  medium: {
    body: 'text-[13px] leading-6',
    headingPrimary: 'text-[14px]',
    headingSecondary: 'text-[13px]',
    quote: 'text-[13px] leading-6',
    list: 'text-[13px] leading-6',
  },
  large: {
    body: 'text-[15px] leading-6',
    headingPrimary: 'text-[16px]',
    headingSecondary: 'text-[15px]',
    quote: 'text-[15px] leading-6',
    list: 'text-[15px] leading-6',
  },
};

const getAiChatTextSize = (
  value: DashboardWidget['config']['aiChatTextSize'],
  compact: boolean,
): DashboardAiChatTextSize => {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return compact ? 'small' : 'medium';
};

const createMessageId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const formatTimestamp = (createdAt: number): string =>
  new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const getHistoryLimit = (widget: DashboardWidget): number =>
  Math.max(4, Math.min(Number(widget.config.aiChatHistoryLimit || DEFAULT_HISTORY_LIMIT), 120));

const getCurrentProviderOptionValue = (): TextLLMProviderOptionId =>
  getTextLLMProviderOptionValue(getCustomLLMProviderType(), getOpenAICompatibleProviderPresetId());

const getFixedOpenAIBaseUrlIsSelected = (baseUrl: string): boolean => {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return OPENAI_COMPATIBLE_PROVIDER_PRESETS.some((preset) =>
    Boolean(preset.baseUrl && preset.baseUrl.replace(/\/+$/, '') === normalized),
  );
};

const getBaseUrlForProviderOption = (providerValue: TextLLMProviderOptionId): string => {
  const option = resolveTextLLMProviderOption(providerValue);
  if (option.providerType === 'ollama') return getOllamaBaseUrl();
  if (option.providerType !== 'openai') return '';
  const preset = getOpenAICompatibleProviderPreset(option.presetId);
  return preset.baseUrl || getOpenAIBaseUrl();
};

const getStoredModelForProviderOption = (providerValue: TextLLMProviderOptionId): string => {
  const option = resolveTextLLMProviderOption(providerValue);
  if (option.providerType === 'gemini') return getGeminiTextModel();
  if (option.providerType === 'ollama') return getOllamaModel();

  const preset = getOpenAICompatibleProviderPreset(option.presetId);
  const saved = getOpenAIModel().trim();
  if (
    saved &&
    (
      preset.id === getOpenAICompatibleProviderPresetId() ||
      preset.modelOptions.length === 0 ||
      preset.modelOptions.includes(saved)
    )
  ) {
    return saved;
  }
  return preset.defaultModel || preset.modelOptions[0] || saved;
};

const getStaticModelOptionsForProviderOption = (providerValue: TextLLMProviderOptionId): string[] => {
  const option = resolveTextLLMProviderOption(providerValue);
  if (option.providerType === 'gemini') return GEMINI_TEXT_MODELS.map((model) => model.id);
  if (option.providerType === 'openai') {
    return getOpenAICompatibleProviderPreset(option.presetId).modelOptions;
  }
  return [getOllamaModel()].filter(Boolean);
};

interface ChatPickerOption {
  id: string;
  label: string;
  description?: string;
}

const normalizeConversationPreviewText = (content: string): string =>
  content
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const getConversationPreview = (conversation: AiChatWidgetConversation): string => {
  const last = [...conversation.messages].reverse().find((message) => message.content.trim());
  const preview = last ? normalizeConversationPreviewText(last.content) : '';
  return preview ? preview.slice(0, CONVERSATION_PREVIEW_LIMIT) : 'No messages yet';
};

const getConversationMessageSearchText = (message: AiChatWidgetMessage): string =>
  [
    message.content,
    ...message.attachments.flatMap((attachment) => [
      attachment.name,
      attachment.mimeType,
      attachment.textPreview || '',
    ]),
  ].filter(Boolean).join(' ');

const getConversationSearchText = (conversation: AiChatWidgetConversation): string =>
  [
    conversation.title,
    getConversationPreview(conversation),
    ...conversation.messages.map(getConversationMessageSearchText),
  ].join(' ').toLowerCase();

const getConversationSearchPreview = (
  conversation: AiChatWidgetConversation,
  query: string,
): string => {
  const fallback = getConversationPreview(conversation);
  if (!query || fallback.toLowerCase().includes(query)) return fallback;

  const matchingText = conversation.messages
    .map((message) => normalizeConversationPreviewText(getConversationMessageSearchText(message)))
    .find((text) => text.toLowerCase().includes(query));

  return matchingText ? matchingText.slice(0, CONVERSATION_PREVIEW_LIMIT) : fallback;
};

const getToneInstruction = (tone: DashboardWidget['config']['aiChatTone']): string => {
  switch (tone) {
    case 'concise':
      return 'Keep replies compact and direct.';
    case 'technical':
      return 'Use precise technical language and include concrete steps when useful.';
    case 'creative':
      return 'Use a more imaginative style while keeping the answer useful.';
    case 'friendly':
      return 'Use a warm conversational tone.';
    case 'balanced':
    default:
      return 'Balance brevity with enough detail to be useful.';
  }
};

const buildSystemPrompt = (widget: DashboardWidget): string => [
  DEFAULT_SYSTEM_PROMPT,
  getToneInstruction(widget.config.aiChatTone),
  widget.config.aiChatSystemPrompt,
].filter(Boolean).join('\n\n');

const buildToolSystemPrompt = (
  widget: DashboardWidget,
  toolCount: number,
  externalMcpInstruction = '',
): string => [
  buildSystemPrompt(widget),
  'You can use Curio app tools when the user asks you to take action, retrieve app data, control integrations, show cards, run routines, create reminders, manage calendar/mail/slack items, or open dashboard widgets. Use tools only when they materially help fulfill the request, then summarize what happened.',
  toolCount > 0 ? `Available Curio app tools: ${toolCount}.` : '',
  externalMcpInstruction.trim(),
].filter(Boolean).join('\n\n');

const describeAttachmentForPrompt = (attachment: AiChatWidgetAttachment): string => {
  if (attachment.kind === 'image') {
    return `Image: ${attachment.name} (${attachment.mimeType || 'image'}, ${attachment.size} bytes).`;
  }

  return [
    `File: ${attachment.name} (${attachment.mimeType || 'unknown type'}, ${attachment.size} bytes).`,
    attachment.textPreview ? `Preview:\n${attachment.textPreview}` : '',
  ].filter(Boolean).join('\n');
};

const buildPrompt = (
  prompt: string,
  history: AiChatWidgetMessage[],
  attachments: AiChatWidgetAttachment[],
): string => {
  const context = history
    .slice(-HISTORY_CONTEXT_LIMIT)
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');
  const attachmentContext = attachments.length > 0
    ? attachments.map(describeAttachmentForPrompt).join('\n\n')
    : '';

  return [
    context ? `Conversation so far:\n${context}` : '',
    attachmentContext ? `Attached context:\n${attachmentContext}` : '',
    `User message:\n${prompt}`,
  ].filter(Boolean).join('\n\n');
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });

const isTextLikeFile = (file: File): boolean =>
  file.type.startsWith('text/') ||
  /\.(csv|json|log|md|txt|xml|yaml|yml)$/i.test(file.name);

const fileToAttachment = async (file: File): Promise<AiChatWidgetAttachment> => {
  const id = createMessageId('att');
  if (file.type.startsWith('image/')) {
    return {
      id,
      kind: 'image',
      name: file.name,
      mimeType: file.type || 'image/*',
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
    };
  }

  return {
    id,
    kind: 'file',
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    ...(isTextLikeFile(file)
      ? { textPreview: (await readFileAsText(file)).slice(0, TEXT_PREVIEW_LIMIT) }
      : {}),
  };
};

const parseImageInput = (attachment: AiChatWidgetAttachment) => {
  const dataUrl = attachment.dataUrl || '';
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return null;
  return {
    mimeType: attachment.mimeType || 'image/png',
    base64Data: dataUrl.slice(commaIndex + 1),
  };
};

const isSafeMediaUrl = (value: string): boolean =>
  /^(https?:\/\/|data:image\/|blob:)/i.test(value.trim());

const isLikelyImageUrl = (value: string): boolean => {
  const normalized = value.trim();
  return (
    /^(data:image\/|blob:)/i.test(normalized) ||
    /^https?:\/\/.+\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(normalized)
  );
};

const isSafeLinkUrl = (value: string): boolean =>
  /^(https?:\/\/|mailto:)/i.test(value.trim());

const stripMarkdownForCopy = (content: string): string =>
  content
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1 $2')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();

const trimTrailingUrlPunctuation = (value: string): [string, string] => {
  const match = value.match(/^(.+?)([),.!?;:]*)$/);
  return [match?.[1] || value, match?.[2] || ''];
};

const ChatImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        role="note"
        className="my-2 block rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-[var(--ether-on-surface-variant)]"
      >
        Image unavailable: {alt || 'Chat image'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt || 'Chat image'}
      loading="lazy"
      onError={() => setFailed(true)}
      className="my-2 max-h-56 w-auto max-w-full rounded-2xl border border-[var(--ether-glass-border)] object-contain"
    />
  );
};

const renderInlineRichText = (text: string): React.ReactNode[] => {
  const tokenRe = /(!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\)|`[^`]+`|~~[^~]+~~|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s<]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    const imageMatch = token.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    const linkMatch = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);

    if (imageMatch && isSafeMediaUrl(imageMatch[2])) {
      nodes.push(
        <ChatImage
          key={key}
          src={imageMatch[2]}
          alt={imageMatch[1] || 'Chat image'}
        />,
      );
    } else if (linkMatch && isSafeLinkUrl(linkMatch[2])) {
      nodes.push(
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--ether-primary)] underline decoration-[var(--ether-primary)]/35 underline-offset-2"
        >
          {linkMatch[1]}
        </a>,
      );
    } else if (token.startsWith('http')) {
      const [url, trailing] = trimTrailingUrlPunctuation(token);
      if (isSafeLinkUrl(url)) {
        if (isLikelyImageUrl(url) && isSafeMediaUrl(url)) {
          nodes.push(
            <ChatImage key={key} src={url} alt="Chat image" />,
            trailing,
          );
        } else {
          nodes.push(
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--ether-primary)] underline decoration-[var(--ether-primary)]/35 underline-offset-2"
            >
              {url}
            </a>,
            trailing,
          );
        }
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={key} className="rounded-md bg-[var(--ether-control-bg)] px-1.5 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const isTableBlock = (lines: string[]): boolean =>
  lines.length >= 2 &&
  lines[0].includes('|') &&
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1]);

const splitTableRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const renderTableBlock = (
  lines: string[],
  key: string,
): React.ReactNode => {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).filter((line) => line.includes('|')).map(splitTableRow);
  return (
    <div key={key} className="my-2 max-w-full overflow-auto rounded-2xl border border-[var(--ether-glass-border)]">
      <table className="w-full border-collapse text-left text-[11px]" role="table">
        <thead className="bg-[var(--ether-control-bg)]">
          <tr>
            {header.map((cell, index) => (
              <th key={`${index}-${cell}`} className="border-b border-[var(--ether-glass-border)] px-3 py-2 font-black uppercase tracking-[0.12em]">
                {renderInlineRichText(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('|')}`} className="odd:bg-[var(--ether-surface-container-high)]/35">
              {header.map((_, cellIndex) => (
                <td key={cellIndex} className="border-t border-[var(--ether-glass-border)]/60 px-3 py-2 align-top">
                  {renderInlineRichText(row[cellIndex] || '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface ChatChartPoint {
  label: string;
  value: number;
}

interface ChatChartSpec {
  title: string;
  type: 'bar' | 'line';
  data: ChatChartPoint[];
}

const parseChartPoint = (item: unknown, index: number): ChatChartPoint | null => {
  if (Array.isArray(item)) {
    const value = Number(item[1]);
    return Number.isFinite(value)
      ? { label: String(item[0] || `Item ${index + 1}`), value }
      : null;
  }

  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const rawValue = record.value ?? record.y ?? record.count ?? record.total;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  return {
    label: String(record.label ?? record.name ?? record.x ?? `Item ${index + 1}`),
    value,
  };
};

const parseChartSpec = (code: string): ChatChartSpec | null => {
  try {
    const parsed: unknown = JSON.parse(code.trim());
    const parsedRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const dataSource: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsedRecord.data)
        ? parsedRecord.data
        : [];
    const data = dataSource
      .map(parseChartPoint)
      .filter((point): point is ChatChartPoint => Boolean(point));
    if (data.length === 0) return null;
    const rawType = typeof parsedRecord.type === 'string' ? parsedRecord.type.toLowerCase() : '';
    return {
      title: typeof parsedRecord.title === 'string' && parsedRecord.title.trim() ? parsedRecord.title.trim() : 'Chart',
      type: rawType === 'line' ? 'line' : 'bar',
      data: data.slice(0, 12),
    };
  } catch {
    return null;
  }
};

const renderChartBlock = (spec: ChatChartSpec, key: string): React.ReactNode => {
  const width = 320;
  const height = 180;
  const plotX = 30;
  const plotY = 22;
  const plotWidth = 260;
  const plotHeight = 96;
  const positiveValues = spec.data.map((point) => Math.max(0, point.value));
  const maxValue = Math.max(...positiveValues, 1);
  const barGap = 8;
  const barWidth = Math.max(12, (plotWidth - barGap * (spec.data.length - 1)) / spec.data.length);
  const lineMin = Math.min(...spec.data.map((point) => point.value));
  const lineMax = Math.max(...spec.data.map((point) => point.value));
  const lineRange = Math.max(lineMax - lineMin, 1);
  const linePoints = spec.data.map((point, index) => {
    const x = plotX + (spec.data.length === 1 ? plotWidth / 2 : (index / (spec.data.length - 1)) * plotWidth);
    const y = plotY + plotHeight - ((point.value - lineMin) / lineRange) * plotHeight;
    return { x, y };
  });

  return (
    <div key={key} className="my-2 overflow-hidden rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]/45 p-3">
      <svg
        role="img"
        aria-label={`${spec.title} chart`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-[28rem]"
      >
        <title>{`${spec.title} chart`}</title>
        <text x={plotX} y="14" className="fill-[var(--ether-on-surface)] text-[12px] font-bold">
          {spec.title}
        </text>
        <line
          x1={plotX}
          y1={plotY + plotHeight}
          x2={plotX + plotWidth}
          y2={plotY + plotHeight}
          className="stroke-[var(--ether-glass-border)]"
        />
        {spec.type === 'line' ? (
          <>
            <polyline
              points={linePoints.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="var(--ether-primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {linePoints.map((point, index) => (
              <g key={`${spec.data[index].label}-${index}`}>
                <circle cx={point.x} cy={point.y} r="4" fill="var(--ether-primary)" />
                <text
                  x={point.x}
                  y={point.y - 8}
                  textAnchor="middle"
                  className="fill-[var(--ether-on-surface)] text-[10px] font-bold"
                >
                  {spec.data[index].value}
                </text>
                <text
                  x={point.x}
                  y="158"
                  textAnchor="middle"
                  className="fill-[var(--ether-on-surface-variant)] text-[9px] font-semibold"
                >
                  {spec.data[index].label}
                </text>
              </g>
            ))}
          </>
        ) : (
          spec.data.map((point, index) => {
            const value = Math.max(0, point.value);
            const barHeight = Math.max(4, (value / maxValue) * plotHeight);
            const x = plotX + index * (barWidth + barGap);
            const y = plotY + plotHeight - barHeight;
            return (
              <g key={`${point.label}-${index}`}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="5"
                  fill="var(--ether-primary)"
                  opacity="0.88"
                />
                <text
                  x={x + barWidth / 2}
                  y={Math.max(20, y - 6)}
                  textAnchor="middle"
                  className="fill-[var(--ether-on-surface)] text-[10px] font-bold"
                >
                  {point.value}
                </text>
                <text
                  x={x + barWidth / 2}
                  y="158"
                  textAnchor="middle"
                  className="fill-[var(--ether-on-surface-variant)] text-[9px] font-semibold"
                >
                  {point.label}
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
};

type SanitizedHtmlPreview = {
  html: string;
  css: string;
  scripts: string[];
};

type HtmlPreviewCodeBlock = {
  language: string;
  code: string;
};

const HTML_PREVIEW_BASE_CSS = `
  :root {
    color-scheme: light dark;
    font-family: "Google Sans", "Google Sans Text", "Product Sans", Arial, sans-serif;
  }
  * {
    box-sizing: border-box;
  }
  body {
    min-height: 0;
    margin: 0;
    padding: 16px;
    color: #111827;
    background: #ffffff;
  }
  img, svg, video, canvas {
    max-width: 100%;
    height: auto;
  }
  a {
    color: #2563eb;
  }
  @media (prefers-color-scheme: dark) {
    body {
      color: #f8fafc;
      background: #111827;
    }
  }
`;

const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const HTML_PREVIEW_DEFAULT_HEIGHT = 560;
const HTML_PREVIEW_MAX_HEIGHT = 1200;

const buildHtmlPreviewResizeScript = (previewId: string): string => `
(() => {
  const previewId = ${JSON.stringify(previewId)};
  const postSize = () => {
    const body = document.body;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const margins = window.getComputedStyle(body);
    const marginY = (parseFloat(margins.marginTop) || 0) + (parseFloat(margins.marginBottom) || 0);
    const childRects = Array.from(body.children).map((child) => child.getBoundingClientRect());
    const contentTop = childRects.reduce((top, rect) => Math.min(top, rect.top), bodyRect.top);
    const contentBottom = childRects.reduce((bottom, rect) => Math.max(bottom, rect.bottom), bodyRect.bottom);
    const height = Math.ceil(Math.max(bodyRect.height, contentBottom - contentTop) + marginY);
    parent.postMessage({ type: 'curio-html-preview-size', id: previewId, height }, '*');
  };
  if (document.readyState === 'complete') postSize();
  window.addEventListener('load', postSize);
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    new ResizeObserver(postSize).observe(document.body);
  }
  setTimeout(postSize, 0);
  setTimeout(postSize, 250);
  setTimeout(postSize, 750);
})();
`;

const HTML_PREVIEW_CHART_SHIM = `
(() => {
  const palette = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
  const getCanvas = (target) => target && target.canvas ? target.canvas : target;
  const getSeries = (config) => {
    const data = config && config.data ? config.data : {};
    const labels = Array.isArray(data.labels) ? data.labels : [];
    const datasets = Array.isArray(data.datasets) ? data.datasets : [];
    return { labels, datasets, type: (config && config.type) || 'bar', options: (config && config.options) || {} };
  };
  const pickColor = (value, index, fallback) => {
    if (Array.isArray(value)) return value[index % value.length] || fallback;
    return typeof value === 'string' && value ? value : fallback;
  };
  const setupCanvas = (canvas) => {
    const parentRect = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : null;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.floor((parentRect && parentRect.width) || rect.width || canvas.width || 760);
    const width = Math.max(420, cssWidth);
    const height = Math.max(360, Number(canvas.getAttribute('height')) || Math.floor(rect.height > 220 ? rect.height : 0) || 380);
    const ratio = window.devicePixelRatio || 1;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = height + 'px';
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height, ctx };
  };
  const getScale = (values) => {
    const maxValue = Math.max(1, ...values);
    const roughStep = maxValue / 8;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 6 ? 5 : 10;
    const step = nice * magnitude;
    return { max: Math.ceil(maxValue / step) * step, step };
  };
  const getYAxisTitle = (options) =>
    options && options.scales && options.scales.y && options.scales.y.title && options.scales.y.title.text
      ? String(options.scales.y.title.text)
      : '';
  const drawAxes = (ctx, width, height, plot, scale, yTitle) => {
    ctx.strokeStyle = '#d1d5db';
    ctx.fillStyle = '#4b5563';
    ctx.lineWidth = 1;
    ctx.font = '12px "Google Sans", "Google Sans Text", "Product Sans", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let value = 0; value <= scale.max + scale.step / 2; value += scale.step) {
      const y = plot.bottom - ((plot.bottom - plot.top) * value) / scale.max;
      ctx.globalAlpha = value === 0 ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(String(Math.round(value)), plot.left - 10, y);
    }
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.left, plot.bottom);
    ctx.lineTo(plot.right, plot.bottom);
    ctx.stroke();
    if (yTitle) {
      ctx.save();
      ctx.translate(18, (plot.top + plot.bottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(yTitle, 0, 0);
      ctx.restore();
    }
  };
  const drawXAxisLabels = (ctx, labels, plot) => {
    const groupCount = Math.max(1, labels.length);
    const groupWidth = (plot.right - plot.left) / groupCount;
    ctx.fillStyle = '#4b5563';
    ctx.font = '12px "Google Sans", "Google Sans Text", "Product Sans", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    labels.forEach((label, index) => {
      ctx.save();
      ctx.translate(plot.left + index * groupWidth + groupWidth / 2, plot.bottom + 22);
      ctx.rotate(-Math.PI / 10);
      ctx.fillText(String(label), 0, 0);
      ctx.restore();
    });
  };
  const drawBarChart = (ctx, width, height, labels, datasets, options) => {
    const plot = { left: 68, top: 18, right: width - 18, bottom: height - 84 };
    const values = datasets.flatMap((dataset) => Array.isArray(dataset.data) ? dataset.data.map(Number) : []);
    const scale = getScale(values);
    drawAxes(ctx, width, height, plot, scale, getYAxisTitle(options));
    const groupCount = Math.max(1, labels.length || values.length);
    const groupWidth = (plot.right - plot.left) / groupCount;
    datasets.forEach((dataset, datasetIndex) => {
      const data = Array.isArray(dataset.data) ? dataset.data.map(Number) : [];
      const barWidth = Math.max(8, groupWidth / Math.max(1, datasets.length) * 0.66);
      data.forEach((value, pointIndex) => {
        ctx.fillStyle = pickColor(dataset.backgroundColor, pointIndex, palette[datasetIndex % palette.length]);
        const x = plot.left + pointIndex * groupWidth + datasetIndex * barWidth + groupWidth * 0.17;
        const barHeight = ((plot.bottom - plot.top) * value) / scale.max;
        ctx.fillRect(x, plot.bottom - barHeight, barWidth, barHeight);
      });
    });
    drawXAxisLabels(ctx, labels, plot);
  };
  const drawLineChart = (ctx, width, height, labels, datasets, options) => {
    const plot = { left: 68, top: 18, right: width - 18, bottom: height - 84 };
    const values = datasets.flatMap((dataset) => Array.isArray(dataset.data) ? dataset.data.map(Number) : []);
    const scale = getScale(values);
    drawAxes(ctx, width, height, plot, scale, getYAxisTitle(options));
    datasets.forEach((dataset, datasetIndex) => {
      const data = Array.isArray(dataset.data) ? dataset.data.map(Number) : [];
      ctx.strokeStyle = pickColor(dataset.borderColor || dataset.backgroundColor, datasetIndex, palette[datasetIndex % palette.length]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      data.forEach((value, pointIndex) => {
        const x = plot.left + ((plot.right - plot.left) * pointIndex) / Math.max(1, data.length - 1);
        const y = plot.bottom - ((plot.bottom - plot.top) * value) / scale.max;
        if (pointIndex === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    drawXAxisLabels(ctx, labels, plot);
  };
  const drawPieChart = (ctx, width, height, datasets) => {
    const data = datasets[0] && Array.isArray(datasets[0].data) ? datasets[0].data.map(Number) : [];
    const total = data.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.min(width, height) * 0.33;
    const centerX = width / 2;
    const centerY = height / 2;
    let start = -Math.PI / 2;
    data.forEach((value, index) => {
      const end = start + (Math.PI * 2 * value) / total;
      ctx.fillStyle = pickColor(datasets[0] && datasets[0].backgroundColor, index, palette[index % palette.length]);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, end);
      ctx.closePath();
      ctx.fill();
      start = end;
    });
  };
  class PreviewChart {
    constructor(target, config) {
      this.canvas = getCanvas(target);
      this.config = config || {};
      this.update();
    }
    update() {
      if (!this.canvas) return;
      const { width, height, ctx } = setupCanvas(this.canvas);
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const { labels, datasets, type, options } = getSeries(this.config);
      if (type === 'pie' || type === 'doughnut') drawPieChart(ctx, width, height, datasets);
      else if (type === 'line') drawLineChart(ctx, width, height, labels, datasets, options);
      else drawBarChart(ctx, width, height, labels, datasets, options);
    }
    destroy() {}
  }
  window.Chart = window.Chart || PreviewChart;
})();
`;

const sanitizeCssText = (value: string): string =>
  value
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/@import[^;]*(;|$)/gi, '')
    .replace(/url\s*\([^)]*\)/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/javascript\s*:/gi, '');

const UNSAFE_PREVIEW_SCRIPT_RE =
  /\b(alert|confirm|prompt|fetch|XMLHttpRequest|WebSocket|EventSource|navigator|localStorage|sessionStorage|indexedDB|eval|postMessage)\b|document\s*\.\s*(cookie|write)|(?:window\s*\.)?(?:parent|top|opener|location)\b|import\s*\(/i;

const UNSAFE_PREVIEW_FUNCTION_CONSTRUCTOR_RE = /\b(?:new\s+)?Function\s*\(/;

const stripScriptLiteralsForInspection = (value: string): string =>
  value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, '$1$1');

const sanitizePreviewScript = (value: string): string => {
  const script = value.replace(/<\/script/gi, '<\\/script').trim();
  const inspectionScript = stripScriptLiteralsForInspection(script);
  if (
    !script ||
    UNSAFE_PREVIEW_SCRIPT_RE.test(inspectionScript) ||
    UNSAFE_PREVIEW_FUNCTION_CONSTRUCTOR_RE.test(inspectionScript)
  ) return '';
  return script;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeHtmlPreview = (code: string): SanitizedHtmlPreview => {
  if (typeof DOMParser === 'undefined') {
    return { html: `<pre>${escapeHtml(code)}</pre>`, css: '', scripts: [] };
  }

  const document = new DOMParser().parseFromString(code, 'text/html');
  const scripts: string[] = [];
  document.querySelectorAll('script').forEach((scriptElement) => {
    if (!scriptElement.getAttribute('src')) {
      const sanitizedScript = sanitizePreviewScript(scriptElement.textContent || '');
      if (sanitizedScript) scripts.push(sanitizedScript);
    }
    scriptElement.remove();
  });

  document
    .querySelectorAll('iframe,object,embed,link,meta,base,form,input,textarea,select,option,button')
    .forEach((node) => node.remove());

  const cssBlocks: string[] = [];
  document.querySelectorAll('style').forEach((styleElement) => {
    const sanitizedCss = sanitizeCssText(styleElement.textContent || '').trim();
    if (sanitizedCss) cssBlocks.push(sanitizedCss);
    styleElement.remove();
  });

  document.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attribute.name);
        return;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && !isSafeMediaUrl(value) && !isSafeLinkUrl(value)) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === 'style') {
        const sanitizedStyle = sanitizeCssText(value);
        if (sanitizedStyle.trim()) {
          element.setAttribute(attribute.name, sanitizedStyle);
        } else {
          element.removeAttribute(attribute.name);
        }
      }
    });
  });

  return {
    html: document.body.innerHTML,
    css: cssBlocks.join('\n\n'),
    scripts,
  };
};

const buildHtmlPreviewSrcDoc = (htmlCode: string, cssCode = '', previewId?: string): string => {
  const sanitizedHtml = sanitizeHtmlPreview(htmlCode);
  const sanitizedCss = sanitizeCssText(cssCode);
  const css = [HTML_PREVIEW_BASE_CSS, sanitizedHtml.css, sanitizedCss]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}" />`,
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body>',
    sanitizedHtml.html,
    ...(sanitizedHtml.scripts.length > 0
      ? [
          '<script>',
          HTML_PREVIEW_CHART_SHIM,
          '</script>',
          ...sanitizedHtml.scripts.flatMap((script) => ['<script>', script, '</script>']),
          ...(previewId ? ['<script>', buildHtmlPreviewResizeScript(previewId), '</script>'] : []),
        ]
      : []),
    '</body>',
    '</html>',
  ].join('');
};

const parseCodeFence = (block: string): { language: string; code: string } => {
  const match = block.match(/^```([^\n`]*)\n?([\s\S]*?)```$/);
  return {
    language: (match?.[1] || '').trim().toLowerCase(),
    code: (match?.[2] || '').replace(/\n$/, ''),
  };
};

const normalizeCodeLanguage = (language: string): string =>
  language.trim().toLowerCase().replace(/^\./, '');

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  '': 'Code',
  bash: 'Shell',
  css: 'CSS',
  html: 'HTML',
  htm: 'HTML',
  'html-css': 'HTML',
  javascript: 'JavaScript',
  js: 'JavaScript',
  jsx: 'JSX',
  json: 'JSON',
  markdown: 'Markdown',
  md: 'Markdown',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  py: 'Python',
  python: 'Python',
  shell: 'Shell',
  sh: 'Shell',
  sql: 'SQL',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  yaml: 'YAML',
  yml: 'YAML',
};

const CODE_DOWNLOAD_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  css: 'css',
  html: 'html',
  htm: 'html',
  'html-css': 'html',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  json: 'json',
  markdown: 'md',
  md: 'md',
  powershell: 'ps1',
  preview: 'html',
  ps1: 'ps1',
  py: 'py',
  python: 'py',
  shell: 'sh',
  sh: 'sh',
  sql: 'sql',
  ts: 'ts',
  tsx: 'tsx',
  typescript: 'ts',
  yaml: 'yaml',
  yml: 'yml',
};

const getCodeLanguageLabel = (language: string): string => {
  const normalized = normalizeCodeLanguage(language);
  return CODE_LANGUAGE_LABELS[normalized] || normalized.toUpperCase() || 'Code';
};

const getCodeDownloadExtension = (language: string): string =>
  CODE_DOWNLOAD_EXTENSIONS[normalizeCodeLanguage(language)] || 'txt';

const getCodeDownloadMimeType = (language: string): string => {
  const normalized = normalizeCodeLanguage(language);
  if (isHtmlPreviewLanguage(normalized)) return 'text/html;charset=utf-8';
  if (normalized === 'css') return 'text/css;charset=utf-8';
  if (normalized === 'json') return 'application/json;charset=utf-8';
  if (normalized === 'markdown' || normalized === 'md') return 'text/markdown;charset=utf-8';
  return 'text/plain;charset=utf-8';
};

const downloadCodeSnippet = (code: string, language: string): void => {
  const extension = getCodeDownloadExtension(language);
  const blob = new Blob([code], { type: getCodeDownloadMimeType(language) });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `curio-chat-snippet.${extension}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const isHtmlPreviewLanguage = (language: string): boolean =>
  ['html', 'htm', 'html-css', 'preview'].includes(language);

const isCssPreviewLanguage = (language: string): boolean =>
  ['css', 'scss', 'sass'].includes(language);

const ChatCodeBlock: React.FC<{
  code: string;
  language?: string;
}> = ({ code, language = '' }) => {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = normalizeCodeLanguage(language);
  const languageLabel = getCodeLanguageLabel(normalizedLanguage);
  const lineCount = Math.max(1, code.split('\n').length);
  const canDownloadHtml = isHtmlPreviewLanguage(normalizedLanguage);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    downloadCodeSnippet(code, normalizedLanguage || 'txt');
  }, [code, normalizedLanguage]);

  return (
    <div
      className="my-2 overflow-hidden rounded-2xl border border-[var(--ether-glass-border)] bg-slate-950 text-slate-100 shadow-inner shadow-black/20"
      data-testid="chat-code-block"
    >
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
            {languageLabel}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-slate-500">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label={`Copy ${languageLabel} code snippet`}
            title={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {canDownloadHtml && (
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Download HTML code snippet"
              title="Download HTML"
            >
              <Download size={14} />
            </button>
          )}
        </div>
      </div>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-5 text-slate-100 [tab-size:2]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const renderCodePre = (code: string, key: string, language = ''): React.ReactNode => (
  <ChatCodeBlock key={key} code={code} language={language} />
);

const ChatHtmlPreview: React.FC<{
  htmlCode: string;
  cssCode?: string;
  codeBlocks: HtmlPreviewCodeBlock[];
}> = ({ htmlCode, cssCode = '', codeBlocks }) => {
  const previewIdRef = useRef(`chat-html-preview-${Math.random().toString(36).slice(2)}`);
  const previewId = previewIdRef.current;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState(HTML_PREVIEW_DEFAULT_HEIGHT);
  const srcDoc = useMemo(() => buildHtmlPreviewSrcDoc(htmlCode, cssCode, previewId), [cssCode, htmlCode, previewId]);

  useEffect(() => {
    setPreviewHeight(HTML_PREVIEW_DEFAULT_HEIGHT);
  }, [srcDoc]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string; height?: unknown } | null;
      if (!data || data.type !== 'curio-html-preview-size' || data.id !== previewId) return;
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) return;
      const nextHeight = Math.ceil(Number(data.height));
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setPreviewHeight(Math.min(HTML_PREVIEW_MAX_HEIGHT, Math.max(HTML_PREVIEW_DEFAULT_HEIGHT, nextHeight + 16)));
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [previewId]);

  return (
    <div className="my-2 space-y-2">
      <iframe
        ref={iframeRef}
        data-testid="chat-html-preview"
        title="Rendered HTML and CSS preview"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{ height: `${previewHeight}px` }}
        className="w-full overflow-hidden rounded-2xl border border-[var(--ether-glass-border)] bg-white shadow-inner shadow-black/5 dark:bg-slate-950"
      />
      {codeBlocks.map((block, index) => (
        renderCodePre(block.code, `code-${block.language || 'plain'}-${index}`, block.language)
      ))}
    </div>
  );
};

const renderCodeBlock = (block: string, key: string): React.ReactNode => {
  const { language, code } = parseCodeFence(block);
  const chartSpec = (language.includes('chart') || language === 'json') ? parseChartSpec(code) : null;
  if (chartSpec) return renderChartBlock(chartSpec, `chart-${key}`);

  if (isHtmlPreviewLanguage(language)) {
    return <ChatHtmlPreview key={`html-${key}`} htmlCode={code} codeBlocks={[{ language, code }]} />;
  }

  return renderCodePre(code, `code-${key}`, language);
};

const isHorizontalRuleLine = (line: string): boolean =>
  /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);

const getHeadingMatch = (line: string): RegExpMatchArray | null =>
  line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);

const renderParagraphBlock = (
  lines: string[],
  key: string,
  textSize: DashboardAiChatTextSize,
): React.ReactNode => (
  <p
    key={key}
    className={`${AI_CHAT_TEXT_SIZE_CLASSES[textSize].body} whitespace-pre-wrap`}
  >
    {renderInlineRichText(lines.join('\n').trim())}
  </p>
);

const renderHeadingBlock = (
  line: string,
  key: string,
  textSize: DashboardAiChatTextSize,
): React.ReactNode => {
  const headingMatch = getHeadingMatch(line);
  if (!headingMatch) return renderParagraphBlock([line], key, textSize);
  const level = headingMatch[1].length;
  return (
    <div
      key={key}
      className={`${level <= 2 ? AI_CHAT_TEXT_SIZE_CLASSES[textSize].headingPrimary : AI_CHAT_TEXT_SIZE_CLASSES[textSize].headingSecondary} mb-1 mt-2 font-black uppercase tracking-[0.12em]`}
    >
      {renderInlineRichText(headingMatch[2])}
    </div>
  );
};

const renderQuoteBlock = (
  lines: string[],
  key: string,
  textSize: DashboardAiChatTextSize,
): React.ReactNode => (
  <blockquote
    key={key}
    className={`my-2 border-l-2 border-[var(--ether-primary)]/55 pl-3 ${AI_CHAT_TEXT_SIZE_CLASSES[textSize].quote} italic text-[var(--ether-on-surface-variant)]`}
  >
    {lines.map((line, lineIndex) => (
      <p key={`${lineIndex}-${line}`}>
        {renderInlineRichText(line.replace(/^\s*>\s?/, ''))}
      </p>
    ))}
  </blockquote>
);

const renderUnorderedListBlock = (
  lines: string[],
  key: string,
  textSize: DashboardAiChatTextSize,
): React.ReactNode => (
  <ul key={key} className={`my-2 list-disc space-y-1 pl-4 ${AI_CHAT_TEXT_SIZE_CLASSES[textSize].list}`}>
    {lines.map((line, lineIndex) => (
      <li key={`${lineIndex}-${line}`}>
        {renderInlineRichText(line.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?/, ''))}
      </li>
    ))}
  </ul>
);

const renderOrderedListBlock = (
  lines: string[],
  key: string,
  textSize: DashboardAiChatTextSize,
): React.ReactNode => (
  <ol key={key} className={`my-2 list-decimal space-y-1 pl-4 ${AI_CHAT_TEXT_SIZE_CLASSES[textSize].list}`}>
    {lines.map((line, lineIndex) => (
      <li key={`${lineIndex}-${line}`}>
        {renderInlineRichText(line.replace(/^\s*\d+\.\s+/, ''))}
      </li>
    ))}
  </ol>
);

const renderMarkdownLineBlocks = (
  lines: string[],
  keyBase: string,
  textSize: DashboardAiChatTextSize,
): React.ReactNode[] => {
  const elements: React.ReactNode[] = [];
  let paragraphLines: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    if (paragraphLines.some((line) => line.trim())) {
      elements.push(renderParagraphBlock(paragraphLines, `${keyBase}-p-${elements.length}`, textSize));
    }
    paragraphLines = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && isTableBlock([line, lines[index + 1]])) {
      flushParagraph();
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      elements.push(renderTableBlock(tableLines, `${keyBase}-table-${elements.length}`));
      continue;
    }

    if (getHeadingMatch(line)) {
      flushParagraph();
      elements.push(renderHeadingBlock(line, `${keyBase}-heading-${elements.length}`, textSize));
      index += 1;
      continue;
    }

    if (isHorizontalRuleLine(line)) {
      flushParagraph();
      elements.push(
        <hr
          key={`${keyBase}-hr-${elements.length}`}
          className="my-2 border-0 border-t border-[var(--ether-glass-border)]"
        />,
      );
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      elements.push(renderQuoteBlock(quoteLines, `${keyBase}-quote-${elements.length}`, textSize));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph();
      const listLines: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      elements.push(renderUnorderedListBlock(listLines, `${keyBase}-list-${elements.length}`, textSize));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const listLines: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      elements.push(renderOrderedListBlock(listLines, `${keyBase}-ordered-${elements.length}`, textSize));
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph();
  return elements;
};

const ChatRichText: React.FC<{
  content: string;
  textSize: DashboardAiChatTextSize;
}> = ({ content, textSize }) => {
  const blocks = content.replace(/\r\n?/g, '\n').split(/(```[\s\S]*?```)/g);
  const elements: React.ReactNode[] = [];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (!block) continue;
    if (block.startsWith('```') && block.endsWith('```')) {
      const parsed = parseCodeFence(block);

      if (isHtmlPreviewLanguage(parsed.language)) {
        const cssBlocks: HtmlPreviewCodeBlock[] = [];
        let cursor = blockIndex + 1;
        while (cursor < blocks.length) {
          const separator = blocks[cursor] || '';
          if (separator.trim()) break;

          const nextBlock = blocks[cursor + 1];
          if (!nextBlock || !nextBlock.startsWith('```') || !nextBlock.endsWith('```')) break;

          const nextParsed = parseCodeFence(nextBlock);
          if (!isCssPreviewLanguage(nextParsed.language)) break;

          cssBlocks.push(nextParsed);
          cursor += 2;
        }

        if (cssBlocks.length > 0) {
          elements.push(
            <ChatHtmlPreview
              key={`html-${blockIndex}`}
              htmlCode={parsed.code}
              cssCode={cssBlocks.map((cssBlock) => cssBlock.code).join('\n\n')}
              codeBlocks={[parsed, ...cssBlocks]}
            />,
          );
          blockIndex = cursor - 1;
          continue;
        }
      }

      if (isCssPreviewLanguage(parsed.language)) {
        let cursor = blockIndex + 1;
        while (cursor < blocks.length && !(blocks[cursor] || '').trim()) {
          const nextBlock = blocks[cursor + 1];
          if (!nextBlock || !nextBlock.startsWith('```') || !nextBlock.endsWith('```')) break;

          const nextParsed = parseCodeFence(nextBlock);
          if (!isHtmlPreviewLanguage(nextParsed.language)) break;

          elements.push(
            <ChatHtmlPreview
              key={`html-${blockIndex}`}
              htmlCode={nextParsed.code}
              cssCode={parsed.code}
              codeBlocks={[nextParsed, parsed]}
            />,
          );
          blockIndex = cursor + 1;
          cursor = blocks.length;
        }

        if (cursor >= blocks.length) continue;
      }

      elements.push(renderCodeBlock(block, `${blockIndex}`));
      continue;
    }

    const trimmed = block.trim();
    if (!trimmed) continue;
    elements.push(...renderMarkdownLineBlocks(trimmed.split('\n'), `text-${blockIndex}`, textSize));
  }

  return <>{elements}</>;
};

const AttachmentPill: React.FC<{
  attachment: AiChatWidgetAttachment;
  onRemove?: () => void;
}> = ({ attachment, onRemove }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-1.5">
    {attachment.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
    <span className="min-w-0 truncate text-[10px] font-semibold">
      {attachment.name}
    </span>
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[var(--ether-control-hover)]"
        aria-label={`Remove ${attachment.name}`}
      >
        <X size={12} />
      </button>
    )}
  </div>
);

const ChatPicker: React.FC<{
  label: string;
  value: string;
  options: ChatPickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  buttonClassName?: string;
}> = ({ label, value, options, onChange, placeholder, buttonClassName = '' }) => {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  return (
    <div ref={pickerRef} className="relative z-[70]">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className={`flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2 text-left text-[10px] font-bold text-[var(--ether-on-surface)] shadow-sm outline-none transition hover:bg-[var(--ether-control-hover)] focus:border-[var(--ether-primary)]/50 ${buttonClassName}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label || value || placeholder}
        </span>
        <ChevronDown size={12} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          className="absolute right-0 top-8 z-[80] max-h-60 w-60 overflow-y-auto rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-1.5 text-[var(--ether-on-surface)] shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[10px] font-semibold text-[var(--ether-on-surface-variant)]">
              No options available
            </div>
          ) : options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-label={option.label}
                aria-selected={active}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full min-w-0 flex-col rounded-xl px-3 py-2 text-left transition ${
                  active
                    ? 'bg-[var(--ether-primary)]/18 text-[var(--ether-on-surface)] ring-1 ring-[var(--ether-primary)]/30'
                    : 'text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]'
                }`}
              >
                <span className="truncate text-[11px] font-black">
                  {option.label}
                </span>
                {option.description && (
                  <span className="mt-0.5 line-clamp-2 text-[9px] font-semibold leading-4 opacity-70">
                    {option.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MessageBubble: React.FC<{
  message: AiChatWidgetMessage;
  compact: boolean;
  textSize: DashboardAiChatTextSize;
  showTimestamp: boolean;
  onDelete: () => void;
  onCopy: () => void;
  copied: boolean;
}> = ({ message, compact, textSize, showTimestamp, onDelete, onCopy, copied }) => {
  const assistant = message.role === 'assistant';
  const [copyControlVisible, setCopyControlVisible] = useState(false);
  const copyVisible = copied || copyControlVisible;
  const density = compact ? 'compact' : 'comfortable';
  const rowGapClass = compact ? 'gap-1.5' : 'gap-2';
  const rowInsetClass = assistant
    ? (compact ? 'pr-3' : 'pr-5')
    : (compact ? 'flex-row-reverse pl-3' : 'flex-row-reverse pl-5');
  const avatarClass = compact ? 'mt-0.5 h-6 w-6' : 'mt-1 h-7 w-7';
  const avatarIconSize = compact ? 12 : 14;
  const bubblePaddingClass = compact ? 'rounded-[1rem] px-2.5 py-1.5' : 'rounded-[1.2rem] px-3 py-2';
  const copyButtonClass = compact ? 'right-1.5 top-1.5 h-6 w-6' : 'right-2 top-2 h-7 w-7';
  const contentInsetClass = assistant ? (compact ? 'pr-7' : 'pr-8') : '';
  const timestampClass = compact ? 'mt-0.5 gap-1.5 text-[8px]' : 'mt-1 gap-2 text-[9px]';
  const textSizeClass = AI_CHAT_TEXT_SIZE_CLASSES[textSize].body;
  const revealCopyControl = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!assistant) return;
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      setCopyControlVisible(true);
    }
  };

  return (
    <div
      className={`group/message flex ${rowGapClass} ${rowInsetClass}`}
      data-ai-chat-density={density}
      data-ai-chat-text-size={textSize}
    >
      <div
        className={`${avatarClass} flex shrink-0 items-center justify-center rounded-full ${
          assistant
            ? 'bg-[var(--ether-primary)]/14 text-[var(--ether-primary)]'
            : 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]'
        }`}
      >
        {assistant ? <Bot size={avatarIconSize} /> : <User size={avatarIconSize} />}
      </div>
      <div className={`min-w-0 flex-1 ${assistant ? '' : 'text-right'}`}>
        <div
          className={`relative inline-block max-w-full border text-left ${bubblePaddingClass} ${
            assistant
              ? 'rounded-tl-md border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]/72'
              : 'rounded-tr-md border-[var(--ether-primary)]/25 bg-[var(--ether-primary)]/14'
          }`}
        >
          {assistant && (
            <button
              type="button"
              onClick={onCopy}
              className={`absolute z-10 flex ${copyButtonClass} items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] shadow-sm backdrop-blur-md transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)] focus-visible:pointer-events-auto focus-visible:opacity-100 ${
                copyVisible
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100'
              }`}
              aria-label="Copy assistant message"
            >
              {copied ? <Check size={compact ? 11 : 12} /> : <Copy size={compact ? 11 : 12} />}
            </button>
          )}
          <div
            className={`select-text ${textSizeClass} ${contentInsetClass}`}
            data-testid={assistant ? 'assistant-message-content' : undefined}
            onPointerUp={revealCopyControl}
          >
            <ChatRichText content={message.content} textSize={textSize} />
          </div>
          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Message attachments">
              {message.attachments.map((attachment) => (
                <AttachmentPill key={attachment.id} attachment={attachment} />
              ))}
            </div>
          )}
        </div>
        <div className={`flex items-center ${timestampClass} text-[var(--ether-on-surface-variant)]/60 ${assistant ? '' : 'justify-end'}`}>
          {showTimestamp && <span>{formatTimestamp(message.createdAt)}</span>}
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 transition hover:text-rose-500 group-hover:opacity-100 focus:opacity-100"
            aria-label={`Delete ${message.role} message`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

const AiChatWidget: React.FC<{ widget: DashboardWidget; focused?: boolean }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const historyLimit = getHistoryLimit(widget);
  const compact = widget.config.aiChatDensity
    ? widget.config.aiChatDensity === 'compact'
    : size.pixelHeight < 420;
  const bubbleTextSize = getAiChatTextSize(widget.config.aiChatTextSize, compact);
  const showTimestamps = widget.config.aiChatShowTimestamps !== false;
  const uploadsEnabled = widget.config.aiChatAllowUploads !== false;
  const voiceEnabled = widget.config.aiChatVoiceInput !== false;
  const toolUseEnabled = widget.config.aiChatToolUse !== false;
  const cardManager = useContext(CardManagerContext);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dictationRef = useRef<DictationHandle | null>(null);

  const [messages, setMessages] = useState<AiChatWidgetMessage[]>(() =>
    getAiChatWidgetHistory(widget.id),
  );
  const [conversations, setConversations] = useState<AiChatWidgetConversation[]>(() =>
    getAiChatWidgetConversations(widget.id),
  );
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(() =>
    getAiChatWidgetActiveConversationId(widget.id),
  );
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AiChatWidgetAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentProviderValue, setCurrentProviderValue] = useState<TextLLMProviderOptionId>(() =>
    getCurrentProviderOptionValue(),
  );
  const [currentModel, setCurrentModel] = useState(() => getCustomLLMModel());
  const [modelOptions, setModelOptions] = useState<string[]>(() => [getCustomLLMModel()].filter(Boolean));
  const [modelsLoading, setModelsLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState({
    label: 'Checking',
    images: false,
    ready: false,
  });

  useEffect(() => {
    const syncHistory = (event: Event) => {
      const detail = (event as CustomEvent<{ widgetId?: string }>).detail;
      if (!detail?.widgetId || detail.widgetId === widget.id) {
        setMessages(getAiChatWidgetHistory(widget.id));
        setConversations(getAiChatWidgetConversations(widget.id));
        setActiveConversationIdState(getAiChatWidgetActiveConversationId(widget.id));
      }
    };
    window.addEventListener('curio:ai-chat-history-changed', syncHistory);
    return () => window.removeEventListener('curio:ai-chat-history-changed', syncHistory);
  }, [widget.id]);

  useEffect(() => {
    let cancelled = false;
    const loadProviderStatus = async () => {
      const providerOption = resolveTextLLMProviderOption(currentProviderValue);
      try {
        const config = await getConfiguredCustomLLMProviderConfig();
        if (!hasConfiguredCustomLLMCredential(config)) {
          if (!cancelled) {
            setProviderStatus({ label: 'Configure Text LLM', images: false, ready: false });
          }
          return;
        }
        const provider = await createConfiguredCustomLLMProvider();
        if (!cancelled) {
          setProviderStatus({
            label: `${providerOption.label} - ${config.model}`,
            images: typeof provider.generateVisionText === 'function',
            ready: true,
          });
        }
      } catch {
        if (!cancelled) {
          setProviderStatus({ label: 'Text LLM unavailable', images: false, ready: false });
        }
      }
    };
    void loadProviderStatus();
    return () => {
      cancelled = true;
    };
  }, [currentModel, currentProviderValue]);

  useEffect(() => () => {
    dictationRef.current?.abort();
    dictationRef.current = null;
  }, []);

  const loadModelOptions = useCallback(async (providerValue: TextLLMProviderOptionId = currentProviderValue) => {
    const providerOption = resolveTextLLMProviderOption(providerValue);
    const providerType = providerOption.providerType;
    const selectedModel = getStoredModelForProviderOption(providerValue);
    setCurrentModel(selectedModel);
    setModelsLoading(true);
    try {
      let options: string[] = [];

      if (providerType === 'gemini') {
        options = GEMINI_TEXT_MODELS.map((model) => model.id);
      } else if (providerType === 'openai') {
        const preset = getOpenAICompatibleProviderPreset(providerOption.presetId);
        options = [...preset.modelOptions];
        const baseUrl = getBaseUrlForProviderOption(providerValue);
        if (baseUrl.trim()) {
          try {
            const { fetchAvailableModels } = await import('../../../services/ai/llmProvider');
            const fetched = await fetchAvailableModels(
              baseUrl,
              'openai',
              await getOpenaiApiKeyAsync(preset.id, selectedModel, baseUrl),
            );
            options = [...options, ...fetched];
          } catch {
            // Preset models remain usable when the provider does not expose /models.
          }
        }
      } else {
        const baseUrl = getBaseUrlForProviderOption(providerValue);
        if (baseUrl.trim()) {
          try {
            const { fetchAvailableModels } = await import('../../../services/ai/llmProvider');
            options = await fetchAvailableModels(baseUrl, 'ollama', '');
          } catch {
            options = [];
          }
        }
      }

      setModelOptions(Array.from(new Set([selectedModel, ...options].filter(Boolean))));
    } finally {
      setModelsLoading(false);
    }
  }, [currentProviderValue]);

  useEffect(() => {
    void loadModelOptions();
  }, [loadModelOptions]);

  const title = widget.config.aiChatTitle?.trim() || 'AI Chat';
  const providerOptions = useMemo<ChatPickerOption[]>(() =>
    TEXT_LLM_PROVIDER_OPTIONS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      description: provider.description,
    })),
  []);
  const modelPickerOptions = useMemo<ChatPickerOption[]>(() => {
    const geminiById = new Map(GEMINI_TEXT_MODELS.map((model) => [model.id, model]));
    return modelOptions.map((model) => {
      const gemini = geminiById.get(model);
      return {
        id: model,
        label: model,
        description: gemini?.name,
      };
    });
  }, [modelOptions]);
  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    return conversations.reduce<Array<{ conversation: AiChatWidgetConversation; preview: string }>>((items, conversation) => {
      if (!query || getConversationSearchText(conversation).includes(query)) {
        items.push({
          conversation,
          preview: getConversationSearchPreview(conversation, query),
        });
      }
      return items;
    }, []);
  }, [conversations, conversationSearch]);
  const hasConversationSearch = conversationSearch.trim().length > 0;

  const persistMessages = useCallback((nextMessages: AiChatWidgetMessage[]) => {
    const saved = saveAiChatWidgetHistory(widget.id, nextMessages, historyLimit);
    setMessages(saved);
    setConversations(getAiChatWidgetConversations(widget.id));
    setActiveConversationIdState(getAiChatWidgetActiveConversationId(widget.id));
    return saved;
  }, [historyLimit, widget.id]);

  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessages(deleteAiChatWidgetMessage(widget.id, messageId));
  }, [widget.id]);

  const handleClearHistory = useCallback(() => {
    clearAiChatWidgetHistory(widget.id);
    setMessages([]);
    setConversations(getAiChatWidgetConversations(widget.id));
    setActiveConversationIdState(getAiChatWidgetActiveConversationId(widget.id));
  }, [widget.id]);

  const handleNewConversation = useCallback(() => {
    const conversation = createAiChatWidgetConversation(widget.id, {
      title: 'New chat',
      messages: [],
    });
    setActiveConversationIdState(conversation.id);
    setConversations(getAiChatWidgetConversations(widget.id));
    setMessages([]);
    setConversationSearch('');
    setHistoryOpen(false);
  }, [widget.id]);

  const handleOpenConversation = useCallback((conversationId: string) => {
    const selected = setAiChatWidgetActiveConversationId(widget.id, conversationId);
    if (!selected) return;
    setActiveConversationIdState(selected.id);
    setConversations(getAiChatWidgetConversations(widget.id));
    setMessages(selected.messages);
    setConversationSearch('');
    setHistoryOpen(false);
  }, [widget.id]);

  const handleDeleteConversation = useCallback((conversationId: string) => {
    const next = deleteAiChatWidgetConversation(widget.id, conversationId);
    setConversations(next);
    setActiveConversationIdState(getAiChatWidgetActiveConversationId(widget.id));
    setMessages(getAiChatWidgetHistory(widget.id));
  }, [widget.id]);

  const handleCopyMessage = useCallback(async (message: AiChatWidgetMessage) => {
    try {
      await navigator.clipboard?.writeText(stripMarkdownForCopy(message.content));
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1200);
    } catch {
      setError('Unable to copy this response.');
    }
  }, []);

  const handleProviderChange = useCallback((providerValue: string) => {
    const nextProviderValue = providerValue as TextLLMProviderOptionId;
    const providerOption = resolveTextLLMProviderOption(nextProviderValue);
    let nextModel = getStoredModelForProviderOption(nextProviderValue);

    setCustomLLMProviderType(providerOption.providerType);
    if (providerOption.providerType === 'openai' && providerOption.presetId) {
      const preset = getOpenAICompatibleProviderPreset(providerOption.presetId);
      const currentOpenAIBaseUrl = getOpenAIBaseUrl();
      setOpenAICompatibleProviderPresetId(providerOption.presetId);
      if (preset.baseUrl) {
        setOpenAIBaseUrl(preset.baseUrl);
      } else if (getFixedOpenAIBaseUrlIsSelected(currentOpenAIBaseUrl)) {
        setOpenAIBaseUrl('');
      }
      nextModel = preset.modelOptions.includes(nextModel) || preset.modelOptions.length === 0
        ? nextModel
        : preset.defaultModel || preset.modelOptions[0] || nextModel;
    }

    if (nextModel) {
      setCustomLLMModel(nextModel);
    }

    setCurrentProviderValue(nextProviderValue);
    setCurrentModel(nextModel);
    setModelOptions(Array.from(new Set([
      nextModel,
      ...getStaticModelOptionsForProviderOption(nextProviderValue),
    ].filter(Boolean))));
    setProviderStatus((current) => ({
      ...current,
      label: nextModel ? `${providerOption.label} - ${nextModel}` : providerOption.label,
    }));
    void loadModelOptions(nextProviderValue);
  }, [loadModelOptions]);

  const handleModelChange = useCallback((model: string) => {
    setCustomLLMModel(model);
    setCurrentModel(model);
    setModelOptions((current) => Array.from(new Set([model, ...current].filter(Boolean))));
    setProviderStatus((current) => ({
      ...current,
      label: `${resolveTextLLMProviderOption(currentProviderValue).label} - ${model}`,
    }));
  }, [currentProviderValue]);

  const removePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleAttachmentSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    const attachments = await Promise.all(files.map(fileToAttachment));
    setPendingAttachments((current) => [...current, ...attachments].slice(0, 8));
  };

  const stopDictation = useCallback(() => {
    dictationRef.current?.abort();
    dictationRef.current = null;
    setDictating(false);
    setInterimText('');
  }, []);

  const toggleDictation = useCallback(() => {
    if (dictating) {
      stopDictation();
      return;
    }
    if (!isWebSpeechSupported()) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    const handle = startDictation({
      onStart: () => {
        setError(null);
        setDictating(true);
      },
      onInterim: setInterimText,
      onFinal: (text) => {
        setDraft((current) => [current, text].filter(Boolean).join(current.trim() ? ' ' : ''));
        setInterimText('');
      },
      onError: (message) => {
        if (message !== 'no-speech') setError(message);
        setDictating(false);
      },
      onEnd: () => {
        setDictating(false);
        setInterimText('');
      },
    });
    dictationRef.current = handle;
  }, [dictating, stopDictation]);

  const handleSend = async () => {
    const prompt = draft.trim();
    if ((!prompt && pendingAttachments.length === 0) || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    setPendingAttachments([]);

    const userContent = prompt || 'Please review the attached files.';
    const userMessage: AiChatWidgetMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: userContent,
      createdAt: Date.now(),
      attachments: pendingAttachments,
    };
    const savedWithUser = appendAiChatWidgetMessages(widget.id, [userMessage], historyLimit);
    setMessages(savedWithUser);
    setConversations(getAiChatWidgetConversations(widget.id));
    setActiveConversationIdState(getAiChatWidgetActiveConversationId(widget.id));

    try {
      const config = await getConfiguredCustomLLMProviderConfig();
      if (!hasConfiguredCustomLLMCredential(config)) {
        throw new Error('Add a Text LLM provider in Settings > Voice & AI.');
      }

      const provider = await createConfiguredCustomLLMProvider();
      const providerHasNativeSearch = customLLMProviderConfigHasNativeSearch(config);
      const imageAttachment = pendingAttachments.find((attachment) => attachment.kind === 'image' && attachment.dataUrl);
      const imageInput = imageAttachment ? parseImageInput(imageAttachment) : null;
      const llmPrompt = buildPrompt(userContent, savedWithUser.slice(0, -1), pendingAttachments);
      const systemPrompt = buildSystemPrompt(widget);
      const shouldUseVision = Boolean(imageInput && provider.generateVisionText);

      let response: string;
      if (toolUseEnabled && !shouldUseVision) {
        const [{ runLLMToolAgent }, { buildCustomLLMToolDefinitions }] = await Promise.all([
          import('../../../services/ai/llmToolAgent'),
          import('../../../services/ai/toolSchema'),
        ]);
        let mcpTools: import('@google/genai').FunctionDeclaration[] = [];
        let onMcpToolCall: ((name: string, args: any) => Promise<any>) | undefined;
        let entityCache: any[] = [];
        let homeAssistantToolCount = 0;
        let genericMcpSession: import('../../../services/genericMcpService').PreparedGenericMcpTools | null = null;
        let haToolCall: ((name: string, args: any) => Promise<any>) | undefined;

        try {
          const { getHaPreparedSession } = await import('../../../services/haMcpService');
          const prepared = await getHaPreparedSession();
          if (prepared) {
            mcpTools = prepared.tools;
            entityCache = prepared.entities;
            homeAssistantToolCount = prepared.tools.length;
            haToolCall = async (name, args) => prepared.client.callTool(name, args);
          }
        } catch (haError) {
          console.warn('[AiChatWidget] Failed to prepare Home Assistant tools:', haError);
        }

        try {
          const {
            filterPreparedGenericMcpToolsForSearchCapability,
            prepareGenericMcpTools,
          } = await import('../../../services/genericMcpService');
          genericMcpSession = filterPreparedGenericMcpToolsForSearchCapability(
            await prepareGenericMcpTools(),
            { allowSearchTools: !providerHasNativeSearch },
          );
          if (genericMcpSession.tools.length > 0) {
            mcpTools = [...mcpTools, ...genericMcpSession.tools];
          }
        } catch (mcpError) {
          console.warn('[AiChatWidget] Failed to prepare external MCP tools:', mcpError);
        }

        if (haToolCall || genericMcpSession?.tools.length) {
          onMcpToolCall = async (name, args) => {
            if (name.startsWith('homeassistant__') && haToolCall) {
              return haToolCall(name, args);
            }
            if (genericMcpSession?.bindings.has(name)) {
              return genericMcpSession.callTool(name, args);
            }
            throw new Error(`No MCP client available to handle tool: ${name}`);
          };
        }

        const toolDefinitions = buildCustomLLMToolDefinitions(mcpTools, {
          homeAssistant: homeAssistantToolCount > 0,
        });
        response = await runLLMToolAgent({
          provider,
          prompt: imageInput
            ? `${llmPrompt}\n\nNote: the current tool-enabled request cannot pass image bytes. Use attachment names and available file text.`
            : llmPrompt,
          systemPrompt: buildToolSystemPrompt(widget, toolDefinitions.length, genericMcpSession?.instructionSuffix || ''),
          temperature: 0.5,
          persistSystemPromptInSession: false,
          maxSessionMessages: 12,
          toolDefinitions,
          context: {
            onCardEvent: cardManager?.enabled ? cardManager.emitCardEvent : undefined,
            entityCache,
            handler: {
              get_weather: async (city?: string) => {
                const requestedCity = city?.trim() || getWeatherCity().trim();
                if (!requestedCity) {
                  return { success: false, error: 'No weather city is configured.' };
                }
                const { getUnifiedWeather } = await import('../../../services/weatherService');
                const { weather, aqi } = await getUnifiedWeather(requestedCity, false, true);
                return {
                  success: Boolean(weather),
                  city: weather?.city || requestedCity,
                  tempUnit: getTempUnit() === 'C' ? 'C' : 'F',
                  weather,
                  aqi,
                  timestamp: new Date().toISOString(),
                };
              },
            },
            onMcpToolCall,
            disconnect: () => {},
            startHaCameraStream: async () => {},
            stopHaCameraStream: () => {},
            isHaCameraStreaming: false,
          },
        });
      } else if (imageInput && provider.generateVisionText) {
        response = await provider.generateVisionText({
            prompt: llmPrompt,
            systemPrompt,
            image: imageInput,
            temperature: 0.5,
          });
      } else {
        response = await provider.generateText({
            prompt: imageInput
              ? `${llmPrompt}\n\nNote: the current provider could not accept the image bytes in this widget request. Respond using the attachment names and available text.`
              : llmPrompt,
            systemPrompt,
            temperature: 0.5,
            stream: false,
          });
      }

      const assistantMessage: AiChatWidgetMessage = {
        id: createMessageId('assistant'),
        role: 'assistant',
        content: response || 'I did not receive a response from the model.',
        createdAt: Date.now(),
        attachments: [],
      };
      persistMessages([...savedWithUser, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The chat request failed.';
      setError(message);
      persistMessages([
        ...savedWithUser,
        {
          id: createMessageId('assistant'),
          role: 'assistant',
          content: `I could not complete that request. ${message}`,
          createdAt: Date.now(),
          attachments: [],
        },
      ]);
    } finally {
      setSending(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const emptyState = useMemo(() => (
    <WidgetEmptyState
      icon={<Sparkles size={22} />}
      title="Start a chat"
      description={providerStatus.ready ? providerStatus.label : 'Configure a Text LLM'}
      className="border-transparent bg-transparent px-5"
    />
  ), [providerStatus.label, providerStatus.ready]);

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="indigo" widget={widget}>
        <WidgetBody align="center" gap="none" className="items-center">
          <Bot size={24} className="text-[var(--ether-indigo)]" />
        </WidgetBody>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={title}
      titleClassName="truncate text-[13px] font-semibold leading-none tracking-normal normal-case"
      icon={<Bot size={15} />}
      accent="indigo"
      className="font-['Google_Sans','Google_Sans_Text','Product_Sans',Arial,sans-serif]"
      bodyClassName="min-h-0"
      rightSlot={
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setHistoryOpen((current) => !current)}
            className={`dashboard-widget-control-button relative ${historyOpen ? 'dashboard-widget-control-button-active' : ''}`}
            aria-label="Open chat history"
            aria-expanded={historyOpen}
            title="Open chat history"
          >
            <History size={14} />
            {conversations.length > 0 && (
              <span
                data-testid="ai-chat-history-count"
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-primary)] px-1 text-[8px] font-black leading-none text-[var(--ether-control-active-text)] shadow-sm"
              >
                {conversations.length > 99 ? '99+' : conversations.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleNewConversation}
            className="dashboard-widget-control-button dashboard-widget-control-button-primary"
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={15} />
          </button>
          <ChatPicker
            label="Chat provider"
            value={currentProviderValue}
            options={providerOptions}
            onChange={handleProviderChange}
            placeholder="Provider"
            buttonClassName="max-w-[7.75rem] w-[7.75rem]"
          />
          <ChatPicker
            label="Chat model"
            value={currentModel}
            options={modelPickerOptions}
            onChange={handleModelChange}
            placeholder="Model"
            buttonClassName="max-w-[11rem] w-[11rem]"
          />
          <button
            type="button"
            onClick={() => void loadModelOptions()}
            className="dashboard-widget-control-button"
            aria-label="Refresh chat models"
            title={modelsLoading ? 'Loading models' : providerStatus.label}
          >
            <RefreshCw size={12} className={modelsLoading ? 'animate-spin' : ''} />
          </button>
          {providerStatus.images && (
            <span
              role="img"
              aria-label="Images supported"
              title="Images supported"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
            >
              <ImageIcon size={13} aria-hidden />
            </span>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-rose-500"
              aria-label="Clear chat history"
              title="Clear chat history"
            >
              <Eraser size={13} />
            </button>
          )}
        </div>
      }
    >
      <WidgetBody gap="none">
        {historyOpen && (
          <div className="mb-3 grid max-h-72 gap-2 overflow-y-auto rounded-[1.25rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]/72 p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
                  Conversations
                </span>
                <span className="block truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]/55">
                  {hasConversationSearch
                    ? `${visibleConversations.length} result${visibleConversations.length === 1 ? '' : 's'}`
                    : `${conversations.length} saved`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleNewConversation}
                className="dashboard-widget-control-button dashboard-widget-control-button-primary"
                aria-label="New chat conversation"
                title="New chat conversation"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 text-[var(--ether-on-surface-variant)]">
              <Search size={13} className="shrink-0" />
              <input
                type="search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Search chats"
                aria-label="Search conversations"
                className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]/45"
              />
              {hasConversationSearch && (
                <button
                  type="button"
                  onClick={() => setConversationSearch('')}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                  aria-label="Clear conversation search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {conversations.length === 0 ? (
              <div className="rounded-xl bg-[var(--ether-control-bg)] px-3 py-2 text-[11px] text-[var(--ether-on-surface-variant)]">
                No saved conversations yet.
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-xl bg-[var(--ether-control-bg)] px-3 py-2 text-[11px] text-[var(--ether-on-surface-variant)]">
                No conversations match that search.
              </div>
            ) : visibleConversations.map(({ conversation, preview }) => {
              const active = conversation.id === activeConversationId;
              return (
                <div
                  key={conversation.id}
                  className={`flex items-start gap-2 rounded-xl border p-3 ${
                    active
                      ? 'border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10'
                      : 'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenConversation(conversation.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Open conversation ${conversation.title}`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--ether-on-surface)]">
                        {conversation.title}
                      </div>
                      <div className="shrink-0 text-right text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]/60">
                        {formatTimestamp(conversation.updatedAt)}
                      </div>
                    </div>
                    <div className="mt-1 overflow-hidden text-[10px] leading-4 text-[var(--ether-on-surface-variant)]/75 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {preview}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(conversation.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-rose-500/12 hover:text-rose-400"
                    aria-label={`Delete conversation ${conversation.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <WidgetBody scroll="y" gap="md" className="space-y-3">
          {messages.length === 0 ? emptyState : messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              compact={compact}
              textSize={bubbleTextSize}
              showTimestamp={showTimestamps}
              onDelete={() => handleDeleteMessage(message.id)}
              onCopy={() => void handleCopyMessage(message)}
              copied={copiedMessageId === message.id}
            />
          ))}
          {sending && (
            <div className="flex items-center gap-2 pl-1 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
              <Loader2 size={14} className="animate-spin" />
              Thinking
            </div>
          )}
        </WidgetBody>

        {error && (
          <div className="mt-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
            {error}
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Pending chat attachments">
            {pendingAttachments.map((attachment) => (
              <AttachmentPill
                key={attachment.id}
                attachment={attachment}
                onRemove={() => removePendingAttachment(attachment.id)}
              />
            ))}
          </div>
        )}

        {interimText && (
          <div className="mt-2 rounded-2xl bg-[var(--ether-control-bg)] px-3 py-2 text-[11px] italic text-[var(--ether-on-surface-variant)]">
            {interimText}
          </div>
        )}

        <div className="mt-3 flex items-end gap-2 rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-2">
          {uploadsEnabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.csv,.json,.log,.md,.pdf,.txt,.xml,.yaml,.yml"
                className="hidden"
                aria-label="Chat attachments"
                onChange={handleAttachmentSelection}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                aria-label="Attach files"
                title="Attach files"
              >
                <Paperclip size={16} />
              </button>
            </>
          )}
          {voiceEnabled && (
            <button
              type="button"
              onClick={toggleDictation}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                dictating
                  ? 'bg-rose-500/18 text-rose-400'
                  : 'text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]'
              }`}
              aria-label={dictating ? 'Stop voice input' : 'Start voice input'}
              title={dictating ? 'Stop voice input' : 'Start voice input'}
            >
              {dictating ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            aria-label="Chat message"
            rows={compact ? 1 : 2}
            placeholder="Ask Curio..."
            className={`max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-[var(--ether-on-surface-variant)]/45 ${theme.onSurface}`}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || (!draft.trim() && pendingAttachments.length === 0)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ether-primary)] text-[var(--ether-control-active-text)] transition hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-35"
            aria-label="Send chat message"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </WidgetBody>
    </WidgetShell>
  );
};

export default AiChatWidget;
