import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Shuffle, SlidersHorizontal } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../services/dashboardTypes';
import {
  fetchQuoteBatch,
  getQuoteIndexForTime,
  getQuoteRefreshIntervalMinutes,
  LOCAL_QUOTES,
  type DashboardQuote,
  type DashboardQuoteSource,
} from '../../../services/quoteService';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';
import { IconQuote } from './widgetIcons';

const INTERVAL_OPTIONS = [
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every 1 hour' },
  { minutes: 120, label: 'Every 2 hours' },
  { minutes: 240, label: 'Every 4 hours' },
];

const normalizeQuoteSource = (value: unknown): DashboardQuoteSource =>
  value === 'local' ? 'local' : 'zenquotes';

const normalizeQuoteIndex = (value: unknown, quoteCount: number) => {
  if (quoteCount <= 0) return 0;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(quoteCount - 1, Math.round(numeric)));
};

const getInitialQuoteIndex = (widget: DashboardWidget, quoteCount: number) =>
  normalizeQuoteIndex(widget.config.quoteSelectedIndex, quoteCount) ??
  getQuoteIndexForTime(
    Date.now(),
    getQuoteRefreshIntervalMinutes(widget.config),
    quoteCount,
  );

type QuoteWidgetProps = {
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
};

const QuoteWidget: React.FC<QuoteWidgetProps> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const quoteSource = normalizeQuoteSource(widget.config.quoteSource);
  const refreshIntervalMinutes = getQuoteRefreshIntervalMinutes(widget.config);
  const [quotes, setQuotes] = useState<DashboardQuote[]>(LOCAL_QUOTES);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    getInitialQuoteIndex(widget, LOCAL_QUOTES.length),
  );
  const [controlsOpen, setControlsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    fetchQuoteBatch({
      source: quoteSource,
      signal: controller.signal,
    })
      .then((nextQuotes) => {
        if (controller.signal.aborted) return;
        setQuotes(nextQuotes);
        setSelectedIndex(
          normalizeQuoteIndex(widget.config.quoteSelectedIndex, nextQuotes.length) ??
            getQuoteIndexForTime(
              Date.now(),
              getQuoteRefreshIntervalMinutes(widget.config),
              nextQuotes.length,
            ),
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setQuotes(LOCAL_QUOTES);
        setLoadError('Using local quotes for now.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [quoteSource]);

  useEffect(() => {
    const configuredIndex = normalizeQuoteIndex(widget.config.quoteSelectedIndex, quotes.length);
    if (configuredIndex !== null) {
      setSelectedIndex(configuredIndex);
    }
  }, [quotes.length, widget.config.quoteSelectedIndex]);

  useEffect(() => {
    const intervalMs = refreshIntervalMinutes * 60 * 1000;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setSelectedIndex(getQuoteIndexForTime(Date.now(), refreshIntervalMinutes, quotes.length));
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [quotes.length, refreshIntervalMinutes]);

  const currentQuote = quotes[selectedIndex % Math.max(1, quotes.length)] || LOCAL_QUOTES[0];
  const visibleQuotes = useMemo(() => quotes.slice(0, size.sizeClass === 'small' ? 5 : 8), [quotes, size.sizeClass]);

  const selectQuote = (index: number) => {
    setSelectedIndex(index);
    setControlsOpen(false);
    onUpdateWidgetConfig?.(widget.id, { quoteSelectedIndex: index });
  };

  const showNextQuote = () => {
    const nextIndex = quotes.length > 0 ? (selectedIndex + 1) % quotes.length : 0;
    selectQuote(nextIndex);
  };

  const changeSource = (source: DashboardQuoteSource) => {
    onUpdateWidgetConfig?.(widget.id, {
      quoteSource: source,
      quoteSelectedIndex: 0,
    });
    setSelectedIndex(0);
  };

  const refreshQuotes = () => {
    setLoading(true);
    setLoadError(null);
    void fetchQuoteBatch({ source: quoteSource, nowMs: Date.now() + 60 * 60 * 1000 + 1 })
      .then((nextQuotes) => {
        setQuotes(nextQuotes);
        setSelectedIndex(0);
        onUpdateWidgetConfig?.(widget.id, { quoteSelectedIndex: 0 });
      })
      .catch(() => {
        setLoadError('Could not refresh quotes.');
      })
      .finally(() => setLoading(false));
  };

  const updateInterval = (minutes: number) => {
    onUpdateWidgetConfig?.(widget.id, { refreshIntervalMinutes: minutes });
  };

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-4xl text-indigo-500/70">&ldquo;</span>
        </div>
      </WidgetShell>
    );
  }

  const textSize = (() => {
    switch (size.sizeClass) {
      case 'small':  return 'text-sm';
      case 'medium': return 'text-base sm:text-lg';
      case 'large':  return 'text-lg sm:text-xl';
      case 'xlarge': return 'text-xl sm:text-2xl';
      default:       return 'text-base';
    }
  })();

  return (
    <WidgetShell
      title="Quote"
      icon={<IconQuote />}
      accent="indigo"
      widget={widget}
      rightSlot={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              showNextQuote();
            }}
            className="dashboard-widget-control-button"
            aria-label="Show another quote"
          >
            <Shuffle size={14} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setControlsOpen((open) => !open);
            }}
            className={`dashboard-widget-control-button ${
              controlsOpen ? 'dashboard-widget-control-button-active' : ''
            }`}
            aria-label="Open quote controls"
            aria-expanded={controlsOpen}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      }
    >
      <div className="relative flex h-full min-h-0 flex-col justify-center gap-3">
        {controlsOpen && (
          <div className="absolute right-0 top-0 z-20 grid max-h-full w-full max-w-[19rem] gap-3 overflow-y-auto rounded-[1.4rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-3 text-[var(--ether-on-surface)] shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div>
              <div className="mb-2">
                <WidgetText variant="label" tone="muted">Source</WidgetText>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['zenquotes', 'ZenQuotes'],
                  ['local', 'Curio library'],
                ] as const).map(([source, label]) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => changeSource(source)}
                    className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold transition ${
                      quoteSource === source
                        ? 'border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/12 text-[var(--ether-on-surface)]'
                        : 'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
                    }`}
                    aria-pressed={quoteSource === source}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2">
                <WidgetText variant="label" tone="muted">Change quote</WidgetText>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {INTERVAL_OPTIONS.map((option) => (
                  <button
                    key={option.minutes}
                    type="button"
                    onClick={() => updateInterval(option.minutes)}
                    className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold transition ${
                      refreshIntervalMinutes === option.minutes
                        ? 'border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/12 text-[var(--ether-on-surface)]'
                        : 'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
                    }`}
                    aria-pressed={refreshIntervalMinutes === option.minutes}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <WidgetText variant="label" tone="muted">Pick quote</WidgetText>
                <button
                  type="button"
                  onClick={refreshQuotes}
                  className="dashboard-widget-control-button"
                  aria-label="Refresh quote list"
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1">
                {visibleQuotes.map((item, index) => (
                  <button
                    key={`${item.text}-${item.author}-${index}`}
                    type="button"
                    onClick={() => selectQuote(index)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      selectedIndex === index
                        ? 'border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/12'
                        : 'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]'
                    }`}
                    aria-label={`Select quote: ${item.text}`}
                    aria-pressed={selectedIndex === index}
                  >
                    <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-[var(--ether-on-surface)]">
                      {item.text}
                    </span>
                    <div className="mt-1 block">
                      <WidgetText variant="label" tone="muted">
                        {item.author}
                      </WidgetText>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <p className={`${textSize} font-semibold italic leading-snug ${theme.onSurface}`}>
            &ldquo;{currentQuote.text}&rdquo;
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="h-px w-3 bg-indigo-500/50" />
            <WidgetText variant="caption" tone="muted">{currentQuote.author}</WidgetText>
            <WidgetText variant="label" tone="muted">
              {loading ? 'Syncing' : loadError || 'Source'}
            </WidgetText>
            {currentQuote.source === 'zenquotes' ? (
              <a
                href="https://zenquotes.io/"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-primary)] hover:underline"
              >
                ZenQuotes
              </a>
            ) : (
              <WidgetText variant="label" tone="muted">
                {currentQuote.sourceLabel}
              </WidgetText>
            )}
          </div>
        </div>
      </div>
    </WidgetShell>
  );
};

export default QuoteWidget;
