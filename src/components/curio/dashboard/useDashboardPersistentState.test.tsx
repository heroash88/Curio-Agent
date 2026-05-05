import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DashboardBoardPreferences,
  DashboardPage,
  DashboardWidget,
} from "../../../services/dashboardTypes";
import { useDashboardPersistentState } from "./useDashboardPersistentState";

const makeWidget = (
  id: string,
  position: number,
  config: DashboardWidget["config"] = { w: 2, h: 2 },
): DashboardWidget => ({
  id,
  type: "weather",
  position,
  size: "large",
  enabled: true,
  config,
});

const preferences: DashboardBoardPreferences = {
  mode: "grid",
  snapToGrid: true,
  accentPreset: "cobalt",
  glassEffectEnabled: true,
  glassEffectIntensity: 50,
  reduceMotion: true,
  widgetGlowEnabled: false,
  showPageSwitcher: true,
  pageKeyboardShortcutsEnabled: true,
};

const makePages = (): DashboardPage[] => [
  {
    id: "home",
    name: "Home",
    appearance: {
      themeMode: "dark",
      accentPreset: "cobalt",
      backgroundStyle: "default",
      backgroundColor: "#0a0a0a",
      glassEffectEnabled: true,
    },
    widgets: [makeWidget("weather_home", 0)],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "work",
    name: "Work",
    appearance: {
      themeMode: "light",
      accentPreset: "coral",
      backgroundStyle: "solid",
      backgroundColor: "#fef3c7",
      glassEffectEnabled: false,
    },
    widgets: [makeWidget("weather_work", 0, { w: 3, h: 3 })],
    createdAt: 2,
    updatedAt: 2,
  },
];

const renderPersistentState = (
  overrides: Partial<Parameters<typeof useDashboardPersistentState>[0]> = {},
) => {
  const pages = makePages();
  const saveDashboardPages = vi.fn();
  const saveActiveDashboardPageId = vi.fn();
  const saveDashboardPreferences = vi.fn();
  const onPageSelected = vi.fn();
  const activeGestureRef = { current: null };

  const hook = renderHook(() =>
    useDashboardPersistentState({
      activeProfileId: null,
      activeGestureRef,
      savedDashboardPages: pages,
      savedActiveDashboardPageId: "home",
      savedLayoutWidgets: pages[0].widgets,
      savedPreferences: preferences,
      globalThemeMode: "dark",
      globalAppBackgroundStyle: "default",
      globalAppBackgroundColor: "",
      saveDashboardPages,
      saveActiveDashboardPageId,
      saveDashboardPreferences,
      onPageSelected,
      ...overrides,
    }),
  );

  return {
    ...hook,
    saveDashboardPages,
    saveActiveDashboardPageId,
    saveDashboardPreferences,
    onPageSelected,
  };
};

describe("useDashboardPersistentState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects a dashboard page and exposes that page's widgets", () => {
    const { result, saveActiveDashboardPageId, onPageSelected } =
      renderPersistentState();

    act(() => {
      result.current.selectDashboardPage("work");
    });

    expect(result.current.activeDashboardPageId).toBe("work");
    expect(result.current.widgets.map((widget) => widget.id)).toEqual([
      "weather_work",
    ]);
    expect(saveActiveDashboardPageId).toHaveBeenCalledWith("work", null);
    expect(onPageSelected).toHaveBeenCalledTimes(1);
  });

  it("adds a page with no widgets and the active appearance", () => {
    const { result, saveDashboardPages, saveActiveDashboardPageId } =
      renderPersistentState();

    act(() => {
      result.current.addDashboardPage();
    });

    const newPage = result.current.dashboardPages[2];
    expect(newPage.name).toBe("Page 3");
    expect(newPage.appearance).toEqual(result.current.getActivePageAppearanceSnapshot());
    expect(newPage.widgets).toEqual([]);
    expect(result.current.widgets).toEqual([]);
    expect(result.current.activeDashboardPageId).toBe(newPage.id);
    expect(saveDashboardPages).toHaveBeenCalledWith(
      expect.arrayContaining([newPage]),
      null,
    );
    expect(saveActiveDashboardPageId).toHaveBeenCalledWith(newPage.id, null);
  });

  it("debounces widget page persistence while updating local widget state immediately", () => {
    const { result, saveDashboardPages } = renderPersistentState();
    const updatedWidget = makeWidget("weather_home", 0, { w: 4, h: 3 });

    act(() => {
      result.current.persistWidgets([updatedWidget]);
    });

    expect(result.current.widgets[0].config).toEqual({ w: 4, h: 3 });
    expect(saveDashboardPages).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(349);
    });
    expect(saveDashboardPages).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(saveDashboardPages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "home",
          widgets: [expect.objectContaining({ config: { w: 4, h: 3 } })],
        }),
      ]),
      null,
    );
  });
});
