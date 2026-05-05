import type {
  DeviceControlKind,
  DeviceSupportedAction,
  MediaSupportedAction,
} from './cardTypes';

export type HomeAssistantCardAction =
  | DeviceSupportedAction
  | MediaSupportedAction;

type DeviceCapability = {
  controlKind: DeviceControlKind;
  actions: DeviceSupportedAction[];
};

const DEVICE_CAPABILITIES: Record<string, DeviceCapability> = {
  light: { controlKind: 'toggle', actions: ['turn_on', 'turn_off', 'toggle'] },
  switch: { controlKind: 'toggle', actions: ['turn_on', 'turn_off', 'toggle'] },
  fan: { controlKind: 'toggle', actions: ['turn_on', 'turn_off', 'toggle'] },
  input_boolean: { controlKind: 'toggle', actions: ['turn_on', 'turn_off', 'toggle'] },
  lock: { controlKind: 'lock', actions: ['lock', 'unlock'] },
  cover: { controlKind: 'cover', actions: ['open_cover', 'close_cover', 'stop_cover'] },
  climate: { controlKind: 'readonly', actions: [] },
  sensor: { controlKind: 'readonly', actions: [] },
  binary_sensor: { controlKind: 'readonly', actions: [] },
};

const MEDIA_ACTIONS: MediaSupportedAction[] = [
  'media_play',
  'media_pause',
  'media_next_track',
];

const GENERIC_TOOL_CANDIDATES: Partial<Record<HomeAssistantCardAction, string[]>> = {
  turn_on: ['homeassistant.turn_on', 'HassTurnOn'],
  turn_off: ['homeassistant.turn_off', 'HassTurnOff'],
  toggle: ['homeassistant.toggle', 'HassToggle'],
};

const DOMAIN_TOOL_CANDIDATES: Record<string, Partial<Record<HomeAssistantCardAction, string[]>>> = {
  light: {
    turn_on: ['light.turn_on', 'HassLightTurnOn'],
    turn_off: ['light.turn_off', 'HassLightTurnOff'],
    toggle: ['light.toggle'],
  },
  switch: {
    turn_on: ['switch.turn_on', 'HassTurnOn'],
    turn_off: ['switch.turn_off', 'HassTurnOff'],
    toggle: ['switch.toggle', 'HassToggle'],
  },
  fan: {
    turn_on: ['fan.turn_on', 'HassTurnOn'],
    turn_off: ['fan.turn_off', 'HassTurnOff'],
    toggle: ['fan.toggle', 'HassToggle'],
  },
  input_boolean: {
    turn_on: ['input_boolean.turn_on', 'HassTurnOn'],
    turn_off: ['input_boolean.turn_off', 'HassTurnOff'],
    toggle: ['input_boolean.toggle', 'HassToggle'],
  },
  lock: {
    lock: ['lock.lock', 'HassLock'],
    unlock: ['lock.unlock', 'HassUnlock'],
  },
  cover: {
    open_cover: ['cover.open_cover', 'HassOpenCover'],
    close_cover: ['cover.close_cover', 'HassCloseCover'],
    stop_cover: ['cover.stop_cover', 'HassStopCover'],
  },
  media_player: {
    media_play: ['media_player.media_play', 'HassMediaPlay'],
    media_pause: ['media_player.media_pause', 'HassMediaPause'],
    media_next_track: ['media_player.media_next_track', 'HassMediaNextTrack'],
  },
};

const SUPPORTED_PATTERN_FRAGMENTS = [
  'turnon',
  'turnoff',
  'toggle',
  'lightset',
  'light_set',
  'lock',
  'unlock',
  'opencover',
  'closecover',
  'stopcover',
  'open_cover',
  'close_cover',
  'stop_cover',
  'turn_on',
  'turn_off',
  'assist_search',
  'search',
  'media_play',
  'mediaplay',
  'media_pause',
  'mediapause',
  'media_next_track',
  'medianexttrack',
];

type ToolMatchContext = {
  action: HomeAssistantCardAction;
  domain?: string;
};

export const extractHomeAssistantToolName = (toolName: string): string =>
  String(toolName || '')
    .trim()
    .replace(/^homeassistant__/, '')
    .replace(/__/g, '.');

export const normalizeHomeAssistantToolName = (toolName: string): string =>
  extractHomeAssistantToolName(toolName)
    .toLowerCase();

const buildSupportedToolNameSet = () => {
  const toolNames = new Set<string>();

  Object.values(GENERIC_TOOL_CANDIDATES).forEach((names) => {
    names?.forEach((name) => toolNames.add(normalizeHomeAssistantToolName(name)));
  });

  Object.values(DOMAIN_TOOL_CANDIDATES).forEach((domainMap) => {
    Object.values(domainMap).forEach((names) => {
      names?.forEach((name) => toolNames.add(normalizeHomeAssistantToolName(name)));
    });
  });

  return toolNames;
};

