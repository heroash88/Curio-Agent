import React, { startTransition } from "react";
import {
  Bell,
  Camera,
  CameraOff,
  Check,
  EyeOff,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Settings2,
  Sun,
  SwitchCamera,
  X,
} from "lucide-react";
import type { DashboardPage } from "../../../services/dashboardTypes";
import type { DashboardSearchResult } from "../../../services/dashboardSearch";
import { getDisplayInitials } from "./dashboardBoardUtils";

const IconToolbarButton: React.FC<{
  active?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}> = ({ active = false, onClick, label, icon, badge }) => (
  <button
    onClick={onClick}
    title={label}
    className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition sm:h-10 sm:w-10 ${
      active
        ? "border-[var(--ether-glass-border)] bg-[var(--ether-on-surface)] text-[var(--ether-surface)] shadow-[0_14px_36px_rgba(15,23,42,0.22)]"
        : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]/60 text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-surface-bright)]/60"
    }`}
    aria-label={label}
  >
    {icon}
    {badge && badge > 0 ? (
      <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-lg">
        {badge > 9 ? "9+" : badge}
      </span>
    ) : null}
  </button>
);

const ToolbarActionPill: React.FC<{
  active?: boolean;
  busy?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}> = ({ active = false, busy = false, onClick, label, icon }) => (
  <button
    onClick={onClick}
    title={label}
    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 rounded-full border px-0 text-sm font-semibold transition sm:h-10 sm:w-auto sm:px-4 ${
      active || busy
        ? "border-transparent bg-[var(--ether-primary)] text-slate-950 shadow-[0_16px_36px_rgba(14,165,233,0.24)]"
        : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]/60 text-[var(--ether-on-surface)] hover:bg-[var(--ether-surface-bright)]/60"
    }`}
    aria-label={label}
  >
    <span className={busy ? "animate-spin" : ""}>{icon}</span>
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const ToolbarPanelButton: React.FC<{
  active?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}> = ({ active = false, onClick, label, icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
      active
        ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]"
        : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface)] hover:bg-[var(--ether-control-hover)]"
    }`}
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
  </button>
);

interface DashboardToolbarProps {
  isDark: boolean;
  avatarDataUrl: string;
  dashboardOwnerName: string;
  toolbarGreeting: string;
  dashboardLabel: string;
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleAvatarPanel: () => void;
  connectionLabel?: string;
  connectionActive: boolean;
  connectionBusy: boolean;
  onToggleConnection?: () => void;
  textInputVisible: boolean;
  onToggleTextInput?: () => void;
  editMode: boolean;
  showDashboardSearch: boolean;
  showPicker: boolean;
  showActionsPanel: boolean;
  onToggleEditMode: () => void;
  onOpenDashboardSearch: () => void;
  onToggleWidgetPicker: () => void;
  onToggleActionsPanel: () => void;
  cameraEnabled: boolean;
  canFlipCamera: boolean;
  onToggleCamera?: () => void;
  onFlipCamera?: () => void | Promise<unknown>;
  connectionActiveForMute: boolean;
  isMuted: boolean;
  onToggleMute?: () => void;
  showNotificationsPanel: boolean;
  effectiveUnreadNotificationCount: number;
  onToggleNotificationsPanel: () => void;
  onOpenSettings?: () => void;
  onToggleTheme: () => void;
  showBoardPanel: boolean;
  onToggleBoardPanel: () => void;
  showPageSwitcher: boolean;
  dashboardPages: DashboardPage[];
  activeDashboardPageId: string;
  onSelectDashboardPage: (pageId: string) => void;
  onHidePageSwitcher: () => void;
  dashboardSearchInputRef: React.RefObject<HTMLInputElement | null>;
  dashboardSearchQuery: string;
  dashboardSearchHasQuery: boolean;
  dashboardSearchResults: DashboardSearchResult[];
  onDashboardSearchQueryChange: (value: string) => void;
  onOpenDashboardSearchResult: (widgetId: string) => void;
  onCloseDashboardSearch: () => void;
}

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  isDark,
  avatarDataUrl,
  dashboardOwnerName,
  toolbarGreeting,
  dashboardLabel,
  avatarInputRef,
  onAvatarFileChange,
  onToggleAvatarPanel,
  connectionLabel,
  connectionActive,
  connectionBusy,
  onToggleConnection,
  textInputVisible,
  onToggleTextInput,
  editMode,
  showDashboardSearch,
  showPicker,
  showActionsPanel,
  onToggleEditMode,
  onOpenDashboardSearch,
  onToggleWidgetPicker,
  onToggleActionsPanel,
  cameraEnabled,
  canFlipCamera,
  onToggleCamera,
  onFlipCamera,
  connectionActiveForMute,
  isMuted,
  onToggleMute,
  showNotificationsPanel,
  effectiveUnreadNotificationCount,
  onToggleNotificationsPanel,
  onOpenSettings,
  onToggleTheme,
  showBoardPanel,
  onToggleBoardPanel,
  showPageSwitcher,
  dashboardPages,
  activeDashboardPageId,
  onSelectDashboardPage,
  onHidePageSwitcher,
  dashboardSearchInputRef,
  dashboardSearchQuery,
  dashboardSearchHasQuery,
  dashboardSearchResults,
  onDashboardSearchQueryChange,
  onOpenDashboardSearchResult,
  onCloseDashboardSearch,
}) => (
  <div
    data-testid="dashboard-toolbar"
    className="dashboard-pwa-toolbar sticky top-0 z-30 px-2.5 py-2 sm:px-6 sm:py-3"
    style={{
      background: isDark
        ? "linear-gradient(180deg, rgba(12, 11, 10, 0.40), rgba(12, 11, 10, 0.18)), linear-gradient(90deg, rgba(255, 244, 225, 0.04), rgba(125, 211, 252, 0.03), rgba(255, 244, 225, 0.02))"
        : "linear-gradient(180deg, rgba(234, 226, 211, 0.34), rgba(234, 226, 211, 0.16)), linear-gradient(90deg, rgba(82, 69, 53, 0.04), rgba(125, 211, 252, 0.03), rgba(82, 69, 53, 0.02))",
      backdropFilter: isDark
        ? "blur(24px) saturate(1.35)"
        : "blur(24px) saturate(1.25)",
      WebkitBackdropFilter: isDark
        ? "blur(24px) saturate(1.35)"
        : "blur(24px) saturate(1.25)",
      borderBottom: isDark
        ? "1px solid rgba(255, 244, 225, 0.09)"
        : "1px solid rgba(76, 64, 48, 0.10)",
      boxShadow: isDark
        ? "0 12px 30px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 244, 225, 0.04)"
        : "0 10px 24px rgba(73, 59, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.24)",
    }}
  >
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        <div className="relative">
          <button
            onClick={onToggleAvatarPanel}
            className="group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] shadow-[var(--ether-glass-shadow)] transition hover:scale-105 sm:h-12 sm:w-12"
            aria-label="Edit profile picture"
          >
            {avatarDataUrl ? (
              <img
                src={avatarDataUrl}
                alt={dashboardOwnerName || "Curio user"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-[var(--ether-on-surface)]">
                {getDisplayInitials(dashboardOwnerName || "Curio User")}
              </span>
            )}
            <span
              className={`absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)] shadow-lg transition-opacity duration-300 ${
                avatarDataUrl ? "opacity-0 group-hover:opacity-100" : "opacity-100"
              }`}
            >
              <Camera size={11} />
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onAvatarFileChange}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[9px] font-bold uppercase tracking-[0.22em] sm:text-[10px]"
            style={{ color: "var(--ether-on-surface-variant)" }}
          >
            {toolbarGreeting}
          </div>
          <h2
            className="truncate text-base font-semibold font-headline tracking-[-0.03em] sm:text-xl"
            style={{ color: "var(--ether-on-surface)" }}
          >
            {dashboardLabel}
          </h2>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-0.5 shadow-sm backdrop-blur-[var(--ether-glass-blur)] sm:gap-1.5 sm:p-1">
          {onToggleConnection && connectionLabel ? (
            <ToolbarActionPill
              active={connectionActive}
              busy={connectionBusy}
              onClick={onToggleConnection}
              label={connectionLabel}
              icon={
                connectionBusy ? (
                  <Loader2 size={16} />
                ) : connectionActive ? (
                  <MicOff size={16} />
                ) : (
                  <Mic size={16} />
                )
              }
            />
          ) : null}
          {onToggleTextInput ? (
            <IconToolbarButton
              active={textInputVisible}
              onClick={onToggleTextInput}
              label={textInputVisible ? "Hide text input" : "Show text input"}
              icon={<MessageSquare size={16} />}
            />
          ) : null}
          <IconToolbarButton
            active={editMode}
            onClick={onToggleEditMode}
            label={editMode ? "Done" : "Edit"}
            icon={editMode ? <Check size={16} /> : <Pencil size={16} />}
          />
          <IconToolbarButton
            active={showDashboardSearch}
            onClick={onOpenDashboardSearch}
            label="Search dashboard"
            icon={<Search size={16} />}
          />
          {editMode && (
            <IconToolbarButton
              active={showPicker}
              onClick={onToggleWidgetPicker}
              label="Add widget"
              icon={<Plus size={16} />}
            />
          )}
          <div className="sm:hidden">
            <IconToolbarButton
              active={showActionsPanel}
              onClick={onToggleActionsPanel}
              label="More controls"
              icon={<MoreHorizontal size={16} />}
            />
          </div>
        </div>

        <div className="hidden items-center gap-1.5 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-1 shadow-sm backdrop-blur-[var(--ether-glass-blur)] sm:flex">
          {onToggleCamera ? (
            <IconToolbarButton
              active={cameraEnabled}
              onClick={onToggleCamera}
              label={cameraEnabled ? "Disable camera" : "Enable camera"}
              icon={cameraEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
            />
          ) : null}
          {cameraEnabled && canFlipCamera && onFlipCamera ? (
            <IconToolbarButton
              active={false}
              onClick={() => { void onFlipCamera(); }}
              label="Flip camera"
              icon={<SwitchCamera size={16} />}
            />
          ) : null}
          {onToggleMute && connectionActiveForMute ? (
            <IconToolbarButton
              active={isMuted}
              onClick={onToggleMute}
              label={isMuted ? "Unmute microphone" : "Mute microphone"}
              icon={isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            />
          ) : null}
          <IconToolbarButton
            active={showNotificationsPanel}
            onClick={onToggleNotificationsPanel}
            label="Notifications"
            icon={<Bell size={16} />}
            badge={effectiveUnreadNotificationCount}
          />
          {onOpenSettings ? (
            <IconToolbarButton
              onClick={onOpenSettings}
              label="App settings"
              icon={<Settings size={16} />}
            />
          ) : null}
          <IconToolbarButton
            onClick={onToggleTheme}
            label={isDark ? "Light" : "Dark"}
            icon={isDark ? <Sun size={14} /> : <Moon size={14} />}
          />
          <IconToolbarButton
            active={showBoardPanel}
            onClick={onToggleBoardPanel}
            label="Board controls"
            icon={<Settings2 size={16} />}
          />
        </div>
      </div>
    </div>

    {showPageSwitcher && (
      <div
        data-testid="dashboard-page-switcher"
        className="mt-2 flex w-full items-center gap-1 overflow-x-auto pb-0.5"
      >
        <div className="flex max-w-full items-center gap-1 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-0.5 shadow-sm backdrop-blur-[var(--ether-glass-blur)]">
          {dashboardPages.map((page) => {
            const active = page.id === activeDashboardPageId;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => onSelectDashboardPage(page.id)}
                aria-label={`Switch to ${page.name} dashboard page`}
                className={`h-7 max-w-36 shrink-0 rounded-full px-3 text-xs font-semibold transition sm:h-8 ${
                  active
                    ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)] shadow-sm"
                    : "text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                }`}
              >
                <span className="block truncate">{page.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onHidePageSwitcher}
            aria-label="Hide dashboard page tabs"
            title="Hide dashboard page tabs"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)] sm:h-8 sm:w-8"
          >
            <EyeOff size={13} />
          </button>
        </div>
      </div>
    )}

    {showDashboardSearch && (
      <div
        data-testid="dashboard-inline-search"
        className={`mt-2 w-full rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)]/88 p-2 shadow-sm backdrop-blur-[var(--ether-glass-blur)] ${
          dashboardSearchHasQuery ? "max-w-[34rem]" : "max-w-[21rem]"
        }`}
      >
        <div className="flex flex-col gap-2">
          <label className="flex h-10 w-full shrink-0 items-center gap-2 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3">
            <Search
              size={15}
              className="shrink-0 text-[var(--ether-on-surface-variant)]"
            />
            <input
              ref={dashboardSearchInputRef}
              value={dashboardSearchQuery}
              onChange={(event) => {
                const value = event.target.value;
                startTransition(() => onDashboardSearchQueryChange(value));
              }}
              placeholder="Search dashboard"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]"
            />
            <button
              type="button"
              onClick={onCloseDashboardSearch}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
              aria-label="Close dashboard search"
            >
              <X size={14} />
            </button>
          </label>

          {dashboardSearchHasQuery && (
            <div
              data-testid="dashboard-search-results"
              className="flex min-w-0 flex-col gap-2"
            >
              {dashboardSearchResults.length > 0 ? (
                dashboardSearchResults.slice(0, 6).map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => onOpenDashboardSearchResult(result.widgetId)}
                    aria-label={`Show ${result.label}: ${result.title}`}
                    className="w-full rounded-[1.05rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left outline-none transition hover:bg-[var(--ether-control-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/45"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                        {result.label}
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--ether-on-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-surface)]">
                        Show
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-[var(--ether-on-surface)]">
                      {result.title}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--ether-on-surface-variant)]">
                      {result.summary}
                    </div>
                  </button>
                ))
              ) : (
                <div className="flex min-h-16 w-full items-center justify-center rounded-[1.05rem] border border-dashed border-[var(--ether-glass-border)] px-4 text-center text-sm text-[var(--ether-on-surface-variant)]">
                  No on-screen results. Try weather, a widget name, note text, or a table value.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}

    {showActionsPanel && (
      <div className="absolute right-2.5 top-[4.75rem] z-[35] w-[18rem] max-w-[calc(100vw-1.5rem)] rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-3 shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)] sm:hidden">
        <div className="grid gap-2">
          {onToggleCamera ? (
            <ToolbarPanelButton
              active={cameraEnabled}
              onClick={onToggleCamera}
              label={cameraEnabled ? "Disable camera" : "Enable camera"}
              icon={cameraEnabled ? <Camera size={15} /> : <CameraOff size={15} />}
            />
          ) : null}
          {cameraEnabled && canFlipCamera && onFlipCamera ? (
            <ToolbarPanelButton
              active={false}
              onClick={() => { void onFlipCamera(); }}
              label="Flip camera"
              icon={<SwitchCamera size={15} />}
            />
          ) : null}
          {onToggleMute && connectionActiveForMute ? (
            <ToolbarPanelButton
              active={isMuted}
              onClick={onToggleMute}
              label={isMuted ? "Unmute microphone" : "Mute microphone"}
              icon={isMuted ? <MicOff size={15} /> : <Mic size={15} />}
            />
          ) : null}
          <ToolbarPanelButton
            active={showNotificationsPanel}
            onClick={onToggleNotificationsPanel}
            label="Notifications"
            icon={<Bell size={15} />}
          />
          {onOpenSettings ? (
            <ToolbarPanelButton
              onClick={onOpenSettings}
              label="App settings"
              icon={<Settings size={15} />}
            />
          ) : null}
          <ToolbarPanelButton
            onClick={onToggleTheme}
            label={isDark ? "Light mode" : "Dark mode"}
            icon={isDark ? <Sun size={15} /> : <Moon size={15} />}
          />
          <ToolbarPanelButton
            active={showBoardPanel}
            onClick={onToggleBoardPanel}
            label="Board controls"
            icon={<Settings2 size={15} />}
          />
        </div>
      </div>
    )}
  </div>
);

export default DashboardToolbar;
