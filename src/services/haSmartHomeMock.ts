export interface HaSmartHomeMockState {
  entity_id: string;
  state: string;
  attributes?: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export const HA_SMART_HOME_REVIEW_PARAM = "curioHaSmartHomeReview";
export const HA_SMART_HOME_REVIEW_BASE_URL = "http://curio-ha-review.local:8123";
export const HA_SMART_HOME_REVIEW_MCP_URL = `${HA_SMART_HOME_REVIEW_BASE_URL}/api/mcp`;
export const HA_SMART_HOME_REVIEW_TOKEN = "curio-ha-review-token";

type MutableHaState = HaSmartHomeMockState & {
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
};

const nowIso = () => new Date().toISOString();

const buildState = (
  entityId: string,
  state: string,
  attributes: Record<string, any> = {},
): MutableHaState => ({
  entity_id: entityId,
  state,
  attributes,
  last_changed: nowIso(),
  last_updated: nowIso(),
});

const buildMediaArtworkDataUrl = () =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
      <defs>
        <linearGradient id="cover" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#f472b6"/>
          <stop offset="0.54" stop-color="#7c3aed"/>
          <stop offset="1" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <rect width="640" height="640" rx="72" fill="url(#cover)"/>
      <circle cx="320" cy="320" r="186" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.5)" stroke-width="12"/>
      <circle cx="320" cy="320" r="54" fill="#f8fafc" opacity="0.88"/>
      <text x="64" y="104" fill="#fff" font-family="system-ui, sans-serif" font-size="34" font-weight="800">CURIO RADIO</text>
      <text x="64" y="548" fill="rgba(255,255,255,0.72)" font-family="system-ui, sans-serif" font-size="24" font-weight="700">Morning Playlist</text>
    </svg>
  `.trim())}`;

const initialStates = (): MutableHaState[] => [
  buildState("camera.front_door", "idle", { friendly_name: "Front Door", area_id: "Entry" }),
  buildState("camera.garage", "idle", { friendly_name: "Garage", area_id: "Garage" }),
  buildState("light.kitchen_pendants", "on", {
    friendly_name: "Kitchen Pendants",
    area_id: "Kitchen",
    brightness: 184,
    color_temp_kelvin: 3100,
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500,
  }),
  buildState("sensor.living_room_temperature", "72", {
    friendly_name: "Living Room Temperature",
    area_id: "Living Room",
    unit_of_measurement: "°F",
  }),
  buildState("sensor.main_floor_humidity", "44", {
    friendly_name: "Main Floor Humidity",
    area_id: "Living Room",
    unit_of_measurement: "%",
  }),
  buildState("climate.downstairs", "heat", {
    friendly_name: "Downstairs",
    area_id: "Living Room",
    current_temperature: 70,
    temperature: 72,
    min_temp: 60,
    max_temp: 82,
    hvac_modes: ["heat", "cool", "auto", "off"],
  }),
  buildState("cover.living_room_shades", "open", {
    friendly_name: "Living Room Shades",
    area_id: "Living Room",
    current_position: 68,
  }),
  buildState("media_player.family_room", "playing", {
    friendly_name: "Family Room",
    area_id: "Living Room",
    media_title: "Morning Playlist With A Longer Title",
    media_artist: "Curio Radio",
    media_album_name: "Home Assistant Review",
    entity_picture: buildMediaArtworkDataUrl(),
    app_name: "Spotify",
    source: "Kitchen speaker",
    source_list: ["Family Room", "Kitchen speaker", "Bedroom speaker"],
    media_duration: 244,
    media_position: 78,
    volume_level: 0.42,
  }),
  buildState("select.house_mode", "Evening", {
    friendly_name: "House Mode",
    area_id: "Hallway",
    options: ["Morning", "Away", "Evening", "Movie", "Sleep"],
  }),
  buildState("scene.movie_night", "off", { friendly_name: "Movie Night", area_id: "Living Room" }),
  buildState("script.goodnight", "off", { friendly_name: "Goodnight", area_id: "Bedroom" }),
  buildState("button.find_phone", "unknown", { friendly_name: "Find Phone", area_id: "Hallway" }),
  buildState("switch.porch_outlet", "on", { friendly_name: "Porch Outlet", area_id: "Entry" }),
  buildState("calendar.family", "on", { friendly_name: "Family Calendar", area_id: "Kitchen" }),
  buildState("vacuum.robovac", "cleaning", {
    friendly_name: "RoboVac",
    area_id: "Living Room",
    battery_level: 76,
    fan_speed: "Balanced",
  }),
  buildState("sensor.printer_status", "printing", {
    friendly_name: "Printer Status",
    area_id: "Office",
  }),
  buildState("sensor.printer_progress", "63", {
    friendly_name: "Printer Progress",
    area_id: "Office",
    unit_of_measurement: "%",
  }),
  buildState("sensor.printer_nozzle", "214", {
    friendly_name: "Nozzle",
    area_id: "Office",
    unit_of_measurement: "°C",
  }),
  buildState("sensor.printer_bed", "60", {
    friendly_name: "Bed",
    area_id: "Office",
    unit_of_measurement: "°C",
  }),
  buildState("sensor.printer_time_left", "38 min", {
    friendly_name: "Time Left",
    area_id: "Office",
  }),
  buildState("sensor.printer_filename", "curio_mount.3mf", {
    friendly_name: "Printer File",
    area_id: "Office",
  }),
  buildState("button.printer_pause", "unknown", { friendly_name: "Pause Print", area_id: "Office" }),
  buildState("camera.printer", "idle", { friendly_name: "Printer Camera", area_id: "Office" }),
  buildState("sensor.home_power", "1280", {
    friendly_name: "Home Power",
    area_id: "Utility",
    unit_of_measurement: "W",
  }),
  buildState("sensor.solar_generation", "2.4", {
    friendly_name: "Solar Generation",
    area_id: "Utility",
    unit_of_measurement: "kW",
  }),
  buildState("sensor.energy_today", "14.2", {
    friendly_name: "Energy Today",
    area_id: "Utility",
    unit_of_measurement: "kWh",
  }),
  buildState("binary_sensor.front_door_motion", "on", {
    friendly_name: "Front Door Motion",
    area_id: "Entry",
  }),
  buildState("lock.front_door", "locked", { friendly_name: "Front Door Lock", area_id: "Entry" }),
];

