/**
 * GitHub REST API client.
 *
 * Thin fetch wrapper that supports three auth styles in one place:
 *
 *   - 'pat' (recommended): a fine-grained or classic personal access token
 *     stored encrypted in secret storage. Sent as `Authorization: Bearer`.
 *   - 'oauth': a GitHub OAuth device-flow / web-flow token. Same header shape.
 *   - 'mcp': when the user has the built-in `github-remote` MCP server
 *     enabled, the GitHub widget routes through `genericMcpService` instead
 *     of talking to api.github.com directly. That path lives in
 *     `githubMcpWidgetService.ts` to keep this module dependency-free.
 *
 * The AI tool handler, proactive notifications engine, and dashboard
 * widget all go through the helpers here so auth, error shape, and rate
 * limit handling stay in one file.
 */

import {
  getGitHubAccessTokenAsync,
  getGitHubBaseUrl,
  getGitHubUsername,
} from '../utils/settingsStorage';

const DEFAULT_API = 'https://api.github.com';
const DEFAULT_VERSION = '2022-11-28';

export type GitHubIssueState = 'open' | 'closed' | 'all';
export type GitHubPullState = 'open' | 'closed' | 'merged' | 'all';
export type GitHubWorkflowStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'waiting'
  | 'requested';

export interface GitHubUserProfile {
  login: string;
  name?: string;
  avatarUrl?: string;
  htmlUrl: string;
  bio?: string;
  followers: number;
  following: number;
  publicRepos: number;
  company?: string;
  location?: string;
  blog?: string;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  description?: string;
  htmlUrl: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language?: string;
  defaultBranch?: string;
  isPrivate: boolean;
  isArchived: boolean;
  updatedAt?: string;
  pushedAt?: string;
}

export interface GitHubPullRequestItem {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  htmlUrl: string;
  repoFullName: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
  mergedAt?: string;
  comments: number;
  commits?: number;
  additions?: number;
  deletions?: number;
  labels: string[];
  reviewers: string[];
}

export interface GitHubIssueItem {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  htmlUrl: string;
  repoFullName: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
  comments: number;
  labels: string[];
  assignees: string[];
  milestone?: string;
}

export interface GitHubNotificationItem {
  id: string;
  reason: string;
  unread: boolean;
  updatedAt: string;
  title: string;
  type: string;
  repoFullName: string;
  htmlUrl?: string;
}

export interface GitHubWorkflowRunItem {
  id: number;
  name: string;
  status?: GitHubWorkflowStatus;
  conclusion?: string | null;
  event: string;
  headBranch?: string;
  headCommitMessage?: string;
  actorLogin?: string;
  htmlUrl: string;
  repoFullName: string;
  createdAt: string;
  updatedAt?: string;
  runNumber: number;
}

export interface GitHubProjectItem {
  id: string | number;
  number?: number;
  title: string;
  htmlUrl?: string;
  body?: string;
  state?: string;
  creator?: string;
  updatedAt?: string;
  closed?: boolean;
  public?: boolean;
  itemCount?: number;
  ownerLogin?: string;
}

export interface GitHubReleaseItem {
  id: number;
  name: string;
  tagName: string;
  htmlUrl: string;
  repoFullName: string;
  authorLogin?: string;
  publishedAt?: string;
  draft: boolean;
  prerelease: boolean;
}

export interface GitHubApiError extends Error {
  status?: number;
  /**
   * If GitHub returned an `x-ratelimit-remaining: 0` header, callers can
   * show a softer message instead of a generic failure.
   */
  rateLimited?: boolean;
}

const raiseApiError = (status: number, message: string, rateLimited = false): GitHubApiError => {
  const err = new Error(message) as GitHubApiError;
  err.status = status;
  err.rateLimited = rateLimited;
  return err;
};

const buildHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': DEFAULT_VERSION,
});

/**
 * Low-level fetch. Callers should prefer the named wrappers below.
 * `token` is optional so public routes (user, public repo list, orgs)
 * still work when no PAT is configured. Private routes will 401 cleanly.
 */
