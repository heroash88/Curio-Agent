import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

import {
  DEFAULT_STOCK_SYMBOLS,
  parseStockSymbols,
  removeStockSymbol,
  searchStockSymbols,
  upsertStockSymbol,
  type StockSearchResult,
} from '../../../services/stockMarketService';

interface StockSymbolSettingsProps {
  symbols?: string;
  onSymbolsChange: (symbols: string) => void;
  variant?: 'ether' | 'light';
}

const getSymbolSource = (symbols: string | undefined) =>
  symbols == null ? DEFAULT_STOCK_SYMBOLS : symbols;

const StockSymbolSettings: React.FC<StockSymbolSettingsProps> = ({
  symbols,
  onSymbolsChange,
  variant = 'ether',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const resultsId = useId();
  const searchAbortRef = useRef<AbortController | null>(null);

  const trackedSymbols = useMemo(
    () => parseStockSymbols(getSymbolSource(symbols)),
    [symbols],
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

  const addSymbol = useCallback((symbol: string) => {
    const nextSymbols = upsertStockSymbol(getSymbolSource(symbols), symbol);
    onSymbolsChange(nextSymbols);
    setSearchQuery('');
    setSuggestions([]);
    setSearchError(null);
  }, [onSymbolsChange, symbols]);

  const removeSymbol = useCallback((symbol: string) => {
    onSymbolsChange(removeStockSymbol(getSymbolSource(symbols), symbol));
  }, [onSymbolsChange, symbols]);

  const handleSearchSubmit = useCallback(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;
    if (suggestions.length > 0) {
      addSymbol(suggestions[0].symbol);
      return;
    }
    runSearch(trimmedQuery);
  }, [addSymbol, runSearch, searchQuery, suggestions]);

  const panelClass = variant === 'light'
    ? 'rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm'
    : 'rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3';
  const labelClass = variant === 'light'
    ? 'text-sm font-semibold text-slate-800'
    : 'text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]';
  const inputClass = variant === 'light'
    ? 'h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-11 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white'
    : 'h-10 w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] pl-9 pr-11 text-sm font-medium text-[var(--ether-on-surface)] outline-none transition focus:border-[var(--ether-primary)]/45 focus:bg-[var(--ether-control-hover)]';
  const chipClass = variant === 'light'
    ? 'inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1 text-[11px] font-bold uppercase text-slate-700'
    : 'inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] pl-2.5 pr-1 text-[11px] font-bold uppercase text-[var(--ether-on-surface)]';
  const iconButtonClass = variant === 'light'
    ? 'grid h-7 w-7 place-items-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900'
    : 'grid h-7 w-7 place-items-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]';
  const suggestionClass = variant === 'light'
    ? 'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100'
    : 'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)]';

  return (
    <div className={panelClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={labelClass}>Symbols</div>
        {searching && (
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-50">
            ...
          </div>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Tracked stocks">
        {trackedSymbols.length > 0 ? trackedSymbols.map((symbol) => (
          <span key={symbol} className={chipClass}>
            <span className="truncate">{symbol}</span>
            <button
              type="button"
              aria-label={`Remove ${symbol}`}
              onClick={() => removeSymbol(symbol)}
              className={iconButtonClass}
            >
              <X size={12} />
            </button>
          </span>
        )) : (
          <div className="text-xs font-medium opacity-55">No symbols tracked</div>
        )}
      </div>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-45"
        />
        <input
          role="combobox"
          aria-label="Search stocks"
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
          className={inputClass}
        />
        <button
          type="button"
          aria-label="Search stock symbols"
          onClick={handleSearchSubmit}
          className={`${iconButtonClass} absolute right-1.5 top-1/2 -translate-y-1/2`}
        >
          <Search size={13} />
        </button>
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
              onClick={() => addSymbol(suggestion.symbol)}
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

export default StockSymbolSettings;
