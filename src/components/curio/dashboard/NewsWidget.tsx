import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Newspaper, ExternalLink, Pin, PinOff, RefreshCcw, Settings2 } from 'lucide-react';

// TODO: [Accessibility] Apply useListKeyboardNav to the news list for full keyboard navigation.
// TODO: [Accessibility] Replace in-card icon buttons with WidgetIconButton for 44px targets.

import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useWidgetPersistentState } from '../../../hooks/useWidgetPersistentState';
import type { DashboardNewsProvider, DashboardWidget } from '../../../services/dashboardTypes';
import { setDashboardDragPayload } from '../../../services/dashboardIntents';
import {
  DEFAULT_NEWS_CATEGORY,
  DEFAULT_NEWS_PROVIDER,
  fetchNewsFeedArticles,
  getNewsFeedCategory,
  type NewsFeedArticle,
  type NewsFeedProvider,
} from '../../../services/newsFeedService';
import {
  sortPinnedFirst,
  togglePin,
} from '../../../services/pinnedItemIdsHelper';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { WidgetSkeleton, WidgetInlineError, WidgetText } from './widgetPrimitives';

interface GroundedNewsArticle {
  id: string;
  title: string;
  source: string;
  time: string;
  url?: string;
  summary?: string;
  category?: string;
  imageUrl?: string;
}

type NewsArticle = GroundedNewsArticle | NewsFeedArticle;

interface NewsWidgetProps {
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidget['config']>,
  ) => void;
  onOpenWidgetSettings?: (widgetId: string) => void;
}

const DEFAULT_NEWS_ITEMS = 10;
const MAX_NEWS_ITEMS = 20;

const getMaxNewsItems = (value: unknown): number => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return DEFAULT_NEWS_ITEMS;
  return Math.max(1, Math.min(parsedValue, MAX_NEWS_ITEMS));
};

const parseGroundedHeadlines = (raw: string, maxItems: number): NewsArticle[] => {
  return raw
    .split('\n')
    .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((line, index) => {
      const [title = '', source = 'Search', time = 'Recent', url = ''] = line.split('|').map((part) => part.trim());
      return {
        id: `news-${index}-${title}`,
        title: title || line,
        source: source || 'Search',
        time: time || 'Recent',
        url: url || undefined,
      } satisfies NewsArticle;
    });
};