export async function ghFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = getGitHubBaseUrl() || DEFAULT_API;
  const token = await getGitHubAccessTokenAsync();

  const headers: Record<string, string> = {
    ...(token ? buildHeaders(token) : { Accept: 'application/vnd.github+json' }),
    ...(init.headers as Record<string, string> | undefined),
  };

  const url = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const rateLimited = res.headers.get('x-ratelimit-remaining') === '0';
    let message = `GitHub request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.message === 'string') {
        message = body.message;
      }
    } catch {
      // body wasn't JSON; stick with the default message.
    }
    throw raiseApiError(res.status, message, rateLimited);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ── Profile ────────────────────────────────────────────────────────

export async function getAuthenticatedUser(): Promise<GitHubUserProfile> {
  const raw = await ghFetch<any>('/user');
  return {
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
  };
}

// ── Repositories ───────────────────────────────────────────────────

const normalizeRepo = (raw: any): GitHubRepoItem => ({
  id: raw.id,
  name: raw.name,
  fullName: raw.full_name,
  description: raw.description ?? undefined,
  htmlUrl: raw.html_url,
  stars: raw.stargazers_count ?? 0,
  forks: raw.forks_count ?? 0,
  watchers: raw.watchers_count ?? 0,
  openIssues: raw.open_issues_count ?? 0,
  language: raw.language ?? undefined,
  defaultBranch: raw.default_branch ?? undefined,
  isPrivate: Boolean(raw.private),
  isArchived: Boolean(raw.archived),
  updatedAt: raw.updated_at ?? undefined,
  pushedAt: raw.pushed_at ?? undefined,
});

export async function listMyRepositories(
  options: { sort?: 'pushed' | 'updated' | 'full_name' | 'created'; perPage?: number } = {},
): Promise<GitHubRepoItem[]> {
  const params = new URLSearchParams({
    sort: options.sort || 'pushed',
    per_page: String(Math.max(1, Math.min(options.perPage || 10, 50))),
    affiliation: 'owner,collaborator,organization_member',
  });
  const raw = await ghFetch<any[]>(`/user/repos?${params.toString()}`);
  return raw.map(normalizeRepo);
}

export async function getRepo(owner: string, repo: string): Promise<GitHubRepoItem> {
  const raw = await ghFetch<any>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  return normalizeRepo(raw);
}

// ── Pull requests ──────────────────────────────────────────────────

const normalizePull = (raw: any, repoFullName?: string): GitHubPullRequestItem => ({
  id: raw.id,
  number: raw.number,
  title: raw.title,
  state: raw.state,
  draft: Boolean(raw.draft),
  merged: Boolean(raw.merged || raw.merged_at),
  htmlUrl: raw.html_url,
  repoFullName: repoFullName || raw.base?.repo?.full_name || raw.repository_url?.split('/repos/')[1] || '',
  authorLogin: raw.user?.login || 'unknown',
  authorAvatarUrl: raw.user?.avatar_url,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  mergedAt: raw.merged_at ?? undefined,
  comments: raw.comments ?? 0,
  commits: raw.commits ?? undefined,
  additions: raw.additions ?? undefined,
  deletions: raw.deletions ?? undefined,
  labels: Array.isArray(raw.labels) ? raw.labels.map((label: any) => label?.name).filter(Boolean) : [],
  reviewers: Array.isArray(raw.requested_reviewers)
    ? raw.requested_reviewers.map((reviewer: any) => reviewer?.login).filter(Boolean)
    : [],
});

export async function listPullRequestsForRepo(
  owner: string,
  repo: string,
  options: { state?: GitHubPullState; perPage?: number } = {},
): Promise<GitHubPullRequestItem[]> {
  const state = options.state === 'merged' || options.state === 'all' ? 'all' : options.state || 'open';
  const params = new URLSearchParams({
    state,
    per_page: String(Math.max(1, Math.min(options.perPage || 10, 50))),
    sort: 'updated',
    direction: 'desc',
  });
  const raw = await ghFetch<any[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params.toString()}`,
  );
  const full = `${owner}/${repo}`;
  const items = raw.map((item) => normalizePull(item, full));
  if (options.state === 'merged') return items.filter((item) => item.merged);
  return items;
}

/**
 * Returns PRs involving the authenticated user (assigned, review requested,
 * authored, or mentioned). Uses GitHub search. Auth is required.
 */
