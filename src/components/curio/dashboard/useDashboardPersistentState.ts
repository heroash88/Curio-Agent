import { useCallback, useEffect, useRef, useState } from "react";
import {
  setProfileActiveDashboardPageId,
  setProfileDashboardPages,
  setProfileDashboardPreferences,
} from "../../../utils/settingsStorage";
import type {
  DashboardBoardPreferences,
  DashboardPage,
  DashboardPageAppearance,
  DashboardPageBackgroundStyle,
  DashboardPageThemeMode,
  DashboardWidget,
} from "../../../services/dashboardTypes";
import {
  DASHBOARD_PAGE_STORAGE_PERSIST_DEBOUNCE_MS,
  dashboardStateEqual,
  isDashboardPageShortcutEditableTarget,
  normalizeWidgets,
  type ActiveGesture,
} from "./dashboardBoardUtils";

type SaveDashboardPages = (
  pages: DashboardPage[],
  profileId: string | null,
) => void;

type SaveActiveDashboardPageId = (
  pageId: string,
  profileId: string | null,
) => void;

type SaveDashboardPreferences = (
  preferences: DashboardBoardPreferences,
  profileId: string | null,
) => void;

export interface UseDashboardPersistentStateOptions {
  activeProfileId: string | null;
  savedDashboardPages: DashboardPage[];
  savedActiveDashboardPageId: string;
  savedLayoutWidgets: DashboardWidget[];
  savedPreferences: DashboardBoardPreferences;
  globalThemeMode: DashboardPageThemeMode;
  globalAppBackgroundStyle: DashboardPageBackgroundStyle;
  globalAppBackgroundColor: string;
  activeGestureRef: React.MutableRefObject<ActiveGesture | null>;
  onPageSelected?: () => void;
  saveDashboardPages?: SaveDashboardPages;
  saveActiveDashboardPageId?: SaveActiveDashboardPageId;
  saveDashboardPreferences?: SaveDashboardPreferences;
}

