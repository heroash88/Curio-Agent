import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

import {
  normalizePortfolioHoldings,
  removePortfolioHolding,
  upsertPortfolioHolding,
  type PortfolioHolding,
} from '../../../services/portfolioTrackerService';
import {
  searchStockSymbols,
  type StockSearchResult,
} from '../../../services/stockMarketService';

interface PortfolioHoldingsSettingsProps {
  holdings?: PortfolioHolding[];
  onHoldingsChange: (holdings: PortfolioHolding[]) => void;
  variant?: 'ether' | 'light';
}

const parseShares = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(6)) : 0;
};

const formatShares = (shares: number) =>
  Number.isInteger(shares) ? String(shares) : String(Number(shares.toFixed(6)));

const PortfolioHoldingsSettings: React.FC<PortfolioHoldingsSettingsProps> = ({
  holdings,
  onHoldingsChange,
  variant = 'ether',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [shareDraft, setShareDraft] = useState('1');
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const resultsId = useId();
  const searchAbortRef = useRef<AbortController | null>(null);

  const normalizedHoldings = useMemo(
    () => normalizePortfolioHoldings(holdings),
    [holdings],
  );

  const runSearch = useCallback((query: string) => {
    searchAbortRef.current?.abort();
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setSearchError(null);

    void searchStockSymbols(trimmedQuery, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return;
        setSuggestions(results);
      })
      .catch((searchFailure) => {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSearchError((searchFailure as Error).message || 'Could not search stocks.');
      })
      .finally(() => {
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      runSearch(searchQuery);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [runSearch, searchQuery]);

  useEffect(() => () => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }, []);

  const addHolding = useCallback((result: StockSearchResult) => {
    const shares = parseShares(shareDraft) || 1;
    onHoldingsChange(upsertPortfolioHolding(normalizedHoldings, {
      symbol: result.symbol,
      name: result.name,
      shares,
    }));
    setSearchQuery('');
    setShareDraft('1');
    setSuggestions([]);
    setSearchError(null);
  }, [normalizedHoldings, onHoldingsChange, shareDraft]);

  const updateShares = useCallback((holding: PortfolioHolding, value: string) => {
    const shares = parseShares(value);
    if (shares <= 0) {
      return;
    }
    onHoldingsChange(upsertPortfolioHolding(normalizedHoldings, {
      ...holding,
      shares,
    }));
  }, [normalizedHoldings, onHoldingsChange]);

  const removeHolding = useCallback((symbol: string) => {
    onHoldingsChange(removePortfolioHolding(normalizedHoldings, symbol));
  }, [normalizedHoldings, onHoldingsChange]);

  const handleSearchSubmit = useCallback(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;
    if (suggestions.length > 0) {
      addHolding(suggestions[0]);
      return;
    }
    runSearch(trimmedQuery);
  }, [addHolding, runSearch, searchQuery, suggestions]);

  const panelClass = variant === 'light'
    ? 'rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm'
    : 'rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3';
  const labelClass = variant === 'light'
    ? 'text-sm font-semibold text-slate-800'
    : 'text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]';
  const inputClass = variant === 'light'
    ? 'h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white'
    : 'h-10 w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] px-3 text-sm font-medium text-[var(--ether-on-surface)] outline-none transition focus:border-[var(--ether-primary)]/45 focus:bg-[var(--ether-control-hover)]';
  const iconButtonClass = variant === 'light'
    ? 'grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900'
    : 'grid h-8 w-8 place-items-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]';
  const suggestionClass = variant === 'light'
    ? 'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100'
    : 'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)]';
  const rowClass = variant === 'light'
    ? 'grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]'
    : 'grid gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]';

  return (
    <div className={panelClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className={labelClass}>Portfolio Holdings</div>
          <div className="mt-1 text-xs leading-5 opacity-60">
            Add tickers and the share count you own.
          </div>
        </div>
        {searching && (
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-50">
            ...
          </div>
        )}
      </div>

      <div className="mb-3 grid gap-2">
        {normalizedHoldings.length > 0 ? normalizedHoldings.map((holding) => (
          <div key={holding.id} className={rowClass}>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{holding.symbol}</div>
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] opacity-45">
                {holding.name || 'Holding'}
              </div>
            </div>
            <label className="grid gap-1">
              <span className="sr-only">Shares for {holding.symbol}</span>
              <input
                aria-label={`Shares for ${holding.symbol}`}
                inputMode="decimal"
                defaultValue={formatShares(holding.shares)}
                onBlur={(event) => updateShares(holding, event.currentTarget.value)}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              aria-label={`Remove ${holding.symbol}`}
              onClick={() => removeHolding(holding.symbol)}
              className={iconButtonClass}
            >
              <X size={14} />
            </button>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-current/15 px-3 py-4 text-center text-xs font-medium opacity-55">
            No holdings yet
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-45"
          />
          <input
            role="combobox"
            aria-label="Search portfolio stocks"
            aria-controls={resultsId}
            aria-expanded={suggestions.length > 0}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSearchSubmit();
              }
            }}
            placeholder="Search company or ticker"
            className={`${inputClass} pl-9 pr-11`}
          />
          <button
            type="button"
            aria-label="Search stock symbols"
            onClick={handleSearchSubmit}
            className={`${iconButtonClass} absolute right-1 top-1/2 -translate-y-1/2`}
          >
            <Search size={13} />
          </button>
        </div>
        <label className="grid gap-1">
          <span className="sr-only">Shares to add</span>
          <input
            aria-label="Shares to add"
            inputMode="decimal"
            value={shareDraft}
            onChange={(event) => setShareDraft(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {suggestions.length > 0 && (
        <div
          id={resultsId}
          role="listbox"
          className={variant === 'light'
            ? 'mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm'
            : 'mt-2 max-h-44 overflow-y-auto rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-1'}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.symbol}
              type="button"
              role="option"
              aria-selected="false"
              aria-label={`${suggestion.name} ${suggestion.symbol}${suggestion.exchange ? ` ${suggestion.exchange}` : ''}`}
              onClick={() => addHolding(suggestion)}
              className={suggestionClass}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{suggestion.name}</span>
                <span className="block truncate text-[10px] font-bold uppercase opacity-55">
                  {suggestion.symbol}{suggestion.exchange ? ` ${suggestion.exchange}` : ''}
                </span>
              </span>
              <Plus size={14} className="shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      )}

      {searchError && (
        <div className={variant === 'light'
          ? 'mt-2 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700'
          : 'mt-2 rounded-xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-2 py-1.5 text-xs text-[var(--ether-error)]'}
        >
          {searchError}
        </div>
      )}
    </div>
  );
};

export default PortfolioHoldingsSettings;
