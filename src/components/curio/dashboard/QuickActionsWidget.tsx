import React from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import WidgetShell from './WidgetShell';
import { IconBolt } from './widgetIcons';
import { WidgetBody, WidgetText } from './widgetPrimitives';

const ACTIONS: { label: string; emoji: string; prompt: string }[] = [
  { label: 'Weather', emoji: '🌤', prompt: 'What is the weather?' },
  { label: 'Timer', emoji: '⏱', prompt: 'Set a 5 minute timer' },
  { label: 'Joke', emoji: '😂', prompt: 'Tell me a joke' },
  { label: 'News', emoji: '📰', prompt: 'What is in the news today?' },
  { label: 'Music', emoji: '🎵', prompt: 'Play some music' },
  { label: 'Fact', emoji: '🧠', prompt: 'Tell me a fun fact' },
  { label: 'Lights', emoji: '💡', prompt: 'Turn on the lights' },
  { label: 'Schedule', emoji: '📅', prompt: 'What is on my calendar?' },
];

const QuickActionsWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);

  const handleAction = (text: string) => {
    window.dispatchEvent(new CustomEvent('curio:quick-action', { detail: { text } }));
  };

  const preset = (() => {
    switch (size.sizeClass) {
      case 'tiny':   return { count: 2, cols: 'grid-cols-2', showLabel: false };
      case 'small':  return { count: 4, cols: 'grid-cols-2', showLabel: !size.isCompact };
      case 'medium': return { count: 6, cols: 'grid-cols-3', showLabel: true };
      case 'large':  return { count: 8, cols: 'grid-cols-4', showLabel: true };
      case 'xlarge': return { count: 8, cols: 'grid-cols-4', showLabel: true };
    }
  })();

  const visibleActions = ACTIONS.slice(0, preset.count);

  // Tiny: no header, just button grid
  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare widget={widget}>
        <WidgetBody gap="none">
          <div className={`grid ${preset.cols} min-h-0 flex-1 gap-1.5`}>
            {visibleActions.map((a) => (
              <button
                key={a.label}
                onClick={() => handleAction(a.prompt)}
                className={`flex items-center justify-center rounded-lg transition-all active:scale-95 hover:bg-teal-500/10 ${theme.surfaceContainerLow}`}
                aria-label={a.label}
              >
                <span className="text-xl">{a.emoji}</span>
              </button>
            ))}
          </div>
        </WidgetBody>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell widget={widget} title="Quick Actions" icon={<IconBolt />} accent="teal">
      <WidgetBody gap="none">
        <div className={`grid ${preset.cols} min-h-0 flex-1 gap-2`}>
          {visibleActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action.prompt)}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg p-2 transition-all active:scale-95 hover:bg-teal-500/10 ${theme.surfaceContainerLow}`}
              aria-label={action.label}
            >
              <span className="text-xl">{action.emoji}</span>
              {preset.showLabel && (
                <WidgetText
                  as="span"
                  variant="label"
                  tone="default"
                  align="center"
                  className={theme.onSurface}
                >
                  {action.label}
                </WidgetText>
              )}
            </button>
          ))}
        </div>
      </WidgetBody>
    </WidgetShell>
  );
};

export default QuickActionsWidget;
