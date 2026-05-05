import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Search,
  Sparkles,
  X,
  Square,
} from "lucide-react";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from "../../../services/dashboardTypes";
import { resolveYouTubeApiKey } from "../../../services/youtubeApi";
import { fetchNoApiKeyCandidates } from "../../../services/musicSearchService";
import WidgetShell from "./WidgetShell";
import { WidgetBody, WidgetText } from "./widgetPrimitives";
import { IconPlay, IconYouTube } from "./widgetIcons";

type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
};

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const credentiallessIframeProps = {
  credentialless: "true",
} as React.IframeHTMLAttributes<HTMLIFrameElement> & { credentialless: string };
const YOUTUBE_POST_MESSAGE_ORIGIN = "https://www.youtube.com";
const YOUTUBE_PLAYER_STATE_PLAYING = 1;
const YOUTUBE_PLAYER_STATE_PAUSED = 2;
const YOUTUBE_PLAYER_CHROME_IDLE_MS = 3000;

const normalizeQuery = (value: string) => value.trim().replace(/\s+/g, " ");

const clampResults = (value: number) =>
  Math.max(3, Math.min(12, Math.round(value || 6)));

const parseYouTubeApiResults = (items: any[]): YouTubeSearchResult[] =>
  items
    .map((item) => {
      const videoId = String(item?.id?.videoId || "").trim();
      if (!videoId) return null;
      const title = String(item?.snippet?.title || "YouTube Video").trim();
      const channelTitle = String(
        item?.snippet?.channelTitle || "YouTube",
      ).trim();
      const thumbnailUrl = String(
        item?.snippet?.thumbnails?.high?.url ||
          item?.snippet?.thumbnails?.medium?.url ||
          item?.snippet?.thumbnails?.default?.url ||
          "",
      );
      return { videoId, title, channelTitle, thumbnailUrl };
    })
    .filter((item): item is YouTubeSearchResult => Boolean(item));

const dedupeResults = (results: YouTubeSearchResult[]) => {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.videoId)) return false;
    seen.add(result.videoId);
    return true;
  });
};

const formatVideoTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const readStartSeconds = (config: DashboardWidgetConfig) => {
  const value = Number(config.youtubeStartSeconds || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
};

const parseYouTubePostMessage = (data: unknown) => {
  if (!data) return null;
  if (typeof data === "object") return data as Record<string, unknown>;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const postYouTubeMessage = (
  iframe: HTMLIFrameElement | null,
  payload: Record<string, unknown>,
) => {
  iframe?.contentWindow?.postMessage(
    JSON.stringify(payload),
    YOUTUBE_POST_MESSAGE_ORIGIN,
  );
};

const postYouTubeCommand = (
  iframe: HTMLIFrameElement | null,
  func: string,
  args: unknown[] = [],
) => {
  postYouTubeMessage(iframe, {
    event: "command",
    func,
    args,
  });
};

const VideoThumbnail: React.FC<{
  src?: string;
  title: string;
}> = ({ src, title }) => {
  if (src) {
    return (
      <img
        src={src}
        alt={title}
        className="h-10 w-16 shrink-0 rounded-md object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-500"
      aria-label={title}
    >
      <span className="h-5 w-5">
        <IconPlay />
      </span>
    </div>
  );
};

const searchYouTubeVideos = async (
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<YouTubeSearchResult[]> => {
  const cleanedQuery = normalizeQuery(query);
  if (!cleanedQuery) return [];

  const { key } = await resolveYouTubeApiKey();
  if (key) {
    try {
      const params = new URLSearchParams({
        part: "snippet",
        q: cleanedQuery,
        type: "video",
        maxResults: String(clampResults(maxResults)),
        key,
      });
      const response = await fetch(
        `${YOUTUBE_SEARCH_URL}?${params.toString()}`,
        { signal },
      );
      if (response.ok) {
        const payload = (await response.json()) as { items?: any[] };
        if (Array.isArray(payload.items)) {
          const parsed = dedupeResults(parseYouTubeApiResults(payload.items));
          if (parsed.length > 0) return parsed;
        }
      }
    } catch {
      // Fallback below.
    }
  }

  if (signal?.aborted) return [];

  const fallback = await fetchNoApiKeyCandidates(cleanedQuery);
  return dedupeResults(
    fallback
      .filter((candidate) => candidate.videoId)
      .slice(0, clampResults(maxResults))
      .map((candidate) => ({
        videoId: candidate.videoId as string,
        title: candidate.title,
        channelTitle: candidate.artistOrChannel,
        thumbnailUrl: candidate.thumbnailUrl,
      })),
  );
};

const YouTubeWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  const size = useWidgetSize(widget);
  const maxResults = clampResults(Number(widget.config.maxItems || 6));
  const compact =
    size.sizeClass === "tiny" ||
    size.sizeClass === "small" ||
    size.pixelHeight < 270;
  const tightEmptyState = size.pixelHeight < 430;
  const resultLimit = compact
    ? Math.min(maxResults, size.pixelHeight < 330 ? 2 : 3)
    : Math.min(maxResults, size.pixelHeight < 520 ? 4 : 6);

  const [searchQuery, setSearchQuery] = useState(() =>
    String(widget.config.youtubeQuery || ""),
  );
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [activeVideo, setActiveVideo] = useState<YouTubeSearchResult | null>(
    () => {
      const savedVideoId = String(widget.config.youtubeVideoId || "").trim();
      if (!savedVideoId) return null;
      return {
        videoId: savedVideoId,
        title: String(
          widget.config.youtubeTitle ||
            widget.config.youtubeQuery ||
            "YouTube Video",
        ),
        channelTitle: "YouTube",
        thumbnailUrl: "",
      };
    },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAutoplay, setShowAutoplay] = useState(
    () => widget.config.youtubeAutoplay === true,
  );
  const [startSeconds, setStartSeconds] = useState(() =>
    readStartSeconds(widget.config),
  );
  const [playerNonce, setPlayerNonce] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [playerState, setPlayerState] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const initialSearchDoneRef = useRef(false);
  const lastHandledRequestNonceRef = useRef<number>(0);
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const updateWidgetConfig = useCallback(
    (patch: Partial<DashboardWidgetConfig>) => {
      onUpdateWidgetConfig?.(widget.id, patch);
    },
    [onUpdateWidgetConfig, widget.id],
  );

  const selectVideo = useCallback(
    (video: YouTubeSearchResult, autoplay: boolean, sourceQuery?: string) => {
      const normalizedQuery = normalizeQuery(sourceQuery ?? searchQuery);
      setActiveVideo(video);
      setShowAutoplay(autoplay);
      setStartSeconds(0);
      setPlayerNonce((current) => current + 1);
      setShowSearch(false);
      updateWidgetConfig({
        youtubeVideoId: video.videoId,
        youtubeTitle: video.title,
        youtubeQuery: normalizedQuery || undefined,
        youtubeAutoplay: autoplay,
      });
    },
    [searchQuery, updateWidgetConfig],
  );

  const stopVideo = useCallback(() => {
    setActiveVideo(null);
    updateWidgetConfig({
      youtubeVideoId: undefined,
      youtubeTitle: undefined,
    });
  }, [updateWidgetConfig]);

  const runSearch = useCallback(
    async (query: string, autoplayFirst = false) => {
      const cleanedQuery = normalizeQuery(query);
      if (!cleanedQuery) return;
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      searchAbortControllerRef.current?.abort();
      const abortController =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      searchAbortControllerRef.current = abortController;
      setLoading(true);
      setError(null);
      try {
        const nextResults = await searchYouTubeVideos(
          cleanedQuery,
          maxResults,
          abortController?.signal,
        );
        if (requestId !== searchRequestIdRef.current) return;
        setResults(nextResults);
        updateWidgetConfig({ youtubeQuery: cleanedQuery });
        if (nextResults.length === 0) {
          setError("No videos found for that search.");
          return;
        }
        if (autoplayFirst) {
          selectVideo(nextResults[0], true, cleanedQuery);
        }
      } catch (searchError) {
        if (abortController?.signal.aborted) return;
        if (requestId !== searchRequestIdRef.current) return;
        console.warn("[YouTubeWidget] Search failed:", searchError);
        setError("Search failed. Please try again.");
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [maxResults, selectVideo, updateWidgetConfig],
  );

  const clearPlayerChromeTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current === null) return;
    window.clearTimeout(hideControlsTimeoutRef.current);
    hideControlsTimeoutRef.current = null;
  }, []);

  useEffect(
    () => () => {
      searchAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    clearPlayerChromeTimer();
    setControlsVisible(false);
    setPlayerState(showAutoplay ? YOUTUBE_PLAYER_STATE_PLAYING : 0);
    setCurrentTime(startSeconds);
    setDuration(0);
    setSeekValue(startSeconds);
    setIsSeeking(false);
  }, [activeVideo?.videoId, clearPlayerChromeTimer, playerNonce, showAutoplay, startSeconds]);

  useEffect(
    () => () => {
      clearPlayerChromeTimer();
    },
    [clearPlayerChromeTimer],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = String(event.origin || "");
      if (origin && !origin.includes("youtube.com")) return;
      const playerWindow = iframeRef.current?.contentWindow;
      if (playerWindow && event.source && event.source !== playerWindow) return;
      const payload = parseYouTubePostMessage(event.data);
      if (!payload || payload.event !== "infoDelivery") return;
      const info = payload.info;
      if (!info || typeof info !== "object") return;
      const playerInfo = info as Record<string, unknown>;
      const nextDuration = Number(playerInfo.duration);
      if (Number.isFinite(nextDuration) && nextDuration > 0) {
        setDuration(nextDuration);
      }
      const nextCurrentTime = Number(playerInfo.currentTime);
      if (!isSeeking && Number.isFinite(nextCurrentTime) && nextCurrentTime >= 0) {
        setCurrentTime(nextCurrentTime);
        setSeekValue(nextCurrentTime);
      }
      const nextPlayerState = Number(playerInfo.playerState);
      if (Number.isFinite(nextPlayerState)) {
        setPlayerState(nextPlayerState);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isSeeking]);

  useEffect(() => {
    const configuredQuery = String(widget.config.youtubeQuery || "");
    setSearchQuery(configuredQuery);
  }, [widget.config.youtubeQuery]);

  useEffect(() => {
    const configuredVideoId = String(widget.config.youtubeVideoId || "").trim();
    if (!configuredVideoId) return;
    setActiveVideo((current) => {
      if (current?.videoId === configuredVideoId) return current;
      return {
        videoId: configuredVideoId,
        title: String(
          widget.config.youtubeTitle ||
            widget.config.youtubeQuery ||
            "YouTube Video",
        ),
        channelTitle: current?.channelTitle || "YouTube",
        thumbnailUrl: current?.thumbnailUrl || "",
      };
    });
  }, [
    widget.config.youtubeQuery,
    widget.config.youtubeTitle,
    widget.config.youtubeVideoId,
  ]);

  useEffect(() => {
    const requestNonce = Number(widget.config.youtubeRequestNonce || 0);
    if (!requestNonce || requestNonce === lastHandledRequestNonceRef.current) {
      return;
    }
    lastHandledRequestNonceRef.current = requestNonce;
    const requestedQuery = normalizeQuery(
      String(widget.config.youtubeQuery || ""),
    );
    const requestedVideoId = String(widget.config.youtubeVideoId || "").trim();
    const shouldAutoplay = widget.config.youtubeAutoplay !== false;

    if (requestedVideoId) {
      setActiveVideo({
        videoId: requestedVideoId,
        title: String(
          widget.config.youtubeTitle || requestedQuery || "YouTube Video",
        ),
        channelTitle: "YouTube",
        thumbnailUrl: "",
      });
      setShowAutoplay(shouldAutoplay);
      setStartSeconds(readStartSeconds(widget.config));
      setPlayerNonce((current) => current + 1);
      setShowSearch(false);
      return;
    }

    if (requestedQuery) {
      setSearchQuery(requestedQuery);
      void runSearch(requestedQuery, shouldAutoplay);
    }
  }, [
    runSearch,
    widget.config.youtubeAutoplay,
    widget.config.youtubeQuery,
    widget.config.youtubeRequestNonce,
    widget.config.youtubeTitle,
    widget.config.youtubeVideoId,
  ]);

  useEffect(() => {
    const initialQuery = normalizeQuery(
      String(widget.config.youtubeQuery || ""),
    );
    if (
      initialSearchDoneRef.current ||
      !initialQuery ||
      widget.config.youtubeVideoId
    )
      return;
    initialSearchDoneRef.current = true;
    void runSearch(initialQuery, false);
  }, [runSearch, widget.config.youtubeQuery, widget.config.youtubeVideoId]);

  const iframeSrc = useMemo(() => {
    if (!activeVideo?.videoId) return "";
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      controls: "0",
      playsinline: "1",
      fs: "0",
      enablejsapi: "1",
      disablekb: "1",
      iv_load_policy: "3",
      autoplay: showAutoplay ? "1" : "0",
    });
    if (showAutoplay && startSeconds > 0) {
      params.set("start", String(startSeconds));
    }
    if (
      typeof window !== "undefined" &&
      window.location.origin.startsWith("http")
    ) {
      params.set("origin", window.location.origin);
    }
    return `https://www.youtube.com/embed/${activeVideo.videoId}?${params.toString()}`;
  }, [activeVideo?.videoId, showAutoplay, startSeconds]);

  const openInYouTubeUrl = activeVideo?.videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(activeVideo.videoId)}`
    : "";

  const isPlaying = !!(activeVideo?.videoId && iframeSrc);
  const isPlayerPlaying = playerState === YOUTUBE_PLAYER_STATE_PLAYING;
  const displayedTime = isSeeking ? seekValue : currentTime;
  const rangeMax = Math.max(1, Math.ceil(duration || displayedTime || 1));
  const controlsVisibilityClass = controlsVisible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";

  const revealPlayerControls = useCallback(() => {
    if (!isPlaying || showSearch) return;
    setControlsVisible(true);
    clearPlayerChromeTimer();
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      hideControlsTimeoutRef.current = null;
      setControlsVisible(false);
    }, YOUTUBE_PLAYER_CHROME_IDLE_MS);
  }, [clearPlayerChromeTimer, isPlaying, showSearch]);

  const handleExpandVideo = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      revealPlayerControls();
      updateWidgetConfig({
        youtubeAutoplay: true,
        youtubeStartSeconds: Math.max(0, Math.floor(displayedTime)),
      });
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("curio-focus-widget", {
          detail: { widgetId: widget.id },
        }),
      );
    },
    [displayedTime, revealPlayerControls, updateWidgetConfig, widget.id],
  );

  const handleTogglePlayback = useCallback(() => {
    revealPlayerControls();
    if (isPlayerPlaying) {
      postYouTubeCommand(iframeRef.current, "pauseVideo");
      setPlayerState(YOUTUBE_PLAYER_STATE_PAUSED);
      return;
    }
    postYouTubeCommand(iframeRef.current, "playVideo");
    setPlayerState(YOUTUBE_PLAYER_STATE_PLAYING);
  }, [isPlayerPlaying, revealPlayerControls]);

  const commitSeek = useCallback(
    (nextValue = seekValue) => {
      const safeValue = Math.max(0, Math.min(rangeMax, nextValue));
      setIsSeeking(false);
      setCurrentTime(safeValue);
      setSeekValue(safeValue);
      revealPlayerControls();
      postYouTubeCommand(iframeRef.current, "seekTo", [safeValue, true]);
    },
    [rangeMax, revealPlayerControls, seekValue],
  );

  useEffect(() => {
    if (!isPlaying) return;
    const intervalId = window.setInterval(() => {
      postYouTubeCommand(iframeRef.current, "getCurrentTime");
      postYouTubeCommand(iframeRef.current, "getDuration");
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isPlaying, activeVideo?.videoId, playerNonce]);

  return (
    <WidgetShell
      widget={widget}
      title={isPlaying && !showSearch ? "" : "YouTube"}
      icon={isPlaying && !showSearch ? null : <IconYouTube />}
      accent="rose"
      padded={!isPlaying || showSearch}
      ghost={isPlaying && !showSearch}
      rightSlot={
        <div
          className={`flex items-center gap-1.5 transition-opacity duration-300 ${
            isPlaying && !showSearch ? "opacity-0 group-hover:opacity-100" : ""
          }`}
        >
          {isPlaying && (
            <button
              onClick={stopVideo}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-500 transition hover:bg-rose-500/20 active:scale-95"
              title="Stop Video"
            >
              <Square size={12} fill="currentColor" />
            </button>
          )}
          {isPlaying && (
            <button
              onClick={() => setShowSearch((v) => !v)}
              className={`dashboard-widget-control-button ${
                showSearch ? "dashboard-widget-control-button-active" : ""
              }`}
              title="Search"
            >
              {showSearch ? <X size={14} /> : <Search size={14} />}
            </button>
          )}
          {isPlaying && (
            <a
              href={openInYouTubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
              aria-label="Open in YouTube"
              title="Open in YouTube"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      }
    >
      <WidgetBody gap="none">
        {(!isPlaying || showSearch) && (
          <div className="flex flex-col gap-3 mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch(searchQuery, false);
              }}
              className="flex items-center gap-2"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 focus-within:ring-1 ring-[var(--ether-primary)]/30">
                <Search
                  size={14}
                  className="text-[var(--ether-on-surface-variant)]"
                />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search YouTube videos"
                  className="w-full min-w-0 bg-transparent text-sm text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="flex h-9 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)] active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : "Go"}
              </button>
            </form>

            <div className="dashboard-widget-touch-scroll min-h-0 flex-1 space-y-2 pr-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                  <Loader2 size={14} className="animate-spin" />
                  Searching videos...
                </div>
              ) : results.length > 0 ? (
                results.slice(0, resultLimit).map((result) => (
                  <button
                    key={result.videoId}
                    type="button"
                    onClick={() => selectVideo(result, true)}
                    className={`flex w-full items-center gap-3 rounded-[1.05rem] border px-2.5 py-2 text-left transition ${
                      activeVideo?.videoId === result.videoId
                        ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                        : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
                    }`}
                  >
                    <VideoThumbnail src={result.thumbnailUrl} title={result.title} />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-semibold text-[var(--ether-on-surface)]">
                        {result.title}
                      </div>
                    <div className="line-clamp-1">
                      <WidgetText variant="label" tone="muted">
                        {result.channelTitle}
                      </WidgetText>
                    </div>
                    </div>
                  </button>
                ))
              ) : error ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500">
                  {error}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-[1.1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                  <Sparkles size={14} />
                  Search to load video results
                </div>
              )}
            </div>
          </div>
        )}

        {isPlaying && (
          <div
            className={`relative flex-1 overflow-hidden rounded-[1.2rem] bg-black group/video ${
              !showSearch ? "absolute inset-0" : ""
            }`}
            onFocusCapture={revealPlayerControls}
            onMouseEnter={revealPlayerControls}
            onPointerDown={revealPlayerControls}
            onPointerMove={revealPlayerControls}
            onTouchStart={revealPlayerControls}
          >
            <iframe
              {...credentiallessIframeProps}
              ref={iframeRef}
              key={`${activeVideo.videoId}-${playerNonce}`}
              src={iframeSrc}
              title={activeVideo.title}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              className="pointer-events-none h-full w-full border-0"
              onLoad={() => {
                revealPlayerControls();
                window.setTimeout(() => {
                  postYouTubeMessage(iframeRef.current, {
                    event: "listening",
                    id: `curio-youtube-${widget.id}`,
                  });
                  postYouTubeCommand(iframeRef.current, "addEventListener", [
                    "onStateChange",
                  ]);
                  postYouTubeCommand(iframeRef.current, "getCurrentTime");
                  postYouTubeCommand(iframeRef.current, "getDuration");
                }, 0);
                if (showAutoplay && widget.config.youtubeAutoplay !== false) {
                  updateWidgetConfig({
                    youtubeAutoplay: false,
                    youtubeStartSeconds: undefined,
                  });
                }
              }}
            />

            {!showSearch && (
              <>
                <button
                  type="button"
                  aria-label="Expand video widget"
                  data-visible={controlsVisible ? "true" : "false"}
                  onClick={handleExpandVideo}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    revealPlayerControls();
                  }}
                  className={`absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:bg-black/65 active:scale-95 data-[visible=true]:opacity-100 ${controlsVisibilityClass}`}
                >
                  <Maximize2 size={17} strokeWidth={2.35} />
                </button>

                <div
                  data-testid="youtube-player-surface"
                  className="absolute inset-0 z-20"
                  onPointerDown={revealPlayerControls}
                  onPointerMove={revealPlayerControls}
                  onTouchStart={revealPlayerControls}
                  aria-hidden="true"
                />

                {(!isPlayerPlaying || controlsVisible) && (
                  <button
                    type="button"
                    aria-label={
                      isPlayerPlaying
                        ? "Pause video from center"
                        : "Play video from center"
                    }
                    onClick={handleTogglePlayback}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      revealPlayerControls();
                    }}
                    className={`absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition hover:brightness-110 active:scale-95 ${
                      isPlayerPlaying
                        ? "h-16 w-16 rounded-full border border-white/15 bg-black/55 backdrop-blur-md"
                        : "h-16 w-24 rounded-[1.25rem] bg-[#ff0000]"
                    }`}
                  >
                    {isPlayerPlaying ? (
                      <Pause size={28} fill="currentColor" strokeWidth={1.75} />
                    ) : (
                      <Play size={34} fill="currentColor" strokeWidth={1.75} />
                    )}
                  </button>
                )}

                <div
                  data-testid="youtube-playback-controls"
                  data-visible={controlsVisible ? "true" : "false"}
                  className={`absolute inset-x-3 bottom-3 z-30 flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 text-white shadow-lg backdrop-blur-md transition-opacity duration-200 data-[visible=true]:opacity-100 ${controlsVisibilityClass}`}
                  onPointerDown={revealPlayerControls}
                  onPointerMove={revealPlayerControls}
                  onTouchStart={revealPlayerControls}
                >
                  <button
                    type="button"
                    aria-label={isPlayerPlaying ? "Pause video" : "Play video"}
                    onClick={handleTogglePlayback}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90 active:scale-95"
                  >
                    {isPlayerPlaying ? (
                      <Pause size={15} fill="currentColor" />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}
                  </button>
                  <input
                    type="range"
                    aria-label="Seek video"
                    min={0}
                    max={rangeMax}
                    step={0.1}
                    value={Math.max(0, Math.min(rangeMax, seekValue))}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      revealPlayerControls();
                      setIsSeeking(true);
                      setSeekValue(nextValue);
                      setCurrentTime(nextValue);
                    }}
                    onMouseUp={() => commitSeek()}
                    onTouchEnd={() => commitSeek()}
                    onBlur={() => {
                      if (isSeeking) commitSeek();
                    }}
                    onKeyUp={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " " ||
                        event.key.startsWith("Arrow") ||
                        event.key === "Home" ||
                        event.key === "End"
                      ) {
                        commitSeek(Number(event.currentTarget.value));
                      }
                    }}
                    className="min-w-0 flex-1 accent-rose-500"
                  />
                  <span
                    aria-label="Video time"
                    className="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold tabular-nums text-white"
                  >
                    {formatVideoTime(displayedTime)}
                    <span className="text-white/55"> / </span>
                    {duration > 0 ? formatVideoTime(duration) : "--:--"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {!compact && !isPlaying && !loading && results.length === 0 && !error && (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[1.2rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-4 text-center">
            <div className={`flex min-h-0 flex-col items-center ${tightEmptyState ? "gap-2" : "gap-3"}`}>
              <div className={`${tightEmptyState ? "h-10 w-10" : "h-12 w-12"} flex items-center justify-center rounded-full bg-rose-500/10 text-rose-500`}>
                <span className={tightEmptyState ? "h-6 w-6" : "h-7 w-7"}>
                  <IconYouTube className="h-full w-full" />
                </span>
              </div>
              <div className="line-clamp-2 max-w-[220px]">
                <WidgetText variant="label" tone="muted">
                  Ready to play. Search for a video to get started.
                </WidgetText>
              </div>
            </div>
          </div>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default React.memo(YouTubeWidget);
