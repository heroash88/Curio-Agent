import React from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useSyncedDashboardTime } from '../../../hooks/useSyncedDashboardTime';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { useClockShowSeconds, useClockUse24Hour } from '../../../utils/settingsStorage';
import WidgetShell from './WidgetShell';
import { IconClock } from './widgetIcons';
import { WidgetBody, WidgetText } from './widgetPrimitives';

const ClockWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const showSeconds = useClockShowSeconds();
  const use24Hour = useClockUse24Hour();
  const now = useSyncedDashboardTime(showSeconds ? 'second' : 'minute');

  const rawTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' as const } : {}),
    hour12: !use24Hour,
  });
  const [timeStr, ampmStr = ''] = rawTime.split(/\s+/);
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  // Preset-driven sizing: every size class has a deliberate look
  const preset = (() => {
    switch (size.sizeClass) {
      case 'tiny':   return { time: 'text-3xl', ampm: 'text-[9px]',  date: 'text-[10px]', showDate: false,       showAmpm: !use24Hour,  header: false };
      case 'small':  return { time: 'text-5xl', ampm: 'text-[10px]', date: 'text-[11px]', showDate: !size.isCompact, showAmpm: !use24Hour,  header: true  };
      case 'medium': return { time: 'text-7xl', ampm: 'text-xs',     date: 'text-sm',     showDate: true,        showAmpm: !use24Hour,  header: true  };
      case 'large':  return { time: 'text-8xl', ampm: 'text-sm',     date: 'text-base',   showDate: true,        showAmpm: !use24Hour,  header: true  };
      case 'xlarge': return { time: 'text-9xl', ampm: 'text-base',   date: 'text-lg',     showDate: true,        showAmpm: !use24Hour,  header: true  };
    }
  })();

  const showDate = widget.config.showDate !== false && preset.showDate;

  return (
    <WidgetShell
      widget={widget}
      title="Local Time"
      icon={<IconClock />}
      accent="sky"
      bare={!preset.header}
      rightSlot={
        preset.header ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]" />
        ) : undefined
      }
    >
      <WidgetBody align="center" gap="none" className="items-center text-center">
        <div className={`${preset.time} font-bold leading-none tracking-tighter tabular-nums ${theme.headline} ${theme.onSurface}`}>
          {timeStr}
        </div>
        {preset.showAmpm && ampmStr && (
          <WidgetText
            as="div"
            variant="label"
            tone="accent"
            className={`mt-1 ${preset.ampm} tracking-[0.2em] text-sky-500/80`}
          >
            {ampmStr}
          </WidgetText>
        )}
        {showDate && (
          <WidgetText
            as="div"
            variant="caption"
            tone="muted"
            className={`mt-3 ${preset.date} font-medium ${theme.muted}`}
          >
            {size.sizeClass === 'small' ? shortDateStr : dateStr}
          </WidgetText>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default ClockWidget;
