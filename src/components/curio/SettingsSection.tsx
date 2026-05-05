import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode | (() => React.ReactNode);
  defaultOpen?: boolean;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon,
  children,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  // Keep children mounted after first open so local state is preserved.
  const [hasOpened, setHasOpened] = useState(defaultOpen);

  const handleToggle = () => {
    setOpen((previousOpen) => {
      if (!previousOpen) {
        setHasOpened(true);
      }
      return !previousOpen;
    });
  };

  return (
    <div className="curio-settings-section rounded-2xl border border-slate-100">
      <button
        onClick={handleToggle}
        className="curio-settings-section-trigger flex w-full items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3 transition-colors hover:bg-slate-100/80"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{title}</span>
        </div>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {hasOpened && (
        <div className="curio-settings-section-body space-y-3 bg-white px-4 py-3" style={{ display: open ? undefined : 'none' }}>
          {typeof children === 'function' ? children() : children}
        </div>
      )}
    </div>
  );
};

export default SettingsSection;