export const useDashboardPersistentState = ({
  activeProfileId,
  savedDashboardPages,
  savedActiveDashboardPageId,
  savedLayoutWidgets,
  savedPreferences,
  globalThemeMode,
  globalAppBackgroundStyle,
  globalAppBackgroundColor,
  activeGestureRef,
  onPageSelected,
  saveDashboardPages = setProfileDashboardPages,
  saveActiveDashboardPageId = setProfileActiveDashboardPageId,
  saveDashboardPreferences = setProfileDashboardPreferences,
}: UseDashboardPersistentStateOptions) => {
  const [dashboardPages, setDashboardPages] =
    useState<DashboardPage[]>(savedDashboardPages);
  const [activeDashboardPageId, setActiveDashboardPageIdState] =
    useState(savedActiveDashboardPageId);
  const activeDashboardPage =
    dashboardPages.find((page) => page.id === activeDashboardPageId) ||
    dashboardPages[0] ||
    null;
  const activePageAppearance = activeDashboardPage?.appearance || {};
  const themeMode = activePageAppearance.themeMode || globalThemeMode;
  const isDark = themeMode === "dark";
  const appBackgroundStyle =
    activePageAppearance.backgroundStyle || globalAppBackgroundStyle;
  const appBackgroundColor =
    activePageAppearance.backgroundColor || globalAppBackgroundColor;
  const savedWidgets = activeDashboardPage?.widgets || savedLayoutWidgets;
  const [widgets, setWidgets] = useState<DashboardWidget[]>(savedWidgets);
  const [preferences, setPreferences] =
    useState<DashboardBoardPreferences>(savedPreferences);

  const widgetsRef = useRef(widgets);
  const dashboardPagesRef = useRef(dashboardPages);
  const activeDashboardPageIdRef = useRef(activeDashboardPageId);
  const pendingDashboardPagesPersistRef = useRef<{
    pages: DashboardPage[];
    profileId: string | null;
  } | null>(null);
  const pendingDashboardPagesPersistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  useEffect(() => {
    dashboardPagesRef.current = dashboardPages;
  }, [dashboardPages]);

  useEffect(() => {
    activeDashboardPageIdRef.current = activeDashboardPageId;
  }, [activeDashboardPageId]);

  useEffect(() => {
    if (!activeGestureRef.current) {
      setDashboardPages((current) =>
        dashboardStateEqual(current, savedDashboardPages)
          ? current
          : savedDashboardPages,
      );
    }
  }, [activeGestureRef, savedDashboardPages]);

  useEffect(() => {
    if (!activeGestureRef.current) {
      setActiveDashboardPageIdState((current) =>
        current === savedActiveDashboardPageId
          ? current
          : savedActiveDashboardPageId,
      );
    }
  }, [activeGestureRef, savedActiveDashboardPageId]);

  useEffect(() => {
    if (!activeGestureRef.current) {
      setWidgets((current) =>
        dashboardStateEqual(normalizeWidgets(current), normalizeWidgets(savedWidgets))
          ? current
          : savedWidgets,
      );
    }
  }, [activeGestureRef, savedWidgets]);

  useEffect(() => {
    if (!activeGestureRef.current) {
      setPreferences((current) =>
        dashboardStateEqual(current, savedPreferences) ? current : savedPreferences,
      );
    }
  }, [activeGestureRef, savedPreferences]);

  const persistDashboardPages = useCallback(
    (nextPages: DashboardPage[]) => {
      if (pendingDashboardPagesPersistTimerRef.current !== null) {
        window.clearTimeout(pendingDashboardPagesPersistTimerRef.current);
        pendingDashboardPagesPersistTimerRef.current = null;
      }
      pendingDashboardPagesPersistRef.current = null;
      dashboardPagesRef.current = nextPages;
      setDashboardPages(nextPages);
      saveDashboardPages(nextPages, activeProfileId);
    },
    [activeProfileId, saveDashboardPages],
  );

  const scheduleDashboardPagesStoragePersist = useCallback(
    (nextPages: DashboardPage[]) => {
      pendingDashboardPagesPersistRef.current = {
        pages: nextPages,
        profileId: activeProfileId,
      };
      if (pendingDashboardPagesPersistTimerRef.current !== null) {
        window.clearTimeout(pendingDashboardPagesPersistTimerRef.current);
      }
      pendingDashboardPagesPersistTimerRef.current = window.setTimeout(() => {
        pendingDashboardPagesPersistTimerRef.current = null;
        const pending = pendingDashboardPagesPersistRef.current;
        pendingDashboardPagesPersistRef.current = null;
        if (!pending) return;
        saveDashboardPages(pending.pages, pending.profileId);
      }, DASHBOARD_PAGE_STORAGE_PERSIST_DEBOUNCE_MS);
    },
    [activeProfileId, saveDashboardPages],
  );

  const flushDashboardPagesStoragePersist = useCallback(() => {
    if (pendingDashboardPagesPersistTimerRef.current !== null) {
      window.clearTimeout(pendingDashboardPagesPersistTimerRef.current);
      pendingDashboardPagesPersistTimerRef.current = null;
    }
    const pending = pendingDashboardPagesPersistRef.current;
    pendingDashboardPagesPersistRef.current = null;
    if (!pending) return;
    saveDashboardPages(pending.pages, pending.profileId);
  }, [saveDashboardPages]);

  useEffect(
    () => () => {
      flushDashboardPagesStoragePersist();
    },
    [flushDashboardPagesStoragePersist],
  );

  const persistActivePageAppearance = useCallback(
    (patch: DashboardPageAppearance) => {
      const activePageId = activeDashboardPageIdRef.current;
      const pages = dashboardPagesRef.current.length > 0
        ? dashboardPagesRef.current
        : savedDashboardPages;
      const now = Date.now();
      const nextPages = pages.map((page, index) =>
        page.id === activePageId || (!activePageId && index === 0)
          ? {
              ...page,
              appearance: {
                ...(page.appearance || {}),
                ...patch,
              },
              updatedAt: now,
            }
          : page,
      );
      dashboardPagesRef.current = nextPages;
      setDashboardPages(nextPages);
      scheduleDashboardPagesStoragePersist(nextPages);
    },
    [savedDashboardPages, scheduleDashboardPagesStoragePersist],
  );

  const resetActivePageAppearance = useCallback(() => {
    const activePageId = activeDashboardPageIdRef.current;
    const pages = dashboardPagesRef.current.length > 0
      ? dashboardPagesRef.current
      : savedDashboardPages;
    const now = Date.now();
    const nextPages = pages.map((page, index) =>
      page.id === activePageId || (!activePageId && index === 0)
        ? {
            ...page,
            appearance: {},
            updatedAt: now,
          }
        : page,
    );
    dashboardPagesRef.current = nextPages;
    setDashboardPages(nextPages);
    scheduleDashboardPagesStoragePersist(nextPages);
  }, [savedDashboardPages, scheduleDashboardPagesStoragePersist]);

  const getActivePageAppearanceSnapshot = useCallback(
    (): DashboardPageAppearance => {
      const activePageId = activeDashboardPageIdRef.current;
      const page =
        dashboardPagesRef.current.find((item) => item.id === activePageId) ||
        dashboardPagesRef.current[0];
      return {
        themeMode: page?.appearance?.themeMode || globalThemeMode,
        accentPreset: page?.appearance?.accentPreset || preferences.accentPreset,
        backgroundStyle:
          page?.appearance?.backgroundStyle || globalAppBackgroundStyle,
        backgroundColor:
          page?.appearance?.backgroundColor || globalAppBackgroundColor,
        glassEffectEnabled:
          page?.appearance?.glassEffectEnabled ?? preferences.glassEffectEnabled,
      };
    },
    [
      globalAppBackgroundColor,
      globalAppBackgroundStyle,
      globalThemeMode,
      preferences.accentPreset,
      preferences.glassEffectEnabled,
    ],
  );

  const persistWidgets = useCallback(
    (nextWidgets: DashboardWidget[]) => {
      const normalized = normalizeWidgets(nextWidgets);
      if (dashboardStateEqual(normalizeWidgets(widgetsRef.current), normalized)) {
        return;
      }
      widgetsRef.current = normalized;
      setWidgets(normalized);
      const activePageId = activeDashboardPageIdRef.current;
      const pages = dashboardPagesRef.current.length > 0
        ? dashboardPagesRef.current
        : savedDashboardPages;
      const now = Date.now();
      const nextPages = pages.map((page, index) =>
        page.id === activePageId || (!activePageId && index === 0)
          ? {
              ...page,
              widgets: normalized,
              updatedAt: now,
            }
          : page,
      );
      dashboardPagesRef.current = nextPages;
      setDashboardPages(nextPages);
      scheduleDashboardPagesStoragePersist(nextPages);
    },
    [savedDashboardPages, scheduleDashboardPagesStoragePersist],
  );

  const persistPreferences = useCallback(
    (nextPreferences: DashboardBoardPreferences) => {
      setPreferences(nextPreferences);
      saveDashboardPreferences(nextPreferences, activeProfileId);
    },
    [activeProfileId, saveDashboardPreferences],
  );

  const selectDashboardPage = useCallback(
    (pageId: string) => {
      const page =
        dashboardPagesRef.current.find((item) => item.id === pageId) ||
        dashboardPagesRef.current[0];
      if (!page) return;
      const nextWidgets = normalizeWidgets(page.widgets);
      activeDashboardPageIdRef.current = page.id;
      widgetsRef.current = nextWidgets;
      setActiveDashboardPageIdState(page.id);
      setWidgets(nextWidgets);
      onPageSelected?.();
      saveActiveDashboardPageId(page.id, activeProfileId);
    },
    [activeProfileId, onPageSelected, saveActiveDashboardPageId],
  );

  useEffect(() => {
    if (
      preferences.pageKeyboardShortcutsEnabled === false ||
      dashboardPages.length < 2
    ) {
      return;
    }

    const handlePageShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing
      ) {
        return;
      }

      const direction =
        event.key === "]" || event.code === "BracketRight"
          ? 1
          : event.key === "[" || event.code === "BracketLeft"
            ? -1
            : 0;
      if (direction === 0) return;

      const activeElement =
        typeof document === "undefined" ? null : document.activeElement;
      if (
        isDashboardPageShortcutEditableTarget(event.target) ||
        isDashboardPageShortcutEditableTarget(activeElement)
      ) {
        return;
      }

      const pages = dashboardPagesRef.current;
      if (pages.length < 2) return;
      const activePageId = activeDashboardPageIdRef.current;
      const activeIndex = Math.max(
        0,
        pages.findIndex((page) => page.id === activePageId),
      );
      const nextPage = pages[(activeIndex + direction + pages.length) % pages.length];
      if (!nextPage || nextPage.id === activePageId) return;

      event.preventDefault();
      selectDashboardPage(nextPage.id);
    };

    window.addEventListener("keydown", handlePageShortcut);
    return () => window.removeEventListener("keydown", handlePageShortcut);
  }, [
    dashboardPages.length,
    preferences.pageKeyboardShortcutsEnabled,
    selectDashboardPage,
  ]);

  const renameDashboardPage = useCallback(
    (pageId: string, name: string) => {
      const nextName = name.trim() || "Dashboard";
      const nextPages = dashboardPagesRef.current.map((page) =>
        page.id === pageId
          ? { ...page, name: nextName.slice(0, 40), updatedAt: Date.now() }
          : page,
      );
      persistDashboardPages(nextPages);
    },
    [persistDashboardPages],
  );

  const moveDashboardPage = useCallback(
    (pageId: string, direction: -1 | 1) => {
      const pages = dashboardPagesRef.current.slice();
      const index = pages.findIndex((page) => page.id === pageId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= pages.length) return;
      const [page] = pages.splice(index, 1);
      pages.splice(targetIndex, 0, page);
      persistDashboardPages(pages);
    },
    [persistDashboardPages],
  );

  const addDashboardPage = useCallback(() => {
    const pages = dashboardPagesRef.current;
    if (pages.length >= 12) return;
    const now = Date.now();
    const pageNumber = pages.length + 1;
    const name = `Page ${pageNumber}`;
    const emptyWidgets: DashboardWidget[] = [];
    const newPage: DashboardPage = {
      id: `dashboard-page-${now}`,
      name,
      appearance: getActivePageAppearanceSnapshot(),
      widgets: emptyWidgets,
      createdAt: now,
      updatedAt: now,
    };
    const nextPages = [...pages, newPage];
    persistDashboardPages(nextPages);
    activeDashboardPageIdRef.current = newPage.id;
    setActiveDashboardPageIdState(newPage.id);
    widgetsRef.current = emptyWidgets;
    setWidgets(emptyWidgets);
    saveActiveDashboardPageId(newPage.id, activeProfileId);
  }, [
    activeProfileId,
    getActivePageAppearanceSnapshot,
    persistDashboardPages,
    saveActiveDashboardPageId,
  ]);

  const deleteDashboardPage = useCallback(
    (pageId: string) => {
      const pages = dashboardPagesRef.current;
      if (pages.length <= 1) return;
      const nextPages = pages.filter((page) => page.id !== pageId);
      const currentActiveId = activeDashboardPageIdRef.current;
      const nextActivePage =
        currentActiveId === pageId
          ? nextPages[Math.max(0, pages.findIndex((page) => page.id === pageId) - 1)] ||
            nextPages[0]
          : nextPages.find((page) => page.id === currentActiveId) ||
            nextPages[0];
      persistDashboardPages(nextPages);
      if (nextActivePage) {
        const nextWidgets = normalizeWidgets(nextActivePage.widgets);
        activeDashboardPageIdRef.current = nextActivePage.id;
        widgetsRef.current = nextWidgets;
        setActiveDashboardPageIdState(nextActivePage.id);
        setWidgets(nextWidgets);
        saveActiveDashboardPageId(nextActivePage.id, activeProfileId);
      }
    },
    [activeProfileId, persistDashboardPages, saveActiveDashboardPageId],
  );

  return {
    dashboardPages,
    activeDashboardPageId,
    activeDashboardPage,
    activePageAppearance,
    themeMode,
    isDark,
    appBackgroundStyle,
    appBackgroundColor,
    widgets,
    preferences,
    widgetsRef,
    dashboardPagesRef,
    activeDashboardPageIdRef,
    persistDashboardPages,
    scheduleDashboardPagesStoragePersist,
    flushDashboardPagesStoragePersist,
    persistActivePageAppearance,
    resetActivePageAppearance,
    getActivePageAppearanceSnapshot,
    persistWidgets,
    persistPreferences,
    selectDashboardPage,
    renameDashboardPage,
    moveDashboardPage,
    addDashboardPage,
    deleteDashboardPage,
  };
};
