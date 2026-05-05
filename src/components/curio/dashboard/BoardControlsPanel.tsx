import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Gem,
  Keyboard,
  Layers,
  Magnet,
  Moon,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  SunMedium,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  APP_BACKGROUND_PRESETS,
} from "../../../utils/settingsStorage";
import type {
  DashboardAccentPreset,
  DashboardAnimationPreset,
  DashboardBoardPreferences,
  DashboardLayoutMode,
  DashboardPage,
  DashboardPageAppearance,
} from "../../../services/dashboardTypes";
import {
  DASHBOARD_ACCENT_ORDER,
  DASHBOARD_ACCENT_PRESETS,
} from "../../../services/dashboardVisualPresets";
import {
  generateDashboardThemeFromPrompt,
  isDashboardThemeResetPrompt,
} from "../../../services/dashboardThemeGenerator";
import {
  DASHBOARD_ANIMATED_BACKGROUND_OPTIONS,
  buildDashboardAnimatedBackgroundAppearance,
} from "../../../services/dashboardAnimatedBackgroundPresets";
import ColorWheelInput from "../ColorWheelInput";

const DashboardPageNameInput: React.FC<{
  page: DashboardPage;
  onCommit: (pageId: string, name: string) => void;
}> = ({ page, onCommit }) => {
  const [draft, setDraft] = useState(page.name);

  useEffect(() => {
    setDraft(page.name);
  }, [page.id, page.name]);

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(page.id, draft.trim())}
      aria-label={`Rename ${page.name} dashboard page`}
      className="min-w-0 flex-1 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-sm font-semibold text-[var(--ether-on-surface)] outline-none transition focus:border-[var(--ether-primary)]/40"
    />
  );
};

export interface BoardControlsPanelProps {
  dashboardPages: DashboardPage[];
  activeDashboardPageId: string | null;
  preferences: DashboardBoardPreferences;
  pageSwitcherPreferenceEnabled: boolean;
  pageKeyboardShortcutsEnabled: boolean;
  widgetGlowEnabled: boolean;
  glassEffectIntensity: number;
  isDark: boolean;
  effectiveMode: DashboardLayoutMode;
  glassEffectEnabled: boolean;
  activeAccentPreset: DashboardAccentPreset;
  activeAccentColor?: string;
  activeAnimationPreset?: DashboardAnimationPreset;
  appBackgroundStyle: string;
  appBackgroundColor: string;
  editMode: boolean;
  onAddDashboardPage: () => void;
  onSelectDashboardPage: (pageId: string) => void;
  onRenameDashboardPage: (pageId: string, name: string) => void;
  onMoveDashboardPage: (pageId: string, direction: -1 | 1) => void;
  onDeleteDashboardPage: (pageId: string) => void;
  onPersistPreferences: (preferences: DashboardBoardPreferences) => void;
  onPersistActivePageAppearance: (patch: DashboardPageAppearance) => void;
  onResetActivePageAppearance: () => void;
  onModeToggle: (mode: DashboardLayoutMode) => void;
  onToggleEditMode: () => void;
  onOpenDashboardSearch: () => void;
  onResetDashboardBoard: () => void;
}

