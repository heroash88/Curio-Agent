import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardPage,
} from "../../../services/dashboardTypes";
import BoardControlsPanel from "./BoardControlsPanel";

const page: DashboardPage = {
  id: "dashboard",
  name: "Dashboard",
  widgets: [],
  createdAt: 1,
  updatedAt: 1,
};

const renderPanel = () => {
  const props = {
    dashboardPages: [page],
    activeDashboardPageId: page.id,
    preferences: DEFAULT_DASHBOARD_PREFERENCES,
    pageSwitcherPreferenceEnabled: true,
    pageKeyboardShortcutsEnabled: true,
    widgetGlowEnabled: false,
    glassEffectIntensity: 50,
    isDark: true,
    effectiveMode: "grid" as const,
    glassEffectEnabled: true,
    activeAccentPreset: "cobalt" as const,
    appBackgroundStyle: "solid",
    appBackgroundColor: "#0a0a0a",
    editMode: false,
    onAddDashboardPage: vi.fn(),
    onSelectDashboardPage: vi.fn(),
    onRenameDashboardPage: vi.fn(),
    onMoveDashboardPage: vi.fn(),
    onDeleteDashboardPage: vi.fn(),
    onPersistPreferences: vi.fn(),
    onPersistActivePageAppearance: vi.fn(),
    onResetActivePageAppearance: vi.fn(),
    onModeToggle: vi.fn(),
    onToggleEditMode: vi.fn(),
    onOpenDashboardSearch: vi.fn(),
    onResetDashboardBoard: vi.fn(),
  };

  render(<BoardControlsPanel {...props} />);
  return props;
};

describe("BoardControlsPanel", () => {
  it("uses distinct icons for the board visual controls", () => {
    renderPanel();

    const iconFor = (label: string) => {
      const control = screen.getByText(label).closest("button,label");
      expect(control).not.toBeNull();
      const icon = control?.querySelector("svg.lucide");
      expect(icon).not.toBeNull();
      return icon;
    };

    expect(iconFor("Widget glow")).toHaveClass("lucide-sun-medium");
    expect(iconFor("AI Theme")).toHaveClass("lucide-wand-sparkles");
    expect(iconFor("Glass effect")).toHaveClass("lucide-gem");
    expect(iconFor("Glassy feel")).toHaveClass("lucide-sliders-horizontal");
  });

  it("lets the dashboard accent use any custom color and clears it when a preset is selected", () => {
    const props = renderPanel();

    fireEvent.input(screen.getByLabelText("Custom dashboard accent color"), {
      target: { value: "#ff2bd6" },
    });

    expect(props.onPersistActivePageAppearance).toHaveBeenCalledWith({
      accentColor: "#ff2bd6",
    });

    fireEvent.click(screen.getByRole("button", { name: /select neon accent/i }));

    expect(props.onPersistActivePageAppearance).toHaveBeenLastCalledWith({
      accentPreset: "neon",
      accentColor: undefined,
    });
  });
});
