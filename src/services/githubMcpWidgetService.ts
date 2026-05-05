/**
 * GitHub Remote MCP-backed widget service.
 *
 * When the user has the built-in `github-remote` MCP server enabled in
 * Accounts & Keys, the GitHub widget and proactive engine can route
 * through the MCP bridge instead of talking to api.github.com directly.
 *
 * The GitHub MCP server (github.com/github/github-mcp-server) exposes a
 * wide range of tools. We keep the widget's interface narrow and only
 * invoke a small set:
 *   - `list_pull_requests`
 *   - `list_issues`
 *   - `list_notifications`
 *   - `list_workflow_runs`
 *   - `get_me` (for profile/stats)
 *
 * Tool names can vary slightly between server versions, so we resolve
 * them against the prepared tool list and fall back to the closest
 * match by suffix.
 */

import type {
  GitHubIssueItem,
  GitHubNotificationItem,
  GitHubPullRequestItem,
  GitHubUserProfile,
  GitHubWorkflowRunItem,
} from './githubApi';
import {
  getEnabledGenericMcpServers,
  type GenericMcpServerConfig,
} from '../utils/settingsStorage';
import { prepareGenericMcpTools } from './genericMcpService';

const GITHUB_MCP_ID = 'github-remote';

export const isGitHubMcpAvailable = (): boolean => {
  const servers = getEnabledGenericMcpServers();
  return servers.some((server) => matchesGitHubMcp(server));
};

const matchesGitHubMcp = (server: GenericMcpServerConfig): boolean => {
  if (!server.enabled) return false;
  if (server.id === GITHUB_MCP_ID) return true;
  const url = server.url || '';
  return /githubcopilot\.com\/mcp|api\.github\.com\/mcp/i.test(url);
};

const getGitHubMcpServer = (): GenericMcpServerConfig | undefined =>
  getEnabledGenericMcpServers().find(matchesGitHubMcp);

type PreparedTools = Awaited<ReturnType<typeof prepareGenericMcpTools>>;

const prepareOnce = async (): Promise<PreparedTools | null> => {
  const server = getGitHubMcpServer();
  if (!server) return null;
  return prepareGenericMcpTools([server]);
};

const findToolName = (prepared: PreparedTools, suffix: string): string | undefined => {
  const lowered = suffix.toLowerCase();
  const direct = prepared.toolNames.find(
    (name) => name.toLowerCase() === lowered || name.toLowerCase().endsWith(`_${lowered}`),
  );
  if (direct) return direct;
  return prepared.toolNames.find((name) => name.toLowerCase().includes(lowered));
};

type McpTextContent = { type?: string; text?: string };

const extractJsonFromMcpResult = (result: unknown): unknown => {
  if (!result || typeof result !== 'object') return result;
  const payload = result as Record<string, unknown>;
  const content = payload.content;
  if (Array.isArray(content)) {
    const textPart = (content as McpTextContent[]).find(
      (part) => part?.type === 'text' || typeof part?.text === 'string',
    );
    if (textPart?.text) {
      try {
        return JSON.parse(textPart.text);
      } catch {
        return textPart.text;
      }
    }
  }
  return payload.result ?? payload.data ?? payload;
};

const asArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const keys = ['items', 'pull_requests', 'issues', 'notifications', 'workflow_runs', 'runs'];
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as any[];
    }
  }
  return [];
};

export interface GitHubMcpListOptions {
  owner?: string;
  repo?: string;
  state?: 'open' | 'closed' | 'all';
  perPage?: number;
}

/**
 * Best-effort shape normalization. The GitHub MCP server largely returns
 * the same payloads as the REST API, so we reuse the existing normalize
 * helpers' shape manually here to avoid a circular import.
 */
const normalizeMcpPull = (raw: any): GitHubPullRequestItem => ({
  id: raw.id,
  number: raw.number,
  title: raw.title ?? '',
  state: raw.state === 'closed' ? 'closed' : 'open',
  draft: Boolean(raw.draft),
  merged: Boolean(raw.merged || raw.merged_at),
  htmlUrl: raw.html_url || raw.url || '',
  repoFullName:
    raw.base?.repo?.full_name || raw.repository?.full_name || raw.repo_full_name || '',
  authorLogin: raw.user?.login || raw.author?.login || 'unknown',
  authorAvatarUrl: raw.user?.avatar_url || raw.author?.avatar_url,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  mergedAt: raw.merged_at ?? undefined,
  comments: raw.comments ?? 0,
  labels: Array.isArray(raw.labels)
    ? raw.labels.map((label: any) => label?.name ?? label).filter(Boolean)
    : [],
  reviewers: Array.isArray(raw.requested_reviewers)
    ? raw.requested_reviewers.map((reviewer: any) => reviewer?.login).filter(Boolean)
    : [],
});

const normalizeMcpIssue = (raw: any): GitHubIssueItem => ({
  id: raw.id,
  number: raw.number,
  title: raw.title ?? '',
  state: raw.state === 'closed' ? 'closed' : 'open',
  htmlUrl: raw.html_url || raw.url || '',
  repoFullName: raw.repository?.full_name || raw.repo_full_name || '',
  authorLogin: raw.user?.login || 'unknown',
  authorAvatarUrl: raw.user?.avatar_url,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  closedAt: raw.closed_at ?? undefined,
  comments: raw.comments ?? 0,
  labels: Array.isArray(raw.labels)
    ? raw.labels.map((label: any) => label?.name ?? label).filter(Boolean)
    : [],
  assignees: Array.isArray(raw.assignees)
    ? raw.assignees.map((assignee: any) => assignee?.login).filter(Boolean)
    : [],
  milestone: raw.milestone?.title ?? undefined,
});