export const SUPPORTED_HOME_ASSISTANT_TOOL_NAMES = buildSupportedToolNameSet();

function matchesSupportedPattern(normalizedToolName: string): boolean {
  return SUPPORTED_PATTERN_FRAGMENTS.some((fragment) => normalizedToolName.includes(fragment));
}

export const isSupportedHomeAssistantTool = (toolName: string): boolean => {
  const normalizedToolName = normalizeHomeAssistantToolName(toolName);
  return SUPPORTED_HOME_ASSISTANT_TOOL_NAMES.has(normalizedToolName)
    || matchesSupportedPattern(normalizedToolName);
};

export const getDeviceControlKind = (domain: string): DeviceControlKind =>
  DEVICE_CAPABILITIES[domain]?.controlKind ?? 'readonly';

export const getSupportedDeviceActions = (domain: string): DeviceSupportedAction[] =>
  [...(DEVICE_CAPABILITIES[domain]?.actions ?? [])];

export const getSupportedMediaActions = (): MediaSupportedAction[] => [...MEDIA_ACTIONS];

export const getToolCandidatesForAction = (
  action: HomeAssistantCardAction,
  domain?: string,
): string[] => {
  const candidates = new Set<string>();

  if (domain) {
    DOMAIN_TOOL_CANDIDATES[domain]?.[action]?.forEach((toolName) => candidates.add(toolName));
  }

  GENERIC_TOOL_CANDIDATES[action]?.forEach((toolName) => candidates.add(toolName));

  return [...candidates];
};

function matchesActionContext(
  normalizedToolName: string,
  { action }: ToolMatchContext,
): boolean {
  switch (action) {
    case 'turn_on':
      return normalizedToolName.includes('turn_on') || normalizedToolName.includes('turnon');
    case 'turn_off':
      return normalizedToolName.includes('turn_off') || normalizedToolName.includes('turnoff');
    case 'toggle':
      return normalizedToolName.includes('toggle');
    case 'lock':
      return normalizedToolName.includes('lock') && !normalizedToolName.includes('unlock');
    case 'unlock':
      return normalizedToolName.includes('unlock');
    case 'open_cover':
      return normalizedToolName.includes('open_cover') || normalizedToolName.includes('opencover');
    case 'close_cover':
      return normalizedToolName.includes('close_cover') || normalizedToolName.includes('closecover');
    case 'stop_cover':
      return normalizedToolName.includes('stop_cover') || normalizedToolName.includes('stopcover');
    case 'media_play':
      return normalizedToolName.includes('media_play') || normalizedToolName.includes('mediaplay');
    case 'media_pause':
      return normalizedToolName.includes('media_pause') || normalizedToolName.includes('mediapause');
    case 'media_next_track':
      return normalizedToolName.includes('media_next_track') || normalizedToolName.includes('medianexttrack');
    default:
      return false;
  }
}

function scoreToolMatch(
  normalizedToolName: string,
  rawToolName: string,
  { action, domain }: ToolMatchContext,
): number {
  if (!matchesActionContext(normalizedToolName, { action, domain })) {
    return -1;
  }

  let score = 10;
  if (domain) {
    if (normalizedToolName.startsWith(`${domain}.`)) {
      score += 6;
    }

    if (normalizedToolName.includes(domain)) {
      score += 4;
    }
  }

  if (normalizedToolName.startsWith('hass')) {
    score += 2;
  }

  if (rawToolName.includes('.')) {
    score += 1;
  }

  if (normalizedToolName.includes('search')) {
    score -= 10;
  }

  return score;
}

export const resolveSupportedToolName = (
  toolNames: Iterable<string>,
  action: HomeAssistantCardAction,
  domain?: string,
): string | null => {
  const rawToolNames = [...toolNames]
    .map((toolName) => extractHomeAssistantToolName(toolName))
    .filter(Boolean);
  const normalizedLookup = new Map(
    rawToolNames.map((rawToolName) => [normalizeHomeAssistantToolName(rawToolName), rawToolName]),
  );

  for (const candidate of getToolCandidatesForAction(action, domain)) {
    const normalizedCandidate = normalizeHomeAssistantToolName(candidate);
    const exact = normalizedLookup.get(normalizedCandidate);
    if (exact) {
      return exact;
    }
  }

  let bestMatch: { rawToolName: string; score: number } | null = null;
  for (const rawToolName of rawToolNames) {
    const normalizedToolName = normalizeHomeAssistantToolName(rawToolName);
    const score = scoreToolMatch(normalizedToolName, rawToolName, { action, domain });
    if (score < 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { rawToolName, score };
    }
  }

  return bestMatch?.rawToolName ?? null;
};