let mockStates = initialStates();

export const isHaSmartHomeReviewMode = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(HA_SMART_HOME_REVIEW_PARAM);
};

export const getHaSmartHomeMockStates = (): HaSmartHomeMockState[] =>
  mockStates.map((state) => ({
    ...state,
    attributes: { ...state.attributes },
  }));

const findMockState = (entityId: string) =>
  mockStates.find((state) => state.entity_id.toLowerCase() === entityId.toLowerCase());

const touchState = (state: MutableHaState) => {
  const timestamp = nowIso();
  state.last_changed = timestamp;
  state.last_updated = timestamp;
};

const updateEntityState = (
  entityId: string,
  nextState: string,
  attributes: Record<string, unknown> = {},
) => {
  const state = findMockState(entityId);
  if (!state) return null;
  state.state = nextState;
  state.attributes = {
    ...state.attributes,
    ...attributes,
  };
  touchState(state);
  return state;
};

const toJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const buildCameraSvg = (entityId: string) => {
  const isGarage = entityId.toLowerCase().includes("garage");
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#0f172a"/>
          <stop offset="0.55" stop-color="#1e293b"/>
          <stop offset="1" stop-color="#0f766e"/>
        </linearGradient>
        <linearGradient id="window" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#fef3c7" stop-opacity="0.95"/>
          <stop offset="1" stop-color="#f59e0b" stop-opacity="0.54"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#sky)"/>
      <circle cx="1030" cy="220" r="72" fill="#fbbf24" opacity="0.82"/>
      ${
        isGarage
          ? `
      <rect x="300" y="196" width="680" height="360" rx="26" fill="#111827" opacity="0.9"/>
      <rect x="348" y="246" width="584" height="254" rx="18" fill="#334155"/>
      <path d="M390 498 L450 388 H826 L892 498 Z" fill="#e5e7eb"/>
      <path d="M505 390 C555 320 730 320 780 390 Z" fill="#0f172a"/>
      <circle cx="502" cy="497" r="36" fill="#020617"/>
      <circle cx="778" cy="497" r="36" fill="#020617"/>
      <rect x="378" y="268" width="528" height="38" fill="rgba(255,255,255,0.18)"/>
      `
          : `
      <path d="M238 384 L640 168 L1040 384 L1002 416 L640 226 L276 416 Z" fill="#334155"/>
      <rect x="310" y="384" width="660" height="214" rx="20" fill="#1f2937"/>
      <rect x="388" y="430" width="120" height="168" rx="10" fill="url(#window)"/>
      <rect x="584" y="430" width="112" height="168" rx="10" fill="rgba(255,255,255,0.16)"/>
      <rect x="758" y="430" width="120" height="168" rx="10" fill="url(#window)"/>
      <path d="M232 598 C342 532 458 648 610 574 C748 508 872 642 1058 560 C1126 530 1196 540 1280 512 L1280 720 L0 720 L0 624 C78 630 152 620 232 598 Z" fill="#0f5132" opacity="0.84"/>
      `
      }
      <path d="M0 575 C180 500 260 620 430 560 C610 495 760 630 945 550 C1070 495 1180 535 1280 505 L1280 720 L0 720 Z" fill="#0f5132" opacity="0.46"/>
    </svg>
  `.trim();
};

const updateServiceState = (
  domain: string,
  service: string,
  body: Record<string, any>,
) => {
  const entityIds = Array.isArray(body.entity_id) ? body.entity_id : [body.entity_id];
  const updated: MutableHaState[] = [];

  entityIds.filter(Boolean).forEach((entityId: string) => {
    const state = findMockState(entityId);
    if (!state) return;

    if (["light", "switch", "input_boolean"].includes(domain)) {
      if (service === "turn_on") {
        const attrs: Record<string, unknown> = {};
        if (typeof body.brightness === "number") attrs.brightness = body.brightness;
        if (Array.isArray(body.rgb_color)) attrs.rgb_color = body.rgb_color;
        if (typeof body.color_temp_kelvin === "number") {
          attrs.color_temp_kelvin = body.color_temp_kelvin;
        }
        updateEntityState(entityId, "on", attrs);
      } else if (service === "turn_off") {
        updateEntityState(entityId, "off");
      }
    } else if (domain === "climate") {
      const attrs: Record<string, unknown> = {};
      if (typeof body.temperature === "number") attrs.temperature = body.temperature;
      const nextState = typeof body.hvac_mode === "string" ? body.hvac_mode : state.state;
      updateEntityState(entityId, nextState, attrs);
    } else if (domain === "cover") {
      if (service === "open_cover") {
        updateEntityState(entityId, "open", { current_position: 100 });
      } else if (service === "close_cover") {
        updateEntityState(entityId, "closed", { current_position: 0 });
      } else if (service === "stop_cover") {
        updateEntityState(entityId, state.state);
      } else if (service === "set_cover_position") {
        updateEntityState(entityId, Number(body.position) > 0 ? "open" : "closed", {
          current_position: Number(body.position),
        });
      }
    } else if (domain === "media_player") {
      if (service === "media_play_pause") {
        updateEntityState(entityId, state.state === "playing" ? "paused" : "playing");
      } else if (service === "volume_set") {
        updateEntityState(entityId, state.state, { volume_level: body.volume_level });
      } else {
        touchState(state);
      }
    } else if (domain === "select" || domain === "input_select") {
      if (typeof body.option === "string") {
        updateEntityState(entityId, body.option);
      }
    } else if (domain === "vacuum") {
      const next =
        service === "start"
          ? "cleaning"
          : service === "pause"
            ? "paused"
            : service === "return_to_base"
              ? "returning"
              : state.state;
      updateEntityState(entityId, next);
    } else {
      touchState(state);
    }

    const next = findMockState(entityId);
    if (next) updated.push(next);
  });

  return updated;
};

export const installHaSmartHomeReviewFetchMock = () => {
  if (typeof window === "undefined" || !isHaSmartHomeReviewMode()) return;
  const reviewWindow = window as Window & {
    __curioHaSmartHomeReviewFetch?: typeof fetch;
    __curioHaSmartHomeReviewInstalled?: boolean;
  };
  if (reviewWindow.__curioHaSmartHomeReviewInstalled) return;

  reviewWindow.__curioHaSmartHomeReviewFetch = window.fetch.bind(window);
  reviewWindow.__curioHaSmartHomeReviewInstalled = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!requestUrl.startsWith(HA_SMART_HOME_REVIEW_BASE_URL)) {
      return reviewWindow.__curioHaSmartHomeReviewFetch!(input, init);
    }

    const url = new URL(requestUrl);
    const path = url.pathname;

    if (path === "/api/states") {
      return toJsonResponse(getHaSmartHomeMockStates());
    }

    if (path.startsWith("/api/states/")) {
      const entityId = decodeURIComponent(path.replace("/api/states/", ""));
      const state = findMockState(entityId);
      return state ? toJsonResponse(state) : toJsonResponse({ message: "Not found" }, 404);
    }

    if (path.startsWith("/api/camera_proxy/")) {
      const entityId = decodeURIComponent(path.replace("/api/camera_proxy/", ""));
      return new Response(buildCameraSvg(entityId), {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-store",
        },
      });
    }

    if (path.startsWith("/api/services/")) {
      const [, , , domain, service] = path.split("/");
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const updated = updateServiceState(domain, service, body);
      return toJsonResponse(updated);
    }

    if (path.startsWith("/api/calendars/")) {
      const start = new Date();
      const second = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      return toJsonResponse([
        {
          summary: "School pickup",
          start: { dateTime: start.toISOString() },
          end: { dateTime: new Date(start.getTime() + 45 * 60 * 1000).toISOString() },
        },
        {
          summary: "Movie night",
          start: { dateTime: second.toISOString() },
          end: { dateTime: new Date(second.getTime() + 2 * 60 * 60 * 1000).toISOString() },
        },
      ]);
    }

    return toJsonResponse({ message: "Mock endpoint not found" }, 404);
  };
};
