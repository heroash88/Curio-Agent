import React, { useEffect, useMemo, useState } from 'react';
import {
  BellOff,
  CheckCircle2,
  Clock3,
  Home,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardProfileStatus,
  DashboardWidget,
} from '../../../services/dashboardTypes';
import {
  setNotificationSystemEnabled,
  setOfflineModeEnabled,
  setSpeakerMuted,
  useUserAvatarDataUrl,
  useUserName,
} from '../../../utils/settingsStorage';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';

type ProfileWidgetProps = {
  widget: DashboardWidget;
  activeProfileName?: string | null;
  recognizedBy?: string | null;
  updatedAt?: number;
};

const DEFAULT_PROFILE_STATUS: DashboardProfileStatus = 'available';

interface StatusOption {
  value: DashboardProfileStatus;
  label: string;
  summary: string;
  description: string;
  icon: LucideIcon;
  iconSoft: string;
  iconFg: string;
  dotClass: string;
  glow: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'focus',
    label: 'Focus',
    summary: 'Do not disturb',
    description: 'Notifications are paused and the system is in deep-work mode.',
    icon: BellOff,
    iconSoft: 'bg-sky-500/15',
    iconFg: 'text-sky-600 dark:text-sky-300',
    dotClass: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.6)]',
    glow: 'rgba(56,189,248,0.18)',
  },
  {
    value: 'available',
    label: 'Open',
    summary: 'Active now',
    description: 'The system is fully operational and waiting for your input.',
    icon: CheckCircle2,
    iconSoft: 'bg-emerald-500/15',
    iconFg: 'text-emerald-600 dark:text-emerald-300',
    dotClass: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]',
    glow: 'rgba(52,211,153,0.18)',
  },
  {
    value: 'away',
    label: 'Away',
    summary: 'Be right back',
    description: 'Speakers are muted and the robot has entered ambient mode.',
    icon: Clock3,
    iconSoft: 'bg-amber-500/15',
    iconFg: 'text-amber-600 dark:text-amber-300',
    dotClass: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]',
    glow: 'rgba(251,191,36,0.18)',
  },
  {
    value: 'offline',
    label: 'Offline',
    summary: 'Local only',
    description: 'Cloud services are cut. Operating in fully private local mode.',
    icon: WifiOff,
    iconSoft: 'bg-slate-500/15',
    iconFg: 'text-slate-600 dark:text-slate-300',
    dotClass: 'bg-slate-400',
    glow: 'rgba(148,163,184,0.16)',
  },
];

const getStorageKey = (widgetId: string) =>
  `curio_dashboard_profile_status_${widgetId}`;

const isProfileStatus = (
  value: string | null,
): value is DashboardProfileStatus =>
  ['focus', 'available', 'away', 'offline'].includes(value || '');

const applyProfileStatusEffects = (nextStatus: DashboardProfileStatus) => {
  if (nextStatus === 'focus') {
    setNotificationSystemEnabled(false);
    setOfflineModeEnabled(false);
    setSpeakerMuted(false);
    return;
  }
  if (nextStatus === 'available') {
    setNotificationSystemEnabled(true);
    setOfflineModeEnabled(false);
    setSpeakerMuted(false);
    return;
  }
  if (nextStatus === 'away') {
    setNotificationSystemEnabled(false);
    setOfflineModeEnabled(false);
    setSpeakerMuted(true);
    return;
  }
  setNotificationSystemEnabled(false);
  setOfflineModeEnabled(true);
  setSpeakerMuted(false);
};

