import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { getSecret, SENSITIVE_KEYS, setSecret } from "../utils/secretStorage";
import { runSettingsMigrations } from "../utils/settingsMigrations";
import {
  listDashboardGalleryImages,
  replaceDashboardGalleryImages,
} from "./dashboardImageStore";
import {
  getOfflineImages,
  replaceOfflineImages,
} from "./offlineImageStore";
import {
  listCustomWakeWordEntries,
  replaceCustomWakeWords,
} from "./customWakeWordStore";
import {
  listVoiceProfiles,
  replaceVoiceProfiles,
} from "./voiceProfileStore";

const BACKUP_TYPE = "curio.encrypted-backup";
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_PAYLOAD_FILE = "payload.json";
const BACKUP_ITERATIONS = 250_000;
const BACKUP_SALT_BYTES = 16;
const BACKUP_IV_BYTES = 12;

export const CURIO_BACKUP_FILE_EXTENSION = ".curio-backup";
export const CURIO_BACKUP_MIME_TYPE = "application/vnd.curio.backup+json";

export interface CurioBackupPasswordValidation {
  valid: boolean;
  message?: string;
}

export interface CurioBackupBlobRecord {
  id: string;
  name: string;
  mimeType: string;
  dataBase64: string;
  addedAt: number;
}

export interface CurioBackupWakeWordRecord {
  id: string;
  label: string;
  phrase: string;
  threshold: number;
  filename: string;
  dataBase64: string;
}

export interface CurioBackupVoiceProfile {
  id: string;
  name: string;
  embedding: number[];
  embeddingVersion: number;
  createdAt: number;
  updatedAt: number;
  source: "recording" | "upload";
  sampleRate: number;
  durationMs: number;
}

export interface CurioBackupAssetsV1 {
  dashboardGalleryImages: CurioBackupBlobRecord[];
  offlineImages: CurioBackupBlobRecord[];
  customWakeWords: CurioBackupWakeWordRecord[];
  voiceProfiles: CurioBackupVoiceProfile[];
}

export interface CurioBackupPayloadV1 {
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  storage: Record<string, string>;
  secrets: Record<string, string>;
  assets: CurioBackupAssetsV1;
}

export interface CurioBackupEnvelopeV1 {
  type: typeof BACKUP_TYPE;
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  encryption: {
    algorithm: "AES-GCM";
    kdf: "PBKDF2-SHA-256";
    iterations: number;
    saltBase64: string;
    ivBase64: string;
  };
  ciphertextBase64: string;
}

export interface CurioBackupSummary {
  createdAt: string;
  appVersion: string;
  storageEntryCount: number;
  secretCount: number;
  dashboardPageCount: number;
  dashboardWidgetCount: number;
  assetCount: number;
  accountCategories: string[];
}

export interface CurioBackupPreview {
  envelope: CurioBackupEnvelopeV1;
  payload: CurioBackupPayloadV1;
  summary: CurioBackupSummary;
}

export interface CurioBackupAssetAdapter {
  exportAssets(): Promise<CurioBackupAssetsV1>;
  restoreAssets(assets: CurioBackupAssetsV1): Promise<void>;
}

export interface CreateCurioBackupFileOptions {
  password: string;
  appVersion?: string;
  storage?: Storage;
  assetAdapter?: CurioBackupAssetAdapter;
  readSecret?: (key: string) => Promise<string>;
  now?: () => number;
}

export interface RestoreCurioBackupPayloadOptions {
  storage?: Storage;
  assetAdapter?: CurioBackupAssetAdapter;
  writeSecret?: (key: string, value: string) => Promise<void>;
  runMigrations?: () => void;
}

const emptyAssets = (): CurioBackupAssetsV1 => ({
  dashboardGalleryImages: [],
  offlineImages: [],
  customWakeWords: [],
  voiceProfiles: [],
});

const getStorage = (storage?: Storage): Storage => {
  const resolved = storage || (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!resolved) {
    throw new Error("Curio backup requires local storage.");
  }
  return resolved;
};

const getCrypto = (): Crypto => {
  const resolved = globalThis.crypto;
  if (!resolved?.subtle || !resolved.getRandomValues) {
    throw new Error(
      "Encrypted backups require Web Crypto. Open Curio from localhost, HTTPS, Electron, or Home Assistant ingress.",
    );
  }
  return resolved;
};

