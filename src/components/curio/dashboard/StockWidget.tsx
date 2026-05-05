import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCcw, DollarSign, Search, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useSwipeGesture } from '../../../hooks/useSwipeGesture';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import {
  appendWidgetSparklineSample,
  getWidgetSparklineHistory,
  type SparklineSample,
} from '../../../services/dashboardSparklineStore';
import { dashboardToastBus } from '../../../services/dashboardToastBus';
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import { setDashboardDragPayload } from '../../../services/dashboardIntents';
import {
  DEFAULT_STOCK_SYMBOLS,
  fetchStockQuote,
  parseStockSymbols,
  removeStockSymbol,
  searchStockSymbols,
  type StockQuote,
  type StockSearchResult,
} from '../../../services/stockMarketService';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, WidgetText, WidgetCounter, WidgetSkeleton, WidgetInlineError } from './widgetPrimitives';
import { useRowDisplayModeCycle, type RowDisplayMode } from '../../../hooks/useRowDisplayModeCycle';

interface StockWidgetProps {
  widget: DashboardWidget;
  focused?: boolean;
  onOpenWidgetSettings?: (widgetId: string) => void;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

const StocksMultiTimeframeLazy = React.lazy(() => import('./stocks/StocksMultiTimeframe'));

const formatQuotePrice = (stock: StockQuote) => {
  const prefix = stock.currency === 'USD' ? '$' : '';
  return `${prefix}${stock.price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Format a stock row value based on the active display mode. */
const formatStockRowValue = (stock: StockQuote, mode: RowDisplayMode): string => {
  switch (mode) {
    case 'percent':
      return `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`;
    case 'dayChange':
      return `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}`;
    case 'value':
    default:
      return formatQuotePrice(stock);
  }
};

/** Get the numeric value for WidgetCounter based on display mode. */
const getStockRowNumericValue = (stock: StockQuote, mode: RowDisplayMode): number => {
  switch (mode) {
    case 'percent':
      return stock.changePercent;
    case 'dayChange':
      return stock.change;
    case 'value':
    default:
      return stock.price;
  }
};

const getSparklineKey = (symbol: string) => `stock-${symbol}`;

const buildSparklinePath = (stock: StockQuote) => {
  const width = 88;
  const height = 28;
  const points = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const drift = stock.changePercent / 100;
    const seed = stock.symbol.charCodeAt(index % stock.symbol.length) || 41;
    const wave = Math.sin((seed + index * 17) * 0.38) * 0.18;
    const value = 0.5 - drift * (t - 0.5) - wave;
    return {
      x: t * width,
      y: Math.max(3, Math.min(height - 3, value * height)),
    };
  });
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
};

const buildSparklinePathFromSamples = (samples: SparklineSample[]) => {
  if (samples.length < 2) return '';
  const width = 88;
  const height = 28;
  const values = samples.map((s) => s.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(1, Math.abs(max) * 0.02);
  return samples
    .map((sample, index) => {
      const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * width;
      const normalized = (sample.v - min) / spread;
      const y = Math.max(3, Math.min(height - 3, height - normalized * height));
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const StockSparkline: React.FC<{
  stock: StockQuote;
  compact?: boolean;
  history: SparklineSample[];
}> = ({ stock, compact = false, history }) => {
  const positive = stock.change >= 0;
  const historicalPath = history.length >= 2
    ? buildSparklinePathFromSamples(history)
    : '';
  const path = historicalPath || buildSparklinePath(stock);
  return (
    <svg
      data-testid={`stock-sparkline-${stock.symbol}`}
      viewBox="0 0 88 28"
      className={`${compact ? 'h-5 w-14' : 'h-7 w-20'} shrink-0 ${positive ? 'text-emerald-400' : 'text-rose-400'}`}
      aria-hidden
    >
      <path
        d={`${path} L 88 28 L 0 28 Z`}
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
};

// --- Swipeable stock row (extracted so useSwipeGesture can be called per-row) ---
interface StockRowProps {
  stock: StockQuote;
  index: number;
  getRowBindings: ReturnType<typeof useDragReorder<StockQuote>>['getRowBindings'];
  dragReorderEnabled: boolean;
  swipeGesturesEnabled: boolean;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
  onRemove: (symbol: string) => void;
  widgetId: string;
  compactRows: boolean;
  rollingEnabled: boolean;
  rowDisplayMode: RowDisplayMode;
  cycleRowDisplayMode: () => void;
  sparklineHistory: SparklineSample[];
  theme: ReturnType<typeof useCardTheme>;
}

const StockRow: React.FC<StockRowProps> = ({
  stock,
  index,
  getRowBindings,
  dragReorderEnabled,
  swipeGesturesEnabled,
  onUpdateWidgetConfig,
  onRemove,
  widgetId,
  compactRows,
  rollingEnabled,
  rowDisplayMode,
  cycleRowDisplayMode,
  sparklineHistory,
  theme,
}) => {
  const rowBindings = getRowBindings(index);
  const priceClass = `text-[13px] font-bold tabular-nums ${theme.onSurface}`;

  const { handlers: swipeHandlers, progress: swipeProgress, isSwiping } = useSwipeGesture({
    enabled: swipeGesturesEnabled && Boolean(onUpdateWidgetConfig),
    onSwipeLeft: () => onRemove(stock.symbol),
    onSwipeRight: () => onRemove(stock.symbol),
    commitThreshold: 0.35,
  });

  const swipeStyle: React.CSSProperties = isSwiping
    ? {
        transform: `translateX(${swipeProgress * 100}%)`,
        opacity: Math.max(0.3, 1 - Math.abs(swipeProgress) * 0.8),
        transition: 'none',
      }
    : {};

  return (
    <div
      data-dragging={rowBindings.isDragging ? 'true' : undefined}
      draggable={!rowBindings.isDragging && !isSwiping}
      onDragStart={(event) => {
        if (rowBindings.isDragging || isSwiping) {
          event.preventDefault();
          return;
        }
        setDashboardDragPayload(event.dataTransfer, {
          kind: 'stock',
          sourceWidgetId: widgetId,
          sourceWidgetType: 'stock',
          data: { symbol: stock.symbol },
        });
      }}
      className={`group/drag-row relative flex items-center justify-between rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/80 transition-all hover:bg-[var(--ether-surface-container-high)] data-[dragging=true]:border-emerald-400/60 data-[dragging=true]:shadow-lg ${compactRows ? 'gap-2 px-2.5 py-2' : 'gap-3 p-3'}`}
      style={swipeStyle}
      {...swipeHandlers}
    >
      {dragReorderEnabled && onUpdateWidgetConfig && (
        <DragReorderHandle
          bindings={rowBindings}
          ariaLabel={`Reorder ${stock.symbol}`}
          compact
        />
      )}
      <div className="min-w-0">
        <div className={`text-[13px] font-bold ${theme.onSurface}`}>{stock.symbol}</div>
        <div className={`${compactRows ? 'max-w-[5.5rem]' : 'max-w-[9rem]'}`}>
          <WidgetText variant="label" tone="faint">
            {stock.name || stock.currency}
          </WidgetText>
        </div>
      </div>
      <StockSparkline
        stock={stock}
        compact={compactRows}
        history={sparklineHistory}
      />
      <div
        className="cursor-pointer text-right"
        onClick={(e) => { e.stopPropagation(); cycleRowDisplayMode(); }}
        role="button"
        tabIndex={0}
        aria-label={`${stock.symbol} ${rowDisplayMode}: ${formatStockRowValue(stock, rowDisplayMode)}. Tap to cycle display.`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleRowDisplayMode(); } }}
      >
        <div className={priceClass}>
          {rollingEnabled ? (
            <WidgetCounter
              value={getStockRowNumericValue(stock, rowDisplayMode)}
              precision={2}
              format={() => formatStockRowValue(stock, rowDisplayMode)}
              ariaLabel={`${stock.symbol} ${rowDisplayMode} ${formatStockRowValue(stock, rowDisplayMode)}`}
            />
          ) : (
            <span>{formatStockRowValue(stock, rowDisplayMode)}</span>
          )}
        </div>
        <div className={`flex items-center justify-end gap-1 text-[10px] font-bold tabular-nums ${stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {stock.change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {rowDisplayMode === 'value' ? (
            <>{stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</>
          ) : rowDisplayMode === 'percent' ? (
            <>{formatQuotePrice(stock)}</>
          ) : (
            <>{stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</>
          )}
        </div>
      </div>
    </div>
  );
};

const StockWidget: React.FC<StockWidgetProps> = ({
  widget,
  focused,
  onOpenWidgetSettings,
  onUpdateWidgetConfig,
}) => {
  if (focused) {
    return (
      <React.Suspense fallback={<WidgetSkeleton variant="chart" />}>
        <StocksMultiTimeframeLazy widget={widget} focused onOpenWidgetSettings={onOpenWidgetSettings} onUpdateWidgetConfig={onUpdateWidgetConfig} />
      </React.Suspense>
    );
  }

  return <StockWidgetCompact widget={widget} onOpenWidgetSettings={onOpenWidgetSettings} onUpdateWidgetConfig={onUpdateWidgetConfig} />;
};

const StockWidgetCompact: React.FC<Omit<StockWidgetProps, 'focused'>> = ({
  widget,
  onUpdateWidgetConfig,
}) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const [stocks, setStocks] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sparklineTick, setSparklineTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const { mode: rowDisplayMode, cycle: cycleRowDisplayMode } = useRowDisplayModeCycle(widget.id);

  const boardInteractivity = useDashboardInteractivitySettings();
  const rollingEnabled = effectiveToggle(
    'rollingNumbersEnabled',
    boardInteractivity,
    widget.config,
  );
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );
  const sparklineHistoryEnabled = boardInteractivity.sparklineHistoryEnabled;
  const swipeGesturesEnabled = effectiveToggle(
    'swipeGesturesEnabled',
    boardInteractivity,
    widget.config,
  );
  const sparklineMaxSamples = Number.isFinite(widget.config.sparklineMaxSamples)
    ? Number(widget.config.sparklineMaxSamples)
    : undefined;

  const symbols = useMemo(
    () => parseStockSymbols(widget.config.symbols ?? DEFAULT_STOCK_SYMBOLS),
    [widget.config.symbols],
  );
  const symbolKey = symbols.join(',');
  const compactRows = size.w <= 2 || size.pixelWidth < 380 || size.pixelHeight < 340;

  const handleReorderStocks = useCallback(
    (nextStocks: StockQuote[]) => {
      if (!onUpdateWidgetConfig) return;
      // Persist the new order as a CSV of symbols. Symbols that have
      // no live quote yet (e.g. a refresh is mid-flight) are appended
      // to the tail in their original order so they do not disappear
      // from the tracked list after a reorder.
      const visibleOrder = nextStocks.map((s) => s.symbol);
      const visibleSet = new Set(visibleOrder);
      const tail = symbols.filter((sym) => !visibleSet.has(sym));
      onUpdateWidgetConfig(widget.id, {
        symbols: [...visibleOrder, ...tail].join(','),
      });
    },
    [onUpdateWidgetConfig, symbols, widget.id],
  );
  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<StockQuote>(
    stocks,
    handleReorderStocks,
    {
      keyExtractor: (item) => item.symbol,
      enabled: dragReorderEnabled && Boolean(onUpdateWidgetConfig),
    },
  );

  const loadStocks = useCallback(async (background = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!background) {
      setLoading(true);
    }
    setError(null);

    if (symbols.length === 0) {
      setStocks([]);
      setLoading(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      return;
    }

    try {
      const results = await Promise.allSettled(
        symbols.map((symbol) => fetchStockQuote(symbol, controller.signal)),
      );

      const nextStocks = results
        .filter((result): result is PromiseFulfilledResult<StockQuote> => result.status === 'fulfilled')
        .map((result) => result.value);

      if (controller.signal.aborted) return;
      setStocks(nextStocks);

      if (sparklineHistoryEnabled && nextStocks.length > 0) {
        const timestamp = Date.now();
        for (const stock of nextStocks) {
          if (!Number.isFinite(stock.price)) continue;
          appendWidgetSparklineSample(
            widget.id,
            getSparklineKey(stock.symbol),
            { t: timestamp, v: stock.price },
            sparklineMaxSamples,
          );
        }
        setSparklineTick((n) => n + 1);
      }

      if (nextStocks.length === 0) {
        setError('No market quotes available right now.');
      }
    } catch (fetchError) {
      if (controller.signal.aborted) return;
      setStocks([]);
      setError((fetchError as Error).message || 'Could not load market data.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [symbols, sparklineHistoryEnabled, sparklineMaxSamples, widget.id]);

  useEffect(() => {
    void loadStocks(false);
  }, [loadStocks, symbolKey]);

  const { refreshNow } = useDashboardRefresh({
    refreshOnMount: false,
    widget,
    onRefresh: (background) => loadStocks(background),
  });

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const sparklineHistoryBySymbol = useMemo(() => {
    const map: Record<string, SparklineSample[]> = {};
    for (const stock of stocks) {
      map[stock.symbol] = getWidgetSparklineHistory(
        widget.id,
        getSparklineKey(stock.symbol),
      );
    }
    return map;
    // sparklineTick is part of the memo deps intentionally: a fresh
    // read is needed after each append. stocks identity changes alone
    // is not sufficient because the store is off-React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, widget.id, sparklineTick]);

  const announcement = stocks.length > 0
    ? `Markets: ${stocks
        .slice(0, 3)
        .map((s) => `${s.symbol} ${formatQuotePrice(s)}`)
        .join(', ')}`
    : '';
  useWidgetAriaAnnouncer(widget.id, announcement);

  // --- Inline search state ---
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const runSearch = useCallback((query: string) => {
    searchAbortRef.current?.abort();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchStockSymbols(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          setSearchResults(results);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    runSearch(value);
  }, [runSearch]);

  const handleAddSymbol = useCallback((symbol: string) => {
    if (!onUpdateWidgetConfig) return;
    const normalized = symbol.trim().toUpperCase();
    if (!normalized || symbols.includes(normalized)) return;
    onUpdateWidgetConfig(widget.id, {
      symbols: [...symbols, normalized].join(','),
    });
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  }, [onUpdateWidgetConfig, symbols, widget.id]);

  const handleRemoveSymbol = useCallback((symbol: string) => {
    if (!onUpdateWidgetConfig) return;
    const currentSymbols = symbols.join(',');
    const nextSymbols = removeStockSymbol(currentSymbols, symbol);
    onUpdateWidgetConfig(widget.id, { symbols: nextSymbols });
    dashboardToastBus.show({
      id: `stock-remove-${symbol}`,
      label: `Removed ${symbol}`,
      tone: 'default',
      onUndo: () => {
        // Re-add the symbol at the end
        onUpdateWidgetConfig(widget.id, {
          symbols: nextSymbols ? `${nextSymbols},${symbol}` : symbol,
        });
      },
    });
  }, [onUpdateWidgetConfig, symbols, widget.id]);

  return (
    <WidgetShell
      widget={widget}
      title="Markets"
      icon={<DollarSign size={14} className="text-emerald-400" />}
      accent="emerald"
      rightSlot={
        <>
          {onUpdateWidgetConfig && (
            <button
              type="button"
              aria-label={searchOpen ? 'Close stock search' : 'Search stocks'}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((open) => !open);
                if (searchOpen) {
                  setSearchQuery('');
                  setSearchResults([]);
                }
              }}
              className={`dashboard-widget-control-button ${
                searchOpen ? 'dashboard-widget-control-button-active' : ''
              }`}
            >
              {searchOpen ? <X size={12} /> : <Search size={12} />}
            </button>
          )}
          <button
            type="button"
            aria-label="Refresh market data"
            onClick={() => refreshNow(false)}
            className="dashboard-widget-control-button"
          >
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </>
      }
    >
      {loading && stocks.length === 0 ? (
        <WidgetSkeleton variant="list" />
      ) : error && !loading && stocks.length === 0 ? (
        <WidgetInlineError message={error} widgetId={widget.id} />
      ) : (
      <div className="dashboard-widget-touch-scroll flex min-h-0 flex-1 flex-col gap-1.5 pr-1">
        <div role="status" aria-live="polite" className="sr-only">
          {dragAnnouncement}
        </div>
        {searchOpen && (
          <div className="relative z-20 shrink-0">
            <label htmlFor={searchInputId} className="sr-only">
              Search stock symbol
            </label>
            <div className="relative min-w-0">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)] opacity-65"
              />
              <input
                id={searchInputId}
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => handleSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults.length > 0) {
                    event.preventDefault();
                    handleAddSymbol(searchResults[0].symbol);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setSearchOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }
                }}
                placeholder="Search symbol or name..."
                className="h-9 w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] pl-9 pr-3 text-sm font-semibold text-[var(--ether-on-surface)] shadow-sm outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/55 focus:border-emerald-400/50 focus:bg-[var(--ether-overlay-panel)]"
                aria-label="Search stock symbol"
                autoComplete="off"
              />
            </div>
            {(searchResults.length > 0 || (searchQuery.trim().length >= 2 && !searchLoading)) && (
              <div
                role="listbox"
                aria-label="Stock search results"
                className="mt-1.5 max-h-44 overflow-y-auto rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-1.5 text-[var(--ether-on-surface)] shadow-[0_18px_46px_rgba(0,0,0,0.22)] backdrop-blur-xl"
              >
                {searchResults.length === 0 && !searchLoading ? (
                  <div className="px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                    No matching symbols
                  </div>
                ) : (
                  searchResults.map((result) => {
                    const alreadyTracked = symbols.includes(result.symbol);
                    return (
                      <button
                        key={result.symbol}
                        type="button"
                        role="option"
                        aria-selected="false"
                        disabled={alreadyTracked}
                        onClick={() => handleAddSymbol(result.symbol)}
                        className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--ether-control-hover)] focus:bg-[var(--ether-control-hover)] focus:outline-none disabled:opacity-40"
                        aria-label={alreadyTracked ? `${result.symbol} already tracked` : `Add ${result.symbol}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold leading-tight text-[var(--ether-on-surface)]">
                            {result.symbol}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] font-semibold text-[var(--ether-on-surface-variant)]">
                            {result.name}{result.exchange ? ` \u00B7 ${result.exchange}` : ''}
                          </span>
                        </span>
                        <WidgetText variant="label" tone="muted" className="shrink-0 rounded-full bg-[var(--ether-control-bg)] px-2.5 py-1">
                          {alreadyTracked ? 'Added' : 'Add'}
                        </WidgetText>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            {searchLoading && searchQuery.trim().length >= 2 && (
              <div className="mt-1.5 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                Searching...
              </div>
            )}
          </div>
        )}
        {stocks.map((stock, index) => (
          <StockRow
            key={stock.symbol}
            stock={stock}
            index={index}
            getRowBindings={getRowBindings}
            dragReorderEnabled={dragReorderEnabled}
            swipeGesturesEnabled={swipeGesturesEnabled}
            onUpdateWidgetConfig={onUpdateWidgetConfig}
            onRemove={handleRemoveSymbol}
            widgetId={widget.id}
            compactRows={compactRows}
            rollingEnabled={rollingEnabled}
            rowDisplayMode={rowDisplayMode}
            cycleRowDisplayMode={cycleRowDisplayMode}
            sparklineHistory={sparklineHistoryBySymbol[stock.symbol] || []}
            theme={theme}
          />
        ))}
        {error && !loading && stocks.length > 0 && (
          <div className="rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
            {error}
          </div>
        )}
        {stocks.length === 0 && !loading && !error && (
          <div className="flex flex-1 items-center justify-center opacity-60">
            <WidgetText variant="label" tone="muted" align="center">
              No symbols tracked
            </WidgetText>
          </div>
        )}
      </div>
      )}
    </WidgetShell>
  );
};

export default React.memo(StockWidget);