const ProfileWidget: React.FC<ProfileWidgetProps> = ({
  widget,
  activeProfileName,
}) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const configuredName = useUserName();
  const avatarDataUrl = useUserAvatarDataUrl();
  const displayName =
    activeProfileName || configuredName || 'Curio Operator';

  const [status, setStatus] = useState<DashboardProfileStatus>(() => {
    if (typeof window === 'undefined') {
      return widget.config.profileStatus || DEFAULT_PROFILE_STATUS;
    }
    const storedStatus = localStorage.getItem(getStorageKey(widget.id));
    return isProfileStatus(storedStatus)
      ? storedStatus
      : widget.config.profileStatus || DEFAULT_PROFILE_STATUS;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(getStorageKey(widget.id), status);
  }, [status, widget.id]);

  // Ensure effects are applied on mount
  useEffect(() => {
    applyProfileStatusEffects(status);
  }, []); // Only on mount

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    return (
      (parts[0]?.[0] || 'C') + (parts[1]?.[0] || '')
    ).toUpperCase();
  }, [displayName]);

  const activeOption =
    STATUS_OPTIONS.find((opt) => opt.value === status) || STATUS_OPTIONS[1];

  const handleStatusChange = (nextStatus: DashboardProfileStatus) => {
    setStatus(nextStatus);
    applyProfileStatusEffects(nextStatus);
  };

  // ---------- Responsive layout decisions ----------
  const isTiny = size.sizeClass === 'tiny';
  const isSmall = size.sizeClass === 'small';
  
  // 2x3 (2 wide, 3 tall) is ~440px tall. We hide the big hero if we are shorter than that.
  const showHero = size.pixelHeight >= 440;
  // Also hide the small summary lines in the grid if we are cramped vertically to prevent text clipping.
  const showStatusSummaryInGrid = size.pixelHeight >= 440;
  
  const twoColumnStatus = size.pixelWidth >= 300;

  // ---------- Avatar ----------
  const Avatar: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({
    size: avatarSize = 'md',
  }) => {
    const dim =
      avatarSize === 'lg'
        ? 'h-12 w-12'
        : avatarSize === 'sm'
          ? 'h-9 w-9'
          : 'h-11 w-11';
    const initialsSize =
      avatarSize === 'lg'
        ? 'text-base'
        : avatarSize === 'sm'
          ? 'text-[11px]'
          : 'text-sm';
    return (
      <div className="relative shrink-0">
        {avatarDataUrl ? (
          <img
            src={avatarDataUrl}
            alt={displayName}
            className={`${dim} rounded-[0.9rem] object-cover border border-[var(--ether-glass-border)]`}
          />
        ) : (
          <div
            className={`${dim} flex items-center justify-center rounded-[0.9rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]`}
          >
            <span
              className={`${initialsSize} font-bold tracking-tight ${theme.onSurface}`}
            >
              {initials}
            </span>
          </div>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--ether-glass-bg)] ${activeOption.dotClass}`}
          aria-hidden="true"
        />
      </div>
    );
  };

  // ---------- TINY ----------
  if (isTiny) {
    return (
      <WidgetShell bare widget={widget} actionSlotVisibility="always">
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center">
          <Avatar size="sm" />
          <WidgetText variant="label" tone="muted" align="center">
            {activeOption.label}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  // ---------- HEADER (shared across non-tiny sizes) ----------
  const Header = (
    <div className="flex items-center gap-3">
      <Avatar size={size.pixelWidth >= 320 ? 'md' : 'sm'} />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[14px] font-semibold leading-tight tracking-tight ${theme.onSurface}`}
        >
          {displayName}
        </div>
        <div className="mt-0.5">
          <div className="flex items-center gap-1">
            <activeOption.icon
              size={10}
              strokeWidth={2.4}
              className={activeOption.iconFg}
            />
            <WidgetText as="div" variant="label" tone="muted" className="truncate">
              {activeOption.summary}
            </WidgetText>
          </div>
        </div>
      </div>
    </div>
  );

  // ---------- SMALL — header + compact status grid only ----------
  if (isSmall) {
    return (
      <WidgetShell
        widget={widget}
        title="Profile"
        icon={<Home size={16} />}
        accent="sky"
      >
        <div className="flex h-full flex-col gap-3 min-h-0">
          {Header}
          <div className="mt-auto grid grid-cols-2 gap-1.5">
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleStatusChange(option.value)}
                  aria-pressed={isSelected}
                  className={`profile-status-option-${option.value} flex min-w-0 items-center gap-1.5 rounded-[0.9rem] border px-2 py-1.5 text-left transition-colors ${isSelected
                      ? 'border-[var(--ether-outline)] bg-[var(--ether-surface-container-high)]'
                      : 'border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] hover:bg-[var(--ether-surface-container-high)]'
                    }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${option.iconSoft} ${option.iconFg}`}
                  >
                    <Icon size={11} strokeWidth={2.4} />
                  </span>
                  <span
                    className={`truncate text-[11px] font-semibold ${theme.onSurface}`}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </WidgetShell>
    );
  }

  // ---------- MEDIUM / LARGE / XLARGE ----------
  return (
    <WidgetShell
      widget={widget}
      title="Profile"
      icon={<Home size={16} />}
      accent="sky"
    >
      <div className="relative flex h-full flex-col gap-2 min-h-0">
        {/* Header */}
        <div className="relative z-10 shrink-0">{Header}</div>

        {/* Status selector */}
        <div
          className={`relative z-10 grid shrink-0 gap-2 ${twoColumnStatus ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {STATUS_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleStatusChange(option.value)}
                aria-pressed={isSelected}
                className={`profile-status-option-${option.value} group relative flex min-w-0 items-center gap-2.5 rounded-[1rem] border px-2.5 py-2 text-left transition-colors ${isSelected
                    ? 'border-[var(--ether-outline)] bg-[var(--ether-surface-container-high)]'
                    : 'border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] hover:bg-[var(--ether-surface-container-high)]'
                  }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.6rem] ${option.iconSoft} ${option.iconFg}`}
                >
                  <Icon size={14} strokeWidth={2.3} />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div
                    className={`truncate text-[13px] font-semibold ${theme.onSurface}`}
                  >
                    {option.label}
                  </div>
                  {showStatusSummaryInGrid && (
                    <WidgetText as="div" variant="label" tone="muted">
                      {option.summary}
                    </WidgetText>
                  )}
                </div>
                {isSelected && (
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.dotClass}`}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Description Section (Conditional) */}
        {showHero ? (
          /* Active Status Hero (Large Display) */
          <div className="relative z-10 mt-auto flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[1.5rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4 text-center">
            {/* Ambient Glow tied to active status */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-0 opacity-20 blur-3xl transition-colors duration-700"
                style={{ background: `radial-gradient(circle at center, ${activeOption.glow}, transparent 70%)` }}
            />
            
            <div className={`relative flex h-16 w-16 items-center justify-center rounded-full ${activeOption.iconSoft} ${activeOption.iconFg} shadow-lg`}>
                <activeOption.icon size={32} strokeWidth={2} />
                {/* Pulsing dot for visual flair */}
                <span className={`absolute -right-0.5 top-0.5 h-4 w-4 rounded-full border-2 border-[var(--ether-surface-container-low)] ${activeOption.dotClass} animate-pulse`} />
            </div>

            <div className="relative z-10">
                <h2 className={`text-2xl font-black tracking-tight ${theme.onSurface}`}>
                  {activeOption.label}
                </h2>
                <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--ether-on-surface-variant)] opacity-80">
                  {activeOption.description}
                </p>
            </div>
          </div>
        ) : (
          /* Compact Description area (Used for 2x3 or shorter widgets) */
          <div className="relative z-10 mt-auto flex flex-col items-center justify-center px-1 pb-1 text-center">
             <div className="w-full rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-3 py-2.5 shadow-sm">
                <p className="text-[12.5px] font-semibold leading-snug tracking-tight text-[var(--ether-on-surface)] opacity-95">
                  {activeOption.description}
                </p>
             </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default ProfileWidget;