export const validateCurioBackupPassword = (
  password: string,
): CurioBackupPasswordValidation => {
  const digitCount = (password.match(/\d/g) || []).length;
  if (digitCount < 6) {
    return {
      valid: false,
      message: "Enter a backup password with at least 6 digits.",
    };
  }
  return { valid: true };
};

const assertValidPassword = (password: string): void => {
  const validation = validateCurioBackupPassword(password);
  if (!validation.valid) {
    throw new Error(validation.message || "Backup password is invalid.");
  }
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (encoded: string): Uint8Array => {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const blobToBase64 = async (blob: Blob): Promise<string> =>
  bytesToBase64(new Uint8Array(await blob.arrayBuffer()));

const base64ToBlob = (encoded: string, mimeType: string): Blob =>
  new Blob([base64ToBytes(encoded)], { type: mimeType || "application/octet-stream" });

const base64ToArrayBuffer = (encoded: string): ArrayBuffer => {
  const bytes = base64ToBytes(encoded);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const deriveBackupKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> => {
  const subtle = getCrypto().subtle;
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptPayload = async (
  payload: CurioBackupPayloadV1,
  password: string,
): Promise<Pick<CurioBackupEnvelopeV1, "encryption" | "ciphertextBase64">> => {
  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(BACKUP_IV_BYTES));
  const key = await deriveBackupKey(password, salt, BACKUP_ITERATIONS);
  const payloadJsonBytes = new Uint8Array(strToU8(JSON.stringify(payload)));
  const zippedPayload = zipSync({
    [BACKUP_PAYLOAD_FILE]: [payloadJsonBytes, { level: 6 }],
  });
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    zippedPayload,
  );

  return {
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations: BACKUP_ITERATIONS,
      saltBase64: bytesToBase64(salt),
      ivBase64: bytesToBase64(iv),
    },
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

const decryptPayload = async (
  envelope: CurioBackupEnvelopeV1,
  password: string,
): Promise<CurioBackupPayloadV1> => {
  assertValidEnvelope(envelope);

  try {
    const key = await deriveBackupKey(
      password,
      base64ToBytes(envelope.encryption.saltBase64),
      envelope.encryption.iterations,
    );
    const plaintext = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.encryption.ivBase64) },
      key,
      base64ToBytes(envelope.ciphertextBase64),
    );
    const entries = unzipSync(new Uint8Array(plaintext));
    const payloadBytes = entries[BACKUP_PAYLOAD_FILE];
    if (!payloadBytes) {
      throw new Error("Backup payload is missing.");
    }
    return normalizePayload(JSON.parse(strFromU8(payloadBytes)));
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported Curio backup file.") {
      throw error;
    }
    throw new Error("Backup password is incorrect or the backup file is corrupt.");
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function assertValidEnvelope(envelope: unknown): asserts envelope is CurioBackupEnvelopeV1 {
  if (!isRecord(envelope) || envelope.type !== BACKUP_TYPE || envelope.schemaVersion !== 1) {
    throw new Error("Unsupported Curio backup file.");
  }
  if (
    !isRecord(envelope.encryption) ||
    envelope.encryption.algorithm !== "AES-GCM" ||
    envelope.encryption.kdf !== "PBKDF2-SHA-256" ||
    typeof envelope.encryption.iterations !== "number" ||
    typeof envelope.encryption.saltBase64 !== "string" ||
    typeof envelope.encryption.ivBase64 !== "string" ||
    typeof envelope.ciphertextBase64 !== "string"
  ) {
    throw new Error("Unsupported Curio backup file.");
  }
}

const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
};

const normalizePayload = (value: unknown): CurioBackupPayloadV1 => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported Curio backup payload.");
  }
  return {
    schemaVersion: 1,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    appVersion: typeof value.appVersion === "string" ? value.appVersion : "unknown",
    storage: normalizeStringRecord(value.storage),
    secrets: normalizeStringRecord(value.secrets),
    assets: normalizeAssets(value.assets),
  };
};

