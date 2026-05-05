import React, { useCallback } from 'react';
import { Eraser } from 'lucide-react';

import {
  clearWidgetSparklineHistory,
  getWidgetSparklineHistory,
} from '../../../services/dashboardSparklineStore';
import type { DashboardWidget } from '../../../services/dashboardTypes';

/**
 * `WidgetSparklineHistoryControl`
 *
 * Small helper rendered inside each sparkline-producing widget's
 * settings sheet so users can wipe their stored trend when they want to
 * "start fresh" (Requirement 3.7).
 *
 * Accepts either a single `sparklineKey` or a list of keys; clicking the
 * button calls `clearWidgetSparklineHistory(widget.id, key)` for each
 * one and then re-reads so the button can disable itself when no
 * samples remain.
 *
 * The control is intentionally minimal — a single line-high outlined
 * button — so it composes cleanly in tight settings sheets.
 */
export interface WidgetSparklineHistoryControlProps {
  widget: DashboardWidget;
  /** Sparkline key to clear. Ignored if `sparklineKeys` is provided. */
  sparklineKey?: string;
  /** Optional array of keys to clear in one click (e.g. per-symbol). */
  sparklineKeys?: readonly string[];
  /** Optional label override, default "Clear trend". */
  label?: string;
  className?: string;
}

const WidgetSparklineHistoryControl: React.FC<
  WidgetSparklineHistoryControlProps
> = ({ widget, sparklineKey, sparklineKeys, label = 'Clear trend', className = '' }) => {
  const keys = React.useMemo<readonly string[]>(() => {
    if (sparklineKeys && sparklineKeys.length > 0) return sparklineKeys;
    if (sparklineKey) return [sparklineKey];
    return [];
  }, [sparklineKey, sparklineKeys]);

  const [samplesPresent, setSamplesPresent] = React.useState<boolean>(() =>
    keys.some((key) => getWidgetSparklineHistory(widget.id, key).length > 0),
  );

  React.useEffect(() => {
    setSamplesPresent(
      keys.some((key) => getWidgetSparklineHistory(widget.id, key).length > 0),
    );
    // Re-check whenever settings-changed fires (writes happen on append
    // and on clear, both dispatch the same event).
    const onChanged = () => {
      setSamplesPresent(
        keys.some((key) => getWidgetSparklineHistory(widget.id, key).length > 0),
      );
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('curio:settings-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      window.removeEventListener('curio:settings-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, [keys, widget.id]);

  const handleClear = useCallback(() => {
    for (const key of keys) {
      clearWidgetSparklineHistory(widget.id, key);
    }
    setSamplesPresent(false);
  }, [keys, widget.id]);

  if (keys.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={!samplesPresent}
      data-testid="widget-sparkline-history-clear"
      aria-label={label}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)] disabled:cursor-default disabled:opacity-50 ${className}`.trim()}
    >
      <Eraser size={12} aria-hidden />
      <span>{label}</span>
    </button>
  );
};

export default WidgetSparklineHistoryControl;
