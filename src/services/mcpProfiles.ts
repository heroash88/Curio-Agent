/**
 * MCP profile registry.
 *
 * A profile is a small, static adapter that the rest of the app
 * consults to recognize stdio MCP servers the user manually adds and
 * pre-wire them for the dashboard widgets. Profiles are not presets:
 * they do not ship as Settings catalog entries, they do not advertise
 * themselves in the UI, and they carry no vendor branding that is
 * user-visible until the user adds a matching executable.
 *
 * A profile tells the widget layer:
 *
 * - Which widget domains the server can power (mail, calendar, tasks,
 *   notes, messages).
 * - Which exact tool on the server handles each `domain:action`
 *   combination. The widget dispatcher looks this up before falling
 *   back to the generic keyword matcher.
 * - Which environment variables to auto-populate on Test, so the user
 *   does not have to discover server-specific flags like
 *   `OUTLOOK_MCP_ENABLE_WRITES=true` to unlock write tools.
 *
 * Detection is strictly based on the stdio executable's basename
 * (case-insensitive, extension-stripped). If the user never adds a
 * matching executable, nothing about the profile is exposed anywhere.
 */

import type { GenericMcpServerConfig } from '../utils/settingsStorage';

export type McpProfileDomain =
  | 'mail'
  | 'calendar'
  | 'tasks'
  | 'notes'
  | 'messages';

export type McpProfileAction =
  | 'list'
  | 'read'
  | 'search'
  | 'send'
  | 'reply'
  | 'create'
  | 'lists';

export type McpProfileToolKey = `${McpProfileDomain}:${McpProfileAction}`;

export interface McpProfileEnvDefault {
  name: string;
  value: string;
  reason: string;
  /**
   * When to apply the default.
   * - `'test'`: on the Settings → Test click, Curio patches the server
   *   config with this variable before spawning so first-time tests
   *   see the full tool set. The user can still override.
   */
  applyOn: 'test';
}

export interface McpProfile {
  id: string;
  /**
   * Executable basename matchers (case-insensitive, no extension).
   * Only stdio servers are ever considered.
   */
  commandAliases: string[];
  /**
   * Env vars to populate automatically on first Test when the user
   * has not already set them. Never clobbers an existing value.
   */
  envDefaults: McpProfileEnvDefault[];
  /** Exact tool name per `${domain}:${action}` for this server. */
  tools: Partial<Record<McpProfileToolKey, string>>;
  /**
   * Optional display name shown the first time Curio detects this
   * server so the user has a reasonable default. Never shipped as a
   * preset; only used when the user opts to rename.
   */
  suggestedServerName?: string;
}

const OUTLOOK_STDIO_PROFILE: McpProfile = {
  id: 'outlook-stdio',
  commandAliases: ['aws-outlook-mcp', 'outlook-mcp'],
  envDefaults: [{
    name: 'OUTLOOK_MCP_ENABLE_WRITES',
    value: 'true',
    reason: 'Expose send/reply/forward/draft/move/update tools.',
    applyOn: 'test',
  }],
  tools: {
    'mail:list': 'email_inbox',
    'mail:search': 'email_search',
    'mail:read': 'email_read',
    'mail:send': 'email_send',
    'mail:reply': 'email_reply',
    'calendar:list': 'calendar_view',
    'calendar:search': 'calendar_search',
    'calendar:read': 'calendar_meeting',
    'calendar:create': 'calendar_meeting',
    'tasks:list': 'todo_tasks',
    'tasks:read': 'todo_tasks',
    'tasks:lists': 'todo_lists',
  },
  suggestedServerName: 'Outlook Mail & Calendar',
};

const CORP_STDIO_PROFILE: McpProfile = {
  id: 'corp-stdio',
  commandAliases: ['amzn-mcp', 'corp-mcp'],
  envDefaults: [],
  tools: {
    'notes:list': 'search_quip',
    'notes:search': 'search_quip',
    'notes:read': 'read_quip',
    'messages:send': 'slack_send_message',
    // Note: amzn-mcp does not currently expose a Slack history read tool,
    // so we intentionally omit `messages:list`. The Messages widget will
    // fall through to the generic matcher (which will also fail) and
    // surface a clear error instead of silent empty state.
  },
  suggestedServerName: 'Corporate Tools',
};

const PROFILES: McpProfile[] = [OUTLOOK_STDIO_PROFILE, CORP_STDIO_PROFILE];

const basenameNoExt = (commandPath: string): string => {
  const lastSep = Math.max(commandPath.lastIndexOf('/'), commandPath.lastIndexOf('\\'));
  const base = lastSep >= 0 ? commandPath.slice(lastSep + 1) : commandPath;
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
};

export const detectMcpProfile = (
  server: GenericMcpServerConfig,
): McpProfile | null => {
  if ((server.transport || 'http') !== 'stdio') return null;
  const command = server.command?.trim();
  if (!command) return null;
  const base = basenameNoExt(command);
  return PROFILES.find((profile) =>
    profile.commandAliases.some((alias) => alias.toLowerCase() === base)
  ) || null;
};

export const profileSupportsDomain = (
  profile: McpProfile,
  domain: McpProfileDomain,
): boolean =>
  Object.keys(profile.tools).some((key) => key.startsWith(`${domain}:`));

export const profileToolName = (
  profile: McpProfile,
  domain: McpProfileDomain,
  action: McpProfileAction,
): string | undefined => profile.tools[`${domain}:${action}`];

export interface ProfileEnvApplyResult {
  /** Whether the caller needs to persist the returned `nextEnv` back to settings. */
  changed: boolean;
  /** The new env dictionary (or the input when no change). */
  nextEnv: Record<string, string>;
  /** Names of env vars that were added. */
  addedNames: string[];
  /** The detected profile, if any (helpful for status messaging). */
  profile: McpProfile | null;
}

/**
 * Compute the env dictionary for a server with profile defaults applied
 * (never overwriting existing values). Returns `changed: false` when
 * there is nothing to add. Callers persist the result through
 * `setGenericMcpServers` / `updateServer`.
 */
export const applyProfileEnvDefaults = (
  server: GenericMcpServerConfig,
  trigger: 'test',
): ProfileEnvApplyResult => {
  const profile = detectMcpProfile(server);
  if (!profile) {
    return { changed: false, nextEnv: server.env || {}, addedNames: [], profile: null };
  }
  const existing = server.env || {};
  const nextEnv: Record<string, string> = { ...existing };
  const addedNames: string[] = [];
  for (const envDefault of profile.envDefaults) {
    if (envDefault.applyOn !== trigger) continue;
    if (existing[envDefault.name] && existing[envDefault.name].trim().length > 0) continue;
    nextEnv[envDefault.name] = envDefault.value;
    addedNames.push(envDefault.name);
  }
  return {
    changed: addedNames.length > 0,
    nextEnv,
    addedNames,
    profile,
  };
};

/** Test-only helper to inspect the registered profiles. */
export const __getProfilesForTests = (): McpProfile[] => PROFILES;