const normalizeAssets = (value: unknown): CurioBackupAssetsV1 => {
  if (!isRecord(value)) return emptyAssets();
  return {
    dashboardGalleryImages: Array.isArray(value.dashboardGalleryImages)
      ? value.dashboardGalleryImages.filter(isBackupBlobRecord)
      : [],
    offlineImages: Array.isArray(value.offlineImages)
      ? value.offlineImages.filter(isBackupBlobRecord)
      : [],
    customWakeWords: Array.isArray(value.customWakeWords)
      ? value.customWakeWords.filter(isBackupWakeWordRecord)
      : [],
    voiceProfiles: Array.isArray(value.voiceProfiles)
      ? value.voiceProfiles.filter(isBackupVoiceProfile)
      : [],
  };
};

const isBackupBlobRecord = (value: unknown): value is CurioBackupBlobRecord =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.mimeType === "string" &&
  typeof value.dataBase64 === "string" &&
  typeof value.addedAt === "number";

const isBackupWakeWordRecord = (value: unknown): value is CurioBackupWakeWordRecord =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.label === "string" &&
  typeof value.phrase === "string" &&
  typeof value.threshold === "number" &&
  typeof value.filename === "string" &&
  typeof value.dataBase64 === "string";

const isBackupVoiceProfile = (value: unknown): value is CurioBackupVoiceProfile =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  Array.isArray(value.embedding) &&
  typeof value.embeddingVersion === "number" &&
  typeof value.createdAt === "number" &&
  typeof value.updatedAt === "number" &&
  (value.source === "recording" || value.source === "upload") &&
  typeof value.sampleRate === "number" &&
  typeof value.durationMs === "number";

const CURIO_STORAGE_PREFIXES = [
  "curio_",
  "curio:",
  "curio-",
  "gemini_",
  "etheros_",
];

/**
 * Key prefixes explicitly covered by the backup sweep (all start with
 * `curio_` so they are captured by `isCurioOwnedStorageKey`):
 *
 * - `curio_dashboard_prefs*` — board preferences including InteractivitySettings
 * - `curio_dashboard_pages*` — page layouts and widget configs (linkedWidgetIds, pinnedItemIds, per-widget overrides)
 * - `curio_dashboard_presets*` — saved layout presets
 * - `curio_widget_sparkline_*` — sparkline history ring buffers
 * - `curio_widget_state_*` — per-widget persistent state (row display mode, collapse, etc.)
 * - `curio_dashboard_active_page*` — active page selection
 * - `curio_dashboard_layout*` — legacy layout compatibility
 */

const TRANSIENT_STORAGE_KEYS = new Set([
  "curio_oauth_result",
  "curio_spotify_auth_state",
  "curio_spotify_code_verifier",
  "curio_ha_oauth_state_pending",
  "curio_ha_oauth_verifier_pending",
  "curio_ha_auth_url_pending",
  "curio_ha_oauth_redirect_uri",
  "curio_pending_picker_session_id",
  "curio_picker_photo_urls",
  "curio_picker_urls_ts",
  "curio_picker_session_id",
  "curio_ha_ingress",
]);

const TRANSIENT_STORAGE_PREFIXES = [
  "curio-weather-cache",
  "curio:quotes:",
  "curio:fun-facts:",
  "curio_slack_cache_",
];

const isCurioOwnedStorageKey = (key: string): boolean =>
  CURIO_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));

const isTransientStorageKey = (key: string): boolean =>
  TRANSIENT_STORAGE_KEYS.has(key) ||
  TRANSIENT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));

const getStorageKeys = (storage: Storage): string[] => {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys.sort();
};

const getSecretKeys = (storage: Storage): Set<string> => {
  const keys = new Set<string>([
    ...SENSITIVE_KEYS,
    "curio_ha_mcp_refresh_token",
  ]);
  for (const key of getStorageKeys(storage)) {
    if (
      key.startsWith("curio_openai_api_key:") ||
      key.startsWith("curio_tts_remote_api_key:") ||
      key.startsWith("curio_tts_remote_secondary_key:") ||
      key.startsWith("curio_generic_mcp_auth_token:") ||
      key.startsWith("curio_generic_mcp_oauth_token:") ||
      key.startsWith("curio_generic_mcp_oauth_client:") ||
      key.startsWith("curio_generic_mcp_env:")
    ) {
      keys.add(key);
    }
  }
  return keys;
};