const NewsWidget: React.FC<NewsWidgetProps> = ({
  widget,
  onOpenWidgetSettings,
}) => {
  const theme = useCardTheme();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const newsProvider = (widget.config.newsProvider || DEFAULT_NEWS_PROVIDER) as DashboardNewsProvider;
  const rssProvider: NewsFeedProvider =
    newsProvider === 'custom_rss'
      ? 'custom_rss'
      : newsProvider === 'combined_world'
        ? 'combined_world'
        : 'nytimes';
  const rssCategory = getNewsFeedCategory(
    rssProvider,
    widget.config.newsCategory || (rssProvider === 'combined_world' ? DEFAULT_NEWS_CATEGORY : undefined),
  );
  const topic = widget.config.newsTopic || 'Technology';
  const maxItems = getMaxNewsItems(widget.config.maxItems);

  const loadNews = useCallback(async (background = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const isStale = () =>
      controller.signal.aborted || !mountedRef.current;

    if (!background && !isStale()) setLoading(true);
    if (!isStale()) setError(null);

    try {
      if (newsProvider !== 'grounded') {
        const parsedArticles = await fetchNewsFeedArticles({
          provider: rssProvider,
          categoryId: widget.config.newsCategory,
          customUrl: widget.config.newsCustomFeedUrl,
          customFeeds: widget.config.newsCustomFeeds,
          maxItems,
          signal: controller.signal,
        });
        if (isStale()) return;
        setArticles(parsedArticles);
        if (parsedArticles.length === 0) {
          setError('No RSS headlines available right now.');
        }
        return;
      }

      const { geminiSearchProxy } = await import('../../../services/geminiSearchProxy');
      const response = await geminiSearchProxy(
        `Latest ${topic} news headlines today. Return up to ${maxItems} lines in the format "Headline | Source | Recency | URL".`,
      );
      if (isStale()) return;

      const parsedArticles = parseGroundedHeadlines(response.result, maxItems);
      setArticles(parsedArticles);
      if (parsedArticles.length === 0) {
        setError('No grounded headlines available right now.');
      }
    } catch (fetchError) {
      if (isStale() || (fetchError as Error)?.name === 'AbortError') return;
      setArticles([]);
      setError((fetchError as Error).message || 'Could not load news.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [
    maxItems,
    newsProvider,
    rssProvider,
    topic,
    widget.config.newsCategory,
    widget.config.newsCustomFeedUrl,
    widget.config.newsCustomFeeds,
  ]);

  const { refreshNow } = useDashboardRefresh({
    widget,
    onRefresh: (background) => loadNews(background),
  });

  // Per-widget pinning (Requirement 15). `pinnedItemIds` persists
  // across reloads through `useWidgetPersistentState` so users can
  // float favorite articles to the top. When `widgetPinningEnabled`
  // is false, the pin affordance is hidden but the stored ids remain
  // intact so toggling the setting back on restores the prior pins
  // (Requirement 15.5).
  const boardInteractivity = useDashboardInteractivitySettings();
  const pinningEnabled = effectiveToggle(
    'widgetPinningEnabled',
    boardInteractivity,
    widget.config,
  );
  const [pinnedItemIds, setPinnedItemIds] = useWidgetPersistentState<string[]>(
    widget.id,
    'pinnedItemIds',
    [],
  );
  const handleTogglePin = useCallback(
    (articleId: string) => {
      setPinnedItemIds((current) => togglePin(current, articleId));
    },
    [setPinnedItemIds],
  );

  const orderedArticles = useMemo(
    () =>
      pinningEnabled
        ? sortPinnedFirst(articles, pinnedItemIds, (article) => article.id)
        : articles,
    [articles, pinnedItemIds, pinningEnabled],
  );

  const title = useMemo(() => {
    if (newsProvider === 'custom_rss') return 'RSS News';
    if (newsProvider === 'combined_world') return `${rssCategory.label} News`;
    if (newsProvider === 'nytimes') return `${rssCategory.label} News`;
    return `${topic} News`;
  }, [newsProvider, rssCategory.label, topic]);

  return (
    <WidgetShell
      widget={widget}
      title={title}
      icon={<Newspaper size={14} className="text-sky-400" />}
      accent="sky"
      rightSlot={
        <div className="flex items-center gap-1">
          {onOpenWidgetSettings && (
            <button
              type="button"
              aria-label="News settings"
              onClick={() => onOpenWidgetSettings(widget.id)}
              className="dashboard-widget-control-button"
            >
              <Settings2 size={13} />
            </button>
          )}
          <button
            type="button"
            aria-label="Refresh news"
            onClick={() => refreshNow(false)}
            className="dashboard-widget-control-button"
          >
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      }
    >
      {loading && articles.length === 0 ? (
        <WidgetSkeleton variant="list" />
      ) : error && !loading && articles.length === 0 ? (
        <WidgetInlineError message={error} widgetId={widget.id} />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div
          data-testid="news-article-list"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]"
        >
          {orderedArticles.map((article) => {
            const articlePinned = pinnedItemIds.includes(article.id);
            const handleArticleDragStart = (event: React.DragEvent) => {
              // Tag the drag so RichNote / Obsidian targets can
              // accept the drop. Non-Curio drop zones ignore the
              // custom MIME and see the text/plain fallback.
              setDashboardDragPayload(event.dataTransfer, {
                kind: 'news-article',
                sourceWidgetId: widget.id,
                sourceWidgetType: 'news',
                data: {
                  articleId: article.id,
                  title: article.title,
                  url: article.url || '',
                },
              });
            };
            const pinButton = pinningEnabled ? (
              <button
                type="button"
                aria-label={articlePinned ? `Unpin ${article.title}` : `Pin ${article.title}`}
                aria-pressed={articlePinned}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleTogglePin(article.id);
                }}
                className={`shrink-0 rounded-full p-1.5 transition-opacity ${
                  articlePinned
                    ? 'text-sky-400 opacity-100'
                    : 'text-white/40 opacity-50 group-hover:opacity-100 hover:text-sky-400'
                }`}
              >
                {articlePinned ? <Pin size={12} fill="currentColor" /> : <PinOff size={12} />}
              </button>
            ) : null;
            const content = (
              <div className="flex gap-3">
                {article.imageUrl && (
                  <img
                    src={article.imageUrl}
                    alt={article.title}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-16 w-20 shrink-0 rounded-xl border border-white/5 bg-white/5 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className={`text-[13px] font-bold leading-snug group-hover:text-sky-400 transition-colors ${theme.onSurface}`}>
                      {article.title}
                    </h4>
                    <div className="flex shrink-0 items-center gap-1">
                      {pinButton}
                      {article.url && <ExternalLink size={12} className="shrink-0 opacity-20 group-hover:opacity-100 transition-opacity" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <WidgetText variant="label" className="text-sky-400/80">{article.source}</WidgetText>
                    <span className="h-1 w-1 rounded-full bg-white/10" />
                    <span className="text-[9px] font-medium opacity-30">{article.time}</span>
                  </div>
                  {article.summary && (
                    <p className="line-clamp-2 text-[11px] leading-4 opacity-55">
                      {article.summary}
                    </p>
                  )}
                </div>
              </div>
            );

            return article.url ? (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                draggable
                onDragStart={handleArticleDragStart}
                className="group block p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-white/10 transition-all"
              >
                {content}
              </a>
            ) : (
              <div
                key={article.id}
                draggable
                onDragStart={handleArticleDragStart}
                className="group block p-3 rounded-2xl bg-white/5 border border-white/5"
              >
                {content}
              </div>
            );
          })}
          {error && !loading && articles.length > 0 && (
            <div className="rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
              {error}
            </div>
          )}
        </div>
      </div>
      )}
    </WidgetShell>
  );
};

export default React.memo(NewsWidget);
