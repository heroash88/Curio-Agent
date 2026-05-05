/**
 * GitHub tool handlers.
 *
 * Provides the AI a single entry point (`check_github`) that returns a
 * structured snapshot of pull requests, issues, repos, notifications, or
 * workflow runs. Emits a `github` card so the renderer can show a live
 * list next to the voice response.
 *
 * Auth comes from settings storage (personal access token, OAuth, or the
 * enabled `github-remote` MCP server). When no credentials are
 * configured, the handler returns a structured "not connected" result so
 * the model can ask the user to connect before retrying.
 */

import { register } from '../router';
import { hasGitHubAccessToken, getGitHubDefaultRepo, getGitHubAuthMode } from '../../../utils/settingsStorage';
import { isGitHubMcpAvailable } from '../../githubMcpWidgetService';

type GitHubCheckView =
  | 'overview'
  | 'pull_requests'
  | 'issues'
  | 'repos'
  | 'notifications'
  | 'workflow_runs'
  | 'releases';

interface GitHubCheckArgs {
  view?: GitHubCheckView;
  owner?: string;
  repo?: string;
  repoFullName?: string;
  state?: 'open' | 'closed' | 'all';
  maxItems?: number;
}

const parseRepoArg = (
  args: GitHubCheckArgs,
): { owner?: string; repo?: string } => {
  if (args.owner && args.repo) return { owner: args.owner, repo: args.repo };
  const source = args.repoFullName || getGitHubDefaultRepo() || '';
  const match = source.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return {};
  return { owner: match[1], repo: match[2] };
};

register('check_github', async (args: GitHubCheckArgs = {}, ctx) => {
  const authMode = getGitHubAuthMode();
  const useMcp = authMode === 'mcp' || (!hasGitHubAccessToken() && isGitHubMcpAvailable());
  if (!hasGitHubAccessToken() && !isGitHubMcpAvailable()) {
    return {
      result: {
        success: false,
        error:
          'GitHub is not connected. Tell the user: "GitHub isn\'t connected yet. Add a personal access token in Settings → Accounts & Keys → GitHub, or enable the GitHub Remote MCP server."',
      },
      emittedCard: false,
    };
  }

  const view = args.view || 'overview';
  const perPage = Math.max(1, Math.min(Number(args.maxItems || 10), 25));
  const { owner, repo } = parseRepoArg(args);
  const state = args.state || 'open';

  try {
    const api = await import('../../githubApi');
    const mcp = await import('../../githubMcpWidgetService');

    let payload: Record<string, unknown> = { view };

    if (view === 'overview') {
      const [profile, prs, issues, notifications] = await Promise.all([
        useMcp ? mcp.mcpGetMe().catch(() => null) : api.getAuthenticatedUser().catch(() => null),
        useMcp ? mcp.mcpListPullRequests({ perPage }).catch(() => []) : api.listMyPullRequests({ perPage }).catch(() => []),
        useMcp ? mcp.mcpListIssues({ perPage }).catch(() => []) : api.listMyIssues({ perPage }).catch(() => []),
        useMcp ? mcp.mcpListNotifications({ perPage }).catch(() => []) : api.listNotifications({ perPage }).catch(() => []),
      ]);
      payload = { view, profile, prs, issues, notifications };
    } else if (view === 'pull_requests') {
      const items = owner && repo
        ? (useMcp
            ? await mcp.mcpListPullRequests({ owner, repo, state, perPage })
            : await api.listPullRequestsForRepo(owner, repo, { state, perPage }))
        : (useMcp
            ? await mcp.mcpListPullRequests({ state, perPage })
            : await api.listMyPullRequests({ perPage }));
      payload = { view, items, owner, repo, state, count: items.length };
    } else if (view === 'issues') {
      const items = owner && repo
        ? (useMcp
            ? await mcp.mcpListIssues({ owner, repo, state, perPage })
            : await api.listIssuesForRepo(owner, repo, { state, perPage }))
        : (useMcp ? await mcp.mcpListIssues({ state, perPage }) : await api.listMyIssues({ perPage }));
      payload = { view, items, owner, repo, state, count: items.length };
    } else if (view === 'repos') {
      const items = await api.listMyRepositories({ perPage });
      payload = { view, items, count: items.length };
    } else if (view === 'notifications') {
      const items = useMcp
        ? await mcp.mcpListNotifications({ perPage })
        : await api.listNotifications({ perPage });
      payload = { view, items, count: items.length, unread: items.filter((n) => n.unread).length };
    } else if (view === 'workflow_runs') {
      if (!owner || !repo) {
        return {
          result: { success: false, error: 'Workflow runs require a repository. Pass owner and repo.' },
          emittedCard: false,
        };
      }
      const items = useMcp
        ? await mcp.mcpListWorkflowRuns({ owner, repo, perPage })
        : await api.listWorkflowRuns(owner, repo, { perPage });
      payload = { view, items, owner, repo, count: items.length };
    } else if (view === 'releases') {
      if (!owner || !repo) {
        return {
          result: { success: false, error: 'Releases require a repository. Pass owner and repo.' },
          emittedCard: false,
        };
      }
      const items = await api.listReleases(owner, repo, { perPage });
      payload = { view, items, owner, repo, count: items.length };
    }

    if (ctx.onCardEvent) {
      try {
        ctx.onCardEvent({
          type: 'github',
          data: payload,
          persistent: true,
        });
      } catch {
        // card emission is best-effort
      }
    }

    return {
      result: { success: true, ...payload },
      emittedCard: true,
    };
  } catch (error) {
    return {
      result: { success: false, error: error instanceof Error ? error.message : String(error) },
      emittedCard: false,
    };
  }
});