export async function listMyPullRequests(
  options: { involvement?: 'author' | 'assignee' | 'mentions' | 'review-requested'; perPage?: number } = {},
): Promise<GitHubPullRequestItem[]> {
  const username = getGitHubUsername();
  if (!username) {
    // Fall back to /user to figure out the login once.
    const me = await getAuthenticatedUser();
    if (!me?.login) throw new Error('Could not resolve GitHub username.');
    options = { ...options };
    (options as any).__login = me.login;
  }
  const login = (options as any).__login || username;
  const involvement = options.involvement || 'author';
  const qualifier =
    involvement === 'assignee' ? `assignee:${login}` :
    involvement === 'mentions' ? `mentions:${login}` :
    involvement === 'review-requested' ? `review-requested:${login}` :
    `author:${login}`;
  const q = `is:pr is:open ${qualifier}`;
  const params = new URLSearchParams({
    q,
    per_page: String(Math.max(1, Math.min(options.perPage || 10, 50))),
    sort: 'updated',
    order: 'desc',
  });
  const raw = await ghFetch<{ items: any[] }>(`/search/issues?${params.toString()}`);
  return (raw.items || []).map((item) => normalizePull(item));
}

// ── Issues ─────────────────────────────────────────────────────────

const normalizeIssue = (raw: any, repoFullName?: string): GitHubIssueItem => ({
  id: raw.id,
  number: raw.number,
  title: raw.title,
  state: raw.state,
  htmlUrl: raw.html_url,
  repoFullName: repoFullName || raw.repository_url?.split('/repos/')[1] || '',
  authorLogin: raw.user?.login || 'unknown',
  authorAvatarUrl: raw.user?.avatar_url,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  closedAt: raw.closed_at ?? undefined,
  comments: raw.comments ?? 0,
  labels: Array.isArray(raw.labels) ? raw.labels.map((label: any) => label?.name).filter(Boolean) : [],
  assignees: Array.isArray(raw.assignees) ? raw.assignees.map((assignee: any) => assignee?.login).filter(Boolean) : [],
  milestone: raw.milestone?.title ?? undefined,
});

export async function listIssuesForRepo(
  owner: string,
  repo: string,
  options: { state?: GitHubIssueState; perPage?: number; labels?: string } = {},
): Promise<GitHubIssueItem[]> {
  const params = new URLSearchParams({
    state: options.state || 'open',
    per_page: String(Math.max(1, Math.min(options.perPage || 10, 50))),
    sort: 'updated',
    direction: 'desc',
  });
  if (options.labels) params.set('labels', options.labels);
  const raw = await ghFetch<any[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params.toString()}`,
  );
  const full = `${owner}/${repo}`;
  // GitHub's repo issues endpoint returns PRs too; filter them out.
  return raw
    .filter((raw: any) => !raw.pull_request)
    .map((raw: any) => normalizeIssue(raw, full));
}

export async function listMyIssues(
  options: { involvement?: 'author' | 'assignee' | 'mentions'; perPage?: number } = {},
): Promise<GitHubIssueItem[]> {
  const params = new URLSearchParams({
    filter: options.involvement === 'mentions' ? 'mentioned' : options.involvement === 'author' ? 'created' : 'assigned',
    state: 'open',
    per_page: String(Math.max(1, Math.min(options.perPage || 10, 50))),
    sort: 'updated',
    direction: 'desc',
  });
  const raw = await ghFetch<any[]>(`/issues?${params.toString()}`);
  return (raw || []).filter((item: any) => !item.pull_request).map((item: any) => normalizeIssue(item));
}

// ── Notifications ──────────────────────────────────────────────────

const normalizeNotification = (raw: any): GitHubNotificationItem => ({
  id: raw.id,
  reason: raw.reason,
  unread: Boolean(raw.unread),
  updatedAt: raw.updated_at,
  title: raw.subject?.title ?? '(no title)',
  type: raw.subject?.type ?? 'Unknown',
  repoFullName: raw.repository?.full_name ?? '',
  htmlUrl: raw.subject?.url
    ? String(raw.subject.url).replace('api.github.com/repos', 'github.com').replace('/pulls/', '/pull/')
    : undefined,
});

export async function listNotifications(
  options: { all?: boolean; perPage?: number } = {},
): Promise<GitHubNotificationItem[]> {
  const params = new URLSearchParams({
    all: options.all ? 'true' : 'false',
    per_page: String(Math.max(1, Math.min(options.perPage || 20, 50))),
  });
  const raw = await ghFetch<any[]>(`/notifications?${params.toString()}`);
  return (raw || []).map(normalizeNotification);
}

// ── Workflow runs (Actions) ────────────────────────────────────────

const normalizeWorkflowRun = (raw: any, repoFullName?: string): GitHubWorkflowRunItem => ({
  id: raw.id,
  name: raw.name ?? raw.display_title ?? 'Workflow run',
  status: raw.status,
  conclusion: raw.conclusion ?? null,
  event: raw.event,
  headBranch: raw.head_branch ?? undefined,
  headCommitMessage: raw.head_commit?.message ?? raw.display_title ?? undefined,
  actorLogin: raw.actor?.login ?? undefined,
  htmlUrl: raw.html_url,
  repoFullName: repoFullName || raw.repository?.full_name || '',
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
  runNumber: raw.run_number ?? 0,
});

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  options: { perPage?: number; status?: GitHubWorkflowStatus } = {},
): Promise<GitHubWorkflowRunItem[]> {
  const params = new URLSearchParams({
    per_page: String(Math.max(1, Math.min(options.perPage || 10, 50))),
  });
  if (options.status) params.set('status', options.status);
  const raw = await ghFetch<{ workflow_runs: any[] }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${params.toString()}`,
  );
  const full = `${owner}/${repo}`;
  return (raw?.workflow_runs || []).map((item) => normalizeWorkflowRun(item, full));
}

