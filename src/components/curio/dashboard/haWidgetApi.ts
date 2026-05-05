import { getHaMcpTokenAsync } from "../../../utils/settingsStorage";
import {
  getHaSmartHomeMockStates,
  HA_SMART_HOME_REVIEW_BASE_URL,
  HA_SMART_HOME_REVIEW_TOKEN,
  installHaSmartHomeReviewFetchMock,
  isHaSmartHomeReviewMode,
} from "../../../services/haSmartHomeMock";

export interface HaState {
  entity_id: string;
  state: string;
  area?: string;
  attributes?: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export interface HaCalendarEvent {
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

const HA_STATE_CACHE_MS = 5_000;
const HA_AREA_CACHE_MS = 60_000;

let stateCache:
  | {
      baseUrl: string;
      fetchedAt: number;
      states: HaState[];
      promise?: Promise<HaState[]>;
    }
  | null = null;

let areaCache:
  | {
      baseUrl: string;
      fetchedAt: number;
      areas: Map<string, string>;
      promise?: Promise<Map<string, string>>;
    }
  | null = null;

export const normalizeHaBaseUrl = (haUrl: string) =>
  haUrl.replace(/\/api\/mcp\/?$/, "").replace(/\/$/, "");

export const resolveHaImageUrl = (haUrl: string, imageUrl?: string | null) => {
  const trimmed = String(imageUrl || "").trim();
  if (!trimmed) return "";
  if (/^(blob:|data:|https?:\/\/)/i.test(trimmed)) return trimmed;

  const baseUrl = normalizeHaBaseUrl(haUrl);
  if (trimmed.startsWith("/")) {
    return `${baseUrl}${trimmed}`;
  }
  return `${baseUrl}/${trimmed.replace(/^\/+/, "")}`;
};

const getHaAuth = async (
  haUrl: string,
  options: { forceRefresh?: boolean } = {},
) => {
  if (isHaSmartHomeReviewMode()) {
    installHaSmartHomeReviewFetchMock();
    return {
      baseUrl: HA_SMART_HOME_REVIEW_BASE_URL,
      token: HA_SMART_HOME_REVIEW_TOKEN,
    };
  }
  const token = await getHaMcpTokenAsync(options);
  if (!token) {
    throw new Error("Missing Home Assistant token");
  }
  return { baseUrl: normalizeHaBaseUrl(haUrl), token };
};

const parseAreaTemplateResponse = (text: string) => {
  const areas = new Map<string, string>();
  text.split("\n").forEach((line) => {
    const separator = line.indexOf("|");
    if (separator <= 0) return;
    const entityId = line.slice(0, separator).trim().toLowerCase();
    const areaName = line.slice(separator + 1).trim();
    if (entityId && areaName) {
      areas.set(entityId, areaName);
    }
  });
  return areas;
};

const loadHaAreaMapCached = async (
  baseUrl: string,
  token: string,
  force = false,
) => {
  const now = Date.now();
  if (
    !force &&
    areaCache?.baseUrl === baseUrl &&
    now - areaCache.fetchedAt < HA_AREA_CACHE_MS
  ) {
    return areaCache.areas;
  }
  if (!force && areaCache?.baseUrl === baseUrl && areaCache.promise) {
    return areaCache.promise;
  }

  const template =
    "{% for s in states %}" +
    "{% set a = area_name(s.entity_id) %}" +
    "{% if a %}{{ s.entity_id }}|{{ a }}\n{% endif %}" +
    "{% endfor %}";

  const promise = fetch(`${baseUrl}/api/template`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/plain, application/json",
    },
    body: JSON.stringify({ template }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HA areas failed (${response.status})`);
    }
    const areas = parseAreaTemplateResponse(await response.text());
    areaCache = { baseUrl, fetchedAt: Date.now(), areas };
    return areas;
  });

  areaCache = {
    baseUrl,
    fetchedAt: areaCache?.baseUrl === baseUrl ? areaCache.fetchedAt : 0,
    areas: areaCache?.baseUrl === baseUrl ? areaCache.areas : new Map(),
    promise,
  };

  try {
    return await promise;
  } finally {
    if (areaCache?.promise === promise) {
      delete areaCache.promise;
    }
  }
};

const getStateAreaFallback = (state: HaState) => {
  const attrs = state.attributes || {};
  return String(
    state.area ||
      attrs.area ||
      attrs.area_name ||
      attrs.room ||
      attrs.room_name ||
      attrs.area_id ||
      "",
  ).trim();
};

const enrichStatesWithAreas = (states: HaState[], areas: Map<string, string>) =>
  states.map((state) => {
    const area = areas.get(String(state.entity_id).toLowerCase()) || getStateAreaFallback(state);
    return area ? { ...state, area } : state;
  });

export const loadHaStatesCached = async (
  haUrl: string,
  options: { force?: boolean } = {},
): Promise<HaState[]> => {
  if (isHaSmartHomeReviewMode()) {
    installHaSmartHomeReviewFetchMock();
    return getHaSmartHomeMockStates() as HaState[];
  }
  let { baseUrl, token } = await getHaAuth(haUrl);
  const now = Date.now();
  if (
    !options.force &&
    stateCache?.baseUrl === baseUrl &&
    now - stateCache.fetchedAt < HA_STATE_CACHE_MS
  ) {
    return stateCache.states;
  }

  if (!options.force && stateCache?.baseUrl === baseUrl && stateCache.promise) {
    return stateCache.promise;
  }

  const fetchStates = (activeToken: string) => fetch(`${baseUrl}/api/states`, {
    headers: {
      Authorization: `Bearer ${activeToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const promise = fetchStates(token).then(async (initialResponse) => {
    let response = initialResponse;
    if (response.status === 401) {
      const refreshed = await getHaAuth(haUrl, { forceRefresh: true });
      baseUrl = refreshed.baseUrl;
      token = refreshed.token;
      response = await fetchStates(token);
    }
    if (!response.ok) {
      throw new Error(`HA states failed (${response.status})`);
    }
    const rawStates = (await response.json()) as HaState[];
    let states = rawStates;
    try {
      const areas = await loadHaAreaMapCached(baseUrl, token, options.force === true);
      if (areas.size > 0) {
        states = enrichStatesWithAreas(rawStates, areas);
      } else {
        states = rawStates.map((state) => {
          const area = getStateAreaFallback(state);
          return area ? { ...state, area } : state;
        });
      }
    } catch (err) {
      console.warn("[haWidgetApi] Area enrichment failed", err);
      states = rawStates.map((state) => {
        const area = getStateAreaFallback(state);
        return area ? { ...state, area } : state;
      });
    }
    stateCache = { baseUrl, fetchedAt: Date.now(), states };
    return states;
  });

  stateCache = {
    baseUrl,
    fetchedAt: stateCache?.baseUrl === baseUrl ? stateCache.fetchedAt : 0,
    states: stateCache?.baseUrl === baseUrl ? stateCache.states : [],
    promise,
  };

  try {
    return await promise;
  } finally {
    if (stateCache?.promise === promise) {
      delete stateCache.promise;
    }
  }
};

export const callHaService = async (
  haUrl: string,
  domain: string,
  service: string,
  body: Record<string, unknown>,
) => {
  const postService = (baseUrl: string, token: string) => fetch(`${baseUrl}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  let { baseUrl, token } = await getHaAuth(haUrl);
  let response = await postService(baseUrl, token);
  if (response.status === 401) {
    const refreshed = await getHaAuth(haUrl, { forceRefresh: true });
    response = await postService(refreshed.baseUrl, refreshed.token);
  }
  if (!response.ok) {
    throw new Error(`HA service ${domain}.${service} failed (${response.status})`);
  }
  stateCache = null;
  return response;
};

export const loadHaImageObjectUrl = async (
  haUrl: string,
  imageUrl: string,
) => {
  const resolved = resolveHaImageUrl(haUrl, imageUrl);
  if (!resolved || /^(blob:|data:)/i.test(resolved)) return resolved;

  const loadImage = (token: string) => fetch(resolved, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  let { token } = await getHaAuth(haUrl);
  let response = await loadImage(token);
  if (response.status === 401) {
    const refreshed = await getHaAuth(haUrl, { forceRefresh: true });
    response = await loadImage(refreshed.token);
  }
  if (!response.ok) {
    throw new Error(`HA image failed (${response.status})`);
  }
  return URL.createObjectURL(await response.blob());
};

export const loadHaCameraSnapshotObjectUrl = async (
  haUrl: string,
  entityId: string,
) => {
  const loadSnapshot = (baseUrl: string, token: string) => fetch(`${baseUrl}/api/camera_proxy/${encodeURIComponent(entityId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  let { baseUrl, token } = await getHaAuth(haUrl);
  let response = await loadSnapshot(baseUrl, token);
  if (response.status === 401) {
    const refreshed = await getHaAuth(haUrl, { forceRefresh: true });
    response = await loadSnapshot(refreshed.baseUrl, refreshed.token);
  }
  if (!response.ok) {
    throw new Error(`HA camera snapshot failed (${response.status})`);
  }
  return URL.createObjectURL(await response.blob());
};

export const loadHaCalendarEvents = async (
  haUrl: string,
  entityId: string,
): Promise<HaCalendarEvent[]> => {
  let { baseUrl, token } = await getHaAuth(haUrl);
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const url = new URL(`${baseUrl}/api/calendars/${entityId}`);
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());

  const loadCalendar = (activeUrl: string, activeToken: string) => fetch(activeUrl, {
    headers: {
      Authorization: `Bearer ${activeToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  let response = await loadCalendar(url.toString(), token);
  if (response.status === 401) {
    const refreshed = await getHaAuth(haUrl, { forceRefresh: true });
    baseUrl = refreshed.baseUrl;
    token = refreshed.token;
    const refreshedUrl = new URL(`${baseUrl}/api/calendars/${entityId}`);
    refreshedUrl.searchParams.set("start", start.toISOString());
    refreshedUrl.searchParams.set("end", end.toISOString());
    response = await loadCalendar(refreshedUrl.toString(), token);
  }
  if (!response.ok) {
    throw new Error(`HA calendar failed (${response.status})`);
  }
  return (await response.json()) as HaCalendarEvent[];
};

export const getDomain = (entityId = "") => entityId.split(".")[0] || "";

export const getFriendlyName = (state?: HaState | null) =>
  state?.attributes?.friendly_name ||
  state?.entity_id
    ?.split(".")
    .pop()
    ?.replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) ||
  state?.entity_id ||
  "Device";

export const getNumericState = (state?: HaState | null, fallback = 0) => {
  const value = Number.parseFloat(String(state?.state ?? ""));
  return Number.isFinite(value) ? value : fallback;
};

export const formatHaValue = (state?: HaState | null) => {
  if (!state) return "--";
  const unit = state.attributes?.unit_of_measurement || "";
  return `${state.state}${unit ? ` ${unit}` : ""}`;
};

export const stateMatches = (state: HaState, needles: string[]) => {
  const haystack = `${state.entity_id} ${state.attributes?.friendly_name || ""}`.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
};