const collectStorageEntries = (
  storage: Storage,
  secretKeys: Set<string>,
): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (const key of getStorageKeys(storage)) {
    if (!isCurioOwnedStorageKey(key)) continue;
    if (isTransientStorageKey(key)) continue;
    if (secretKeys.has(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) {
      entries[key] = value;
    }
  }
  return entries;
};

const collectSecrets = async (
  storage: Storage,
  secretKeys: Set<string>,
  readSecret: (key: string) => Promise<string>,
): Promise<Record<string, string>> => {
  const secrets: Record<string, string> = {};
  for (const key of [...secretKeys].sort()) {
    if (storage.getItem(key) === null) continue;
    const value = await readSecret(key);
    if (value) {
      secrets[key] = value;
    }
  }
  return secrets;
};

export const createCurioBackupFile = async ({
  password,
  appVersion = "unknown",
  storage,
  assetAdapter = defaultCurioBackupAssetAdapter,
  readSecret = getSecret,
  now = Date.now,
}: CreateCurioBackupFileOptions): Promise<string> => {
  assertValidPassword(password);
  const resolvedStorage = getStorage(storage);
  const secretKeys = getSecretKeys(resolvedStorage);
  const createdAt = new Date(now()).toISOString();
  const payload: CurioBackupPayloadV1 = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    appVersion,
    storage: collectStorageEntries(resolvedStorage, secretKeys),
    secrets: await collectSecrets(resolvedStorage, secretKeys, readSecret),
    assets: await assetAdapter.exportAssets(),
  };
  const encrypted = await encryptPayload(payload, password);
  const envelope: CurioBackupEnvelopeV1 = {
    type: BACKUP_TYPE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    appVersion,
    ...encrypted,
  };

  return JSON.stringify(envelope, null, 2);
};

export const previewCurioBackupFile = async (
  fileText: string,
  password: string,
): Promise<CurioBackupPreview> => {
  assertValidPassword(password);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error("Unsupported Curio backup file.");
  }
  assertValidEnvelope(parsed);
  const payload = await decryptPayload(parsed, password);
  return {
    envelope: parsed,
    payload,
    summary: getCurioBackupSummary(payload),
  };
};

export const restoreCurioBackupPayload = async (
  payload: CurioBackupPayloadV1,
  {
    storage,
    assetAdapter = defaultCurioBackupAssetAdapter,
    writeSecret = setSecret,
    runMigrations = runSettingsMigrations,
  }: RestoreCurioBackupPayloadOptions = {},
): Promise<void> => {
  const normalizedPayload = normalizePayload(payload);
  const resolvedStorage = getStorage(storage);

  for (const key of getStorageKeys(resolvedStorage)) {
    if (isCurioOwnedStorageKey(key)) {
      resolvedStorage.removeItem(key);
    }
  }

  for (const [key, value] of Object.entries(normalizedPayload.storage)) {
    resolvedStorage.setItem(key, value);
  }

  for (const [key, value] of Object.entries(normalizedPayload.secrets)) {
    await writeSecret(key, value);
  }

  await assetAdapter.restoreAssets(normalizedPayload.assets);
  runMigrations();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("curio:settings-changed"));
  }
};

const parseDashboardCounts = (
  storage: Record<string, string>,
): { dashboardPageCount: number; dashboardWidgetCount: number } => {
  let dashboardPageCount = 0;
  let dashboardWidgetCount = 0;

  for (const [key, value] of Object.entries(storage)) {
    if (!key.startsWith("curio_dashboard_pages")) continue;
    try {
      const pages = JSON.parse(value);
      if (!Array.isArray(pages)) continue;
      dashboardPageCount += pages.length;
      dashboardWidgetCount += pages.reduce((count, page) => {
        if (!isRecord(page) || !Array.isArray(page.widgets)) return count;
        return count + page.widgets.length;
      }, 0);
    } catch {
      continue;
    }
  }

  return { dashboardPageCount, dashboardWidgetCount };
};

