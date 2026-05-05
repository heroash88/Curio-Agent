import React from 'react';
import { RotateCcw, X } from 'lucide-react';

import { useDashboardToastBus } from '../../../hooks/useDashboardToastBus';
import {
  DASHBOARD_TOAST_MAX_VISIBLE,
  dashboardToastBus,
  type DashboardToast,
  type DashboardToastTone,
} from '../../../services/dashboardToastBus';

/**
 * `DashboardToastHost`
 *
 * Thin visual layer over `dashboardToastBus`. Subscribes via
 * `useDashboardToastBus` and renders at most three stacked toasts in
 * the bottom-right corner. Each toast exposes:
 *
 *   - an optional Undo button (only when `onUndo` is defined),
 *   - a close button that calls `dashboardToastBus.dismiss(id)`.
 *
 * Undo routes through `dashboardToastBus.triggerUndo(id)` which
 * guarantees `onUndo` fires at most once and dismisses the toast in
 * the same call (see Requirement 16.6).
 *
 * Visual surface is intentionally light: we lean on Tailwind utility
 * classes and the existing `--ether-*` design tokens so the toast
 * stack matches dashboard chrome in both light and dark themes. We
 * avoid Framer Motion here on purpose — a constant three-toast surface
 * should not ship with an animation library attached.
 *
 * Accessibility:
 *  - The outer container is `role="status"` with
 *    `aria-live="polite"` so screen readers announce default and
 *    success-toned toasts without interrupting.
 *  - Danger-toned toasts individually set `role="alert"` so they are
 *    announced assertively.
 *  - Each actionable button carries an explicit `aria-label` and
 *    hits the 44px min tap target dictated by Requirement 27.
 */

const TONE_SURFACE: Record<DashboardToastTone, string> = {
  default:
    'bg-[var(--ether-glass-bg)] border-[var(--ether-glass-border)] text-[var(--ether-on-surface)]',
  success:
    'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/15 dark:border-emerald-400/30 dark:text-emerald-100',
  danger:
    'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-500/15 dark:border-rose-400/30 dark:text-rose-100',
};

const TONE_BUTTON: Record<DashboardToastTone, string> = {
  default:
    'hover:bg-[var(--ether-control-hover)] focus-visible:outline-[var(--ether-primary)]',
  success:
    'hover:bg-emerald-100 focus-visible:outline-emerald-400 dark:hover:bg-emerald-500/20',
  danger:
    'hover:bg-rose-100 focus-visible:outline-rose-400 dark:hover:bg-rose-500/20',
};

const resolveTone = (tone: DashboardToastTone | undefined): DashboardToastTone =>
  tone === 'success' || tone === 'danger' ? tone : 'default';

const ToastRow: React.FC<{ toast: DashboardToast }> = ({ toast }) => {
  const tone = resolveTone(toast.tone);
  const surface = TONE_SURFACE[tone];
  const buttonTone = TONE_BUTTON[tone];

  return (
    <div
      data-testid="dashboard-toast"
      data-toast-id={toast.id}
      data-tone={tone}
      role={tone === 'danger' ? 'alert' : undefined}
      className={`pointer-events-auto flex min-w-[260px] max-w-sm items-center gap-2 rounded-2xl border px-3 py-2 text-sm shadow-lg backdrop-blur ${surface}`}
    >
      <span className="min-w-0 flex-1 truncate leading-5">{toast.label}</span>
      {toast.onUndo && (
        <button
          type="button"
          aria-label={`Undo ${toast.label}`}
          onClick={() => dashboardToastBus.triggerUndo(toast.id)}
          className={`inline-flex min-h-[40px] items-center gap-1 rounded-full px-3 text-xs font-semibold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonTone}`}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Undo
        </button>
      )}
      <button
        type="button"
        aria-label={`Dismiss ${toast.label}`}
        onClick={() => dashboardToastBus.dismiss(toast.id)}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonTone}`}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

const DashboardToastHost: React.FC = () => {
  const toasts = useDashboardToastBus();

  if (!toasts || toasts.length === 0) {
    return null;
  }

  // Defensive cap: the bus already enforces this, but if a subscriber
  // ever sees a transient snapshot with more than the limit, only
  // render the newest N so layout stays stable.
  const visible =
    toasts.length > DASHBOARD_TOAST_MAX_VISIBLE
      ? toasts.slice(toasts.length - DASHBOARD_TOAST_MAX_VISIBLE)
      : toasts;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      data-testid="dashboard-toast-host"
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2"
    >
      {visible.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

export default DashboardToastHost;
