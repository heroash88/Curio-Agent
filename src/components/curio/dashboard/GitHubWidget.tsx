import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  GitPullRequest,
  Github,
  Hash,
  PlayCircle,
  RefreshCcw,
  Rocket,
  Star,
  Tag,
  Users,
} from 'lucide-react';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardGitHubInvolvement,
  DashboardGitHubItemState,
  DashboardGitHubTransport,
  DashboardGitHubView,
  DashboardWidget,
} from '../../../services/dashboardTypes';
import {
  useGitHubAccessToken,
  useGitHubAuthMode,
  useGitHubDefaultRepo,
  useGitHubUsername,
} from '../../../utils/settingsStorage';
import type {
  GitHubIssueItem,
  GitHubNotificationItem,
  GitHubProjectItem,
  GitHubPullRequestItem,
  GitHubReleaseItem,
  GitHubRepoItem,
  GitHubUserProfile,
  GitHubWorkflowRunItem,
} from '../../../services/githubApi';
import WidgetShell from './WidgetShell';
import {
  WidgetBody,
  WidgetEmptyState,
  WidgetFooter,
  WidgetList,
  WidgetStatGrid,
  WidgetText,
} from './widgetPrimitives';

type AnyItem =
  | GitHubPullRequestItem
  | GitHubIssueItem
  | GitHubRepoItem
  | GitHubNotificationItem
  | GitHubWorkflowRunItem
  | GitHubReleaseItem
  | GitHubProjectItem;

interface OverviewSnapshot {
  profile: GitHubUserProfile | null;
  prs: GitHubPullRequestItem[];
  issues: GitHubIssueItem[];
  notifications: GitHubNotificationItem[];
}

const DEFAULT_VIEW: DashboardGitHubView = 'overview';
const DEFAULT_TRANSPORT: DashboardGitHubTransport = 'auto';
const DEFAULT_STATE: DashboardGitHubItemState = 'open';
const DEFAULT_INVOLVEMENT: DashboardGitHubInvolvement = 'author';

const parseRepo = (full: string): { owner: string; repo: string } | null => {
  const trimmed = (full || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
};

const formatRelative = (iso?: string): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const seconds = Math.abs(Math.floor(diff / 1000));
  const past = diff >= 0;
  const pick = (value: number, unit: string) =>
    `${value}${unit} ${past ? 'ago' : 'from now'}`;
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return pick(minutes, 'm');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return pick(hours, 'h');
  const days = Math.floor(hours / 24);
  if (days < 30) return pick(days, 'd');
  const months = Math.floor(days / 30);
  if (months < 12) return pick(months, 'mo');
  const years = Math.floor(months / 12);
  return pick(years, 'y');
};

const pluralize = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

const compactNumber = (value: number): string => {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
};

const stateBadgeClass = (state: string, merged?: boolean, draft?: boolean): string => {
  if (draft) return 'text-slate-400 bg-slate-400/15';
  if (merged) return 'text-violet-400 bg-violet-500/15';
  if (state === 'closed') return 'text-rose-400 bg-rose-500/15';
  return 'text-emerald-400 bg-emerald-500/15';
};

const workflowIcon = (status?: string, conclusion?: string | null) => {
  if (status === 'in_progress' || status === 'queued' || status === 'waiting' || status === 'requested') {
    return <PlayCircle size={13} className="text-sky-400 animate-pulse" />;
  }
  if (conclusion === 'success') return <CheckCircle2 size={13} className="text-emerald-400" />;
  if (conclusion === 'failure' || conclusion === 'timed_out') return <AlertCircle size={13} className="text-rose-400" />;
  if (conclusion === 'cancelled') return <AlertCircle size={13} className="text-slate-400" />;
  return <CircleDot size={13} className="text-[var(--ether-on-surface-variant)]" />;
};

const transportShouldUseMcp = (transport: DashboardGitHubTransport, authMode: string): boolean => {
  if (transport === 'mcp') return true;
  if (transport === 'api') return false;
  return authMode === 'mcp';
};

const GitHubWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const size = useWidgetSize(widget);
  const authMode = useGitHubAuthMode();
  const patToken = useGitHubAccessToken();
  const username = useGitHubUsername();
  const defaultRepo = useGitHubDefaultRepo();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AnyItem[]>([]);
  const [overview, setOverview] = useState<OverviewSnapshot | null>(null);
  const [profile, setProfile] = useState<GitHubUserProfile | null>(null);

  const view = (widget.config.githubView || DEFAULT_VIEW) as DashboardGitHubView;
  const transport = (widget.config.githubTransport || DEFAULT_TRANSPORT) as DashboardGitHubTransport;
  const itemState = (widget.config.githubItemState || DEFAULT_STATE) as DashboardGitHubItemState;
  const involvement = (widget.config.githubInvolvement || DEFAULT_INVOLVEMENT) as DashboardGitHubInvolvement;
  const scope = widget.config.githubScope || (widget.config.githubOwner && widget.config.githubRepo ? 'repo' : 'me');

  const configuredRepo = [widget.config.githubOwner, widget.config.githubRepo].filter(Boolean).join('/');
  const repoPath = configuredRepo || defaultRepo;
  const parsedRepo = parseRepo(repoPath);

  const useMcp = transportShouldUseMcp(transport, authMode);
  const hasApiToken = Boolean(patToken);
  const hasConnection = useMcp || hasApiToken || authMode === 'oauth';

  const layoutMaxItems = size.pixelHeight < 260
    ? 2
    : size.pixelHeight < 400
    ? 4
    : size.pixelHeight < 600
    ? 6
    : 10;
  const maxItems = Math.max(1, Math.min(Number(widget.config.maxItems || layoutMaxItems), layoutMaxItems));
  const showStats = widget.config.githubShowStats !== false;
  const showLabels = widget.config.githubShowLabels !== false && !size.isCompact;
  const showAvatars = widget.config.githubShowAvatars !== false && size.pixelWidth >= 260;
  const showProfile = widget.config.githubShowProfile !== false;

  const accent = 'slate';

  const runOverview = useCallback(async (): Promise<OverviewSnapshot> => {
    const [{ getAuthenticatedUser, listMyPullRequests, listMyIssues, listNotifications }, mcp] = await Promise.all([
      import('../../../services/githubApi'),
      import('../../../services/githubMcpWidgetService'),
    ]);
    const overviewPromise = useMcp
      ? Promise.all([
          mcp.mcpGetMe().catch(() => null),
          mcp.mcpListPullRequests({ perPage: maxItems }).catch(() => []),
          mcp.mcpListIssues({ perPage: maxItems }).catch(() => []),
          mcp.mcpListNotifications({ perPage: maxItems }).catch(() => []),
        ])
      : Promise.all([
          getAuthenticatedUser().catch(() => null),
          listMyPullRequests({ perPage: maxItems, involvement }).catch(() => []),
          listMyIssues({ perPage: maxItems, involvement: involvement === 'review-requested' ? 'assignee' : involvement }).catch(() => []),
          listNotifications({ perPage: maxItems }).catch(() => []),
        ]);
    const [profileResult, prs, issues, notifications] = await overviewPromise;
    return { profile: profileResult, prs, issues, notifications };
  }, [involvement, maxItems, useMcp]);

  const runListFetch = useCallback(async (): Promise<AnyItem[]> => {
    const api = await import('../../../services/githubApi');
    const mcp = await import('../../../services/githubMcpWidgetService');
    switch (view) {
      case 'pull_requests': {
        if (scope === 'repo' && parsedRepo) {
          if (useMcp) return mcp.mcpListPullRequests({ ...parsedRepo, state: itemState, perPage: maxItems });
          return api.listPullRequestsForRepo(parsedRepo.owner, parsedRepo.repo, {
            state: itemState === 'all' ? 'all' : itemState,
            perPage: maxItems,
          });
        }
        if (useMcp) return mcp.mcpListPullRequests({ state: itemState, perPage: maxItems });
        return api.listMyPullRequests({ involvement, perPage: maxItems });
      }
      case 'issues': {
        if (scope === 'repo' && parsedRepo) {
          if (useMcp) return mcp.mcpListIssues({ ...parsedRepo, state: itemState, perPage: maxItems });
          return api.listIssuesForRepo(parsedRepo.owner, parsedRepo.repo, {
            state: itemState === 'all' ? 'all' : itemState,
            perPage: maxItems,
          });
        }
        if (useMcp) return mcp.mcpListIssues({ state: itemState, perPage: maxItems });
        return api.listMyIssues({
          involvement: involvement === 'review-requested' ? 'assignee' : involvement,
          perPage: maxItems,
        });
      }
      case 'repos': {
        return api.listMyRepositories({ perPage: maxItems });
      }
      case 'notifications': {
        if (useMcp) return mcp.mcpListNotifications({ perPage: maxItems });
        return api.listNotifications({ perPage: maxItems });
      }
      case 'workflow_runs': {
        if (!parsedRepo) return [];
        if (useMcp) return mcp.mcpListWorkflowRuns({ ...parsedRepo, perPage: maxItems });
        return api.listWorkflowRuns(parsedRepo.owner, parsedRepo.repo, { perPage: maxItems });
      }
      case 'releases': {
        if (!parsedRepo) return [];
        return api.listReleases(parsedRepo.owner, parsedRepo.repo, { perPage: maxItems });
      }
      case 'projects': {
        const orgLogin = widget.config.githubOrgLogin?.trim();
        const isOrg = widget.config.githubProjectScope === 'org' && Boolean(orgLogin);
        return api.listMyProjectsV2({
          perPage: maxItems,
          isOrg,
          login: isOrg ? orgLogin : undefined,
        });
      }
      default:
        return [];
    }
  }, [
    view,
    scope,
    parsedRepo?.owner,
    parsedRepo?.repo,
    itemState,
    involvement,
    maxItems,
    useMcp,
    widget.config.githubOrgLogin,
    widget.config.githubProjectScope,
  ]);

  const loadData = useCallback(async (background = false) => {
    if (!hasConnection) {
      setItems([]);
      setOverview(null);
      setProfile(null);
      setError(null);
      return;
    }
    if (!background) setLoading(true);
    setError(null);
    try {
      if (view === 'overview') {
        const snapshot = await runOverview();
        setOverview(snapshot);
        setProfile(snapshot.profile);
        setItems([]);
      } else if (view === 'profile') {
        const { getAuthenticatedUser } = await import('../../../services/githubApi');
        const { mcpGetMe } = await import('../../../services/githubMcpWidgetService');
        const next = useMcp ? await mcpGetMe() : await getAuthenticatedUser();
        setProfile(next);
        setItems([]);
        setOverview(null);
      } else {
        const next = await runListFetch();
        setItems(next);
        setOverview(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub request failed.';
      setError(message);
      if (!background) {
        setItems([]);
        setOverview(null);
      }
    } finally {
      setLoading(false);
    }
  }, [hasConnection, runListFetch, runOverview, useMcp, view]);

  const { refreshNow } = useDashboardRefresh({
    widget,
    enabled: hasConnection,
    onRefresh: (background) => loadData(background),
  });

  useEffect(() => {
    if (!hasConnection) {
      setItems([]);
      setOverview(null);
      setProfile(null);
    }
  }, [hasConnection]);

  const transportLabel = useMcp ? 'MCP' : hasApiToken ? 'PAT' : authMode === 'oauth' ? 'OAuth' : 'No auth';

  // ── tiny fallback ──────────────────────────────────────────────
  if (size.sizeClass === 'tiny') {
    const unread = overview?.notifications?.filter((n) => n.unread).length
      || items.filter((i) => (i as GitHubNotificationItem).unread).length
      || (view === 'pull_requests' ? items.length : 0);
    return (
      <WidgetShell bare accent={accent} widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="relative">
            <Github size={24} className="text-[var(--ether-on-surface)]" />
            {unread > 0 && (
              <div className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ether-error)] px-1 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </div>
            )}
          </div>
        </div>
      </WidgetShell>
    );
  }

  const renderHeaderSlot = () => (
    <div className="flex items-center gap-2">
      <WidgetText variant="label" tone="muted" className="rounded-full bg-[var(--ether-control-bg)] px-2 py-0.5">
        {transportLabel}
      </WidgetText>
      <button
        type="button"
        onClick={() => refreshNow(false)}
        className="dashboard-widget-control-button"
        aria-label="Refresh GitHub"
      >
        <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );

  const renderEmpty = (label: string, description?: string) => (
    <WidgetEmptyState
      icon={<Github size={20} />}
      title={label}
      description={description}
    />
  );

  const renderError = () => (
    <WidgetEmptyState
      variant="error"
      icon={<AlertCircle size={20} />}
      title="Could not reach GitHub"
      description={error || 'Try again in a moment.'}
    />
  );

  const renderUnconnected = () => (
    <WidgetEmptyState
      icon={<Github size={22} />}
      title="Connect GitHub"
      description={
        authMode === 'mcp'
          ? 'Enable the GitHub Remote MCP server in Accounts & Keys, or add a personal access token here.'
          : 'Add a personal access token in Settings → Accounts & Keys → GitHub.'
      }
    />
  );

  const renderPullItem = (pr: GitHubPullRequestItem) => (
    <a
      href={pr.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)]"
    >
      <GitPullRequest size={13} className={`mt-0.5 shrink-0 ${pr.merged ? 'text-violet-400' : pr.state === 'closed' ? 'text-rose-400' : 'text-emerald-400'}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <WidgetText variant="body" lines={1} className="font-semibold">
          {pr.title}
        </WidgetText>
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ether-on-surface-variant)]">
          {!size.isCompact && pr.repoFullName && (
            <span className="truncate">{pr.repoFullName}#{pr.number}</span>
          )}
          <span className="truncate">{pr.authorLogin}</span>
          <span className="truncate tabular-nums">{formatRelative(pr.updatedAt || pr.createdAt)}</span>
        </div>
        {showLabels && pr.labels.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {pr.labels.slice(0, 3).map((label) => (
              <span key={label} className="rounded-full bg-[var(--ether-surface-container)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--ether-on-surface-variant)]">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${stateBadgeClass(pr.state, pr.merged, pr.draft)}`}>
        {pr.draft ? 'draft' : pr.merged ? 'merged' : pr.state}
      </span>
    </a>
  );

  const renderIssueItem = (issue: GitHubIssueItem) => (
    <a
      href={issue.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)]"
    >
      <CircleDot size={13} className={`mt-0.5 shrink-0 ${issue.state === 'closed' ? 'text-violet-400' : 'text-emerald-400'}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <WidgetText variant="body" lines={1} className="font-semibold">
          {issue.title}
        </WidgetText>
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ether-on-surface-variant)]">
          {!size.isCompact && issue.repoFullName && (
            <span className="truncate">{issue.repoFullName}#{issue.number}</span>
          )}
          <span className="truncate">{issue.authorLogin}</span>
          <span className="truncate tabular-nums">{formatRelative(issue.updatedAt || issue.createdAt)}</span>
          {issue.comments > 0 && !size.isCompact && (
            <span className="tabular-nums">{issue.comments}💬</span>
          )}
        </div>
      </div>
      {showLabels && issue.labels.length > 0 && (
        <span className="rounded-full bg-[var(--ether-surface-container)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--ether-on-surface-variant)]">
          {issue.labels[0]}
        </span>
      )}
    </a>
  );

  const renderRepoItem = (repo: GitHubRepoItem) => (
    <a
      href={repo.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)]"
    >
      <Hash size={13} className="mt-0.5 shrink-0 text-[var(--ether-on-surface-variant)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <WidgetText variant="body" lines={1} className="font-semibold">
            {repo.fullName}
          </WidgetText>
          {repo.isPrivate && (
            <span className="rounded-full bg-[var(--ether-surface-container)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--ether-on-surface-variant)]">private</span>
          )}
          {repo.isArchived && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-400">archived</span>
          )}
        </div>
        {repo.description && !size.isCompact && (
          <WidgetText variant="caption" tone="muted" lines={1}>
            {repo.description}
          </WidgetText>
        )}
        <div className="flex min-w-0 items-center gap-3 text-[10px] text-[var(--ether-on-surface-variant)]">
          {repo.language && <span>{repo.language}</span>}
          <span className="flex items-center gap-1 tabular-nums"><Star size={10} />{compactNumber(repo.stars)}</span>
          <span className="tabular-nums">⑂ {compactNumber(repo.forks)}</span>
          <span className="truncate tabular-nums">{formatRelative(repo.pushedAt || repo.updatedAt)}</span>
        </div>
      </div>
    </a>
  );

  const renderNotificationItem = (notification: GitHubNotificationItem) => (
    <a
      href={notification.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className={`group flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)] ${notification.unread ? '' : 'opacity-70'}`}
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.unread ? 'bg-sky-400' : 'bg-slate-500'}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <WidgetText variant="body" lines={1} className={notification.unread ? 'font-semibold' : ''}>
          {notification.title}
        </WidgetText>
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ether-on-surface-variant)]">
          <span className="truncate">{notification.repoFullName}</span>
          <span className="truncate capitalize">{notification.reason.replace(/_/g, ' ')}</span>
          <span className="truncate tabular-nums">{formatRelative(notification.updatedAt)}</span>
        </div>
      </div>
    </a>
  );

  const renderWorkflowItem = (run: GitHubWorkflowRunItem) => (
    <a
      href={run.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)]"
    >
      <span className="mt-0.5 shrink-0">{workflowIcon(run.status, run.conclusion)}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <WidgetText variant="body" lines={1} className="font-semibold">
          {run.name}
        </WidgetText>
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ether-on-surface-variant)]">
          <span>#{run.runNumber}</span>
          {run.headBranch && <span className="truncate">{run.headBranch}</span>}
          {run.actorLogin && <span className="truncate">{run.actorLogin}</span>}
          <span className="truncate tabular-nums">{formatRelative(run.updatedAt || run.createdAt)}</span>
        </div>
      </div>
      <span className="rounded-full bg-[var(--ether-surface-container)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[var(--ether-on-surface-variant)]">
        {run.conclusion || run.status || 'run'}
      </span>
    </a>
  );

  const renderReleaseItem = (release: GitHubReleaseItem) => (
    <a
      href={release.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)]"
    >
      <Tag size={13} className="mt-0.5 shrink-0 text-[var(--ether-on-surface-variant)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <WidgetText variant="body" lines={1} className="font-semibold">
          {release.name}
        </WidgetText>
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ether-on-surface-variant)]">
          <span className="truncate">{release.tagName}</span>
          {release.authorLogin && <span className="truncate">{release.authorLogin}</span>}
          <span className="truncate tabular-nums">{formatRelative(release.publishedAt)}</span>
        </div>
      </div>
      {release.prerelease && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] uppercase tracking-wide text-amber-400">pre</span>
      )}
    </a>
  );

  const renderProjectItem = (project: GitHubProjectItem) => (
    <a
      href={project.htmlUrl}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-start gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 py-2 transition hover:bg-[var(--ether-control-bg-hover)]"
    >
      <Rocket size={13} className="mt-0.5 shrink-0 text-[var(--ether-on-surface-variant)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <WidgetText variant="body" lines={1} className="font-semibold">
          {project.title}
        </WidgetText>
        <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--ether-on-surface-variant)]">
          {project.ownerLogin && <span className="truncate">{project.ownerLogin}</span>}
          {typeof project.itemCount === 'number' && (
            <span className="tabular-nums">{pluralize(project.itemCount, 'item')}</span>
          )}
          <span className="truncate tabular-nums">{formatRelative(project.updatedAt)}</span>
        </div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${project.closed ? 'bg-slate-500/15 text-slate-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
        {project.closed ? 'closed' : 'open'}
      </span>
    </a>
  );

  const renderItem = (item: AnyItem, _index: number): React.ReactNode => {
    switch (view) {
      case 'pull_requests':
        return renderPullItem(item as GitHubPullRequestItem);
      case 'issues':
        return renderIssueItem(item as GitHubIssueItem);
      case 'repos':
        return renderRepoItem(item as GitHubRepoItem);
      case 'notifications':
        return renderNotificationItem(item as GitHubNotificationItem);
      case 'workflow_runs':
        return renderWorkflowItem(item as GitHubWorkflowRunItem);
      case 'releases':
        return renderReleaseItem(item as GitHubReleaseItem);
      case 'projects':
        return renderProjectItem(item as GitHubProjectItem);
      default:
        return null;
    }
  };

  const itemKey = (item: AnyItem, index: number): string | number => {
    const maybeId = (item as { id?: string | number }).id;
    return (maybeId ?? `${view}-${index}`) as string | number;
  };

  const title = useMemo(() => {
    switch (view) {
      case 'overview': return 'GitHub';
      case 'pull_requests': return 'Pull Requests';
      case 'issues': return 'Issues';
      case 'repos': return 'Repositories';
      case 'notifications': return 'Notifications';
      case 'workflow_runs': return 'Workflow Runs';
      case 'projects': return 'Projects';
      case 'releases': return 'Releases';
      case 'profile': return 'GitHub Profile';
      default: return 'GitHub';
    }
  }, [view]);

  const renderProfileBlock = (nextProfile: GitHubUserProfile | null) => {
    if (!nextProfile) return null;
    return (
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-2.5">
        {nextProfile.avatarUrl && showAvatars && (
          <img
            src={nextProfile.avatarUrl}
            alt={`${nextProfile.login} avatar`}
            className="h-9 w-9 shrink-0 rounded-full border border-[var(--ether-glass-border)]"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <WidgetText variant="body" lines={1} className="font-semibold">
            {nextProfile.name || nextProfile.login}
          </WidgetText>
          <div className="flex items-center gap-3 text-[10px] text-[var(--ether-on-surface-variant)]">
            <span className="truncate">@{nextProfile.login}</span>
            <span className="flex items-center gap-1"><Users size={10} />{compactNumber(nextProfile.followers)}</span>
            <span className="tabular-nums">{compactNumber(nextProfile.publicRepos)} repos</span>
          </div>
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    if (!overview) return null;
    const nextProfile = overview.profile || profile;
    const unread = overview.notifications.filter((n) => n.unread).length;
    return (
      <>
        {showProfile && nextProfile && renderProfileBlock(nextProfile)}
        {showStats && (
          <WidgetStatGrid size={size} maxColumns={3}>
            <div className="rounded-xl bg-[var(--ether-control-bg)] px-2.5 py-2">
              <WidgetText variant="label" tone="muted">PRs</WidgetText>
              <WidgetText variant="value" className="text-lg">
                {overview.prs.length}
              </WidgetText>
            </div>
            <div className="rounded-xl bg-[var(--ether-control-bg)] px-2.5 py-2">
              <WidgetText variant="label" tone="muted">Issues</WidgetText>
              <WidgetText variant="value" className="text-lg">
                {overview.issues.length}
              </WidgetText>
            </div>
            <div className="rounded-xl bg-[var(--ether-control-bg)] px-2.5 py-2">
              <WidgetText variant="label" tone="muted">Inbox</WidgetText>
              <WidgetText variant="value" className={`text-lg ${unread > 0 ? 'text-sky-400' : ''}`}>
                {unread}
              </WidgetText>
            </div>
          </WidgetStatGrid>
        )}
        {!size.isCompact && overview.prs.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <WidgetText variant="label" tone="muted">Recent PRs</WidgetText>
            <WidgetList
              size={size}
              items={overview.prs}
              getKey={(pr) => pr.id}
              renderItem={(pr) => renderPullItem(pr)}
              approxRowHeight={56}
              reservedHeight={120}
              maxItems={3}
              emptyLabel="No open pull requests"
            />
          </div>
        )}
      </>
    );
  };

  const renderProfileView = () => {
    if (!profile) {
      return renderEmpty('No profile data', 'Connect a token with `read:user` to see your profile.');
    }
    return (
      <>
        {renderProfileBlock(profile)}
        <WidgetStatGrid size={size} maxColumns={3}>
          <div className="rounded-xl bg-[var(--ether-control-bg)] px-2.5 py-2">
            <WidgetText variant="label" tone="muted">Followers</WidgetText>
            <WidgetText variant="value" className="text-lg">{compactNumber(profile.followers)}</WidgetText>
          </div>
          <div className="rounded-xl bg-[var(--ether-control-bg)] px-2.5 py-2">
            <WidgetText variant="label" tone="muted">Following</WidgetText>
            <WidgetText variant="value" className="text-lg">{compactNumber(profile.following)}</WidgetText>
          </div>
          <div className="rounded-xl bg-[var(--ether-control-bg)] px-2.5 py-2">
            <WidgetText variant="label" tone="muted">Public repos</WidgetText>
            <WidgetText variant="value" className="text-lg">{compactNumber(profile.publicRepos)}</WidgetText>
          </div>
        </WidgetStatGrid>
        {profile.bio && !size.isCompact && (
          <WidgetText variant="caption" tone="muted" lines={3}>
            {profile.bio}
          </WidgetText>
        )}
      </>
    );
  };

  const needsRepo = (view === 'workflow_runs' || view === 'releases') && !parsedRepo;

  // ── body ───────────────────────────────────────────────────────
  return (
    <WidgetShell
      widget={widget}
      title={title}
      icon={<Github size={14} />}
      accent={accent}
      rightSlot={renderHeaderSlot()}
    >
      <WidgetBody gap="sm" scroll="y">
        {!hasConnection ? (
          renderUnconnected()
        ) : error ? (
          renderError()
        ) : needsRepo ? (
          renderEmpty('Pick a repository', 'Open widget settings and enter owner/repo for this view.')
        ) : view === 'overview' ? (
          overview ? renderOverview() : loading ? renderEmpty('Loading…') : renderEmpty('No data yet', 'Tap refresh to pull the latest.')
        ) : view === 'profile' ? (
          renderProfileView()
        ) : items.length === 0 ? (
          loading ? renderEmpty('Loading…') : renderEmpty('Nothing to show', 'Try a different filter or repo.')
        ) : (
          <WidgetList
            size={size}
            items={items}
            getKey={itemKey}
            renderItem={renderItem}
            approxRowHeight={60}
            reservedHeight={72}
            maxItems={maxItems}
            emptyLabel="Nothing to show"
          />
        )}
        <WidgetFooter>
          <div className="flex items-center justify-between text-[10px] text-[var(--ether-on-surface-variant)]">
            <span className="truncate">
              {scope === 'repo' && parsedRepo ? `${parsedRepo.owner}/${parsedRepo.repo}` : username ? `@${username}` : 'Signed in'}
            </span>
            {view !== 'overview' && view !== 'profile' && (
              <span className="tabular-nums">{pluralize(items.length, 'item')}</span>
            )}
          </div>
        </WidgetFooter>
      </WidgetBody>
    </WidgetShell>
  );
};

export default GitHubWidget;
