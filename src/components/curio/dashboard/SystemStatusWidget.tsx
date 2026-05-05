import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleSlash2,
  Cpu,
  Database,
  Gauge,
  Home,
  Mic2,
  Monitor,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import {
  DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS,
  type DashboardSystemStatusModule,
  type DashboardWidget,
} from '../../../services/dashboardTypes';
import { getBrowserDeviceProfile } from '../../../services/browserDeviceProfile';
import { useHaMcpEnabled, useVoiceBackend } from '../../../utils/settingsStorage';
import { useHaMcpRuntimeStatus } from '../../../utils/haMcpRuntimeStatus';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';

type StatusTone = 'ok' | 'warn' | 'off' | 'info';

interface NetworkInformationLike extends EventTarget {
  downlink?: number;
  effectiveType?: string;
  type?: string;
}

interface StorageSnapshot {
  usage: number | null;
  quota: number | null;
  source: 'estimate' | 'local' | 'unknown';
}

interface PerformanceMemoryLike {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

interface BrowserDetails {
  browser: string;
  platform: string;
}

interface StatusItem {
  id: DashboardSystemStatusModule;
  label: string;
  tone: StatusTone;
  value: string;
  detail: string;
  icon: React.ReactNode;
  progress?: number;
}

const DEFAULT_SYSTEM_STATUS_MODULES = DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS.map(
  (option) => option.id,
);

const STATUS_STYLES: Record<
  StatusTone,
  { dot: string; icon: string; soft: string; text: string; bar: string }
> = {
  ok: {
    dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.58)]',
    icon: 'text-emerald-400',
    soft: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    bar: 'bg-emerald-400',
  },
  warn: {
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.58)]',
    icon: 'text-amber-400',
    soft: 'bg-amber-500/10',
    text: 'text-amber-400',
    bar: 'bg-amber-400',
  },
  off: {
    dot: 'bg-slate-400',
    icon: 'text-[var(--ether-on-surface-variant)]',
    soft: 'bg-[var(--ether-surface-container-low)]',
    text: 'text-[var(--ether-on-surface-variant)]',
    bar: 'bg-[var(--ether-on-surface-variant)]',
  },
  info: {
    dot: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.45)]',
    icon: 'text-sky-400',
    soft: 'bg-sky-500/10',
    text: 'text-sky-400',
    bar: 'bg-sky-400',
  },
};

const isSystemStatusModule = (
  module: unknown,
): module is DashboardSystemStatusModule =>
  DEFAULT_SYSTEM_STATUS_MODULES.includes(module as DashboardSystemStatusModule);

const getSelectedModules = (
  modules?: DashboardSystemStatusModule[],
): DashboardSystemStatusModule[] => {
  if (!Array.isArray(modules) || modules.length === 0) {
    return DEFAULT_SYSTEM_STATUS_MODULES;
  }
  const selected = modules.filter(isSystemStatusModule);
  return selected.length > 0 ? selected : DEFAULT_SYSTEM_STATUS_MODULES;
};

const getNavigatorConnection = (): NetworkInformationLike | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
};

const getConnectionSnapshot = () => {
  const connection = getNavigatorConnection();
  return {
    downlink:
      typeof connection?.downlink === 'number' && connection.downlink > 0
        ? connection.downlink
        : undefined,
    effectiveType: connection?.effectiveType,
    type: connection?.type,
  };
};

const formatConnectionType = (type?: string): string | null => {
  switch (type) {
    case 'wifi':
      return 'Wi-Fi';
    case 'ethernet':
      return 'Ethernet';
    case 'cellular':
      return 'Cellular';
    case 'bluetooth':
      return 'Bluetooth';
    case 'wimax':
      return 'WiMAX';
    default:
      return null;
  }
};