const BoardControlsPanel: React.FC<BoardControlsPanelProps> = ({
  dashboardPages,
  activeDashboardPageId,
  preferences,
  pageSwitcherPreferenceEnabled,
  pageKeyboardShortcutsEnabled,
  widgetGlowEnabled,
  glassEffectIntensity,
  isDark,
  effectiveMode,
  glassEffectEnabled,
  activeAccentPreset,
  activeAccentColor,
  activeAnimationPreset,
  appBackgroundStyle,
  appBackgroundColor,
  editMode,
  onAddDashboardPage,
  onSelectDashboardPage,
  onRenameDashboardPage,
  onMoveDashboardPage,
  onDeleteDashboardPage,
  onPersistPreferences,
  onPersistActivePageAppearance,
  onResetActivePageAppearance,
  onModeToggle,
  onToggleEditMode,
  onOpenDashboardSearch,
  onResetDashboardBoard,
}) => {
  const [showAiThemePrompt, setShowAiThemePrompt] = useState(false);
  const [themePrompt, setThemePrompt] = useState("");
  const activeBackgroundPreset = APP_BACKGROUND_PRESETS.find(
    (preset) =>
      preset.value === appBackgroundColor &&
      preset.style === appBackgroundStyle,
  );
  const activeAnimatedBackgroundPreset = DASHBOARD_ANIMATED_BACKGROUND_OPTIONS.find(
    (preset) =>
      appBackgroundStyle === "animated" &&
      preset.animationPreset === activeAnimationPreset,
  );
  const currentAccentColor =
    activeAccentColor || DASHBOARD_ACCENT_PRESETS[activeAccentPreset]?.accent || "#7dd3fc";

  const handleGenerateTheme = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = themePrompt.trim();
    if (!prompt) return;
    if (isDashboardThemeResetPrompt(prompt)) {
      onResetActivePageAppearance();
      setThemePrompt("");
      setShowAiThemePrompt(false);
      return;
    }
    onPersistActivePageAppearance(generateDashboardThemeFromPrompt(prompt));
    setThemePrompt("");
    setShowAiThemePrompt(false);
  };

  return (
    <div className="dashboard-floating-panel absolute right-2 top-[4.75rem] z-[35] box-border w-[22rem] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-4 shadow-[var(--ether-glass-shadow)] backdrop-blur-[var(--ether-glass-blur)] sm:right-6 sm:top-[5.25rem]">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ether-on-surface-variant)]">
        Board Controls
      </div>
      <div className="mt-3 grid min-w-0 gap-4">
        <div className="min-w-0 rounded-[1.25rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                <Layers size={12} />
                Pages
              </div>
              <div className="mt-1 text-xs text-[var(--ether-on-surface-variant)]">
                {dashboardPages.length} saved board
                {dashboardPages.length === 1 ? "" : "s"}
              </div>
            </div>
            <button
              type="button"
              onClick={onAddDashboardPage}
              disabled={dashboardPages.length >= 12}
              aria-label="Add dashboard page"
              className="rounded-full bg-[var(--ether-on-surface)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Add
            </button>
          </div>

          <div className="grid gap-2">
            {dashboardPages.map((page, index) => {
              const active = page.id === activeDashboardPageId;
              return (
                <div
                  key={page.id}
                  data-testid={`dashboard-page-row-${page.id}`}
                  onClick={() => onSelectDashboardPage(page.id)}
                  className={`min-w-0 cursor-pointer rounded-[1rem] border p-2 text-left transition ${
                    active
                      ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                      : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/35"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectDashboardPage(page.id)}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition ${
                        active
                          ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                          : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                      }`}
                      aria-label={`Open ${page.name} dashboard page`}
                    >
                      {index + 1}
                    </button>
                    <DashboardPageNameInput
                      page={page}
                      onCommit={onRenameDashboardPage}
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMoveDashboardPage(page.id, -1);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        disabled={index === 0}
                        aria-label={`Move ${page.name} page up`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMoveDashboardPage(page.id, 1);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        disabled={index === dashboardPages.length - 1}
                        aria-label={`Move ${page.name} page down`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ChevronDown size={14} />
                      </button>
                      {dashboardPages.length > 1 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteDashboardPage(page.id);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          aria-label={`Delete ${page.name} dashboard page`}
                          title={`Delete ${page.name} dashboard page`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              onPersistPreferences({
                ...preferences,
                showPageSwitcher: !pageSwitcherPreferenceEnabled,
              })
            }
            aria-label={
              pageSwitcherPreferenceEnabled
                ? "Hide page switcher"
                : "Show page switcher"
            }
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left text-sm font-medium text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Eye size={14} />
              <span className="truncate">
                {pageSwitcherPreferenceEnabled
                  ? "Hide page switcher"
                  : "Show page switcher"}
              </span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {pageSwitcherPreferenceEnabled ? "Visible" : "Hidden"}
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              onPersistPreferences({
                ...preferences,
                pageKeyboardShortcutsEnabled: !pageKeyboardShortcutsEnabled,
              })
            }
            aria-label={
              pageKeyboardShortcutsEnabled
                ? "Disable page keyboard shortcuts"
                : "Enable page keyboard shortcuts"
            }
            title="Use [ and ] to switch dashboard pages when text is not focused"
            className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left text-sm font-medium text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Keyboard size={14} />
              <span className="min-w-0">
                <span className="block truncate">Page shortcuts</span>
                <span className="block text-[10px] font-semibold tracking-normal text-[var(--ether-on-surface-variant)]">
                  Use [ and ]
                </span>
              </span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {pageKeyboardShortcutsEnabled ? "On" : "Off"}
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              onPersistPreferences({
                ...preferences,
                widgetGlowEnabled: !widgetGlowEnabled,
              })
            }
            aria-label={
              widgetGlowEnabled ? "Disable widget glow" : "Enable widget glow"
            }
            className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left text-sm font-medium text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <SunMedium size={14} />
              <span className="truncate">Widget glow</span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {widgetGlowEnabled ? "On" : "Off"}
            </span>
          </button>
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
            Page Style
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPersistActivePageAppearance({ themeMode: "light" })}
              aria-label="Use light theme for this page"
              className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                !isDark
                  ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                  : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
              }`}
            >
              <Sun size={14} />
              Light
            </button>
            <button
              type="button"
              onClick={() => onPersistActivePageAppearance({ themeMode: "dark" })}
              aria-label="Use dark theme for this page"
              className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                isDark
                  ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                  : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
              }`}
            >
              <Moon size={14} />
              Dark
            </button>
          </div>
          <div className="mt-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-2">
            <button
              type="button"
              onClick={() => setShowAiThemePrompt((current) => !current)}
              aria-expanded={showAiThemePrompt}
              aria-label="Open AI theme generator"
              className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <WandSparkles size={14} />
                <span className="truncate">AI Theme</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                Generate
              </span>
            </button>
            {showAiThemePrompt && (
              <form onSubmit={handleGenerateTheme} className="mt-2 grid gap-2">
                <input
                  value={themePrompt}
                  onChange={(event) => setThemePrompt(event.currentTarget.value)}
                  placeholder="Describe a theme..."
                  className="min-w-0 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] px-3 py-2 text-sm text-[var(--ether-on-surface)] outline-none transition placeholder:text-[var(--ether-on-surface-variant)] focus:border-[var(--ether-primary)]/45"
                  aria-label="Describe dashboard theme"
                />
                <button
                  type="submit"
                  disabled={!themePrompt.trim()}
                  aria-label="Generate dashboard theme"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ether-on-surface)] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--ether-surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <WandSparkles size={13} />
                  Generate Theme
                </button>
              </form>
            )}
          </div>
          <button
            type="button"
            onClick={onResetActivePageAppearance}
            aria-label="Reset dashboard theme"
            className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left text-sm font-medium text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <RotateCcw size={14} />
              <span className="truncate">Reset theme</span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
              Page
            </span>
          </button>
        </div>

        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
            Layout
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onModeToggle("grid")}
              className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                effectiveMode === "grid"
                  ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                  : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => onModeToggle("freeform")}
              className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                effectiveMode === "freeform"
                  ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                  : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
              }`}
            >
              Freeform
            </button>
          </div>
        </div>

        <button
          onClick={() =>
            onPersistPreferences({
              ...preferences,
              snapToGrid: !preferences.snapToGrid,
            })
          }
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
            preferences.snapToGrid
              ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/15 text-[var(--ether-on-surface)]"
              : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
          }`}
        >
          <span className="flex items-center gap-2">
            <Magnet size={14} />
            Snap widgets to the grid
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.16em]">
            {preferences.snapToGrid ? "On" : "Off"}
          </span>
        </button>

        <button
          onClick={() =>
            onPersistActivePageAppearance({
              glassEffectEnabled: !glassEffectEnabled,
            })
          }
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
            glassEffectEnabled
              ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/15 text-[var(--ether-on-surface)]"
              : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
          }`}
        >
          <span className="flex items-center gap-2">
            <Gem size={14} />
            Glass effect
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.16em]">
            {glassEffectEnabled ? "On" : "Off"}
          </span>
        </button>

        <label className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-3">
          <span className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--ether-on-surface-variant)]">
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={14} />
              Glassy feel
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.16em]">
              {Math.round(glassEffectIntensity)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={glassEffectIntensity}
            onChange={(event) =>
              onPersistPreferences({
                ...preferences,
                glassEffectIntensity: Number(event.currentTarget.value),
              })
            }
            className="mt-3 h-2 w-full accent-[var(--ether-primary)]"
            aria-label="Adjust dashboard glassy feel"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
            <Palette size={12} />
            Accent
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {DASHBOARD_ACCENT_ORDER.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  onPersistActivePageAppearance({
                    accentPreset: preset,
                    accentColor: undefined,
                  })
                }
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
                  !activeAccentColor && activeAccentPreset === preset
                    ? "scale-110 border-[var(--ether-on-surface)]"
                    : "border-transparent hover:scale-105"
                }`}
                title={preset}
                aria-label={`Select ${preset} accent`}
              >
                <span
                  className="block h-5 w-5 rounded-full"
                  style={{ background: DASHBOARD_ACCENT_PRESETS[preset].accent }}
                />
              </button>
            ))}
            <ColorWheelInput
              value={currentAccentColor}
              onChange={(accentColor) =>
                onPersistActivePageAppearance({ accentColor })
              }
              ariaLabel="Custom dashboard accent color"
              title="Custom dashboard accent color"
              active={Boolean(activeAccentColor)}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
              <Palette size={12} />
              Background
            </div>
            <button
              type="button"
              onClick={() =>
                onPersistActivePageAppearance({ backgroundStyle: "default" })
              }
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition ${
                appBackgroundStyle === "default"
                  ? "bg-[var(--ether-on-surface)] text-[var(--ether-surface)]"
                  : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
              }`}
            >
              Default
            </button>
          </div>
          <div
            className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1"
            data-testid="dashboard-background-preset-grid"
          >
            {APP_BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onPersistActivePageAppearance({
                    backgroundStyle: preset.style,
                    backgroundColor: preset.value,
                  })
                }
                className={`relative min-h-16 overflow-hidden rounded-2xl border transition active:scale-95 ${
                  activeBackgroundPreset?.id === preset.id
                    ? "border-[var(--ether-on-surface)] shadow-lg"
                    : "border-[var(--ether-glass-border)] hover:scale-[1.02]"
                }`}
                title={preset.label}
                aria-label={`Use ${preset.label} background`}
              >
                <span
                  className="absolute inset-0"
                  style={{
                    background:
                      preset.style === "image"
                        ? `center / cover url("${preset.value}")`
                        : preset.value,
                  }}
                />
                <span className="absolute inset-x-2 bottom-2 rounded-xl bg-black/45 px-2 py-1 text-center text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-white shadow-sm backdrop-blur whitespace-normal break-words">
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
              Animated backgrounds
            </div>
            <div
              className="grid grid-cols-2 gap-2"
              data-testid="dashboard-animated-background-preset-grid"
            >
              {DASHBOARD_ANIMATED_BACKGROUND_OPTIONS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    onPersistActivePageAppearance(
                      buildDashboardAnimatedBackgroundAppearance(preset),
                    )
                  }
                  className={`relative min-h-16 overflow-hidden rounded-2xl border transition active:scale-95 ${
                    activeAnimatedBackgroundPreset?.id === preset.id
                      ? "border-[var(--ether-on-surface)] shadow-lg"
                      : "border-[var(--ether-glass-border)] hover:scale-[1.02]"
                  }`}
                  title={preset.description}
                  aria-label={`Use ${preset.label} animated background`}
                >
                  <span
                    className="absolute inset-0"
                    style={{ background: preset.backgroundColor }}
                  />
                  <span className="absolute inset-0 bg-black/10" />
                  <span className="absolute inset-x-2 bottom-2 rounded-xl bg-black/45 px-2 py-1 text-center text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-white shadow-sm backdrop-blur whitespace-normal break-words">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2">
            <span className="text-xs font-semibold text-[var(--ether-on-surface-variant)]">
              Custom color
            </span>
            <ColorWheelInput
              value={
                /^#[0-9a-fA-F]{6}$/.test(appBackgroundColor)
                  ? appBackgroundColor
                  : "#0a0a0a"
              }
              onChange={(backgroundColor) => {
                onPersistActivePageAppearance({
                  backgroundStyle: "solid",
                  backgroundColor,
                });
              }}
              ariaLabel="Custom board background color"
              title="Custom board background color"
              size="sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleEditMode}
            className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
              editMode
                ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/15 text-[var(--ether-on-surface)]"
                : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
            }`}
          >
            {editMode ? "Finish editing" : "Edit widgets"}
          </button>
          <button
            type="button"
            onClick={onOpenDashboardSearch}
            className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-3 text-left text-sm font-semibold text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
          >
            Search dashboard
          </button>
          <button
            type="button"
            onClick={() =>
              onPersistPreferences({
                ...preferences,
                reduceMotion: !preferences.reduceMotion,
              })
            }
            className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
              preferences.reduceMotion
                ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/15 text-[var(--ether-on-surface)]"
                : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
            }`}
          >
            Reduce motion
          </button>
          <button
            type="button"
            onClick={onResetDashboardBoard}
            className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-3 text-left text-sm font-semibold text-rose-400 transition hover:bg-rose-500/15"
          >
            Reset board
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BoardControlsPanel);