const normalizeMcpNotification = (raw: any): GitHubNotificationItem => ({
  id: raw.id,
  reason: raw.reason,
  unread: Boolean(raw.unread),
  updatedAt: raw.updated_at,
  title: raw.subject?.title ?? '(no title)',
  type: raw.subject?.type ?? 'Unknown',
  repoFullName: raw.repository?.full_name ?? '',
  htmlUrl: raw.subject?.url,
});

const normalizeMcpWorkflow = (raw: any): GitHubWorkflowRunItem => ({
  id: raw.id,
  name: raw.name ?? raw.display_title ?? 'Workflow run',
  status: raw.status,
  conclusion: raw.conclusion ?? null,
  event: raw.event,
  headBranch: raw.head_branch ?? undefined,
  headCommitMessage: raw.head_commit?.message ?? raw.display_title ?? undefined,
  actorLogin: raw.actor?.login ?? undefined,
  htmlUrl: raw.html_url,
  repoFullName: raw.repository?.full_name || '',
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  runNumber: raw.run_number ?? 0,
});

const normalizeMcpProfile = (raw: any): GitHubUserProfile => ({
  login: raw.login,
  name: raw.name ?? undefined,
  avatarUrl: raw.avatar_url,
  htmlUrl: raw.html_url,
  bio: raw.bio ?? undefined,
  followers: raw.followers ?? 0,
  following: raw.following ?? 0,
  publicRepos: raw.public_repos ?? 0,
  company: raw.company ?? undefined,
  location: raw.location ?? undefined,
  blog: raw.blog ?? undefined,
});

export async function mcpListPullRequests(
  options: GitHubMcpListOptions = {},
): Promise<GitHubPullRequestItem[]> {
  const prepared = await prepareOnce();
  if (!prepared) return [];
  const toolName = findToolName(prepared, 'list_pull_requests') || findToolName(prepared, 'pull_requests');
  if (!toolName) return [];
  const args: Record<string, unknown> = {
    state: options.state || 'open',
    perPage: Math.max(1, Math.min(options.perPage || 10, 50)),
  };
  if (options.owner) args.owner = options.owner;
  if (options.repo) args.repo = options.repo;
  const result = await prepared.callTool(toolName, args);
  return asArray(extractJsonFromMcpResult(result)).map(normalizeMcpPull);
}

export async function mcpListIssues(
  options: GitHubMcpListOptions = {},
): Promise<GitHubIssueItem[]> {
  const prepared = await prepareOnce();
  if (!prepared) return [];
  const toolName = findToolName(prepared, 'list_issues') || findToolName(prepared, 'issues');
  if (!toolName) return [];
  const args: Record<string, unknown> = {
    state: options.state || 'open',
    perPage: Math.max(1, Math.min(options.perPage || 10, 50)),
  };
  if (options.owner) args.owner = options.owner;
  if (options.repo) args.repo = options.repo;
  const result = await prepared.callTool(toolName, args);
  return asArray(extractJsonFromMcpResult(result)).map(normalizeMcpIssue);
}

export async function mcpListNotifications(
  options: { perPage?: number } = {},
): Promise<GitHubNotificationItem[]> {
  const prepared = await prepareOnce();
  if (!prepared) return [];
  const toolName = findToolName(prepared, 'list_notifications') || findToolName(prepared, 'notifications');
  if (!toolName) return [];
  const result = await prepared.callTool(toolName, {
    perPage: Math.max(1, Math.min(options.perPage || 20, 50)),
  });
  return asArray(extractJsonFromMcpResult(result)).map(normalizeMcpNotification);
}

export async function mcpListWorkflowRuns(
  options: GitHubMcpListOptions = {},
): Promise<GitHubWorkflowRunItem[]> {
  const prepared = await prepareOnce();
  if (!prepared) return [];
  const toolName = findToolName(prepared, 'list_workflow_runs') || findToolName(prepared, 'workflow_runs');
  if (!toolName) return [];
  const args: Record<string, unknown> = {
    perPage: Math.max(1, Math.min(options.perPage || 10, 50)),
  };
  if (options.owner) args.owner = options.owner;
  if (options.repo) args.repo = options.repo;
  const result = await prepared.callTool(toolName, args);
  return asArray(extractJsonFromMcpResult(result)).map(normalizeMcpWorkflow);
}

export async function mcpGetMe(): Promise<GitHubUserProfile | null> {
  const prepared = await prepareOnce();
  if (!prepared) return null;
  const toolName = findToolName(prepared, 'get_me') || findToolName(prepared, 'user');
  if (!toolName) return null;
  const result = await prepared.callTool(toolName, {});
  const payload = extractJsonFromMcpResult(result);
  if (!payload || typeof payload !== 'object' || !(payload as any).login) return null;
  return normalizeMcpProfile(payload);
}
