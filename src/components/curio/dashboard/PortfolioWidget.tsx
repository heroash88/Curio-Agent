import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, RefreshCcw, Search, TrendingDown, TrendingUp, X } from 'lucide-react';

import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import {
  useDashboardDropTarget,
  useDropIntentTarget,
} from '../../../hooks/useDashboardIntents';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useSwipeGesture } from '../../../hooks/useSwipeGesture';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { useRowDisplayModeCycle } from '../../../hooks/useRowDisplayModeCycle';
import { dashboardToastBus } from '../../../services/dashboardToastBus';
import type {
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import {
  PORTFOLIO_RANGES,
  buildPortfolioChartHistory,
  buildPortfolioHistory,
  buildPortfolioSnapshot,
  calculatePortfolioPeriodChange,
  normalizePortfolioHoldings,
  type PortfolioHistoryPoint,
  type PortfolioHolding,
  type PortfolioPosition,
  type PortfolioRange,
} from '../../../services/portfolioTrackerService';
import {
  fetchStockHistory,
  fetchStockQuote,
  searchStockSymbols,
  type StockHistoryPoint,
  type StockQuote,
  type StockSearchResult,
} from '../../../services/stockMarketService';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, FitText, WidgetBody, WidgetCounter, WidgetSkeleton, WidgetInlineError, WidgetText } from './widgetPrimitives';

