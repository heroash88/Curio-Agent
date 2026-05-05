import type { FunctionDeclaration } from '@google/genai';

import { getBuiltInToolDeclarations } from '../toolDeclarations';
import {
  getGmailAccessToken,
  getGoogleCalendarAccessToken,
  getHaMcpEnabled,
  getHaMcpToken,
  getObsidianApiKey,
  getObsidianEnabled,
  getOutlookCalendarAccessToken,
  getOutlookMailAccessToken,
  getSlackAccessToken,
} from '../../utils/settingsStorage';
import { hasICalCalendarSources } from '../icalCalendarApi';

import type { LLMToolDefinition } from './llmProvider';

export const CUSTOM_CAMERA_TOOL_NAME = 'inspect_camera_view';

const BUILT_IN_TOOL_FILTER = new Set([
  'toggleCamera',
  'flipCamera',
  'disconnectSession',
]);

const HOME_ASSISTANT_TOOL_NAMES = new Set([
  'show_camera',
  'close_camera',
  'show_thermostat',
  'show_energy',
  'show_security',
  'show_sensor_reading',
  'show_home_status',
]);

const GOOGLE_CALENDAR_TOOL_NAMES = new Set([
  'create_calendar_event',
  'update_calendar_event',
  'delete_calendar_event',
]);

const OUTLOOK_CALENDAR_TOOL_NAMES = new Set([
  'get_outlook_events',
  'create_outlook_event',
  'update_outlook_event',
  'delete_outlook_event',
]);

const GMAIL_TOOL_NAMES = new Set([
  'check_gmail',
  'reply_gmail',
]);

const OUTLOOK_MAIL_TOOL_NAMES = new Set([
  'check_outlook_mail',
  'reply_outlook_mail',
  'send_outlook_mail',
]);

const SLACK_TOOL_NAMES = new Set([
  'send_slack_message',
  'get_slack_messages',
  'list_slack_channels',
]);

const OBSIDIAN_TOOL_NAMES = new Set([
  'obsidian_search_notes',
  'obsidian_read_note',
  'obsidian_create_note',
  'obsidian_append_note',
]);

export interface ConnectedToolState {
  homeAssistant: boolean;
  googleCalendar: boolean;
  importedCalendar: boolean;
  outlookCalendar: boolean;
  gmail: boolean;
  outlookMail: boolean;
  slack: boolean;
  obsidian: boolean;
}

const hasValue = (value: string | null | undefined): boolean => Boolean(value?.trim());

export const getCurrentConnectedToolState = (): ConnectedToolState => ({
  homeAssistant: getHaMcpEnabled() && hasValue(getHaMcpToken()),
  googleCalendar: hasValue(getGoogleCalendarAccessToken()),
  importedCalendar: hasICalCalendarSources(),
  outlookCalendar: hasValue(getOutlookCalendarAccessToken()),
  gmail: hasValue(getGmailAccessToken()),
  outlookMail: hasValue(getOutlookMailAccessToken()),
  slack: hasValue(getSlackAccessToken()),
  obsidian: getObsidianEnabled() && hasValue(getObsidianApiKey()),
});

const isBuiltInToolAvailable = (
  toolName: string,
  connected: ConnectedToolState,
): boolean => {
  if (HOME_ASSISTANT_TOOL_NAMES.has(toolName)) {
    return connected.homeAssistant;
  }

  if (toolName === 'get_calendar_events') {
    return connected.googleCalendar || connected.importedCalendar || connected.outlookCalendar;
  }

  if (GOOGLE_CALENDAR_TOOL_NAMES.has(toolName)) {
    return connected.googleCalendar;
  }

  if (OUTLOOK_CALENDAR_TOOL_NAMES.has(toolName)) {
    return connected.outlookCalendar;
  }

  if (GMAIL_TOOL_NAMES.has(toolName)) {
    return connected.gmail;
  }

  if (OUTLOOK_MAIL_TOOL_NAMES.has(toolName)) {
    return connected.outlookMail;
  }

  if (SLACK_TOOL_NAMES.has(toolName)) {
    return connected.slack;
  }

  if (OBSIDIAN_TOOL_NAMES.has(toolName)) {
    return connected.obsidian;
  }

  return true;
};

const isMcpToolAvailable = (
  toolName: string | undefined,
  connected: ConnectedToolState,
): boolean => {
  if (!toolName) {
    return false;
  }

  if (toolName.startsWith('homeassistant__')) {
    return connected.homeAssistant;
  }

  return true;
};

const TYPE_MAP: Record<string, string> = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
};

const normalizeSchemaType = (type: unknown): unknown => {
  if (typeof type !== 'string') {
    return type;
  }

  return TYPE_MAP[type] || type.toLowerCase();
};

const isSchemaTypeKeywordValue = (value: unknown): boolean =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

const normalizeSchemaValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSchemaValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const hasSchemaTypeKeyword = isSchemaTypeKeywordValue(record.type);

  for (const [key, nestedValue] of Object.entries(record)) {
    if (key === 'type' && hasSchemaTypeKeyword) {
      normalized[key] = normalizeSchemaType(nestedValue);
    } else {
      normalized[key] = normalizeSchemaValue(nestedValue);
    }
  }

  return normalized;
};

export const functionDeclarationToToolDefinition = (
  declaration: FunctionDeclaration,
): LLMToolDefinition | null => {
  const name = declaration.name?.trim();
  if (!name) {
    return null;
  }

  return {
    name,
    description: declaration.description || '',
    parameters: normalizeSchemaValue(declaration.parameters || {
      type: 'object',
      properties: {},
    }) as Record<string, unknown>,
  };
};

export const getCustomCameraToolDefinition = (): LLMToolDefinition => ({
  name: CUSTOM_CAMERA_TOOL_NAME,
  description: 'Open the device camera briefly, capture a single image, and describe what is visible. Use this when the user asks things like "look at this", "what is this?", "what am I holding?", or "what do you see in front of you?".',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The exact visual question to answer about the captured image.',
      },
      facingMode: {
        type: 'string',
        enum: ['user', 'environment'],
        description: 'Optional camera to prefer. Use "environment" for outward-facing vision and "user" for selfie mode.',
      },
    },
    required: ['prompt'],
  },
});

export const buildCustomLLMToolDefinitions = (
  mcpTools: FunctionDeclaration[] = [],
  connectedOverride: Partial<ConnectedToolState> = {},
): LLMToolDefinition[] => {
  const connected = {
    ...getCurrentConnectedToolState(),
    ...connectedOverride,
  };
  const tools = [
    ...getBuiltInToolDeclarations()
      .filter((tool) =>
        tool.name &&
        !BUILT_IN_TOOL_FILTER.has(tool.name) &&
        isBuiltInToolAvailable(tool.name, connected))
      .map((tool) => functionDeclarationToToolDefinition(tool))
      .filter(Boolean) as LLMToolDefinition[],
    getCustomCameraToolDefinition(),
    ...mcpTools
      .filter((tool) => isMcpToolAvailable(tool.name, connected))
      .map((tool) => functionDeclarationToToolDefinition(tool))
      .filter(Boolean) as LLMToolDefinition[],
  ];

  const deduped = new Map<string, LLMToolDefinition>();
  for (const tool of tools) {
    deduped.set(tool.name, tool);
  }

  return [...deduped.values()];
};
