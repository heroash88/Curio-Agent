import React from 'react';
import { Maximize2 } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useMotionProfile } from '../../../hooks/useMotionProfile';
import { useRelativeTime } from '../../../hooks/useRelativeTime';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import {
  computeFreshnessState,
  DASHBOARD_WIDGET_DATA_UPDATED_EVENT,
  getDashboardRefreshEventName,
  getDashboardRefreshPolicy,
  isLiveDashboardWidget,
  shouldRenderSheen,
  type DashboardWidgetDataUpdatedDetail,
  type FreshnessState,
} from '../../../services/dashboardRefresh';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import FreshnessDot from './FreshnessDot';
import {
  getDashboardWidgetAccentVariables,
  getDashboardWidgetGlowLayerStyle,
  resolveDashboardWidgetAccent,
} from './dashboardWidgetAppearance';

const AMBIENT_PULSE_COALESCE_WINDOW_MS = 2000;
const FRESHNESS_TICK_INTERVAL_MS = 15_000;

export type WidgetAccent =
  | 'sky'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'indigo'
  | 'pink'
  | 'teal'
  | 'slate';

export const DashboardWidgetActionSlotContext = React.createContext<React.ReactNode>(null);
export const DashboardWidgetGlowContext = React.createContext<boolean>(false);
export const DashboardWidgetEditModeContext = React.createContext<boolean>(false);

/**
 * Accent bleed system.
 *
 * The card remains a single rounded surface; these colors only add a subtle
 * edge wash so the accent reaches the card perimeter without creating a
 * second visible background layer.
 */
const ACCENT_COLORS: Record<
  WidgetAccent,
  {
    /** Icon badge tint */
    iconBg: string;
    /** Tiny status dot */
    dot: string;
    /** Primary bleed colour (rgba) */
    bleedA: string;
    /** Secondary bleed colour (rgba) */
    bleedB: string;
    /** Bloom radial tint (rgba) */
    bloom: string;
    /** Light-mode bleed – lower intensity */
    bleedALight: string;
    bleedBLight: string;
    bloomLight: string;
  }
