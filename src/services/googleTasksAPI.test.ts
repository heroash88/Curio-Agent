import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listGoogleTasks } from "./googleTasksAPI";

describe("googleTasksAPI", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("curio_google_tasks_access_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a completed-aware task list so widget refreshes can show current and finished tasks", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listGoogleTasks(100);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("maxResults=100");
    expect(url).toContain("showCompleted=true");
    expect(url).toContain("showHidden=true");
    expect(url).toContain("showDeleted=false");
  });
});