const formatMbps = (downlink: number): string => {
  const rounded = Math.round(downlink * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const formatEffectiveType = (effectiveType?: string): string | null => {
  if (!effectiveType) return null;
  return `${effectiveType.toUpperCase()} class`;
};

const estimateLocalStorageUsage = (): number | null => {
  if (typeof window === 'undefined') return null;
  try {
    let bytes = 0;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || '';
      const value = window.localStorage.getItem(key) || '';
      bytes += (key.length + value.length) * 2;
    }
    return bytes;
  } catch {
    return null;
  }
};

const getInitialStorageSnapshot = (): StorageSnapshot => ({
  usage: estimateLocalStorageUsage(),
  quota: null,
  source: 'local',
});

const getPerformanceMemory = (): PerformanceMemoryLike | null => {
  if (typeof performance === 'undefined') return null;
  const memory = (performance as Performance & {
    memory?: PerformanceMemoryLike;
  }).memory;
  return memory || null;
};

const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes == null || Number.isNaN(bytes)) return 'Unknown';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb * 10) / 10} MB`;
  return `${Math.round((mb / 1024) * 10) / 10} GB`;
};

const formatDeviceMemory = (memoryGb: number): string => {
  const rounded = Math.round(memoryGb * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} GB memory`;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const getBrowserDetails = (): BrowserDetails => {
  if (typeof navigator === 'undefined') {
    return { browser: 'Browser', platform: 'Runtime unavailable' };
  }
  const nav = navigator as Navigator & {
    userAgentData?: {
      brands?: Array<{ brand: string; version: string }>;
      platform?: string;
      mobile?: boolean;
    };
  };
  const brand = nav.userAgentData?.brands?.find(
    (item) => !/not|chromium/i.test(item.brand),
  )?.brand;
  const userAgent = navigator.userAgent || '';
  const browser =
    brand ||
    (/Edg\//.test(userAgent)
      ? 'Edge'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser');
  const platform =
    nav.userAgentData?.platform ||
    navigator.platform ||
    (/Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'Mobile' : 'Web runtime');

  return { browser, platform };
};

const normalizeProgress = (value: number | null | undefined): number | undefined => {
  if (value == null || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(1, value));
};

const SystemStatusWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const haEnabled = useHaMcpEnabled();
  const haRuntime = useHaMcpRuntimeStatus();
  const voiceBackend = useVoiceBackend();
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [connectionInfo, setConnectionInfo] = useState(getConnectionSnapshot);
  const [storageSnapshot, setStorageSnapshot] = useState<StorageSnapshot>(
    getInitialStorageSnapshot,
  );
  const [runtimeNow, setRuntimeNow] = useState(() =>
    typeof performance !== 'undefined' ? performance.now() : 0,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const connection = getNavigatorConnection();
    if (!connection) return undefined;

    const updateConnection = () => setConnectionInfo(getConnectionSnapshot());

    updateConnection();
    connection.addEventListener?.('change', updateConnection);
    return () => {
      connection.removeEventListener?.('change', updateConnection);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const updateStorage = async () => {
      const localUsage = estimateLocalStorageUsage();
      const storage = typeof navigator !== 'undefined' ? navigator.storage : null;
      if (storage?.estimate) {
        try {
          const estimate = await storage.estimate();
          if (!cancelled) {
            setStorageSnapshot({
              usage: estimate.usage ?? localUsage,
              quota: estimate.quota ?? null,
              source: 'estimate',
            });
          }
          return;
        } catch {
          // Fall through to localStorage estimate.
        }
      }
      if (!cancelled) {
        setStorageSnapshot({
          usage: localUsage,
          quota: null,
          source: localUsage == null ? 'unknown' : 'local',
        });
      }
    };

    updateStorage();
    const interval = window.setInterval(updateStorage, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRuntimeNow(typeof performance !== 'undefined' ? performance.now() : 0);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const items = useMemo<StatusItem[]>(() => {
    const selectedModules = getSelectedModules(widget.config.systemStatusModules);
    const voiceLabel =
      voiceBackend === 'liveapi'
        ? 'Gemini Live'
        : voiceBackend === 'nova_sonic'
          ? 'Nova Sonic'
          : voiceBackend === 'ha_voice_pipeline'
            ? 'HA Pipeline'
            : voiceBackend === 'custom_llm'
              ? 'Custom LLM'
              : 'Offline';
    const haTone: StatusTone = !haEnabled
      ? 'off'
      : haRuntime.status === 'connected'
        ? 'ok'
        : haRuntime.status === 'error'
          ? 'warn'
          : 'off';
    const storageProgress = normalizeProgress(
      storageSnapshot.quota && storageSnapshot.usage != null
        ? storageSnapshot.usage / storageSnapshot.quota
        : undefined,
    );
    const memory = getPerformanceMemory();
    const memoryProgress = normalizeProgress(
      memory?.jsHeapSizeLimit && memory.usedJSHeapSize != null
        ? memory.usedJSHeapSize / memory.jsHeapSizeLimit
        : undefined,
    );
    const browserDetails = getBrowserDetails();
    const deviceProfile = getBrowserDeviceProfile();
    const connectionType = formatConnectionType(connectionInfo.type);
    const effectiveType = formatEffectiveType(connectionInfo.effectiveType);
    const networkDetailParts = online
      ? [
          connectionInfo.downlink != null
            ? `Estimated link ${formatMbps(connectionInfo.downlink)} Mbps`
            : null,
          effectiveType,
        ].filter((part): part is string => Boolean(part))
      : [];
    const deviceValue =
      deviceProfile.cores > 0
        ? `${deviceProfile.cores} thread${deviceProfile.cores === 1 ? '' : 's'}`
        : deviceProfile.memoryGb != null
          ? formatDeviceMemory(deviceProfile.memoryGb)
          : 'Browser runtime';
    const deviceDetails = [
      deviceProfile.memoryGb != null ? formatDeviceMemory(deviceProfile.memoryGb) : null,
      deviceProfile.touchPoints > 0
        ? `${deviceProfile.touchPoints} touch point${deviceProfile.touchPoints === 1 ? '' : 's'}`
        : null,
    ].filter((part): part is string => Boolean(part));
    const runtimeSeconds = Math.floor(runtimeNow / 1000);
    const storageTone: StatusTone =
      storageProgress != null && storageProgress >= 0.85 ? 'warn' : 'ok';
    const performanceTone: StatusTone =
      memoryProgress != null && memoryProgress >= 0.85 ? 'warn' : 'info';
    const allItems: Record<DashboardSystemStatusModule, StatusItem | null> = {
      network: {
        id: 'network',
        label: 'Network',
        tone: online ? 'ok' : 'warn',
        value: online ? connectionType || 'Online' : 'Offline',
        detail:
          online && networkDetailParts.length > 0
            ? networkDetailParts.join(', ')
            : online
              ? 'Connected'
              : 'Reconnect needed',
        icon: online ? <Wifi size={15} /> : <WifiOff size={15} />,
        progress: online ? 1 : 0,
      },
      voice: {
        id: 'voice',
        label: 'Voice',
        tone: voiceLabel === 'Offline' ? 'off' : 'ok',
        value: voiceLabel,
        detail: voiceLabel === 'Offline' ? 'Wake and local mode' : 'Assistant ready',
        icon: <Mic2 size={15} />,
      },
      homeAssistant: {
        id: 'homeAssistant',
        label: 'Home Assistant',
        tone: haTone,
        value: !haEnabled
          ? 'Disabled'
          : haRuntime.status === 'connected'
            ? 'Connected'
            : haRuntime.status === 'error'
              ? 'Error'
              : 'Idle',
        detail: haEnabled ? 'Bridge runtime' : 'Not enabled',
        icon: <Home size={15} />,
      },
      storage: {
        id: 'storage',
        label: 'Storage',
        tone: storageTone,
        value: formatBytes(storageSnapshot.usage),
        detail:
          storageSnapshot.quota != null
            ? `${Math.round((storageProgress || 0) * 100)}% of ${formatBytes(
                storageSnapshot.quota,
              )}`
            : storageSnapshot.source === 'local'
              ? 'Local app data'
              : 'Quota unavailable',
        icon: <Database size={15} />,
        progress: storageProgress,
      } satisfies StatusItem,
      performance: {
        id: 'performance',
        label: 'Performance',
        tone: performanceTone,
        value:
          memory?.usedJSHeapSize != null
            ? formatBytes(memory.usedJSHeapSize)
            : formatDuration(runtimeSeconds),
        detail:
          memoryProgress != null
            ? `${formatBytes(memory?.usedJSHeapSize)} of ${formatBytes(
                memory?.jsHeapSizeLimit,
              )} heap`
            : 'Page uptime',
        icon: memory?.usedJSHeapSize != null ? <Gauge size={15} /> : <Activity size={15} />,
        progress: memoryProgress,
      },
      device: {
        id: 'device',
        label: 'Device',
        tone: deviceProfile.isLowEnd ? 'warn' : 'info',
        value: deviceValue,
        detail:
          deviceDetails.length > 0
            ? deviceDetails.join(', ')
            : deviceProfile.isConstrained
              ? 'Constrained device'
              : 'Browser hints limited',
        icon: <Cpu size={15} />,
      },
      browser: {
        id: 'browser',
        label: 'Browser',
        tone: 'info',
        value: browserDetails.browser,
        detail: browserDetails.platform,
        icon: <Monitor size={15} />,
      },
    };

    return selectedModules
      .map((module) => allItems[module])
      .filter((item): item is StatusItem => Boolean(item));
  }, [
    connectionInfo.downlink,
    connectionInfo.effectiveType,
    connectionInfo.type,
    haEnabled,
    haRuntime.status,
    online,
    runtimeNow,
    storageSnapshot.quota,
    storageSnapshot.source,
    storageSnapshot.usage,
    voiceBackend,
    widget.config.systemStatusModules,
  ]);

  const warningCount = items.filter((item) => item.tone === 'warn').length;
  const readyCount = items.filter((item) => item.tone === 'ok' || item.tone === 'info').length;
  const overallTone: StatusTone =
    warningCount > 0 ? 'warn' : readyCount > 0 ? 'ok' : 'off';
  const readiness = items.length > 0 ? readyCount / items.length : 0;
  const headline =
    warningCount > 0
      ? `${warningCount} alert${warningCount === 1 ? '' : 's'}`
      : 'System ready';

  if (size.sizeClass === 'tiny') {
    const Icon = warningCount > 0 ? CircleSlash2 : CheckCircle2;
    return (
      <WidgetShell bare widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--ether-glass-border)] ${STATUS_STYLES[overallTone].soft} ${STATUS_STYLES[overallTone].text}`}
          >
            <Icon size={17} />
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            System
          </WidgetText>
          <span className={`text-[10px] font-semibold ${theme.onSurface}`}>
            {readyCount}/{items.length}
          </span>
        </div>
      </WidgetShell>
    );
  }

  const denseModules = size.pixelHeight < 310 || size.area <= 6;
  const maxVisibleItems =
    denseModules
      ? size.isWide
        ? 2
        : 1
      : size.area <= 4
      ? size.isWide
        ? 4
        : 3
      : size.area <= 6
        ? 5
        : items.length;
  const visibleItems = items.slice(0, maxVisibleItems);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const moduleGridClass =
    size.isWide && size.area >= 6 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <WidgetShell
      widget={widget}
      title="System"
      icon={<Cpu size={16} />}
      accent="teal"
      bodyClassName={denseModules ? "gap-2" : "gap-3"}
    >
      <div className={`rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] ${denseModules ? "p-2" : "p-3"} shadow-sm`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`${denseModules ? "h-2 w-2" : "h-2.5 w-2.5"} shrink-0 rounded-full ${STATUS_STYLES[overallTone].dot}`} />
            <div className="min-w-0">
              <div className={`truncate ${denseModules ? "text-xs" : "text-sm"} font-semibold ${theme.onSurface}`}>
                {headline}
              </div>
              <div className="mt-0.5">
                <WidgetText variant="label" tone="muted">
                  {readyCount}/{items.length} signals ready
                </WidgetText>
              </div>
            </div>
          </div>
          <span className={`shrink-0 ${denseModules ? "text-base" : "text-lg"} font-semibold tabular-nums ${theme.onSurface}`}>
            {Math.round(readiness * 100)}%
          </span>
        </div>
        <div className={`${denseModules ? "mt-2 h-1" : "mt-3 h-1.5"} overflow-hidden rounded-full bg-[var(--ether-surface-container-high)]`}>
          <div
            className={`h-full rounded-full ${STATUS_STYLES[overallTone].bar} transition-all duration-500`}
            style={{ width: `${Math.round(readiness * 100)}%` }}
          />
        </div>
      </div>

      <div
        data-testid="system-status-modules"
        className={`grid min-h-0 flex-1 ${denseModules ? "gap-1.5 overflow-hidden" : "gap-2 overflow-y-auto pr-0.5"} ${moduleGridClass}`}
      >
        {visibleItems.map((item) => (
          <div
            key={item.id}
            data-testid={`system-module-${item.id}`}
            className={`min-w-0 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] ${denseModules ? "p-1.5" : "p-3"}`}
          >
            <div className={`flex min-w-0 items-start ${denseModules ? "gap-1.5" : "gap-2.5"}`}>
              <span
                className={`flex ${denseModules ? "h-6 w-6 rounded-lg" : "h-8 w-8 rounded-xl"} shrink-0 items-center justify-center border border-[var(--ether-glass-border)] ${STATUS_STYLES[item.tone].soft} ${STATUS_STYLES[item.tone].icon}`}
              >
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <WidgetText variant={denseModules ? 'label' : 'label'} tone="muted" className={denseModules ? 'text-[8px]' : undefined}>
                  {item.label}
                </WidgetText>
                <div className={`${denseModules ? "mt-0 text-[11px]" : "mt-1 text-sm"} truncate font-semibold ${theme.onSurface}`}>
                  {item.value}
                </div>
                {!denseModules && (
                  <div className={`mt-0.5 truncate text-[11px] ${theme.onSurfaceVariant}`}>
                    {item.detail}
                  </div>
                )}
              </div>
            </div>
            {item.progress != null && !size.isCompact && !denseModules && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ether-surface-container-high)]">
                <div
                  className={`h-full rounded-full ${STATUS_STYLES[item.tone].bar}`}
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
        {hiddenCount > 0 && !denseModules && (
          <div className={`rounded-[1.15rem] border border-dashed border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3 text-xs font-semibold ${theme.muted}`}>
            +{hiddenCount} more in widget settings
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default React.memo(SystemStatusWidget);
