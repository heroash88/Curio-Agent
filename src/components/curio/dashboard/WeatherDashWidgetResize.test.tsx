import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import type { AqiData, WeatherData } from "../../../services/weatherService";
import WeatherDashWidget from "./WeatherDashWidget";

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 3,
    h: 4,
    area: 12,
    sizeClass: "large",
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 462,
    pixelHeight: 422,
  },
}));

vi.mock("../../../hooks/useCardTheme", () => ({
  useCardTheme: () => ({
    dark: true,
    headline: "font-headline",
    onSurface: "text-white",
    onSurfaceVariant: "text-white/60",
    muted: "text-white/40",
    text2: "text-white/60",
  }),
}));

vi.mock("../../../hooks/useWidgetSize", () => ({
  useWidgetSize: () => widgetSizeMock.current,
}));

vi.mock("../../../hooks/useDashboardWeatherData", () => ({
  useDashboardWeatherData: ({
    fallbackWeather,
    fallbackAqi,
  }: {
    fallbackWeather: WeatherData | null;
    fallbackAqi: AqiData | null;
  }) => ({
    weather: fallbackWeather,
    aqi: fallbackAqi,
    loading: false,
  }),
}));

vi.mock("../../../utils/settingsStorage", () => ({
  useTempUnit: () => "F",
}));

const widget: DashboardWidget = {
  id: "weather_resize",
  type: "weather",
  position: 0,
  size: "large",
  enabled: true,
  config: { w: 3, h: 4 },
};

const weather: WeatherData = {
  city: "Sample City",
  tempF: 73,
  tempC: 23,
  icon: "partlyCloudyDay",
  desc: "Partly Cloudy",
  humidity: 48,
  windSpeedMph: 8,
  feelsLikeF: 73,
  feelsLikeC: 23,
  daily: [
    { date: "Today", highF: 73, lowF: 46, highC: 23, lowC: 8, icon: "cloud", condition: "Overcast" },
    { date: "Fri", highF: 73, lowF: 52, highC: 23, lowC: 11, icon: "cloud", condition: "Cloudy" },
    { date: "Sat", highF: 73, lowF: 52, highC: 23, lowC: 11, icon: "cloud", condition: "Cloudy" },
    { date: "Sun", highF: 79, lowF: 52, highC: 26, lowC: 11, icon: "cloud", condition: "Cloudy" },
  ],
};

describe("WeatherDashWidget resize layout", () => {
  beforeEach(() => {
    widgetSizeMock.current = {
      w: 3,
      h: 4,
      area: 12,
      sizeClass: "large",
      isWide: true,
      isTall: true,
      isCompact: false,
      pixelWidth: 462,
      pixelHeight: 422,
    };
  });

  it("anchors the primary weather icon in a stable 3x4 resize slot", () => {
    render(<WeatherDashWidget widget={widget} weather={weather} aqi={null} />);

    const surface = screen.getByTestId("weather-dashboard-card");
    expect(surface).toHaveClass("dashboard-weather-card-tall");

    const currentHero = screen.getByTestId("weather-current-hero");
    expect(currentHero).toHaveClass("weather-current-hero", "grid");

    const iconSlot = screen.getByTestId("weather-primary-icon-slot");
    expect(iconSlot).toHaveClass(
      "weather-primary-icon-slot",
      "justify-self-end",
      "self-start",
    );
    expect(within(iconSlot).getByTestId("weather-motion-model")).toHaveClass(
      "weather-motion-partly",
    );
    expect(
      screen.queryByText(/Precipitation next 60 min|Rain for the next 60 min/i),
    ).not.toBeInTheDocument();
  });

  it("keeps wider compact weather cards to a compact summary without clipped stats", () => {
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      sizeClass: "small",
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 350,
      pixelHeight: 210,
    };

    render(
      <WeatherDashWidget
        widget={{ ...widget, size: "small", config: { w: 2, h: 2 } }}
        weather={weather}
        aqi={null}
      />,
    );

    expect(screen.getByTestId("weather-dashboard-card")).toHaveClass(
      "dashboard-weather-card-cramped",
    );
    expect(screen.getByTestId("weather-primary-icon-slot")).toBeInTheDocument();
    expect(screen.getByText(/Today:/i)).toBeInTheDocument();
    expect(screen.queryByText(/Feels like/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Humidity/i)).toBeInTheDocument();
    expect(screen.getByText(/48%/i)).toBeInTheDocument();
    expect(screen.queryByText(/Wind/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("weather-forecast-strip")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Precipitation next 60 min|Rain for the next 60 min/i),
    ).not.toBeInTheDocument();
  });

  it("keeps true narrow 2x2 weather cards summary-only without forecast overlap", () => {
    widgetSizeMock.current = {
      w: 2,
      h: 2,
      area: 4,
      sizeClass: "small",
      isWide: false,
      isTall: false,
      isCompact: true,
      pixelWidth: 230,
      pixelHeight: 210,
    };

    render(
      <WeatherDashWidget
        widget={{ ...widget, size: "small", config: { w: 2, h: 2 } }}
        weather={weather}
        aqi={{ value: 18, category: "Good", color: "#22c55e" }}
      />,
    );

    expect(screen.getByTestId("weather-dashboard-card")).toHaveClass(
      "dashboard-weather-card-cramped",
    );
    const iconSlot = screen.getByTestId("weather-primary-icon-slot");
    expect(iconSlot).toHaveClass("h-16", "w-16");
    expect(within(iconSlot).getByTestId("weather-motion-model")).toHaveClass(
      "weather-motion-partly",
    );
    expect(screen.getByText(/Today:/i)).toBeInTheDocument();
    expect(screen.getByText(/Humidity/i)).toBeInTheDocument();
    expect(screen.getByText(/48%/i)).toBeInTheDocument();
    expect(screen.getByText(/AQI 18/i)).toBeInTheDocument();
    expect(screen.queryByTestId("weather-forecast-strip")).not.toBeInTheDocument();
    expect(screen.queryByText("Fri")).not.toBeInTheDocument();
    expect(screen.queryByText("Sat")).not.toBeInTheDocument();
    expect(screen.queryByText(/Feels like/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Wind/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Precipitation next 60 min|Rain for the next 60 min/i),
    ).not.toBeInTheDocument();
  });
});