interface PortfolioWidgetProps {
  widget: DashboardWidget;
  focused?: boolean;
  onOpenWidgetSettings?: (widgetId: string) => void;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

const PortfolioLotEditorLazy = React.lazy(() => import('./portfolio/PortfolioLotEditor'));

const isPortfolioRange = (value: unknown): value is PortfolioRange =>
  PORTFOLIO_RANGES.some((range) => range.id === value);

const formatCurrency = (value: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const formatPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatShareCount = (shares: number) =>
  `${Number.isInteger(shares) ? shares : Number(shares.toFixed(4))} ${shares === 1 ? 'share' : 'shares'}`;

const buildChartPath = (
  points: PortfolioHistoryPoint[],
  width = 100,
  height = 48,
) => {
  if (points.length < 2) return '';
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(1, max * 0.05);

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - ((point.value - min) / spread) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const rangeLabel = (rangeId: PortfolioRange) =>
  PORTFOLIO_RANGES.find((range) => range.id === rangeId)?.label || 'Day';

// --- Swipeable portfolio holding row ---
interface PortfolioHoldingRowProps {
  position: PortfolioPosition;
  index: number;
  getRowBindings: ReturnType<typeof useDragReorder<PortfolioPosition>>['getRowBindings'];
  dragReorderEnabled: boolean;
  swipeGesturesEnabled: boolean;
  doubleClickEditEnabled: boolean;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
  onRemove: (holdingId: string, symbol: string) => void;
  priceModeSymbols: Set<string>;
  toggleHoldingDisplay: (symbol: string) => void;
  editingSharesSymbol: string | null;
  setEditingSharesSymbol: (symbol: string | null) => void;
  sharesDraft: string;
  setSharesDraft: (value: string) => void;
  sharesInputRef: React.MutableRefObject<HTMLInputElement | null>;
  commitSharesEdit: () => void;
  lastSharesTapRef: React.MutableRefObject<Map<string, number>>;
  snapshot: { currency: string };
}

const PortfolioHoldingRow: React.FC<PortfolioHoldingRowProps> = ({
  position,
  index,
  getRowBindings,
  dragReorderEnabled,
  swipeGesturesEnabled,
  doubleClickEditEnabled,
  onUpdateWidgetConfig,
  onRemove,
  priceModeSymbols,
  toggleHoldingDisplay,
  editingSharesSymbol,
  setEditingSharesSymbol,
  sharesDraft,
  setSharesDraft,
  sharesInputRef,
  commitSharesEdit,
  lastSharesTapRef,
  snapshot,
}) => {
  const rowBindings = getRowBindings(index);
  const showingSharePrice = priceModeSymbols.has(position.symbol);
  const primaryValue = showingSharePrice
    ? position.quote?.price || 0
    : position.value;

  const { handlers: swipeHandlers, progress: swipeProgress, isSwiping } = useSwipeGesture({
    enabled: swipeGesturesEnabled && Boolean(onUpdateWidgetConfig),
    onSwipeLeft: () => onRemove(position.id, position.symbol),
    onSwipeRight: () => onRemove(position.id, position.symbol),
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
      className="group/drag-row relative data-[dragging=true]:ring-2 data-[dragging=true]:ring-emerald-400/40 rounded-[1rem]"
      style={swipeStyle}
      {...swipeHandlers}
    >
      {dragReorderEnabled && onUpdateWidgetConfig && (
        <DragReorderHandle
          bindings={rowBindings}
          ariaLabel={`Reorder ${position.symbol}`}
          compact
        />
      )}
      <button
        className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left transition hover:bg-[var(--ether-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        type="button"
        aria-label={`${position.symbol} portfolio holding, ${showingSharePrice ? 'showing current price' : 'showing holding total'}`}
        aria-pressed={showingSharePrice}
        onClick={() => toggleHoldingDisplay(position.symbol)}
      >
        <div className="min-w-0">
          <div className="truncate text-[12px] font-bold text-[var(--ether-on-surface)]">
            {position.symbol}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-[var(--ether-on-surface-variant)]">
            {position.name && <span className="min-w-0 truncate">{position.name}</span>}
            {doubleClickEditEnabled && onUpdateWidgetConfig ? (
              editingSharesSymbol === position.symbol ? (
                <input
                  ref={sharesInputRef}
                  type="number"
                  step="any"
                  min={0}
                  value={sharesDraft}
                  aria-label={`Edit ${position.symbol} shares`}
                  onChange={(event) => setSharesDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={commitSharesEdit}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitSharesEdit();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditingSharesSymbol(null);
                    }
                  }}
                  className="w-20 shrink-0 rounded-md border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-1 py-0.5 text-[10px] font-bold text-[var(--ether-on-surface)] outline-none focus:border-[var(--ether-primary)]/45"
                />
              ) : (
                <span
                  className="shrink-0 rounded-md px-0.5 hover:bg-[var(--ether-control-hover)]"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setSharesDraft(String(position.shares));
                    setEditingSharesSymbol(position.symbol);
                  }}
                  onPointerUp={(event) => {
                    if (event.pointerType !== 'touch') return;
                    const now = Date.now();
                    const last = lastSharesTapRef.current.get(position.symbol) || 0;
                    if (last > 0 && now - last <= 320) {
                      event.stopPropagation();
                      lastSharesTapRef.current.set(position.symbol, 0);
                      setSharesDraft(String(position.shares));
                      setEditingSharesSymbol(position.symbol);
                      return;
                    }
                    lastSharesTapRef.current.set(position.symbol, now);
                  }}
                  aria-label={`${formatShareCount(position.shares)}. Double-click to edit.`}
                >
                  {formatShareCount(position.shares)}
                </span>
              )
            ) : (
              <span className="shrink-0">{formatShareCount(position.shares)}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-bold text-[var(--ether-on-surface)] tabular-nums">
            {formatCurrency(primaryValue, snapshot.currency)}
          </div>
          <div className={`text-[10px] font-bold tabular-nums ${position.dailyGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {position.dailyGain >= 0 ? '+' : ''}{formatCurrency(position.dailyGain, snapshot.currency)}
          </div>
        </div>
      </button>
    </div>
  );
};

const PortfolioWidget: React.FC<PortfolioWidgetProps> = ({
  widget,
  focused,
  onOpenWidgetSettings,
  onUpdateWidgetConfig,
}) => {
  if (focused) {
    return (
      <React.Suspense fallback={<WidgetSkeleton variant="chart" />}>
        <PortfolioLotEditorLazy widget={widget} focused onOpenWidgetSettings={onOpenWidgetSettings} onUpdateWidgetConfig={onUpdateWidgetConfig} />
      </React.Suspense>
    );
  }

  return <PortfolioWidgetCompact widget={widget} onOpenWidgetSettings={onOpenWidgetSettings} onUpdateWidgetConfig={onUpdateWidgetConfig} />;
};

const PortfolioWidgetCompact: React.FC<Omit<PortfolioWidgetProps, 'focused'>> = ({
  widget,
  onUpdateWidgetConfig,
}) => {
  const size = useWidgetSize(widget);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [range, setRange] = useState<PortfolioRange>(
    isPortfolioRange(widget.config.portfolioRange)
      ? widget.config.portfolioRange
      : '1d',
  );
  const [priceModeSymbols, setPriceModeSymbols] = useState<Set<string>>(() => new Set());
  const { cycle: cycleRowDisplayMode } = useRowDisplayModeCycle(widget.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const holdings = useMemo(
    () => normalizePortfolioHoldings(widget.config.portfolioHoldings),
    [widget.config.portfolioHoldings],
  );
  const holdingKey = holdings
    .map((holding) => `${holding.symbol}:${holding.shares}`)
    .join('|');

  useEffect(() => {
    if (isPortfolioRange(widget.config.portfolioRange)) {
      setRange(widget.config.portfolioRange);
    }
  }, [widget.config.portfolioRange]);

  const snapshot = useMemo(
    () => buildPortfolioSnapshot(holdings, quotes),
    [holdings, quotes],
  );
  const chartHistory = useMemo(
    () => buildPortfolioChartHistory(history, snapshot, range),
    [history, range, snapshot],
  );
  const periodChange = useMemo(
    () => calculatePortfolioPeriodChange(snapshot.totalValue, chartHistory),
    [chartHistory, snapshot.totalValue],
  );
  const activeChange = chartHistory.length > 0
    ? periodChange
    : {
        value: snapshot.dailyGain,
        percent: snapshot.dailyGainPercent,
      };
  const chartPath = useMemo(() => buildChartPath(chartHistory), [chartHistory]);
  const chartAreaPath = chartPath
    ? `${chartPath} L 100 52 L 0 52 Z`
    : '';
  const chartBaselineValue = chartHistory.find((point) => point.value > 0)?.value || 0;
  const usingQuoteFallback = history.length === 0 && chartHistory.length > 1;
  const usingEstimatedRangeFallback = usingQuoteFallback && range !== '1d';
  const portfolioChangeLabel = usingEstimatedRangeFallback
    ? `Est. ${rangeLabel(range)}`
    : usingQuoteFallback
      ? 'Today'
      : rangeLabel(range);
  const chartRangeLabel = usingEstimatedRangeFallback
    ? `Estimated ${rangeLabel(range)}`
    : usingQuoteFallback
      ? 'Today from quotes'
      : rangeLabel(range);
  const veryCompactPortfolio = size.sizeClass === 'tiny'
    || size.pixelHeight < 220
    || size.pixelWidth < 260;
  const compactChange = veryCompactPortfolio
    ? {
        value: snapshot.dailyGain,
        percent: snapshot.dailyGainPercent,
      }
    : activeChange;
  const compactPortfolio = veryCompactPortfolio
    || size.pixelHeight < 390;
  const showChart = snapshot.positions.length > 0 && !veryCompactPortfolio;
  const showHoldingRows = snapshot.positions.length > 0 && !compactPortfolio;
  const chartFillsAvailableSpace = showChart && !showHoldingRows;
  const maxPositions = size.pixelHeight < 360 ? 2 : size.pixelHeight < 500 ? 3 : 5;

  const loadPortfolio = useCallback(async (background = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!background) {
      setLoading(true);
    }
    setError(null);

    if (holdings.length === 0) {
      setQuotes([]);
      setHistory([]);
      setLoading(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      return;
    }

    try {
      const quoteResults = await Promise.allSettled(
        holdings.map((holding) => fetchStockQuote(holding.symbol, controller.signal)),
      );
      const nextQuotes = quoteResults
        .filter((result): result is PromiseFulfilledResult<StockQuote> => result.status === 'fulfilled')
        .map((result) => result.value);

      const historyResults = await Promise.allSettled(
        holdings.map(async (holding) => ({
          symbol: holding.symbol,
          history: await fetchStockHistory(holding.symbol, range, controller.signal),
        })),
      );
      const historyBySymbol: Record<string, StockHistoryPoint[]> = {};
      historyResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          historyBySymbol[result.value.symbol] = result.value.history;
        }
      });

      if (controller.signal.aborted) return;
      setQuotes(nextQuotes);
      setHistory(buildPortfolioHistory(holdings, historyBySymbol));
      if (nextQuotes.length === 0) {
        setError('No portfolio quotes available right now.');
      }
    } catch (portfolioError) {
      if (controller.signal.aborted) return;
      setQuotes([]);
      setHistory([]);
      setError((portfolioError as Error).message || 'Could not load portfolio.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [holdingKey, holdings, range]);

  useEffect(() => {
    void loadPortfolio(false);
  }, [loadPortfolio]);

  const { refreshNow } = useDashboardRefresh({
    refreshOnMount: false,
    widget,
    onRefresh: (background) => loadPortfolio(background),
  });

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const selectRange = (nextRange: PortfolioRange) => {
    setRange(nextRange);
    onUpdateWidgetConfig?.(widget.id, {
      portfolioRange: nextRange,
    });
  };

  const toggleHoldingDisplay = (symbol: string) => {
    // Legacy per-symbol toggle still works for the existing price/total toggle.
    // Additionally cycle the persisted row display mode for the whole widget.
    cycleRowDisplayMode();
    setPriceModeSymbols((currentSymbols) => {
      const nextSymbols = new Set(currentSymbols);
      if (nextSymbols.has(symbol)) {
        nextSymbols.delete(symbol);
      } else {
        nextSymbols.add(symbol);
      }
      return nextSymbols;
    });
  };

  const changePositive = compactChange.value >= 0;
  const totalValueText = formatCurrency(snapshot.totalValue, snapshot.currency);
  const compactChangeText = formatPercent(compactChange.percent);

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
  const doubleClickEditEnabled = effectiveToggle(
    'doubleClickEditEnabled',
    boardInteractivity,
    widget.config,
  );
  const swipeGesturesEnabled = effectiveToggle(
    'swipeGesturesEnabled',
    boardInteractivity,
    widget.config,
  );
  const dropIntentsEnabled = effectiveToggle(
    'dropIntentsEnabled',
    boardInteractivity,
    widget.config,
  );
  const handlePortfolioDrop = useCallback(
    (payload: { payload: Record<string, unknown> }) => {
      const rawSymbol = payload.payload.symbol;
      const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';
      if (!symbol) return;
      // Open the inline search and pre-select the dropped symbol so
      // the user can confirm share count.
      setSearchOpen(true);
      setSelectedSymbol({ symbol, name: symbol, exchange: undefined, type: undefined });
      setSharesAddDraft('1');
      dashboardToastBus.show({
        id: `portfolio-add-${widget.id}-${symbol}`,
        label: `Add holding: ${symbol}`,
      });
    },
    [widget.id],
  );
  useDropIntentTarget(widget.id, handlePortfolioDrop, {
    enabled: dropIntentsEnabled,
  });
  const dropBindings = useDashboardDropTarget({
    widgetId: widget.id,
    widgetType: widget.type,
    enabled: dropIntentsEnabled,
  });
  const [editingSharesSymbol, setEditingSharesSymbol] = useState<string | null>(null);
  const [sharesDraft, setSharesDraft] = useState('');
  const sharesInputRef = useRef<HTMLInputElement | null>(null);
  const lastSharesTapRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (editingSharesSymbol) {
      sharesInputRef.current?.focus();
      sharesInputRef.current?.select();
    }
  }, [editingSharesSymbol]);
  const commitSharesEdit = useCallback(() => {
    const symbol = editingSharesSymbol;
    if (!symbol) return;
    const parsed = Number(sharesDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingSharesSymbol(null);
      return;
    }
    if (!onUpdateWidgetConfig) {
      setEditingSharesSymbol(null);
      return;
    }
    const nextHoldings = holdings.map((holding) =>
      holding.symbol === symbol
        ? { ...holding, shares: parsed }
        : holding,
    );
    onUpdateWidgetConfig(widget.id, { portfolioHoldings: nextHoldings });
    setEditingSharesSymbol(null);
  }, [editingSharesSymbol, holdings, onUpdateWidgetConfig, sharesDraft, widget.id]);
  const visiblePositions = useMemo(
    () => snapshot.positions.slice(0, maxPositions),
    [snapshot.positions, maxPositions],
  );
  const handleReorderPositions = useCallback(
    (nextVisible: PortfolioPosition[]) => {
      if (!onUpdateWidgetConfig) return;
      // Rebuild holdings by mapping the reordered visible-position
      // symbols back onto the full holdings array. Hidden holdings
      // (beyond `maxPositions`) stay in their original order after the
      // visible block.
      const visibleIds = new Set(
        snapshot.positions.slice(0, maxPositions).map((p) => p.id),
      );
      const holdingById = new Map(holdings.map((h) => [h.id, h]));
      const reorderedVisible: PortfolioHolding[] = nextVisible
        .map((p) => holdingById.get(p.id))
        .filter((h): h is PortfolioHolding => Boolean(h));
      const tail = holdings.filter((h) => !visibleIds.has(h.id));
      onUpdateWidgetConfig(widget.id, {
        portfolioHoldings: [...reorderedVisible, ...tail],
      });
    },
    [holdings, maxPositions, onUpdateWidgetConfig, snapshot.positions, widget.id],
  );
  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<PortfolioPosition>(
    visiblePositions,
    handleReorderPositions,
    {
      keyExtractor: (item) => item.id,
      enabled: dragReorderEnabled && Boolean(onUpdateWidgetConfig),
    },
  );

  const formatTotalValue = React.useCallback(
    (n: number) => formatCurrency(n, snapshot.currency),
    [snapshot.currency],
  );

  useWidgetAriaAnnouncer(
    widget.id,
    snapshot.positions.length > 0 ? `Portfolio total ${totalValueText}` : '',
  );

  // --- Inline search state ---
  const searchInputId = useId();
  const sharesAddInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<StockSearchResult | null>(null);
  const [sharesAddDraft, setSharesAddDraft] = useState('1');
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (selectedSymbol) {
      const frame = window.requestAnimationFrame(() => {
        sharesAddInputRef.current?.focus();
        sharesAddInputRef.current?.select();
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [selectedSymbol]);

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
    setSelectedSymbol(null);
    runSearch(value);
  }, [runSearch]);

  const handleSelectSymbol = useCallback((result: StockSearchResult) => {
    setSelectedSymbol(result);
    setSharesAddDraft('1');
  }, []);

  const handleAddHolding = useCallback(() => {
    if (!onUpdateWidgetConfig || !selectedSymbol) return;
    const shares = Number(sharesAddDraft);
    if (!Number.isFinite(shares) || shares <= 0) return;
    const symbol = selectedSymbol.symbol;
    const nextHoldings: PortfolioHolding[] = [
      ...holdings,
      {
        id: `${symbol}-${Date.now()}`,
        symbol,
        shares,
        name: selectedSymbol.name,
      },
    ];
    onUpdateWidgetConfig(widget.id, { portfolioHoldings: nextHoldings });
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSymbol(null);
    setSharesAddDraft('1');
    setSearchOpen(false);
  }, [onUpdateWidgetConfig, selectedSymbol, sharesAddDraft, holdings, widget.id]);

  const handleRemoveHolding = useCallback((holdingId: string, symbol: string) => {
    if (!onUpdateWidgetConfig) return;
    const removedHolding = holdings.find((h) => h.id === holdingId);
    const nextHoldings = holdings.filter((h) => h.id !== holdingId);
    onUpdateWidgetConfig(widget.id, { portfolioHoldings: nextHoldings });
    dashboardToastBus.show({
      id: `portfolio-remove-${holdingId}`,
      label: `Removed ${symbol}`,
      tone: 'default',
      onUndo: () => {
        if (removedHolding) {
          onUpdateWidgetConfig(widget.id, {
            portfolioHoldings: [...nextHoldings, removedHolding],
          });
        }
      },
    });
  }, [onUpdateWidgetConfig, holdings, widget.id]);

  return (
    <WidgetShell
      widget={widget}
      title="Portfolio"
      icon={<BriefcaseBusiness size={14} className="text-emerald-400" />}
      accent="emerald"
      bare={veryCompactPortfolio}
      padded={!veryCompactPortfolio}
      rightSlot={
        <>
          {onUpdateWidgetConfig && (
            <button
              type="button"
              aria-label={searchOpen ? 'Close holding search' : 'Add portfolio holding'}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((open) => !open);
                if (searchOpen) {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSelectedSymbol(null);
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
            aria-label="Refresh portfolio"
            onClick={() => refreshNow(false)}
            className="dashboard-widget-control-button"
          >
            <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </>
      }
    >
      <WidgetBody
        data-testid="portfolio-widget-body"
        gap={veryCompactPortfolio ? 'xs' : compactPortfolio ? 'sm' : 'md'}
        align={veryCompactPortfolio ? 'center' : 'start'}
        className={`text-[var(--ether-on-surface)] ${
          veryCompactPortfolio ? 'items-center px-2 py-2 text-center' : ''
        }`}
        onDragOver={dropBindings.onDragOver}
        onDrop={dropBindings.onDrop}
      >
        {loading && holdings.length > 0 && quotes.length === 0 ? (
          <WidgetSkeleton variant="chart" />
        ) : (
        <>
        <div role="status" aria-live="polite" className="sr-only">
          {dragAnnouncement}
        </div>
        {searchOpen && !veryCompactPortfolio && (
          <div className="relative z-20 shrink-0">
            {!selectedSymbol ? (
              <>
                <label htmlFor={searchInputId} className="sr-only">
                  Search stock to add to portfolio
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
                        handleSelectSymbol(searchResults[0]);
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
                    aria-label="Search stock to add to portfolio"
                    autoComplete="off"
                  />
                </div>
                {(searchResults.length > 0 || (searchQuery.trim().length >= 2 && !searchLoading)) && (
                  <div
                    role="listbox"
                    aria-label="Stock search results"
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-1.5 text-[var(--ether-on-surface)] shadow-[0_18px_46px_rgba(0,0,0,0.22)] backdrop-blur-xl"
                  >
                    {searchResults.length === 0 && !searchLoading ? (
                      <div className="px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                        No matching symbols
                      </div>
                    ) : (
                      searchResults.map((result) => (
                        <button
                          key={result.symbol}
                          type="button"
                          role="option"
                          aria-selected="false"
                          onClick={() => handleSelectSymbol(result)}
                          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--ether-control-hover)] focus:bg-[var(--ether-control-hover)] focus:outline-none"
                          aria-label={`Select ${result.symbol}`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-bold leading-tight text-[var(--ether-on-surface)]">
                              {result.symbol}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-[var(--ether-on-surface-variant)]">
                              {result.name}{result.exchange ? ` \u00B7 ${result.exchange}` : ''}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {searchLoading && searchQuery.trim().length >= 2 && (
                  <div className="mt-1.5 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                    Searching...
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-2 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[var(--ether-on-surface)]">{selectedSymbol.symbol}</div>
                  <div className="truncate text-[10px] font-semibold text-[var(--ether-on-surface-variant)]">{selectedSymbol.name}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <label className="text-[10px] font-bold text-[var(--ether-on-surface-variant)]">Shares:</label>
                  <input
                    ref={sharesAddInputRef}
                    type="number"
                    step="any"
                    min={0.0001}
                    value={sharesAddDraft}
                    onChange={(event) => setSharesAddDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddHolding();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setSelectedSymbol(null);
                      }
                    }}
                    className="w-16 rounded-lg border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-2 py-1 text-xs font-bold text-[var(--ether-on-surface)] outline-none focus:border-emerald-400/50"
                    aria-label={`Number of ${selectedSymbol.symbol} shares`}
                  />
                  <button
                    type="button"
                    onClick={handleAddHolding}
                    className="inline-flex min-h-7 items-center rounded-full bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white shadow-sm transition hover:bg-emerald-400"
                    aria-label={`Add ${selectedSymbol.symbol} to portfolio`}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSymbol(null)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-error)]/10 hover:text-[var(--ether-error)]"
                    aria-label="Cancel"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div
          className={
            veryCompactPortfolio
              ? 'grid h-full w-full min-w-0 content-center justify-items-center gap-1'
              : 'min-w-0 shrink-0'
          }
        >
          <WidgetText
            variant="label"
            tone="muted"
            align={veryCompactPortfolio ? 'center' : undefined}
            className={veryCompactPortfolio ? 'text-[9px] leading-none tracking-[0.16em]' : ''}
          >
            Total Value
          </WidgetText>
          {veryCompactPortfolio ? (
            <div data-testid="portfolio-total-value" className="w-full min-w-0 px-0.5">
              <FitText
                as="div"
                min={0.9}
                max={size.pixelWidth < 145 ? 1.35 : 1.65}
                availableHeight={Math.max(30, Math.min(42, size.pixelHeight * 0.34))}
                className="font-black tracking-normal text-[var(--ether-on-surface)] tabular-nums"
              >
                {totalValueText}
              </FitText>
            </div>
          ) : (
            <div className="mt-1 text-[clamp(1.4rem,6.4vw,2.15rem)] font-black leading-[0.95] tracking-normal text-[var(--ether-on-surface)]">
              {rollingEnabled ? (
                <WidgetCounter
                  value={snapshot.totalValue}
                  precision={2}
                  format={formatTotalValue}
                  ariaLabel={`Portfolio total ${totalValueText}`}
                />
              ) : (
                totalValueText
              )}
            </div>
          )}
          <div
            data-testid={veryCompactPortfolio ? 'portfolio-compact-change' : undefined}
            aria-label={`${changePositive ? 'Portfolio up' : 'Portfolio down'} ${compactChangeText}`}
            className={`flex min-w-0 items-center gap-x-1 gap-y-0.5 font-bold tabular-nums ${
              veryCompactPortfolio
                ? 'mt-0 justify-center text-[11px] leading-none'
                : 'mt-1 flex-wrap text-[11px]'
            } ${changePositive ? 'text-emerald-500' : 'text-rose-500'}`}
          >
            {changePositive ? <TrendingUp size={13} className="shrink-0" /> : <TrendingDown size={13} className="shrink-0" />}
            {!veryCompactPortfolio && (
              <>
                {changePositive ? '+' : ''}{formatCurrency(compactChange.value, snapshot.currency)}
              </>
            )}
            <span>{veryCompactPortfolio ? compactChangeText : `(${compactChangeText})`}</span>
            {!veryCompactPortfolio && (
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                {portfolioChangeLabel}
              </span>
            )}
          </div>
        </div>

        {showChart && (
          <div
            data-testid="portfolio-chart-card"
            className={`relative z-10 flex min-h-0 flex-col overflow-hidden rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface)] ${
              chartFillsAvailableSpace ? 'flex-1' : 'shrink-0'
            } ${compactPortfolio ? 'p-2' : 'p-2.5'}`}
          >
            <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
              <WidgetText variant="label" tone="muted">{chartRangeLabel}</WidgetText>
              {chartBaselineValue > 0 && !compactPortfolio && (
                <span className="truncate text-[var(--ether-on-surface)] tabular-nums">
                  {formatCurrency(chartBaselineValue, snapshot.currency)}
                  {' -> '}
                  {formatCurrency(snapshot.totalValue, snapshot.currency)}
                </span>
              )}
            </div>
            <svg
              aria-label="Historical portfolio value chart"
              viewBox="0 0 100 56"
              preserveAspectRatio="none"
              className={`w-full overflow-visible ${
                chartFillsAvailableSpace
                  ? 'min-h-12 flex-1'
                  : compactPortfolio
                    ? 'h-14 shrink-0'
                    : 'h-[4.75rem] shrink-0'
              }`}
            >
              <defs>
                <linearGradient id={`portfolio-area-${widget.id}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[12, 28, 44].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeWidth="0.5"
                />
              ))}
              {chartAreaPath && (
                <path
                  d={chartAreaPath}
                  fill={`url(#portfolio-area-${widget.id})`}
                  className={changePositive ? 'text-emerald-500' : 'text-rose-500'}
                />
              )}
              {chartPath ? (
                <path
                  d={chartPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={changePositive ? 'text-emerald-500' : 'text-rose-500'}
                />
              ) : null}
            </svg>
            {!chartPath && (
              <div className="pointer-events-none absolute inset-x-3 top-10 text-center">
                <WidgetText variant="label" tone="muted" align="center">
                  No history yet
                </WidgetText>
              </div>
            )}
            <div
              data-testid="portfolio-range-controls"
              className={`grid shrink-0 grid-cols-7 gap-1 ${compactPortfolio ? 'mt-1' : 'mt-1.5'}`}
            >
              {PORTFOLIO_RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={range === item.id}
                  onClick={() => selectRange(item.id)}
                  className={`min-h-6 rounded-full px-1 text-[9px] font-black uppercase transition ${
                    range === item.id
                      ? 'bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.2)]'
                      : 'bg-[var(--ether-surface-container-low)]/70 text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && !loading && quotes.length === 0 ? (
          <WidgetInlineError message={error} widgetId={widget.id} />
        ) : error && !loading && quotes.length > 0 ? (
          <div className="rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
            {error}
          </div>
        ) : null}

        {showHoldingRows ? (
          <div className="dashboard-widget-touch-scroll-y relative z-0 grid min-h-0 flex-1 content-start gap-1.5 pr-1">
            {visiblePositions.map((position, index) => (
              <PortfolioHoldingRow
                key={position.id}
                position={position}
                index={index}
                getRowBindings={getRowBindings}
                dragReorderEnabled={dragReorderEnabled}
                swipeGesturesEnabled={swipeGesturesEnabled}
                doubleClickEditEnabled={doubleClickEditEnabled}
                onUpdateWidgetConfig={onUpdateWidgetConfig}
                onRemove={handleRemoveHolding}
                priceModeSymbols={priceModeSymbols}
                toggleHoldingDisplay={toggleHoldingDisplay}
                editingSharesSymbol={editingSharesSymbol}
                setEditingSharesSymbol={setEditingSharesSymbol}
                sharesDraft={sharesDraft}
                setSharesDraft={setSharesDraft}
                sharesInputRef={sharesInputRef}
                commitSharesEdit={commitSharesEdit}
                lastSharesTapRef={lastSharesTapRef}
                snapshot={snapshot}
              />
            ))}
          </div>
        ) : !veryCompactPortfolio && snapshot.positions.length === 0 && !loading && !error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[1rem] border border-dashed border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-4 text-center">
            <WidgetText variant="label" tone="muted" align="center">
              No holdings yet
            </WidgetText>
            {onUpdateWidgetConfig && (
              <button
                type="button"
                aria-label="Add holding"
                onClick={() => setSearchOpen(true)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-emerald-500 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_28px_rgba(16,185,129,0.22)] transition hover:bg-emerald-400"
              >
                <Search size={12} />
                Add holding
              </button>
            )}
          </div>
        ) : null}
        </>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default PortfolioWidget;
