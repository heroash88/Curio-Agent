import { resolveYouTubeApiKey } from './youtubeApi';
import { searchSpotifyCatalog, type SpotifyCatalogItem, type SpotifyCatalogItemType } from './spotifyApi';

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const MIN_ACCEPTABLE_SCORE = 12;

export interface MusicSearchCandidate {
  videoId?: string;
  id?: string;
  uri?: string;
  itemType?: SpotifyCatalogItemType;
  title: string;
  artistOrChannel: string;
  thumbnailUrl: string;
  liveBroadcastContent?: string;
  albumName?: string;
  durationSeconds?: number;
  externalUrl?: string;
}

export interface MusicSearchMatch extends MusicSearchCandidate {
  query: string;
  score: number;
  source: 'youtube' | 'spotify';
}

export interface MusicSearchResult {
  success: boolean;
  track?: MusicSearchMatch;
  error?: string;
}

interface YouTubeSearchResponseItem {
  id?: {
    kind?: string;
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
}

const MUSIC_FILLER_PATTERN = /\b(play|music|song|songs|track|listen to|on youtube|on youtube music|please|for me)\b/gi;
const WHITESPACE_PATTERN = /\s+/g;

const toSearchableText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value: string) =>
  toSearchableText(value)
    .split(' ')
    .filter(Boolean);

export const cleanMusicQuery = (query: string): string => {
  const trimmed = query.trim();
  if (!trimmed) return '';

  const quotedMatch = trimmed.match(/"([^"]+)"/);
  if (quotedMatch?.[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  return trimmed
    .replace(MUSIC_FILLER_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
};

const selectThumbnail = (item: YouTubeSearchResponseItem): string =>
  item.snippet?.thumbnails?.high?.url
  || item.snippet?.thumbnails?.medium?.url
  || item.snippet?.thumbnails?.default?.url
  || '';

const extractCandidate = (item: YouTubeSearchResponseItem): MusicSearchCandidate | null => {
  const videoId = item.id?.videoId?.trim();
  if (!videoId) return null;

  return {
    videoId,
    title: item.snippet?.title?.trim() || 'YouTube Track',
    artistOrChannel: item.snippet?.channelTitle?.trim() || 'Unknown Artist',
    thumbnailUrl: selectThumbnail(item),
    liveBroadcastContent: item.snippet?.liveBroadcastContent,
  };
};

export const scoreMusicCandidate = (query: string, candidate: MusicSearchCandidate): number => {
  const normalizedQuery = toSearchableText(query);
  const queryTokens = tokenize(query);
  const title = toSearchableText(candidate.title);
  const channel = toSearchableText(candidate.artistOrChannel);
  const combined = `${title} ${channel}`;

  let score = 0;

  if (title === normalizedQuery) score += 120;
  if (title.includes(normalizedQuery)) score += 55;
  if (channel.includes(normalizedQuery)) score += 25;

  for (const token of queryTokens) {
    if (title.includes(token)) score += 12;
    if (channel.includes(token)) score += 7;
  }

  if (/\bofficial\b/.test(title)) score += 24;
  if (/\baudio\b/.test(title)) score += 20;
  if (/\blyric\b/.test(title)) score += 10;
  if (/\btopic\b/.test(channel)) score += 22;
  if (/\bvevo\b/.test(channel)) score += 10;
  if (candidate.liveBroadcastContent && candidate.liveBroadcastContent !== 'none') score -= 30;

  const penaltyTerms = ['live', 'cover', 'reaction', 'karaoke', 'shorts', 'short', 'nightcore'];
  for (const term of penaltyTerms) {
    if (combined.includes(term)) score -= 18;
  }

  return score;
};

export const rankMusicCandidates = (query: string, candidates: MusicSearchCandidate[]): MusicSearchMatch[] =>
  candidates
    .map((candidate) => ({
      ...candidate,
      query,
      score: scoreMusicCandidate(query, candidate),
      source: 'youtube' as const,
    }))
    .sort((left, right) => right.score - left.score);

// ── Dynamic Invidious instance resolver ─────────────────────────────────────

const INVIDIOUS_INSTANCES_URL = 'https://api.invidious.io/instances.json';
const INSTANCE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const INSTANCE_FETCH_TIMEOUT_MS = 5_000;
const INSTANCE_SEARCH_TIMEOUT_MS = 8_000;
const MAX_INSTANCES_TO_TRY = 5;

// Hardcoded fallbacks in case the instances API itself is down
const FALLBACK_INSTANCES = [
  'https://vid.puffyan.us/api/v1',
  'https://invidious.fdn.fr/api/v1',
  'https://yt.artemislena.eu/api/v1',
];

let cachedInstances: string[] | null = null;
let cachedInstancesAt = 0;

const fetchInvidiousInstances = async (): Promise<string[]> => {
  const now = Date.now();
  if (cachedInstances && (now - cachedInstancesAt) < INSTANCE_CACHE_TTL_MS) {
    return cachedInstances;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INSTANCE_FETCH_TIMEOUT_MS);
    const res = await fetch(INVIDIOUS_INSTANCES_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`${res.status}`);
    const data: Array<[string, any]> = await res.json();

    const apiInstances = data
      .filter(([, info]) => info?.api === true && info?.type === 'https')
      .map(([, info]) => `${String(info.uri).replace(/\/$/, '')}/api/v1`)
      .slice(0, 10);

    if (apiInstances.length > 0) {
      cachedInstances = apiInstances;
      cachedInstancesAt = now;
      return apiInstances;
    }
  } catch {
    // Instances API unreachable — fall through to fallbacks
  }

  return FALLBACK_INSTANCES;
};

const parseInvidiousItem = (item: any): MusicSearchCandidate | null => {
  if (item.type !== 'video' || !item.videoId) return null;
  return {
    videoId: item.videoId,
    title: item.title || 'YouTube Track',
    artistOrChannel: item.author || 'Unknown Artist',
    thumbnailUrl: item.videoThumbnails?.find((t: any) => t.quality === 'high')?.url ||
                  item.videoThumbnails?.[0]?.url || '',
    liveBroadcastContent: item.liveNow ? 'live' : 'none',
  };
};

export const fetchInvidiousCandidates = async (query: string): Promise<MusicSearchCandidate[]> => {
  const instances = await fetchInvidiousInstances();

  for (const baseUrl of instances.slice(0, MAX_INSTANCES_TO_TRY)) {
    try {
      const params = new URLSearchParams({ q: query, type: 'video' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INSTANCE_SEARCH_TIMEOUT_MS);
      const response = await fetch(`${baseUrl}/search?${params.toString()}`, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) continue;

      const items = await response.json();
      if (!Array.isArray(items)) continue;

      const mapped = items.map(parseInvidiousItem).filter((item): item is MusicSearchCandidate => item !== null);
      if (mapped.length > 0) return mapped;
    } catch {
      continue;
    }
  }
  return [];
};

// -- YouTube HTML scrape fallback (no API key needed) --
// NOTE: Direct YouTube fetch is blocked by CORS in browsers.
// Instead, we use YouTube's oEmbed endpoint which supports CORS,
// or fall back to constructing a search-based embed URL.

const fetchYouTubeScrapeCandidates = async (_query: string): Promise<MusicSearchCandidate[]> => {
  // YouTube blocks cross-origin fetch from browsers (CORS).
  // This function is kept as a no-op placeholder.
  // The actual fallback is handled in searchOfflineMusic by emitting
  // a YouTube card with a searchQuery instead of a videoId.
  return [];
};

// -- Combined no-API-key search: Invidious first, then YouTube scrape --

export const fetchNoApiKeyCandidates = async (query: string): Promise<MusicSearchCandidate[]> => {
  console.log('[MusicSearch] No API key -- trying Invidious first for:', query);
  const invidious = await fetchInvidiousCandidates(query);
  if (invidious.length > 0) {
    console.log('[MusicSearch] Invidious returned', invidious.length, 'results');
    return invidious;
  }
  console.log('[MusicSearch] Invidious failed -- trying YouTube scrape for:', query);
  const scraped = await fetchYouTubeScrapeCandidates(query);
  console.log('[MusicSearch] YouTube scrape returned', scraped.length, 'results');
  return scraped;
};

const fetchMusicCandidates = async (query: string, apiKey: string): Promise<MusicSearchCandidate[]> => {
  if (!apiKey) {
    return fetchNoApiKeyCandidates(query);
  }

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: '5',
    key: apiKey,
  });

  const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    console.error('[YouTube API Error]', errorData || response.statusText);
    
    if (response.status === 403) {
      return fetchInvidiousCandidates(query);
    }
    throw new Error(errorData?.error?.message || `YouTube search failed with status ${response.status}`);
  }

  const payload = await response.json() as { items?: YouTubeSearchResponseItem[] };
  return Array.isArray(payload.items)
    ? payload.items.map(extractCandidate).filter((item): item is MusicSearchCandidate => Boolean(item))
    : [];
};

