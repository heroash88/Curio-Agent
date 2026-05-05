import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCurioBackupFile,
  getCurioBackupSummary,
  previewCurioBackupFile,
  restoreCurioBackupPayload,
  validateCurioBackupPassword,
  type CurioBackupAssetAdapter,
  type CurioBackupAssetsV1,
} from "./curioBackupService";

const createAssets = (): CurioBackupAssetsV1 => ({
  dashboardGalleryImages: [
    {
      id: "gallery_one",
      name: "dashboard.png",
      mimeType: "image/png",
      dataBase64: "Z2FsbGVyeQ==",
      addedAt: 10,
    },
  ],
  offlineImages: [
    {
      id: "offline_one",
      name: "screensaver.jpg",
      mimeType: "image/jpeg",
      dataBase64: "b2ZmbGluZQ==",
      addedAt: 11,
    },
  ],
  customWakeWords: [
    {
      id: "custom-hello",
      label: "Hello Curio",
      phrase: "hello curio",
      threshold: 0.55,
      filename: "hello.onnx",
      dataBase64: "d2FrZQ==",
    },
  ],
  voiceProfiles: [
    {
      id: "voice_one",
      name: "Test Voice",
      embedding: [1, 2, 3],
      embeddingVersion: 2,
      createdAt: 12,
      updatedAt: 13,
      source: "upload",
      sampleRate: 22050,
      durationMs: 1200,
    },
  ],
});

const emptyAssetsForTest = (): CurioBackupAssetsV1 => ({
  dashboardGalleryImages: [],
  offlineImages: [],
  customWakeWords: [],
  voiceProfiles: [],
});

const createAssetAdapter = (assets: CurioBackupAssetsV1 = createAssets()) => {
  const restored: CurioBackupAssetsV1[] = [];
  const adapter: CurioBackupAssetAdapter = {
    exportAssets: vi.fn(async () => structuredClone(assets)),
    restoreAssets: vi.fn(async (nextAssets) => {
      restored.push(structuredClone(nextAssets));
    }),
  };
  return { adapter, restored };
};

