import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import {
  fetchFunFact,
  getFunFactRefreshIntervalMinutes,
  LOCAL_FUN_FACTS,
  type DashboardFunFact,
} from '../../../services/funFactService';
import WidgetShell from './WidgetShell';
import { WidgetBody, WidgetText } from './widgetPrimitives';
import { IconBrain } from './widgetIcons';

const FunFactWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const refreshIntervalMinutes = getFunFactRefreshIntervalMinutes(widget.config);
  const [fact, setFact] = useState<DashboardFunFact>(LOCAL_FUN_FACTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFact = (options: { signal?: AbortSignal; bypassCache?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    void fetchFunFact({
      signal: options.signal,
      nowMs: options.bypassCache ? Date.now() + (60 * 60 * 1000) + 1 : Date.now(),
    })
      .then((nextFact) => {
        if (options.signal?.aborted) return;
        setFact(nextFact);
      })
      .catch(() => {
        if (!options.signal?.aborted) {
          setError('Using saved facts');
        }
      })
      .finally(() => {
        if (!options.signal?.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    loadFact({ signal: controller.signal });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        loadFact();
      }
    }, refreshIntervalMinutes * 60 * 1000);
    return () => window.clearInterval(id);
  }, [refreshIntervalMinutes]);

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare>
        <div className="flex flex-1 items-center justify-center text-4xl">🧠</div>
      </WidgetShell>
    );
  }

  const textSize =
    size.sizeClass === 'small' ? 'text-sm'
    : size.sizeClass === 'large' || size.sizeClass === 'xlarge' ? 'text-lg'
    : 'text-base';
  const sourceHref = fact.permalink || fact.sourceUrl;

  return (
    <WidgetShell
      title="Fun Fact"
      icon={<IconBrain />}
      accent="amber"
      widget={widget}
      rightSlot={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            loadFact({ bypassCache: true });
          }}
          className="dashboard-widget-control-button"
          aria-label="Refresh fun fact"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <WidgetBody
        data-testid="fun-fact-content"
        gap="md"
        align="center"
      >
        <p className={`${textSize} font-headline font-semibold leading-snug tracking-normal ${theme.onSurface}`}>
          {fact.text}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-px w-5 bg-amber-500/55" />
          <WidgetText variant="label" tone="muted">
            {error || (loading ? 'Syncing' : 'Source')}
          </WidgetText>
          {sourceHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-primary)] hover:underline"
            >
              {fact.sourceLabel}
            </a>
          ) : (
            <WidgetText variant="label" tone="muted">
              {fact.sourceLabel}
            </WidgetText>
          )}
        </div>
      </WidgetBody>
    </WidgetShell>
  );
};

export default FunFactWidget;