export const searchMusicCandidates = async (
  query: string,
  source: 'youtube' | 'spotify' = 'youtube',
): Promise<MusicSearchMatch[]> => {
  const sanitizedQuery = cleanMusicQuery(query) || query.trim();
  if (!sanitizedQuery) return [];

  if (source === 'spotify') {
    try {
      const results = await searchSpotifyCatalog(sanitizedQuery);
      return results as SpotifyCatalogItem[] as MusicSearchMatch[];
    } catch {
      return [];
    }
  }

  const apiKey = await resolveYouTubeApiKey();

  try {
    const candidates = await fetchMusicCandidates(sanitizedQuery, apiKey.key);
    return rankMusicCandidates(sanitizedQuery, candidates);
  } catch {
    return [];
  }
};

export const searchMusic = async (
  query: string,
  source: 'youtube' | 'spotify' = 'youtube',
): Promise<MusicSearchResult> => {
  const sanitizedQuery = cleanMusicQuery(query) || query.trim();
  if (!sanitizedQuery) {
    return {
      success: false,
      error: 'A song name is required to search for music.',
    };
  }

  if (source === 'spotify') {
    try {
      const candidates = await searchSpotifyCatalog(sanitizedQuery);
      const bestMatch = candidates[0] as MusicSearchMatch | undefined;
      if (bestMatch) {
        return { success: true, track: bestMatch };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Spotify music search failed.',
      };
    }

    return {
      success: false,
      error: `I could not find a Spotify result for "${sanitizedQuery}".`,
    };
  }

  const apiKey = await resolveYouTubeApiKey();
  const attempts = Array.from(new Set([sanitizedQuery, query.trim()].filter(Boolean)));

  try {
    for (const attempt of attempts) {
      const candidates = await fetchMusicCandidates(attempt, apiKey.key);
      const ranked = rankMusicCandidates(attempt, candidates);
      const bestMatch = ranked[0];

      if (bestMatch && bestMatch.score >= MIN_ACCEPTABLE_SCORE) {
        return { success: true, track: bestMatch };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'YouTube music search failed.',
    };
  }

  return {
    success: false,
    error: `I could not find a playable YouTube result for "${sanitizedQuery}".`,
  };
};
