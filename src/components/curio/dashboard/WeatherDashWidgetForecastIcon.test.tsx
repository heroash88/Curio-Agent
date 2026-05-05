import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import type { AqiData, WeatherData } from "../../../services/weatherService";
import WeatherDashWidget from "./WeatherDashWidget";

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 6,
    h: 4,
    area: 24,
    sizeClass: "xlarge",
    isWide: true,
    isTall: false,
    isCompact: false,
    pixelWidth: 680,
    pixelHeight: 430,
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
  id: "weather_forecast_icons",
  type: "weather",
  position: 0,
  size: "large",
  enabled: true,
  config: { w: 6, h: 4 },
};

const weather: WeatherData = {
  city: "Sample City",
  tempF: 73,
  tempC: 23,
  icon: "cloud",
  desc: "Overcast",
  humidity: 48,
  windSpeedMph: 8,
  feelsLikeF: 73,
  feelsLikeC: 23,
  daily: [
    {
      date: "Today",
      highF: 73,
      lowF: 46,
      highC: 23,
      lowC: 8,
      icon: "cloud",
      condition: "Overcast",
    },
    {
      date: "Fri",
      highF: 73,
      lowF: 52,
      highC: 23,
      lowC: 11,
      icon: "cloud",
      condition: "Cloudy",
    },
    {
      date: "Sat",
      highF: 73,
      lowF: 52,
      highC: 23,
      lowC: 11,
      icon: "cloud",
      condition: "Cloudy",
    },
    {
      date: "Sun",
      highF: 79,
      lowF: 52,
      highC: 26,
      lowC: 11,
      icon: "cloud",
      condition: "Cloudy",
    },
    {
      date: "Mon",
      highF: 84,
      lowF: 54,
      highC: 29,
      lowC: 12,
      icon: "partlyCloudyDay",
      condition: "Partly Cloudy",
    },
  ],
};

describe("WeatherDashWidget forecast icons", () => {
  beforeEach(() => {
    widgetSizeMock.current = {
      w: 6,
      h: 4,
      area: 24,
      sizeClass: "xlarge",
      isWide: true,
      isTall: false,
      isCompact: false,
      pixelWidth: 680,
      pixelHeight: 430,
    };
  });

  it("uses compact forecast icons instead of the large animated weather model", () => {
    render(<WeatherDashWidget widget={widget} weather={weather} aqi={null} />);

    const forecastStrip = screen.getByTestId("weather-forecast-strip");

    expect(
      within(forecastStrip).getAllByTestId("weather-forecast-icon"),
    ).toHaveLength(5);
    expect(
      within(forecastStrip).queryByTestId("weather-motion-model"),
    ).not.toBeInTheDocument();
  });
});
