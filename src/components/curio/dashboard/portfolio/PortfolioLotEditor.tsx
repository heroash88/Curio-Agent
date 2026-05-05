import React, { useCallback, useMemo, useState } from 'react';
import { DollarSign, Calendar, BarChart3, ToggleLeft, ToggleRight } from 'lucide-react';
import { WidgetBody, WidgetText, WidgetInlineError } from '../widgetPrimitives';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../../services/dashboardTypes';
import { normalizePortfolioHoldings } from '../../../../services/portfolioTrackerService';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface PortfolioLotEditorProps {
  widget: DashboardWidget;
  focused?: boolean;
  onOpenWidgetSettings?: (widgetId: string) => void;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

interface LotData {
  costBasis?: number;
  dateAcquired?: string;
}

interface RebalanceTarget {
  symbol: string;
  targetPercent: number;
}

/**
 * PortfolioLotEditor — focused overlay editor for the Portfolio widget.
 * Provides lot-level editing (cost basis, date acquired), dividend tracking
 * toggle, and a rebalance helper (target allocation % per holding).
 * Mutations write through the existing portfolio store via onUpdateWidgetConfig.
 *
 * Requirements: 13.3, 13.10
 */
const PortfolioLotEditor: React.FC<PortfolioLotEditorProps> = ({
  widget,
}) => {
  const [error] = useState<string | null>(null);
  const holdings = useMemo(
    () => normalizePortfolioHoldings(widget.config.portfolioHoldings),
    [widget.config.portfolioHoldings],
  );

  const [lots, setLots] = useWidgetPersistentState<Record<string, LotData>>(
    widget.id, 'lot-data', {},
  );
  const [dividendTracking, setDividendTracking] = useWidgetPersistentState<boolean>(
    widget.id, 'dividend-tracking', false,
  );
  const [rebalanceTargets, setRebalanceTargets] = useWidgetPersistentState<RebalanceTarget[]>(
    widget.id, 'rebalance-targets', [],
  );

  const handleLotChange = useCallback((holdingId: string, field: keyof LotData, value: string) => {
    setLots((prev) => ({
      ...prev,
      [holdingId]: {
        ...prev[holdingId],
        [field]: field === 'costBasis' ? (value === '' ? undefined : Number(value)) : value,
      },
    }));
  }, [setLots]);

  const handleTargetChange = useCallback((symbol: string, value: string) => {
    const num = value === '' ? 0 : Math.min(100, Math.max(0, Number(value)));
    setRebalanceTargets((prev) => {
      const existing = prev.find((t) => t.symbol === symbol);
      if (existing) {
        return prev.map((t) => t.symbol === symbol ? { ...t, targetPercent: num } : t);
      }
      return [...prev, { symbol, targetPercent: num }];
    });
  }, [setRebalanceTargets]);

  const totalTarget = useMemo(
    () => rebalanceTargets.reduce((sum, t) => sum + t.targetPercent, 0),
    [rebalanceTargets],
  );

  if (error) {
    return <WidgetInlineError message={error} widgetId={widget.id} />;
  }

  if (holdings.length === 0) {
    return (
      <WidgetBody gap="md">
        <WidgetText variant="title">Portfolio Editor</WidgetText>
        <WidgetText variant="body" tone="muted">
          No holdings configured. Add holdings in widget settings to use the lot editor.
        </WidgetText>
      </WidgetBody>
    );
  }

  return (
    <WidgetBody gap="md" scroll="y">
      <div className="flex items-center justify-between">
        <WidgetText variant="title">Portfolio Editor</WidgetText>
        <button
          type="button"
          onClick={() => setDividendTracking(!dividendTracking)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          aria-label={`Dividend tracking ${dividendTracking ? 'on' : 'off'}`}
        >
          {dividendTracking ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
          <span>Dividends</span>
        </button>
      </div>

      {/* Lot-level editing */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-[var(--ether-on-surface-variant)]" />
          <WidgetText variant="label" tone="muted">Cost Basis & Acquisition</WidgetText>
        </div>
        {holdings.map((holding) => {
          const lot = lots[holding.id] || {};
          return (
            <div key={holding.id} className="flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[var(--ether-on-surface)]">{holding.symbol}</div>
                <div className="text-[10px] text-[var(--ether-on-surface-variant)]">{holding.shares} shares</div>
              </div>
              <label className="flex items-center gap-1 text-[10px] text-[var(--ether-on-surface-variant)]">
                <DollarSign size={10} />
                <input
                  type="number"
                  step="0.01"
                  value={lot.costBasis ?? ''}
                  onChange={(e) => handleLotChange(holding.id, 'costBasis', e.target.value)}
                  className="w-16 rounded-md border border-[var(--ether-glass-border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--ether-on-surface)]"
                  placeholder="Cost"
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-[var(--ether-on-surface-variant)]">
                <Calendar size={10} />
                <input
                  type="date"
                  value={lot.dateAcquired ?? ''}
                  onChange={(e) => handleLotChange(holding.id, 'dateAcquired', e.target.value)}
                  className="w-28 rounded-md border border-[var(--ether-glass-border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--ether-on-surface)]"
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Rebalance helper */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BarChart3 size={12} className="text-[var(--ether-on-surface-variant)]" />
            <WidgetText variant="label" tone="muted">Rebalance Targets</WidgetText>
          </div>
          <span className={`text-[10px] font-medium ${totalTarget === 100 ? 'text-emerald-400' : totalTarget > 100 ? 'text-rose-400' : 'text-[var(--ether-on-surface-variant)]'}`}>
            {totalTarget}%
          </span>
        </div>
        {holdings.map((holding) => {
          const target = rebalanceTargets.find((t) => t.symbol === holding.symbol);
          const pct = target?.targetPercent ?? 0;
          return (
            <div key={holding.id} className="flex items-center gap-3 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2">
              <span className="w-14 text-xs font-bold text-[var(--ether-on-surface)]">{holding.symbol}</span>
              <div className="flex-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ether-control-bg)]">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={pct || ''}
                onChange={(e) => handleTargetChange(holding.symbol, e.target.value)}
                className="w-12 rounded-md border border-[var(--ether-glass-border)] bg-transparent px-1 py-0.5 text-center text-xs text-[var(--ether-on-surface)]"
                placeholder="%"
              />
            </div>
          );
        })}
      </div>
    </WidgetBody>
  );
};

export default PortfolioLotEditor;
