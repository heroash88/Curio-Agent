import React from 'react';

interface SettingsToggleProps {
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: () => void;
  /**
   * @deprecated Retained for source compatibility with existing callsites, but
   * ignored at render time. All settings toggles share a single brand color
   * driven by the `--settings-accent` token so light and dark modes look
   * consistent. Per-section tint was causing a mix of violet, indigo, teal,
   * rose, and purple toggles in the same modal.
   */
  color?: string;
  icon?: React.ReactNode;
}

const SettingsToggle: React.FC<SettingsToggleProps> = ({
  label,
  description,
  enabled,
  onToggle,
  icon,
}) => {
  const hasVisibleLabel = Boolean(label) || Boolean(description);
  return (
    <div
      className={`curio-settings-toggle flex items-center justify-between gap-3 ${
        hasVisibleLabel ? 'py-1.5' : ''
      }`}
    >
      {hasVisibleLabel ? (
        <div className="flex flex-col flex-1 min-w-0">
          {label && (
            <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              {icon && <span className="shrink-0">{icon}</span>}
              {label}
            </span>
          )}
          {description && (
            <span className="text-[10px] text-slate-400 italic leading-tight">{description}</span>
          )}
        </div>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label || undefined}
        onClick={onToggle}
        data-state={enabled ? 'on' : 'off'}
        className="curio-settings-toggle-switch relative h-7 w-12 shrink-0 rounded-full shadow-sm transition-all duration-300 active:scale-95"
      >
        <span
          className={`curio-settings-toggle-thumb absolute top-0.5 h-6 w-6 rounded-full shadow-md transition-all duration-300 ${
            enabled ? 'left-5.5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
};

export default SettingsToggle;