const ACCOUNT_CATEGORY_RULES: Array<[string, (key: string) => boolean]> = [
  ["Google", (key) => key.includes("google") || key.includes("gmail")],
  ["Home Assistant", (key) => key.includes("_ha_") || key.includes("ha_mcp")],
  ["Microsoft", (key) => key.includes("microsoft") || key.includes("outlook")],
  ["Slack", (key) => key.includes("slack")],
  ["Spotify", (key) => key.includes("spotify")],
  ["Obsidian", (key) => key.includes("obsidian")],
  ["Gemini", (key) => key.includes("gemini")],
  ["Nova", (key) => key.includes("nova")],
  ["YouTube", (key) => key.includes("youtube")],
  ["OpenAI-compatible", (key) => key.includes("openai") || key.includes("llm_api_key")],
];

const getAccountCategories = (payload: CurioBackupPayloadV1): string[] => {
  const keys = [
    ...Object.keys(payload.storage),
    ...Object.keys(payload.secrets),
  ].map((key) => key.toLowerCase());
  return ACCOUNT_CATEGORY_RULES
    .filter(([, matches]) => keys.some(matches))
    .map(([label]) => label);
};

export const getCurioBackupSummary = (
  payload: CurioBackupPayloadV1,
): CurioBackupSummary => {
  const normalizedPayload = normalizePayload(payload);
  const dashboardCounts = parseDashboardCounts(normalizedPayload.storage);
  const assets = normalizedPayload.assets;
  return {
    createdAt: normalizedPayload.createdAt,
    appVersion: normalizedPayload.appVersion,
    storageEntryCount: Object.keys(normalizedPayload.storage).length,
    secretCount: Object.keys(normalizedPayload.secrets).length,
    dashboardPageCount: dashboardCounts.dashboardPageCount,
    dashboardWidgetCount: dashboardCounts.dashboardWidgetCount,
    assetCount:
      assets.dashboardGalleryImages.length +
      assets.offlineImages.length +
      assets.customWakeWords.length +
      assets.voiceProfiles.length,
    accountCategories: getAccountCategories(normalizedPayload),
  };
};

export const defaultCurioBackupAssetAdapter: CurioBackupAssetAdapter = {
  async exportAssets() {
    const [dashboardGalleryImages, offlineImages, customWakeWords, voiceProfiles] =
      await Promise.all([
        listDashboardGalleryImages(),
        getOfflineImages(),
        listCustomWakeWordEntries(),
        listVoiceProfiles(),
      ]);

    return {
      dashboardGalleryImages: await Promise.all(
        dashboardGalleryImages.map(async (image) => ({
          id: image.id,
          name: image.name,
          mimeType: image.blob.type || "application/octet-stream",
          dataBase64: await blobToBase64(image.blob),
          addedAt: image.addedAt,
        })),
      ),
      offlineImages: await Promise.all(
        offlineImages.map(async (image) => ({
          id: image.id,
          name: image.name,
          mimeType: image.blob.type || "application/octet-stream",
          dataBase64: await blobToBase64(image.blob),
          addedAt: image.addedAt,
        })),
      ),
      customWakeWords: customWakeWords.map((wakeWord) => ({
        id: wakeWord.id,
        label: wakeWord.label,
        phrase: wakeWord.phrase,
        threshold: wakeWord.threshold,
        filename: wakeWord.filename,
        dataBase64: bytesToBase64(new Uint8Array(wakeWord.data)),
      })),
      voiceProfiles: voiceProfiles.map((profile) => ({
        ...profile,
        embedding: Array.from(profile.embedding),
      })),
    };
  },
  async restoreAssets(assets) {
    await Promise.all([
      replaceDashboardGalleryImages(
        assets.dashboardGalleryImages.map((image) => ({
          id: image.id,
          name: image.name,
          blob: base64ToBlob(image.dataBase64, image.mimeType),
          addedAt: image.addedAt,
        })),
      ),
      replaceOfflineImages(
        assets.offlineImages.map((image) => ({
          id: image.id,
          name: image.name,
          blob: base64ToBlob(image.dataBase64, image.mimeType),
          addedAt: image.addedAt,
        })),
      ),
      replaceCustomWakeWords(
        assets.customWakeWords.map((wakeWord) => ({
          id: wakeWord.id,
          label: wakeWord.label,
          phrase: wakeWord.phrase,
          threshold: wakeWord.threshold,
          filename: wakeWord.filename,
          data: base64ToArrayBuffer(wakeWord.dataBase64),
        })),
      ),
      replaceVoiceProfiles(assets.voiceProfiles),
    ]);
  },
};