> = {
  sky: {
    iconBg: 'bg-sky-500/10', dot: 'bg-sky-500',
    bleedA: 'rgba(57,184,253,0.16)', bleedB: 'rgba(31,170,239,0.08)',
    bloom: 'rgba(57,184,253,0.20)',
    bleedALight: 'rgba(14,165,233,0.08)', bleedBLight: 'rgba(56,189,248,0.04)',
    bloomLight: 'rgba(14,165,233,0.10)',
  },
  violet: {
    iconBg: 'bg-violet-500/10', dot: 'bg-violet-500',
    bleedA: 'rgba(172,138,255,0.16)', bleedB: 'rgba(85,22,190,0.08)',
    bloom: 'rgba(139,92,246,0.20)',
    bleedALight: 'rgba(139,92,246,0.08)', bleedBLight: 'rgba(168,85,247,0.04)',
    bloomLight: 'rgba(139,92,246,0.10)',
  },
  emerald: {
    iconBg: 'bg-emerald-500/10', dot: 'bg-emerald-500',
    bleedA: 'rgba(16,185,129,0.16)', bleedB: 'rgba(20,184,166,0.08)',
    bloom: 'rgba(16,185,129,0.20)',
    bleedALight: 'rgba(16,185,129,0.08)', bleedBLight: 'rgba(52,211,153,0.04)',
    bloomLight: 'rgba(16,185,129,0.10)',
  },
  rose: {
    iconBg: 'bg-rose-500/10', dot: 'bg-rose-500',
    bleedA: 'rgba(215,51,87,0.16)', bleedB: 'rgba(244,63,94,0.08)',
    bloom: 'rgba(244,63,94,0.20)',
    bleedALight: 'rgba(244,63,94,0.08)', bleedBLight: 'rgba(251,113,133,0.04)',
    bloomLight: 'rgba(244,63,94,0.10)',
  },
  amber: {
    iconBg: 'bg-amber-500/10', dot: 'bg-amber-500',
    bleedA: 'rgba(245,158,11,0.16)', bleedB: 'rgba(251,191,36,0.08)',
    bloom: 'rgba(245,158,11,0.20)',
    bleedALight: 'rgba(245,158,11,0.08)', bleedBLight: 'rgba(252,211,77,0.04)',
    bloomLight: 'rgba(245,158,11,0.10)',
  },
  indigo: {
    iconBg: 'bg-indigo-500/10', dot: 'bg-indigo-500',
    bleedA: 'rgba(172,138,255,0.16)', bleedB: 'rgba(99,102,241,0.08)',
    bloom: 'rgba(99,102,241,0.20)',
    bleedALight: 'rgba(99,102,241,0.08)', bleedBLight: 'rgba(129,140,248,0.04)',
    bloomLight: 'rgba(99,102,241,0.10)',
  },
  pink: {
    iconBg: 'bg-pink-500/10', dot: 'bg-pink-500',
    bleedA: 'rgba(255,109,175,0.16)', bleedB: 'rgba(236,72,153,0.08)',
    bloom: 'rgba(236,72,153,0.20)',
    bleedALight: 'rgba(236,72,153,0.08)', bleedBLight: 'rgba(244,114,182,0.04)',
    bloomLight: 'rgba(236,72,153,0.10)',
  },
  teal: {
    iconBg: 'bg-teal-500/10', dot: 'bg-teal-500',
    bleedA: 'rgba(20,184,166,0.16)', bleedB: 'rgba(6,182,212,0.08)',
    bloom: 'rgba(20,184,166,0.20)',
    bleedALight: 'rgba(20,184,166,0.08)', bleedBLight: 'rgba(45,212,191,0.04)',
    bloomLight: 'rgba(20,184,166,0.10)',
  },
  slate: {
    iconBg: 'bg-slate-500/10', dot: 'bg-slate-500',
    bleedA: 'rgba(148,163,184,0.16)', bleedB: 'rgba(100,116,139,0.08)',
    bloom: 'rgba(148,163,184,0.20)',
    bleedALight: 'rgba(100,116,139,0.08)', bleedBLight: 'rgba(148,163,184,0.04)',
    bloomLight: 'rgba(100,116,139,0.10)',
  },
};

export interface WidgetShellProps {
  title?: string;
  titleClassName?: string;
  icon?: React.ReactNode;
  accent?: WidgetAccent;
  rightSlot?: React.ReactNode;
  /** Optional control rendered immediately beside the dashboard action menu. */
  actionSlotLeading?: React.ReactNode;
  /** Hide the header entirely (used for tiny sizes or bare widgets) */
  bare?: boolean;
  /** Extra classes on the inner padded area */
  bodyClassName?: string;
  /** Set to false to drop default body padding (full-bleed children like camera/map) */
  padded?: boolean;
  /** Pass the widget object to automatically pull user overrides (accent, glow, etc.) */
  widget?: DashboardWidget;
  /** Extra classes on the outer shell */
  className?: string;
  /** Custom accent color override (hex or rgba) */
  accentOverride?: string;
  glowEnabled?: boolean;
  /** Transparent shell that reveals on hover */
  ghost?: boolean;
  /** Remove hover shell chrome for widgets that render their own physical surface */
  quiet?: boolean;
  /** Controls whether bare widget action dots are always visible or hover-disclosed */
  actionSlotVisibility?: 'hover' | 'always';
  /**
   * When true, reserves space in the widget body so content cannot run under
   * the 3-dot action menu. Useful for `bare` widgets and widgets that render
   * custom full-bleed surfaces. Default is `false` to preserve existing
   * layouts; the header variant already reserves its own action space.
   */
  actionSafeArea?: boolean;
  /**
   * External freshness signal override. When provided, takes precedence
   * over the internally computed freshness state (Requirement 20.1).
   */
  freshness?: FreshnessState;
  /**
   * Whether a background refresh is currently in flight for this
   * widget. Controls the stale-while-revalidate sheen layer
   * (Requirement 22.1).
   */
  refreshInFlight?: boolean;
  /**
   * When `true`, the widget is in its first-load state and the sheen
   * is suppressed (Requirement 22.5). Defaults to `false`.
   */
  isFirstLoad?: boolean;
  /**
   * Text to coalesce through `useWidgetAriaAnnouncer` into the shell's
   * `sr-only` `aria-live="polite"` region (Requirement 26.1 - 26.5).
   */
  ariaAnnouncement?: string;
  children: React.ReactNode;
}

