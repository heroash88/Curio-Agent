import React from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useSyncedDashboardTime } from '../../../hooks/useSyncedDashboardTime';
import { useUserName } from '../../../utils/settingsStorage';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { getDayPartGreeting } from '../../../services/dashboardProviderUtils';
import WidgetShell from './WidgetShell';
import { WidgetBody } from './widgetPrimitives';

const GreetingWidget: React.FC<{ widget: DashboardWidget; activeProfileName?: string | null }> = ({
  widget,
  activeProfileName,
}) => {
  const configuredName = useUserName();
  const displayName = activeProfileName || configuredName || '';
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const now = useSyncedDashboardTime('minute');

  const fullDate = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDate = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const tightFrame = size.pixelHeight < 165 || size.pixelWidth < 260 || size.sizeClass === 'tiny';

  const preset = (() => {
    switch (size.sizeClass) {
      case 'tiny':   return { heading: 'text-[clamp(1rem,8cqw,1.2rem)]', dateClass: '',        showDate: false,         date: '' };
      case 'small':  return { heading: tightFrame ? 'text-[clamp(1.15rem,8cqw,1.45rem)]' : 'text-2xl', dateClass: 'text-xs', showDate: !size.isCompact, date: shortDate };
      case 'medium': return { heading: 'text-3xl',dateClass: 'text-sm', showDate: true,          date: fullDate  };
      case 'large':  return { heading: 'text-4xl',dateClass: 'text-base', showDate: true,        date: fullDate  };
      case 'xlarge': return { heading: 'text-5xl',dateClass: 'text-lg', showDate: true,          date: fullDate  };
    }
  })();

  const showDate = widget.config.showDate !== false && preset.showDate;
  const greeting = getDayPartGreeting(now);
  const bodyPaddingClass = tightFrame ? 'px-3 py-3' : 'px-4 py-4 sm:px-5 sm:py-5';

  return (
    <WidgetShell
      bare
      widget={widget}
      padded={false}
      bodyClassName={bodyPaddingClass}
      actionSlotVisibility="always"
    >
      <WidgetBody
        data-testid="greeting-widget-body"
        align="center"
        gap="none"
      >
        <p
          data-testid="greeting-heading"
          className={`${preset.heading} break-words font-semibold leading-[1.04] tracking-normal ${theme.display} ${theme.onSurface}`}
        >
          {greeting}
          {displayName && (
            <span>, {displayName}</span>
          )}
        </p>
        {showDate && (
          <p className={`mt-2 ${preset.dateClass} font-medium ${theme.muted}`}>{preset.date}</p>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default GreetingWidget;
