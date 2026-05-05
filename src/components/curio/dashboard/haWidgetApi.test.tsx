import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHaMcpTokenAsync: vi.fn(),
}));

vi.mock("../../../utils/settingsStorage", () => ({
  getHaMcpTokenAsync: (...args: unknown[]) => mocks.getHaMcpTokenAsync(...args),
}));

vi.mock("../../../services/haSmartHomeMock", () => ({
  HA_SMART_HOME_REVIEW_BASE_URL: "http://curio-ha-review.local:8123",
  HA_SMART_HOME_REVIEW_TOKEN: "curio-ha-review-token",
  getHaSmartHomeMockStates: () => [],
  installHaSmartHomeReviewFetchMock: vi.fn(),
  isHaSmartHomeReviewMode: () => false,
}));

describe("haWidgetApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getHaMcpTokenAsync.mockImplementation((options?: { forceRefresh?: boolean }) =>
      Promise.resolve(options?.forceRefresh ? "new-token" : "old-token"),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes the HA token and retries state loading after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          entity_id: "light.kitchen_lamp",
          state: "on",
          attributes: { friendly_name: "Kitchen Lamp" },
        },
      ]), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("light.kitchen_lamp|Kitchen\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { loadHaStatesCached } = await import("./haWidgetApi");
    const states = await loadHaStatesCached("http://ha.local:8123/api/mcp", { force: true });

    expect(states[0]).toMatchObject({
      entity_id: "light.kitchen_lamp",
      area: "Kitchen",
    });
    expect(mocks.getHaMcpTokenAsync).toHaveBeenCalledWith({ forceRefresh: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://ha.local:8123/api/states",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-token",
        }),
      }),
    );
  });

  it("refreshes the HA token and retries service calls after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { callHaService } = await import("./haWidgetApi");
    await callHaService("http://ha.local:8123/api/mcp", "light", "turn_on", {
      entity_id: "light.kitchen_lamp",
    });

    expect(mocks.getHaMcpTokenAsync).toHaveBeenCalledWith({ forceRefresh: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://ha.local:8123/api/services/light/turn_on",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer new-token",
        }),
      }),
    );
  });
});
