import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "../../../services/dashboardTypes";
import { fetchNoApiKeyCandidates } from "../../../services/musicSearchService";
import { resolveYouTubeApiKey } from "../../../services/youtubeApi";
import YouTubeWidget from "./YouTubeWidget";

const widgetSizeMock = vi.hoisted(() => ({
  current: {
    w: 4,
    h: 4,
    area: 16,
    sizeClass: "large",
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 560,
    pixelHeight: 420,
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

vi.mock("../../../services/youtubeApi", () => ({
  resolveYouTubeApiKey: vi.fn(),
}));

vi.mock("../../../services/musicSearchService", () => ({
  fetchNoApiKeyCandidates: vi.fn(),
}));

const widget: DashboardWidget = {
  id: "youtube_test",
  type: "youtube_video",
  position: 0,
  size: "medium",
  enabled: true,
  config: {
    w: 4,
    h: 4,
    maxItems: 6,
  },
};

describe("YouTubeWidget", () => {
  beforeEach(() => {
    vi.mocked(resolveYouTubeApiKey).mockResolvedValue({
      key: "test-key",
      source: "custom",
    });
    vi.mocked(fetchNoApiKeyCandidates).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: "curio-video" },
              snippet: {
                title: "Curio test video",
                channelTitle: "Curio Channel",
                thumbnails: {
                  high: { url: "https://example.test/thumb.jpg" },
                },
              },
            },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps click-to-play autoplay on the active iframe after load", async () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <YouTubeWidget
        widget={widget}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search YouTube videos"), {
      target: { value: "curio" },
    });
    fireEvent.submit(
      screen.getByPlaceholderText("Search YouTube videos").closest("form")!,
    );

    const result = await screen.findByRole("button", {
      name: /Curio test video/i,
    });
    fireEvent.click(result);

    const iframe = await screen.findByTitle("Curio test video");
    expect(iframe).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    expect(iframe.closest('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(iframe.parentElement).toHaveClass("absolute", "inset-0");
    expect(iframe).toHaveClass("h-full", "w-full");

    fireEvent.load(iframe);

    await waitFor(() => {
      expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
        "youtube_test",
        expect.objectContaining({ youtubeAutoplay: false }),
      );
    });
    expect(screen.getByTitle("Curio test video")).toHaveAttribute(
      "src",
      expect.stringContaining("autoplay=1"),
    );
  });

  it("uses a chrome-free iframe with only Curio playback controls", () => {
    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: false,
          },
        }}
      />,
    );

    const iframe = screen.getByTitle("Curio test video");
    expect(iframe).toHaveAttribute("src", expect.stringContaining("controls=0"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("fs=0"));
    expect(iframe).not.toHaveAttribute("allow", expect.stringContaining("web-share"));

    const controls = screen.getByTestId("youtube-playback-controls");
    expect(controls).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: /play video/i })).toBeInTheDocument();
    expect(within(controls).getByRole("slider", { name: /seek video/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/video time/i)).toBeInTheDocument();
    expect(screen.queryByText("YOUTUBE")).not.toBeInTheDocument();
  });

  it("auto-hides playback and expand controls after idle until the surface is touched again", () => {
    vi.useFakeTimers();

    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: false,
          },
        }}
      />,
    );

    const iframe = screen.getByTitle("Curio test video");
    const surface = screen.getByTestId("youtube-player-surface");
    const controls = screen.getByTestId("youtube-playback-controls");
    const expandButton = screen.getByRole("button", {
      name: /expand video widget/i,
    });

    expect(controls).toHaveAttribute("data-visible", "false");
    fireEvent.load(iframe);
    expect(controls).toHaveAttribute("data-visible", "true");
    expect(expandButton).toHaveAttribute("data-visible", "true");

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(controls).toHaveAttribute("data-visible", "false");
    expect(expandButton).toHaveAttribute("data-visible", "false");

    fireEvent.pointerDown(surface);
    expect(controls).toHaveAttribute("data-visible", "true");
    expect(expandButton).toHaveAttribute("data-visible", "true");
  });

  it("provides a centered play target that starts the chrome-free player", () => {
    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: false,
          },
        }}
      />,
    );

    const centeredPlay = screen.getByRole("button", {
      name: /play video from center/i,
    });
    fireEvent.click(centeredPlay);

    expect(screen.queryByRole("button", {
      name: /play video from center/i,
    })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("youtube-playback-controls")).getByRole("button", {
      name: /pause video/i,
    })).toBeInTheDocument();
  });

  it("lets the centered playback target pause the running player", () => {
    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: false,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: /play video from center/i,
    }));

    const centeredPause = screen.getByRole("button", {
      name: /pause video from center/i,
    });
    fireEvent.click(centeredPause);

    expect(screen.getByRole("button", {
      name: /play video from center/i,
    })).toBeInTheDocument();
    expect(within(screen.getByTestId("youtube-playback-controls")).getByRole("button", {
      name: /play video/i,
    })).toBeInTheDocument();
  });

  it("ignores player telemetry from other YouTube iframes", () => {
    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: false,
          },
        }}
      />,
    );

    const iframe = screen.getByTitle("Curio test video") as HTMLIFrameElement;
    const rogueFrame = document.createElement("iframe");
    document.body.appendChild(rogueFrame);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://www.youtube.com",
        source: rogueFrame.contentWindow,
        data: JSON.stringify({
          event: "infoDelivery",
          info: {
            duration: 120,
            currentTime: 42,
            playerState: 1,
          },
        }),
      }));
    });

    expect(screen.getByLabelText(/video time/i)).toHaveTextContent("0:00 / --:--");

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://www.youtube.com",
        source: iframe.contentWindow,
        data: JSON.stringify({
          event: "infoDelivery",
          info: {
            duration: 120,
            currentTime: 10,
            playerState: 1,
          },
        }),
      }));
    });

    expect(screen.getByLabelText(/video time/i)).toHaveTextContent("0:10 / 2:00");
    rogueFrame.remove();
  });

  it("hands autoplay and the current timestamp to the expanded video player", () => {
    const focusListener = vi.fn();
    window.addEventListener("curio-focus-widget", focusListener);
    const onUpdateWidgetConfig = vi.fn();

    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: false,
          },
        }}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    const iframe = screen.getByTitle("Curio test video") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://www.youtube.com",
        source: iframe.contentWindow,
        data: JSON.stringify({
          event: "infoDelivery",
          info: {
            duration: 120,
            currentTime: 83.4,
            playerState: 1,
          },
        }),
      }));
    });

    const surface = screen.getByTestId("youtube-player-surface");
    const expandButton = screen.getByRole("button", {
      name: /expand video widget/i,
    });

    expect(expandButton).toHaveAttribute("data-visible", "false");
    fireEvent.pointerDown(surface);
    expect(expandButton).toHaveAttribute("data-visible", "true");

    fireEvent.click(expandButton);
    expect(focusListener).toHaveBeenCalledTimes(1);
    expect((focusListener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      widgetId: "youtube_test",
    });
    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      "youtube_test",
      expect.objectContaining({
        youtubeAutoplay: true,
        youtubeStartSeconds: 83,
      }),
    );

    window.removeEventListener("curio-focus-widget", focusListener);
  });

  it("uses the requested start timestamp when mounted as an autoplaying player", () => {
    render(
      <YouTubeWidget
        widget={{
          ...widget,
          config: {
            ...widget.config,
            youtubeVideoId: "curio-video",
            youtubeTitle: "Curio test video",
            youtubeAutoplay: true,
            youtubeStartSeconds: 83,
          },
        }}
      />,
    );

    const iframe = screen.getByTitle("Curio test video");
    expect(iframe).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("start=83"));
  });

  it("uses the YouTube logo in the empty player state", () => {
    const { container } = render(<YouTubeWidget widget={widget} />);

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(
      screen.getByText("Ready to play. Search for a video to get started."),
    ).toBeInTheDocument();
    expect(container.querySelector('svg rect[fill="#FF0000"]')).toBeInTheDocument();
  });
});