describe("curioBackupService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("requires at least six digits for backup passwords", () => {
    expect(validateCurioBackupPassword("12345")).toMatchObject({
      valid: false,
    });
    expect(validateCurioBackupPassword("backup-12345")).toMatchObject({
      valid: false,
    });
    expect(validateCurioBackupPassword("123456")).toMatchObject({
      valid: true,
    });
    expect(validateCurioBackupPassword("backup-123456")).toMatchObject({
      valid: true,
    });
  });

  it("exports encrypted Curio settings, decrypted secrets, and user assets while excluding caches", async () => {
    localStorage.setItem("curio_dashboard_pages", JSON.stringify([{ id: "page_one", widgets: [] }]));
    localStorage.setItem("curio_dashboard_active_page", "page_one");
    localStorage.setItem("etheros_bookmarks", JSON.stringify([{ title: "Docs" }]));
    localStorage.setItem("curio:quotes:zenquotes-cache:v1", "cached quote");
    localStorage.setItem("curio-weather-cache-v3", "cached weather");
    localStorage.setItem("unrelated_app_key", "leave me alone");
    localStorage.setItem("gemini_live_api_key", "enc::not-portable");
    localStorage.setItem("curio_openai_api_key:openai:gpt-4o", "enc::model-key");

    const secrets = new Map([
      ["gemini_live_api_key", "gemini-secret"],
      ["curio_openai_api_key:openai:gpt-4o", "openai-secret"],
    ]);
    const { adapter } = createAssetAdapter();

    const backupText = await createCurioBackupFile({
      password: "123456",
      appVersion: "test-version",
      assetAdapter: adapter,
      readSecret: async (key) => secrets.get(key) || "",
      now: () => 1700000000000,
    });

    expect(backupText).not.toContain("gemini-secret");
    expect(backupText).not.toContain("cached quote");
    expect(backupText).not.toContain("dashboard.png");

    const preview = await previewCurioBackupFile(backupText, "123456");

    expect(preview.payload.appVersion).toBe("test-version");
    expect(preview.payload.storage).toEqual({
      curio_dashboard_active_page: "page_one",
      curio_dashboard_pages: JSON.stringify([{ id: "page_one", widgets: [] }]),
      etheros_bookmarks: JSON.stringify([{ title: "Docs" }]),
    });
    expect(preview.payload.secrets).toEqual({
      gemini_live_api_key: "gemini-secret",
      "curio_openai_api_key:openai:gpt-4o": "openai-secret",
    });
    expect(preview.payload.assets).toEqual(createAssets());
    expect(preview.summary).toMatchObject({
      appVersion: "test-version",
      storageEntryCount: 3,
      secretCount: 2,
      dashboardPageCount: 1,
      dashboardWidgetCount: 0,
      assetCount: 4,
    });
  });

  it("includes dashboard AI chat conversations and active thread state", async () => {
    const conversations = [
      {
        id: "conversation_one",
        title: "Kitchen planning",
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        messages: [
          {
            id: "msg_one",
            role: "user",
            content: "Save this chat",
            createdAt: 1700000000000,
            attachments: [
              {
                id: "att_one",
                kind: "image",
                name: "sketch.png",
                mimeType: "image/png",
                size: 128,
                dataUrl: "data:image/png;base64,c2tldGNo",
              },
            ],
          },
        ],
      },
    ];
    const legacyMessages = conversations[0].messages;
    localStorage.setItem(
      "curio_ai_chat_widget_conversations:widget_chat",
      JSON.stringify(conversations),
    );
    localStorage.setItem("curio_ai_chat_widget_active:widget_chat", "conversation_one");
    localStorage.setItem("curio_ai_chat_widget:widget_chat", JSON.stringify(legacyMessages));

    const { adapter } = createAssetAdapter(emptyAssetsForTest());
    const backupText = await createCurioBackupFile({
      password: "123456",
      assetAdapter: adapter,
      readSecret: async () => "",
    });
    const preview = await previewCurioBackupFile(backupText, "123456");

    expect(preview.payload.storage).toMatchObject({
      "curio_ai_chat_widget_conversations:widget_chat": JSON.stringify(conversations),
      "curio_ai_chat_widget_active:widget_chat": "conversation_one",
      "curio_ai_chat_widget:widget_chat": JSON.stringify(legacyMessages),
    });
  });

  it("exports API keys and account tokens through encrypted backup payloads", async () => {
    const secretValues = {
      gemini_live_api_key: "gemini-live-secret",
      gemini_text_api_key: "gemini-text-secret",
      curio_youtube_api_key: "youtube-secret",
      curio_google_api_key: "google-api-secret",
      curio_ha_mcp_token: "ha-access-secret",
      curio_ha_mcp_refresh_token: "ha-refresh-secret",
      curio_nova_api_key: "nova-secret",
      curio_openai_api_key: "openai-legacy-secret",
      curio_llm_api_key: "custom-llm-secret",
      curio_tts_remote_api_key: "remote-tts-secret",
      "curio_generic_mcp_auth_token:work-slack": "work-slack-secret",
      "curio_generic_mcp_oauth_token:notion-workspace": JSON.stringify({
        accessToken: "notion-access",
        refreshToken: "notion-refresh",
        expiresAt: 1700003600000,
      }),
      "curio_generic_mcp_oauth_client:notion-workspace": JSON.stringify({
        clientId: "notion-client-id",
      }),
      curio_spotify_token: JSON.stringify({
        accessToken: "spotify-access",
        refreshToken: "spotify-refresh",
        expiresAt: 1700000000000,
      }),
      "curio_openai_api_key:openrouter:qwen3": "openrouter-secret",
    };
    const plainAccountEntries = {
      curio_google_client_id: "google-client-id",
      curio_google_access_token: "google-access-token",
      curio_google_tasks_access_token: "google-tasks-token",
      curio_google_calendar_access_token: "google-calendar-token",
      curio_google_album_id: "google-album-id",
      curio_gmail_access_token: "gmail-token",
      curio_ha_mcp_url: "http://homeassistant.local:8123",
      curio_ha_mcp_enabled: "true",
      curio_ha_mcp_auth_mode: "oauth",
      curio_ha_mcp_token_expires_at: "1700003600000",
      curio_microsoft_client_id: "microsoft-client-id",
      curio_outlook_calendar_token: "outlook-calendar-token",
      curio_outlook_mail_token: "outlook-mail-token",
      curio_slack_client_id: "slack-client-id",
      curio_slack_token: "slack-token",
      curio_obsidian_url: "http://127.0.0.1:27123",
      curio_obsidian_api_key: "obsidian-token",
      curio_spotify_client_id: "spotify-client-id",
      curio_openai_base_url: "https://openrouter.ai/api/v1",
      curio_openai_model: "qwen3",
    };

    for (const key of Object.keys(secretValues)) {
      localStorage.setItem(key, `enc::${key}`);
    }
    for (const [key, value] of Object.entries(plainAccountEntries)) {
      localStorage.setItem(key, value);
    }
    localStorage.setItem("curio_oauth_result", "pending oauth result");
    localStorage.setItem("curio_spotify_auth_state", "pending spotify state");
    localStorage.setItem("curio_spotify_code_verifier", "pending spotify verifier");

    const { adapter } = createAssetAdapter(emptyAssetsForTest());
    const backupText = await createCurioBackupFile({
      password: "123456",
      assetAdapter: adapter,
      readSecret: async (key) => secretValues[key as keyof typeof secretValues] || "",
    });
    const preview = await previewCurioBackupFile(backupText, "123456");

    expect(backupText).not.toContain("gemini-text-secret");
    expect(backupText).not.toContain("spotify-refresh");
    expect(preview.payload.secrets).toEqual(secretValues);
    expect(preview.payload.storage).toMatchObject(plainAccountEntries);
    for (const key of Object.keys(secretValues)) {
      expect(preview.payload.storage).not.toHaveProperty(key);
    }
    expect(preview.payload.storage).not.toHaveProperty("curio_oauth_result");
    expect(preview.payload.storage).not.toHaveProperty("curio_spotify_auth_state");
    expect(preview.payload.storage).not.toHaveProperty("curio_spotify_code_verifier");
    expect(preview.summary.accountCategories).toEqual(expect.arrayContaining([
      "Google",
      "Home Assistant",
      "Microsoft",
      "Slack",
      "Spotify",
      "Obsidian",
      "Gemini",
      "Nova",
      "YouTube",
      "OpenAI-compatible",
    ]));
  });

  it("rejects wrong passwords before exposing a restore preview", async () => {
    localStorage.setItem("curio_dashboard_title", "Kitchen");

    const { adapter } = createAssetAdapter({
      dashboardGalleryImages: [],
      offlineImages: [],
      customWakeWords: [],
      voiceProfiles: [],
    });
    const backupText = await createCurioBackupFile({
      password: "123456",
      assetAdapter: adapter,
      readSecret: async () => "",
    });

    await expect(previewCurioBackupFile(backupText, "654321")).rejects.toThrow(
      /password/i,
    );
  });

  it("replaces Curio-owned local state, restores secrets through the secret writer, and leaves unrelated storage alone", async () => {
    localStorage.setItem("curio_dashboard_title", "Old title");
    localStorage.setItem("curio_dashboard_pages", JSON.stringify([{ id: "old", widgets: [] }]));
    localStorage.setItem("gemini_live_api_key", "enc::not-portable");
    localStorage.setItem("unrelated_app_key", "keep me");

    const { adapter } = createAssetAdapter({
      dashboardGalleryImages: [],
      offlineImages: [],
      customWakeWords: [],
      voiceProfiles: [],
    });
    const backupText = await createCurioBackupFile({
      password: "123456",
      assetAdapter: adapter,
      readSecret: async (key) => (key === "gemini_live_api_key" ? "gemini-secret" : ""),
    });
    const preview = await previewCurioBackupFile(backupText, "123456");

    localStorage.setItem("curio_dashboard_title", "Current title");
    localStorage.setItem("curio_stale_setting", "remove me");
    localStorage.setItem("unrelated_app_key", "keep me");

    const restoredSecrets = new Map<string, string>();
    const { adapter: restoreAdapter, restored } = createAssetAdapter();
    const runMigrations = vi.fn();

    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: restoreAdapter,
      writeSecret: async (key, value) => {
        restoredSecrets.set(key, value);
        localStorage.setItem(key, `enc::${value}`);
      },
      runMigrations,
    });

    expect(localStorage.getItem("curio_dashboard_title")).toBe("Old title");
    expect(localStorage.getItem("curio_stale_setting")).toBeNull();
    expect(localStorage.getItem("unrelated_app_key")).toBe("keep me");
    expect(restoredSecrets.get("gemini_live_api_key")).toBe("gemini-secret");
    expect(restored).toEqual([preview.payload.assets]);
    expect(runMigrations).toHaveBeenCalledTimes(1);
  });

  it("summarizes dashboard pages and account categories from a decrypted payload", () => {
    const summary = getCurioBackupSummary({
      schemaVersion: 1,
      createdAt: "2026-05-01T10:00:00.000Z",
      appVersion: "1.2.3",
      storage: {
        curio_dashboard_pages: JSON.stringify([
          { id: "home", widgets: [{ id: "weather" }, { id: "tasks" }] },
          { id: "work", widgets: [{ id: "calendar" }] },
        ]),
        curio_google_calendar_access_token: "google-token",
        curio_slack_token: "slack-token",
      },
      secrets: {
        curio_ha_mcp_token: "ha-token",
      },
      assets: createAssets(),
    });

    expect(summary).toMatchObject({
      createdAt: "2026-05-01T10:00:00.000Z",
      appVersion: "1.2.3",
      storageEntryCount: 3,
      secretCount: 1,
      dashboardPageCount: 2,
      dashboardWidgetCount: 3,
      assetCount: 4,
      accountCategories: ["Google", "Home Assistant", "Slack"],
    });
  });
});