const WidgetShellImpl: React.FC<WidgetShellProps> = ({
  title,
  titleClassName,
  icon,
  accent = 'sky',
  rightSlot,
  actionSlotLeading,
  bare = false,
  bodyClassName = '',
  padded = true,
  widget,
  className = '',
  accentOverride,
  glowEnabled,
  ghost = false,
  quiet = false,
  actionSlotVisibility = 'hover',
  actionSafeArea = false,
  freshness,
  refreshInFlight = false,
  isFirstLoad = false,
  ariaAnnouncement,
  children,
}) => {
  const theme = useCardTheme();
  const actionSlot = React.useContext(DashboardWidgetActionSlotContext);
  const globalGlowEnabled = React.useContext(DashboardWidgetGlowContext);
  const dashboardEditMode = React.useContext(DashboardWidgetEditModeContext);
  const motionProfile = useMotionProfile();
  const boardInteractivity = useDashboardInteractivitySettings();
  
  // Resolve config with user overrides
  const effectiveAccentOverride = accentOverride || widget?.config?.accentOverride;
  const requestedGlowEnabled =
    glowEnabled ?? (widget ? globalGlowEnabled : false);
  const effectiveGlowEnabled =
    requestedGlowEnabled && (!widget || widget.config.glowEnabled !== false);
  const widgetAccent = resolveDashboardWidgetAccent(effectiveAccentOverride);
  const widgetAppearanceStyle = getDashboardWidgetAccentVariables({
    accentOverride: effectiveAccentOverride,
  });
  const colors = ACCENT_COLORS[accent];
  const accentToken = `var(--ether-${accent})`;
  const colorMix = (amount: number) =>
    `color-mix(in srgb, ${accentToken} ${amount}%, transparent)`;
  const refreshPolicy = widget
    ? getDashboardRefreshPolicy(widget.type, widget.config)
    : null;
  const showRefreshMetadata = Boolean(
    widget?.config?.showRefreshMetadata &&
      widget &&
      isLiveDashboardWidget(widget.type),
  );

  // -- Ambient pulse + updatedAt bookkeeping (Requirements 2.2 - 2.7) -----
  const widgetId = widget?.id;
  const lastPulseAtRef = React.useRef(0);
  const [pulseKey, setPulseKey] = React.useState(0);
  const [updatedAtMs, setUpdatedAtMs] = React.useState<number | null>(null);

  const ambientPulseEnabled = effectiveToggle(
    'ambientPulseEnabled',
    boardInteractivity,
    widget?.config,
  );
  const freshnessDotEnabled = effectiveToggle(
    'freshnessDotEnabled',
    boardInteractivity,
    widget?.config,
  );
  const staleSheenEnabled = effectiveToggle(
    'staleRevalidateSheenEnabled',
    boardInteractivity,
    widget?.config,
  );
  const relativeTimeHintsEnabled = boardInteractivity.relativeTimeHintsEnabled;

  const shouldPulseOnEvents =
    ambientPulseEnabled && motionProfile.shouldAnimate && Boolean(widgetId);

  React.useEffect(() => {
    if (!widgetId) return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DashboardWidgetDataUpdatedDetail>).detail;
      if (!detail || detail.widgetId !== widgetId) return;

      const nowMs =
        typeof detail.updatedAt === 'number' ? detail.updatedAt : Date.now();
      setUpdatedAtMs(nowMs);

      if (!shouldPulseOnEvents) return;
      const lastPulseAt = lastPulseAtRef.current;
      if (nowMs - lastPulseAt < AMBIENT_PULSE_COALESCE_WINDOW_MS) return;
      lastPulseAtRef.current = nowMs;
      setPulseKey((prev) => prev + 1);
    };

    window.addEventListener(DASHBOARD_WIDGET_DATA_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(DASHBOARD_WIDGET_DATA_UPDATED_EVENT, handler);
    };
  }, [widgetId, shouldPulseOnEvents]);

  // Gentle ticker so the freshness dot can transition fresh -> idle -> stale
  // without fresh data events (Requirement 20.1).
  const [, setTickSignal] = React.useState(0);
  React.useEffect(() => {
    if (!showRefreshMetadata || !freshnessDotEnabled) return undefined;
    if (typeof window === 'undefined') return undefined;
    const id = window.setInterval(() => {
      setTickSignal((n) => (n + 1) % Number.MAX_SAFE_INTEGER);
    }, FRESHNESS_TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [showRefreshMetadata, freshnessDotEnabled]);

  const computedFreshness = React.useMemo<FreshnessState>(
    () =>
      computeFreshnessState({
        updatedAt: updatedAtMs,
        intervalMs: refreshPolicy?.intervalMs ?? null,
        lastRefreshError: null,
        nowMs: Date.now(),
      }),
    [updatedAtMs, refreshPolicy?.intervalMs],
  );
  const effectiveFreshness: FreshnessState = freshness ?? computedFreshness;

  // Relative-time label for the refresh metadata chip (Requirement 4.3).
  // Computed unconditionally so the hook's tick schedule is preserved;
  // the label is only rendered when the toggle is on and we have an
  // `updatedAtMs` to format. The hook internally short-circuits when
  // `updatedAtMs` is null (Requirement 4.5).
  const relativeTimeLabel = useRelativeTime(updatedAtMs);
  const showRelativeTimeLabel =
    relativeTimeHintsEnabled && updatedAtMs != null;

  const handleFreshnessRetry = React.useCallback(() => {
    if (!widgetId || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(getDashboardRefreshEventName(widgetId)));
  }, [widgetId]);

  // -- Sheen (Requirement 22.1 - 22.5) -----------------------------------
  const sheenActive = shouldRenderSheen({
    isFirstLoad,
    isRefreshing: refreshInFlight,
    sheenEnabled: staleSheenEnabled,
    motionProfile,
  });

  // -- aria-live announcements (Requirements 26.1 - 26.5) ----------------
  const announcerWidgetId = widgetId ?? '';
  const ariaAnnouncerText = useWidgetAriaAnnouncer(
    announcerWidgetId,
    announcerWidgetId ? ariaAnnouncement : '',
  );

  // Select bleed colours based on current mode
  const bleedA = widgetAccent?.glow || colorMix(theme.dark ? 10 : 5);
  const bleedB = widgetAccent?.soft || colorMix(theme.dark ? 6 : 3);
  const bloom = widgetAccent?.glow || colorMix(theme.dark ? 12 : 7);
  const iconBackground = widgetAccent?.soft || colorMix(theme.dark ? 14 : 10);
  const glowLayerStyle = getDashboardWidgetGlowLayerStyle({
    accentOverride: effectiveAccentOverride,
  }, theme.dark);
  const iconElement = React.isValidElement(icon)
    ? (icon as React.ReactElement<{ className?: string }>)
    : null;
  const canExpandFromIcon = Boolean(widget && icon);
  const expandLabel = title?.trim()
    ? `Expand ${title.trim()} widget`
    : 'Expand widget';
  const handleIconExpand = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!widget || typeof window === 'undefined') return;
      window.dispatchEvent(
        new CustomEvent('curio-focus-widget', {
          detail: { widgetId: widget.id },
        }),
      );
    },
    [widget],
  );
  const handleIconPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );

  const handleShellPointerDownCapture = React.useCallback(() => {
    if (!widget || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('curio:widget-interaction', {
        detail: { widgetId: widget.id },
      })
    );
  }, [widget]);

  const bodyPaddingClass = !padded
    ? ''
    : bare
      ? 'px-4 pt-4 pb-4 sm:px-5 sm:pt-5 sm:pb-5'
      : 'px-4 pb-4 sm:px-5 sm:pb-5';
  const showBareActionSlot = bare
    && actionSlot;
  const showHeaderActionSlot = !bare && (actionSlot || actionSlotLeading);
  const headerActionReserveClass = showHeaderActionSlot && actionSlotLeading
    ? 'pr-[5.75rem] sm:pr-24'
    : 'pr-[3.25rem] sm:pr-14';
  const shellInteractionClass = quiet
    ? ''
    : dashboardEditMode
      ? 'dashboard-widget-shell-editing transition-colors duration-200'
      : 'transition-all duration-700 hover:scale-[1.012] hover:shadow-[0_20px_60px_rgba(0,0,0,0.35)] hover:border-[var(--ether-on-surface-variant)]/20';

  return (
    <div
      className={`group relative isolate flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[inherit] text-[var(--ether-on-surface)] transform-gpu ${
        shellInteractionClass
      } ${
        ghost
          ? quiet
            ? 'border-transparent bg-transparent shadow-none backdrop-blur-0'
            : 'border-transparent bg-transparent shadow-none backdrop-blur-0 hover:border-[var(--ether-glass-border)] hover:bg-[var(--ether-glass-bg)] hover:shadow-[var(--ether-glass-shadow)] hover:backdrop-blur-[var(--ether-glass-blur)]'
          : 'border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)]'
      } ${className}`}
      style={widgetAppearanceStyle}
      onPointerDownCapture={handleShellPointerDownCapture}
    >
      {effectiveGlowEnabled && !quiet && (
        <div
          data-testid="widget-shell-glow"
          className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-100 transition-opacity duration-300"
          style={{
            ...glowLayerStyle,
            background: `
              radial-gradient(100% 80% at -16% -10%, ${bloom} 0%, transparent 42%),
              radial-gradient(96% 78% at 116% 110%, ${bleedB} 0%, transparent 48%),
              linear-gradient(135deg, ${bleedA} 0%, transparent 34%, ${bleedB} 100%)
            `,
          }}
        />
      )}

      {/* Subtle Shine Effect */}
      {!quiet && (
        <div className="pointer-events-none absolute inset-0 z-10 translate-x-[-100%] rounded-[inherit] bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-[100%]" />
      )}

      {/* ── Header ── */}
      {showHeaderActionSlot && (
        <div
          className={`absolute right-3 top-4 z-30 flex items-center gap-1.5 transition-opacity duration-300 sm:right-4 sm:top-5 ${
            ghost ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          }`}
        >
          {actionSlotLeading}
          {actionSlot}
        </div>
      )}

      {!bare && (title || icon || rightSlot) && (
        <div
          className={`relative z-20 flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5 ${headerActionReserveClass} ${
            padded ? 'mb-3' : 'mb-0'
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {icon && (
              <div className="relative shrink-0">
                {canExpandFromIcon ? (
                  <button
                    type="button"
                    className="dashboard-widget-icon-target relative block rounded-xl outline-none"
                    onPointerDown={handleIconPointerDown}
                    onClick={handleIconExpand}
                    aria-label={expandLabel}
                  >
                    <span
                      data-testid="dashboard-widget-icon-badge"
                      className={`dashboard-widget-icon-badge relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--ether-glass-border)] ${colors.iconBg} shadow-sm backdrop-blur-md`}
                      style={{ background: iconBackground }}
                      aria-hidden
                    >
                      <span
                        data-testid="dashboard-widget-icon-burst"
                        className="dashboard-widget-icon-burst"
                        aria-hidden
                      />
                      <span className="dashboard-widget-icon-original relative z-10 flex h-5 w-5 items-center justify-center">
                        {iconElement
                          ? React.cloneElement(iconElement, {
                              className: iconElement.props.className || `h-4 w-4 text-[var(--dashboard-widget-accent,var(--ether-${accent}))]`,
                            })
                          : icon}
                      </span>
                      <span
                        data-testid="dashboard-widget-icon-expand-button"
                        className="dashboard-widget-icon-expand-button"
                        aria-hidden
                      >
                        <Maximize2 size={14} strokeWidth={2.35} />
                      </span>
                    </span>
                  </button>
                ) : (
                  <span
                    data-testid="dashboard-widget-icon-badge"
                    className={`dashboard-widget-icon-badge relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--ether-glass-border)] ${colors.iconBg} shadow-sm backdrop-blur-md`}
                    style={{ background: iconBackground }}
                    aria-hidden
                  >
                    <span
                      data-testid="dashboard-widget-icon-burst"
                      className="dashboard-widget-icon-burst"
                      aria-hidden
                    />
                    <span className="relative z-10 flex h-5 w-5 items-center justify-center">
                      {iconElement
                        ? React.cloneElement(iconElement, {
                            className: iconElement.props.className || `h-4 w-4 text-[var(--dashboard-widget-accent,var(--ether-${accent}))]`,
                          })
                        : icon}
                    </span>
                  </span>
                )}
              </div>
            )}
            {title && (
              <span
                className={`block min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${
                  titleClassName || 'text-[10px] font-bold uppercase leading-[1.35] tracking-[0.16em]'
                } ${theme.onSurface}`}
              >
                {title}
              </span>
            )}
          </div>
          {rightSlot && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {rightSlot}
            </div>
          )}
        </div>
      )}

      {showBareActionSlot && (
        <div
          className={`absolute right-3 top-4 z-30 transition-opacity duration-300 sm:right-4 sm:top-5 ${
            actionSlotVisibility === 'always' || dashboardEditMode
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
          }`}
        >
          {actionSlot}
        </div>
      )}

      {showRefreshMetadata && refreshPolicy && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)] shadow-sm backdrop-blur-md">
          {freshnessDotEnabled && (
            <FreshnessDot
              state={effectiveFreshness}
              motionEnabled={motionProfile.shouldAnimate}
              onRetry={handleFreshnessRetry}
            />
          )}
          <span>
            {showRelativeTimeLabel
              ? relativeTimeLabel
              : refreshPolicy.mode === 'timed'
                ? `Every ${refreshPolicy.intervalMinutes}m`
                : refreshPolicy.label}
          </span>
        </div>
      )}

      {/* ── Body ── */}
      <div
        className={`dashboard-widget-body relative z-10 box-border flex min-h-0 min-w-0 flex-1 flex-col ${bodyPaddingClass} ${bodyClassName}`}
        data-action-safe-area={actionSafeArea ? 'true' : undefined}
        style={
          actionSafeArea
            ? ({
                // Reserve the same footprint as the 3-dot action button
                // (~2.25rem button + 0.75rem right inset + 0.5rem breathing).
                // Consumers can layer content below this via padding-top on
                // their own children or rely on flex gap.
                ['--dashboard-widget-action-safe' as string]: '3.5rem',
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
        {announcerWidgetId && (
          <div
            data-testid="widget-shell-aria-live"
            className="sr-only"
            aria-live="polite"
            aria-atomic="true"
          >
            {ariaAnnouncerText}
          </div>
        )}
      </div>

      {sheenActive && (
        <div
          data-testid="widget-shell-sheen"
          className="widget-shell-sheen z-20"
          aria-hidden
        />
      )}

      {pulseKey > 0 && shouldPulseOnEvents && (
        <div
          key={pulseKey}
          data-testid="widget-shell-pulse"
          className={`widget-shell-pulse z-20 ${
            motionProfile.mode === 'subtle' ? 'widget-shell-pulse--subtle' : ''
          }`}
          aria-hidden
        />
      )}

    </div>
  );
};

export const WidgetShell = React.memo(WidgetShellImpl);
WidgetShell.displayName = 'WidgetShell';

export default WidgetShell;
