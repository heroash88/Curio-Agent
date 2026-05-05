import React, { useCallback, useMemo, useState } from 'react';
import { AlertCircle, GripVertical, Bell } from 'lucide-react';
import { WidgetBody, WidgetText, WidgetInlineError } from '../widgetPrimitives';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../../services/dashboardTypes';
import { parseStockSymbols, DEFAULT_STOCK_SYMBOLS } from '../../../../services/stockMarketService';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface StocksMultiTimeframeProps {
  widget: DashboardWidget;
  focused?: boolean;
  onOpenWidgetSettings?: (widgetId: string) => void;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y', '5Y'];

interface AlertRule {
  symbol: string;
  above?: number;
  below?: number;
}

/**
 * StocksMultiTimeframe — focused overlay editor for the Stocks widget.
 * Renders a multi-timeframe chart selector, symbol reorder handles,
 * and a simple alert rules editor (threshold per symbol).
 *
 * Requirements: 13.2, 13.9
 */
const StocksMultiTimeframe: React.FC<StocksMultiTimeframeProps> = ({
  widget,
  onUpdateWidgetConfig,
}) => {
  const [timeframe, setTimeframe] = useWidgetPersistentState<Timeframe>(
    widget.id, 'focused-timeframe', '1D',
  );
  const [error] = useState<string | null>(null);

  const symbols = useMemo(
    () => parseStockSymbols(widget.config.symbols ?? DEFAULT_STOCK_SYMBOLS),
    [widget.config.symbols],
  );

  const [alerts, setAlerts] = useWidgetPersistentState<AlertRule[]>(
    widget.id, 'alert-rules', [],
  );

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    if (!onUpdateWidgetConfig || fromIdx === toIdx) return;
    const next = [...symbols];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onUpdateWidgetConfig(widget.id, { symbols: next.join(',') });
  }, [onUpdateWidgetConfig, symbols, widget.id]);

  const handleAlertChange = useCallback((symbol: string, field: 'above' | 'below', value: string) => {
    const num = value === '' ? undefined : Number(value);
    setAlerts((prev) => {
      const existing = prev.find((a) => a.symbol === symbol);
      if (existing) {
        return prev.map((a) => a.symbol === symbol ? { ...a, [field]: num } : a);
      }
      return [...prev, { symbol, [field]: num }];
    });
  }, [setAlerts]);

  if (error) {
    return <WidgetInlineError message={error} widgetId={widget.id} />;
  }

  // Generate a simple SVG chart path based on timeframe
  const chartPath = useMemo(() => {
    const seed = TIMEFRAMES.indexOf(timeframe) + 1;
    const points = Array.from({ length: 20 }, (_, i) => {
      const x = (i / 19) * 100;
      const y = 50 + Math.sin((i * seed * 0.7) + seed) * 25 + Math.cos(i * 0.3) * 10;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${Math.max(5, Math.min(95, y)).toFixed(1)}`;
    });
    return points.join(' ');
  }, [timeframe]);

  return (
    <WidgetBody gap="md" scroll="y">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1 rounded-xl bg-[var(--ether-surface-container-low)] p-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              timeframe === tf
                ? 'bg-[var(--ether-primary)] text-[var(--ether-on-primary)] shadow-sm'
                : 'text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div className="relative h-40 w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 p-3">
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          <path d={`${chartPath} L 100 100 L 0 100 Z`} fill="currentColor" className="text-emerald-400/10" />
          <path d={chartPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-emerald-400" />
        </svg>
        <div className="absolute bottom-2 left-3 text-[10px] text-[var(--ether-on-surface-variant)]">
          {timeframe} chart
        </div>
      </div>

      {/* Symbol reorder */}
      <div className="space-y-1">
        <WidgetText variant="label" tone="muted">Symbols (drag to reorder)</WidgetText>
        {symbols.map((sym, idx) => (
          <div
            key={sym}
            className="flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2"
          >
            <button
              type="button"
              className="cursor-grab text-[var(--ether-on-surface-variant)] hover:text-[var(--ether-on-surface)]"
              aria-label={`Move ${sym}`}
              onPointerDown={() => {}}
              onClick={() => {
                if (idx > 0) handleReorder(idx, idx - 1);
              }}
            >
              <GripVertical size={14} />
            </button>
            <span className="flex-1 text-sm font-semibold text-[var(--ether-on-surface)]">{sym}</span>
            <span className="text-xs text-[var(--ether-on-surface-variant)]">#{idx + 1}</span>
          </div>
        ))}
      </div>

      {/* Alert rules editor */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Bell size={12} className="text-[var(--ether-on-surface-variant)]" />
          <WidgetText variant="label" tone="muted">Price Alerts</WidgetText>
        </div>
        {symbols.slice(0, 5).map((sym) => {
          const rule = alerts.find((a) => a.symbol === sym);
          return (
            <div key={sym} className="flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2">
              <span className="w-14 text-xs font-bold text-[var(--ether-on-surface)]">{sym}</span>
              <div className="flex flex-1 items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-[var(--ether-on-surface-variant)]">
                  Above
                  <input
                    type="number"
                    step="0.01"
                    value={rule?.above ?? ''}
                    onChange={(e) => handleAlertChange(sym, 'above', e.target.value)}
                    className="w-16 rounded-md border border-[var(--ether-glass-border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--ether-on-surface)]"
                    placeholder="—"
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-[var(--ether-on-surface-variant)]">
                  Below
                  <input
                    type="number"
                    step="0.01"
                    value={rule?.below ?? ''}
                    onChange={(e) => handleAlertChange(sym, 'below', e.target.value)}
                    className="w-16 rounded-md border border-[var(--ether-glass-border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--ether-on-surface)]"
                    placeholder="—"
                  />
                </label>
              </div>
              {(rule?.above || rule?.below) && (
                <AlertCircle size={12} className="text-amber-400" />
              )}
            </div>
          );
        })}
      </div>
    </WidgetBody>
  );
};

export default StocksMultiTimeframe;
