import React from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';

interface WidgetStatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Optional left accent color, e.g. a dot or icon */
  accent?: React.ReactNode;
  /** Render extra compact (smaller padding, smaller label) */
  dense?: boolean;
}

/**
 * WidgetStat -- the single shared "label + value" row used across dashboard widgets.
 *
 * Every widget that lists key/value pairs (Astronomy, DateInfo, HaEntities,
 * Timers, Forecast...) should use this so the dashboard reads consistently.
 */
export const WidgetStat: React.FC<WidgetStatProps> = ({
  label,
  value,
  hint,
  accent,
  dense = false,
}) => {
  const theme = useCardTheme();
  return (
    <div
      className={`flex items-center gap-2 rounded-lg ${theme.surfaceContainerLow} ${
        dense ? 'px-2.5 py-1.5' : 'px-3 py-2'
      }`}
    >
      {accent && <span className="shrink-0">{accent}</span>}
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[10px] font-bold uppercase tracking-[0.1em] ${theme.muted}`}
        >
          {label}
        </div>
        {hint && (
          <div className={`truncate text-[11px] ${theme.onSurfaceVariant}`}>{hint}</div>
        )}
      </div>
      <div
        className={`shrink-0 text-right text-sm font-bold tabular-nums ${theme.onSurface}`}
      >
        {value}
      </div>
    </div>
  );
};

export default WidgetStat;