// ── Releases ───────────────────────────────────────────────────────

const normalizeRelease = (raw: any, repoFullName: string): GitHubReleaseItem => ({
  id: raw.id,
  name: raw.name || raw.tag_name,
  tagName: raw.tag_name,
  htmlUrl: raw.html_url,
  repoFullName,
  authorLogin: raw.author?.login,
  publishedAt: raw.published_at ?? undefined,
  draft: Boolean(raw.draft),
  prerelease: Boolean(raw.prerelease),
});

export async function listReleases(
  owner: string,
  repo: string,
  options: { perPage?: number } = {},
): Promise<GitHubReleaseItem[]> {
  const params = new URLSearchParams({
    per_page: String(Math.max(1, Math.min(options.perPage || 5, 50))),
  });
  const raw = await ghFetch<any[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?${params.toString()}`,
  );
  const full = `${owner}/${repo}`;
  return (raw || []).map((item) => normalizeRelease(item, full));
}

// ── Projects (Projects v2 via GraphQL) ─────────────────────────────

/**
 * Projects v2 is only available via GitHub's GraphQL API. We issue a
 * targeted query against the logged-in user so token scope requirements
 * stay minimal: `read:project`. Organization projects require org access
 * and are surfaced when the token includes the `read:org` scope.
 */
export async function listMyProjectsV2(
  options: { perPage?: number; login?: string; isOrg?: boolean } = {},
): Promise<GitHubProjectItem[]> {
  const token = await getGitHubAccessTokenAsync();
  if (!token) throw new Error('Projects require a GitHub token.');
  const perPage = Math.max(1, Math.min(options.perPage || 10, 50));

  const query = options.isOrg && options.login
    ? `query($login:String!,$first:Int!){organization(login:$login){projectsV2(first:$first,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number title url shortDescription closed public updatedAt items{totalCount} creator{... on User{login} ... on Organization{login}}}}}}`
    : `query($first:Int!){viewer{login projectsV2(first:$first,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number title url shortDescription closed public updatedAt items{totalCount} creator{... on User{login} ... on Organization{login}}}}}}`;

  const variables: Record<string, unknown> = { first: perPage };
  if (options.isOrg && options.login) variables.login = options.login;

  const base = getGitHubBaseUrl() || DEFAULT_API;
  const res = await fetch(`${base.replace(/\/$/, '')}/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': DEFAULT_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const rateLimited = res.headers.get('x-ratelimit-remaining') === '0';
    throw raiseApiError(res.status, `GraphQL request failed (${res.status})`, rateLimited);
  }
  const payload = await res.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || 'GitHub GraphQL error');
  }
  const nodes: any[] = options.isOrg
    ? payload?.data?.organization?.projectsV2?.nodes || []
    : payload?.data?.viewer?.projectsV2?.nodes || [];
  const ownerLogin = options.isOrg ? options.login : payload?.data?.viewer?.login;
  return nodes.map((raw) => ({
    id: raw.id,
    number: raw.number,
    title: raw.title,
    htmlUrl: raw.url,
    body: raw.shortDescription ?? undefined,
    state: raw.closed ? 'closed' : 'open',
    creator: raw.creator?.login,
    updatedAt: raw.updatedAt,
    closed: Boolean(raw.closed),
    public: Boolean(raw.public),
    itemCount: raw.items?.totalCount ?? undefined,
    ownerLogin,
  }));
}
