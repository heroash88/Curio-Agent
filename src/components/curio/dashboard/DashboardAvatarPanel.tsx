import React from "react";
import { getDisplayInitials } from "./dashboardBoardUtils";

interface DashboardAvatarPanelProps {
  avatarDataUrl: string;
  dashboardOwnerName: string;
  configuredUserName: string;
  customDashboardTitle: string;
  avatarBusy: boolean;
  onUserNameChange: (value: string) => void;
  onDashboardTitleChange: (value: string) => void;
  onChoosePhoto: () => void;
  onRemovePhoto: () => void;
}

const DashboardAvatarPanel: React.FC<DashboardAvatarPanelProps> = ({
  avatarDataUrl,
  dashboardOwnerName,
  configuredUserName,
  customDashboardTitle,
  avatarBusy,
  onUserNameChange,
  onDashboardTitleChange,
  onChoosePhoto,
  onRemovePhoto,
}) => (
  <div className="absolute left-2.5 top-[4.75rem] z-[35] w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-4 shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)] sm:left-6 sm:top-[5.25rem]">
    <div className="flex items-center gap-3">
      {avatarDataUrl ? (
        <img
          src={avatarDataUrl}
          alt={dashboardOwnerName || "Curio user"}
          className="h-14 w-14 rounded-2xl object-cover ring-1 ring-[var(--ether-glass-border)]"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ether-control-bg)] text-sm font-bold text-[var(--ether-on-surface)]">
          {getDisplayInitials(dashboardOwnerName || "Curio User")}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--ether-on-surface)]">
          {dashboardOwnerName || "Curio User"}
        </div>
        <div className="mt-1 text-xs text-[var(--ether-on-surface-variant)]">
          Dashboard profile photo
        </div>
      </div>
    </div>

    <div className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
          Your Name
        </label>
        <input
          type="text"
          value={configuredUserName || ""}
          onChange={(event) => onUserNameChange(event.target.value)}
          placeholder="Enter your name"
          className="w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm text-[var(--ether-on-surface)] outline-none focus:ring-1 ring-[var(--ether-primary)]/30"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
          Dashboard Title
        </label>
        <input
          type="text"
          value={customDashboardTitle || ""}
          onChange={(event) => onDashboardTitleChange(event.target.value)}
          placeholder={
            dashboardOwnerName ? `${dashboardOwnerName}'s Dashboard` : "Shared Dashboard"
          }
          className="w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm text-[var(--ether-on-surface)] outline-none focus:ring-1 ring-[var(--ether-primary)]/30"
        />
      </div>
    </div>

    <div className="mt-6 grid gap-2">
      <button
        onClick={onChoosePhoto}
        disabled={avatarBusy}
        className="rounded-2xl bg-[var(--ether-on-surface)] px-4 py-3 text-sm font-semibold text-[var(--ether-surface)] transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
      >
        {avatarBusy
          ? "Updating photo..."
          : avatarDataUrl
            ? "Change photo"
            : "Upload photo"}
      </button>
      {avatarDataUrl && (
        <button
          onClick={onRemovePhoto}
          className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3 text-sm font-semibold text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
        >
          Remove photo
        </button>
      )}
    </div>
  </div>
);

export default DashboardAvatarPanel;
