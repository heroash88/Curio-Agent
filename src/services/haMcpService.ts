/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Type } from '@google/genai';
import {
    extractHomeAssistantToolName,
    isSupportedHomeAssistantTool,
    normalizeHomeAssistantToolName,
} from './haWidgetSupport';

const HA_FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = HA_FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export interface MCPTool {
    name?: string;
    description?: string;
    inputSchema: any;
}

export interface MCPListToolsResponse {
    tools: MCPTool[];
}

export interface HAEntity {
    entity_id: string;
    name: string;        // friendly name
    domain: string;
    state?: string;
    area?: string;
    
    // Performance optimization: pre-calculate normalized strings
    _normName?: string;
    _normSuffix?: string;
    _normArea?: string;
    _wordSet?: Set<string>;
}

export type HomeAssistantActionStatus =
    | 'success'
    | 'non_actionable'
    | 'no_match'
    | 'unsupported'
    | 'error';

export interface HomeAssistantToolMeta {
    status: HomeAssistantActionStatus;
    resolvedEntityIds: string[];
    refreshedEntities: HAEntity[];
    toolName: string;
    message?: string;
}

// ---------------------------------------------------------------------------
// Fuzzy matching utilities
// ---------------------------------------------------------------------------

const DOMAIN_KEYWORDS: Record<string, string[]> = {
    light: ['light', 'lamp', 'bulb', 'lights', 'led', 'ceiling', 'floor', 'strip', 'lightstrip', 'chandelier', 'sconce'],
    switch: ['switch', 'outlet', 'plug', 'socket'],
    climate: ['thermostat', 'heat', 'cool', 'climate', 'ac', 'hvac', 'temperature', 'heater', 'aircon'],
    cover: ['blind', 'curtain', 'shade', 'garage', 'door', 'cover', 'shutter', 'roller', 'awning'],
    media_player: ['tv', 'television', 'speaker', 'music', 'player', 'media', 'chromecast', 'sonos', 'roku', 'appletv', 'firestick'],
    sensor: ['sensor', 'temperature', 'humidity', 'motion'],
    fan: ['fan'],
    lock: ['lock', 'door lock', 'deadbolt'],
    scene: ['scene'],
    script: ['script', 'routine'],
    vacuum: ['vacuum', 'roomba', 'robot vacuum'],
    camera: ['camera', 'cam', 'doorbell'],
    automation: ['automation', 'routine'],
};

const FILLER_WORDS = new Set([
    'a',
    'an',
    'and',
    'any',
    'are',
    'at',
    'be',
    'can',
    'could',
    'do',
    'down',
    'for',
    'from',
    'get',
    'go',
    'in',
    'into',
    'is',
    'it',
    'just',
    'make',
    'me',
    'my',
    'of',
    'off',
    'on',
    'please',
    'set',
    'switch',
    'that',
    'the',
    'there',
    'these',
    'this',
    'those',
    'to',
    'turn',
    'up',
    'with',
    'would',
]);

const ALL_REQUEST_WORDS = new Set(['all', 'every', 'each']);

function singularizeToken(token: string): string {
    if (token.length <= 3) return token;
    if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
    if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
}

function normalize(s: string): string {
    return s
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[_\-.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(s: string, filterFillers = true): string[] {
    return normalize(s)
        .split(' ')
        .map((token) => singularizeToken(token))
        .filter((token) => token.length > 1)
        .filter((token) => !filterFillers || !FILLER_WORDS.has(token));
}

function wordSet(s: string): Set<string> {
    return new Set(tokenize(s));
}

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1),
            );
        }
    }
    return matrix[b.length][a.length];
}

function tokenMatches(queryToken: string, targetToken: string): boolean {
    if (queryToken === targetToken) return true;
    if (targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken)) return true;
    // Typo tolerance: allow edit distance ≤ 1 for tokens ≥ 4 chars
    if (queryToken.length >= 4 && targetToken.length >= 4) {
        return levenshteinDistance(queryToken, targetToken) <= 1;
    }
    return false;
}

function inferDomainFromQuery(query: string): string | undefined {
    const normalized = normalize(query);
    if (!normalized) return undefined;

    const explicitEntityDomain = normalized.match(/^([a-z0-9_]+)\s+/)?.[1];
    if (explicitEntityDomain && explicitEntityDomain in DOMAIN_KEYWORDS) {
        return explicitEntityDomain;
    }

    const queryTokens = tokenize(query);
    let bestDomain: string | undefined;
    let bestScore = 0;

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        let score = 0;
        for (const keyword of keywords) {
            const keywordTokens = tokenize(keyword, false);
            if (keywordTokens.every((keywordToken) => queryTokens.some((queryToken) => tokenMatches(keywordToken, queryToken)))) {
                score += keywordTokens.length;
            }
        }

        if (score > bestScore) {
            bestDomain = domain;
            bestScore = score;
        }
    }

    return bestScore > 0 ? bestDomain : undefined;
}

function collectTextCandidates(value: unknown, acc: string[] = []): string[] {
    if (typeof value === 'string') {
        if (value.trim()) {
            acc.push(value.trim());
        }
        return acc;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectTextCandidates(item, acc));
        return acc;
    }

    if (value && typeof value === 'object') {
        Object.values(value).forEach((nestedValue) => collectTextCandidates(nestedValue, acc));
    }

    return acc;
}

function inferPreferredDomain(args: any, toolDomain?: string): string | undefined {
    if (toolDomain && toolDomain !== 'homeassistant') {
        return toolDomain;
    }

    const textCandidates = collectTextCandidates(args);
    for (const candidate of textCandidates) {
        const normalizedCandidate = normalize(candidate);
        if (normalizedCandidate.includes(' ')) {
            continue;
        }

        const [maybeDomain] = normalizedCandidate.split('.');
        if (maybeDomain && maybeDomain in DOMAIN_KEYWORDS) {
            return maybeDomain;
        }
    }

    const domainScores = new Map<string, number>();
    for (const candidate of textCandidates) {
        const inferredDomain = inferDomainFromQuery(candidate);
        if (!inferredDomain) continue;
        domainScores.set(inferredDomain, (domainScores.get(inferredDomain) || 0) + 1);
    }

    let bestDomain: string | undefined;
    let bestScore = 0;
    for (const [domain, score] of domainScores.entries()) {
        if (score > bestScore) {
            bestDomain = domain;
            bestScore = score;
        }
    }

    return bestDomain;
}

function stripDomainKeywords(query: string, preferredDomain?: string): string[] {
    const queryTokens = tokenize(query);
    const domainKeywords = preferredDomain ? (DOMAIN_KEYWORDS[preferredDomain] || []) : [];
    const domainKeywordTokens = new Set(
        domainKeywords.flatMap((keyword) => tokenize(keyword, false))
    );

    return queryTokens.filter((token) =>
        !domainKeywordTokens.has(token) &&
        !ALL_REQUEST_WORDS.has(token)
    );
}

function isGroupDeviceRequest(query: string, preferredDomain?: string): boolean {
    const queryTokens = tokenize(query, false);
    const containsGroupWord = queryTokens.some((token) => ALL_REQUEST_WORDS.has(token));
    const domainKeywords = preferredDomain ? (DOMAIN_KEYWORDS[preferredDomain] || []) : [];
    const referencesPluralDomain = domainKeywords.some((keyword) => normalize(query).includes(keyword));
    const remainingTokens = stripDomainKeywords(query, preferredDomain);

    return containsGroupWord || (referencesPluralDomain && remainingTokens.length > 0);
}

function selectGroupedEntities(
    query: string,
    entities: HAEntity[],
    preferredDomain?: string,
    limit = 12,
): HAEntity[] {
    if (!preferredDomain) {
        return [];
    }

    const filtered = entities.filter((entity) => entity.domain === preferredDomain);
    if (filtered.length === 0) {
        return [];
    }

    const roomTokens = stripDomainKeywords(query, preferredDomain);
    if (roomTokens.length === 0) {
        return [];
    }

    const ranked = filtered
        .map((entity) => ({ entity, score: fuzzyScore(query, entity, preferredDomain) }))
        .filter(({ score, entity }) => {
            if (score < 55) return false;

            const targetWords = entity._wordSet || new Set<string>();
            return roomTokens.every((token) =>
                [...targetWords].some((targetWord) => tokenMatches(token, targetWord))
            );
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ entity }) => entity);

    return ranked.length > 1 ? ranked : [];
}

function matchesEntityIdExactly(query: string, entity: HAEntity): boolean {
    const rawQuery = query.trim().toLowerCase();
    const normalizedQuery = normalize(query);
    const normalizedEntityId = normalize(entity.entity_id);

    return (
        rawQuery === entity.entity_id.toLowerCase() ||
        normalizedQuery === normalizedEntityId
    );
}

function matchesEntityAliasExactly(query: string, entity: HAEntity): boolean {
    const rawQuery = query.trim().toLowerCase();
    const normalizedQuery = normalize(query);
    const normalizedName = entity._normName || normalize(entity.name);
    const normalizedSuffix = entity._normSuffix || normalize(entity.entity_id.replace(/^[^.]+\./, ''));

    return (
        rawQuery === entity.name.trim().toLowerCase() ||
        normalizedQuery === normalizedName ||
        normalizedQuery === normalizedSuffix
    );
}

function matchesEntityExactly(query: string, entity: HAEntity): boolean {
    return matchesEntityIdExactly(query, entity) || matchesEntityAliasExactly(query, entity);
}

function pickBestEntity(
    query: string,
    entities: HAEntity[],
    preferredDomain?: string,
    minimumScore = 20,
): HAEntity | null {
    let best: HAEntity | null = null;
    let bestScore = minimumScore;

    for (const entity of entities) {
        const score = fuzzyScore(query, entity, preferredDomain);
        if (score > bestScore) {
            bestScore = score;
            best = entity;
        }
    }

    return best;
}

type RankedCandidate = {
    entity: HAEntity;
    score: number;
};

function rankEntityCandidates(
    query: string,
    entities: HAEntity[],
    preferredDomain?: string,
    minimumScore = 40,
    limit = 5,
): RankedCandidate[] {
    return entities
        .map((entity) => ({ entity, score: fuzzyScore(query, entity, preferredDomain) }))
        .filter((candidate) => candidate.score >= minimumScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function findAmbiguousEntities(
    query: string,
    entities: HAEntity[],
    preferredDomain?: string,
): HAEntity[] {
    if (!query || entities.length < 2) {
        return [];
    }

    if (entities.some((entity) => matchesEntityExactly(query, entity))) {
        return [];
    }

    const ranked = rankEntityCandidates(query, entities, preferredDomain, 40, 3);
    if (ranked.length < 2) {
        return [];
    }

    const [best, second] = ranked;
    if (best.score < 55 || (best.score - second.score) > 5) {
        return [];
    }

    return ranked.map((candidate) => candidate.entity);
}

/**
 * Returns a 0–100 score for how well `query` matches `entity`.
 * @param preferredDomain If provided, gives a significant boost (+40) to entities in this domain.
 */
export function fuzzyScore(query: string, entity: HAEntity, preferredDomain?: string): number {
    const q = normalize(query);
    
    // Use cached normalized values if available
    const name = entity._normName || normalize(entity.name);
    const idSuffix = entity._normSuffix || normalize(entity.entity_id.replace(/^[^.]+\./, ''));
    const area = entity._normArea || normalize(entity.area || '');
    const normalizedEntityId = normalize(entity.entity_id);

    if (q === name || q === idSuffix || q === normalizedEntityId || matchesEntityExactly(query, entity)) return 100;
    
    let score = 0;
    if (preferredDomain) {
        score += entity.domain === preferredDomain ? 55 : -10;
    }

    if (name.includes(q) || idSuffix.includes(q)) return Math.max(score + 50, 90);
    if (q.includes(name) || q.includes(idSuffix)) return Math.max(score + 45, 85);
    if (area && (area.includes(q) || q.includes(area))) return Math.max(score + 30, 75);

    const qWords = wordSet(q);
    if (qWords.size === 0) return 0;

    const targetWords = entity._wordSet || new Set([...wordSet(name), ...wordSet(idSuffix), ...wordSet(area)]);
    const intersection = [...qWords].filter(w =>
        [...targetWords].some(t => tokenMatches(w, t))
    );
    const exactHits = [...qWords].filter((word) => targetWords.has(word)).length;

    const ratio = intersection.length / qWords.size;
    const targetRatio = intersection.length / targetWords.size;
    const combinedRatio = (ratio * 0.7) + (targetRatio * 0.3);

    if (ratio === 1.0 && targetRatio >= 0.5) {
        return Math.max(score + 45 + exactHits * 4, 84);
    }
    
    if (combinedRatio >= 0.4) {
        const subScore = Math.round(40 + combinedRatio * 40 + exactHits * 5);
        return Math.max(score, subScore);
    }

    // Area/room boosting: boost score when query words match entity area
    if (area && intersection.length > 0) {
        const areaWords = wordSet(area);
        const areaHits = [...qWords].filter(w =>
            [...areaWords].some(t => tokenMatches(w, t))
        ).length;
        if (areaHits > 0) {
            score += areaHits * 12;
        }
    }

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        if (entity.domain === domain && keywords.some(k => q.includes(k))) return Math.max(score, 15);
    }

    return score > 0 ? score : 0;
}

/** Returns the best matching entity for a query string (score must be > 20). */
export function findBestEntity(query: string, entities: HAEntity[], preferredDomain?: string): HAEntity | null {
    if (!query || entities.length === 0) return null;

    for (const entity of entities) {
        if (matchesEntityIdExactly(query, entity)) {
            return entity;
        }
    }

    if (preferredDomain) {
        for (const entity of entities) {
            if (entity.domain === preferredDomain && matchesEntityAliasExactly(query, entity)) {
                return entity;
            }
        }

        const sameDomainBest = pickBestEntity(
            query,
            entities.filter((entity) => entity.domain === preferredDomain),
            preferredDomain,
            40,
        );

        if (sameDomainBest) {
            return sameDomainBest;
        }
    }

    for (const entity of entities) {
        if (matchesEntityAliasExactly(query, entity)) {
            return entity;
        }
    }

    return pickBestEntity(query, entities, preferredDomain, 20);
}

/** Returns ranked candidates with score >= 40 for disambiguation. */
export function findCandidates(query: string, entities: HAEntity[], preferredDomain?: string, limit = 5): HAEntity[] {
    return rankEntityCandidates(query, entities, preferredDomain, 40, limit)
        .map((candidate) => candidate.entity);
}

// ---------------------------------------------------------------------------
// MCP Client
// ---------------------------------------------------------------------------

export class HomeAssistantMCPClient {
    private url: string;
    private token: string;
    private apiMode: 'mcp' | 'rest';

    /** Populated by listEntities() -- used for fuzzy matching in callTool */
    public entityCache: HAEntity[] = [];
    public entityMap: Map<string, HAEntity> = new Map();
    /** Full unfiltered entity list for the settings UI */
    public _allEntities: HAEntity[] = [];

    constructor(url: string, token: string, apiMode: 'mcp' | 'rest' = 'rest') {
        this.apiMode = apiMode;
        if (apiMode === 'mcp') {
            this.url = url.endsWith('/api/mcp') ? url : `${url.replace(/\/$/, '')}/api/mcp`;
        } else {
            this.url = url.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');
        }
        // Safety check: reject encrypted tokens — caller must decrypt first
        if (token.startsWith('enc::')) {
            console.error('[HA Client] Received encrypted token! Caller must use getHaMcpTokenAsync() to decrypt.');
            this.token = '';
        } else {
            this.token = token;
        }
    }

    private getBaseUrl(): string {
        if (this.apiMode === 'rest') return this.url;
        return this.url.replace(/\/api\/mcp\/?$/, '');
    }

    private mapStateToEntity(state: any): HAEntity | null {
        if (!state?.entity_id || !String(state.entity_id).includes('.')) {
            return null;
        }

        const normName = normalize(state.attributes?.friendly_name ?? state.entity_id);
        const normSuffix = normalize(String(state.entity_id).replace(/^[^.]+\./, ''));
        const normArea = normalize(state.attributes?.area_id || '');

        return {
            entity_id: state.entity_id,
            name: state.attributes?.friendly_name ?? state.entity_id,
            domain: String(state.entity_id).split('.')[0] ?? '',
            state: state.state,
            area: state.attributes?.area_id,
            _normName: normName,
            _normSuffix: normSuffix,
            _normArea: normArea,
            _wordSet: new Set([
                ...wordSet(normName),
                ...wordSet(normSuffix),
                ...wordSet(normArea),
            ]),
        };
    }

    private cacheEntity(entity: HAEntity): HAEntity {
        const existingIndex = this.entityCache.findIndex(
            (candidate) => candidate.entity_id === entity.entity_id,
        );

        if (existingIndex >= 0) {
            this.entityCache[existingIndex] = entity;
        } else {
            this.entityCache.push(entity);
        }

        [entity.entity_id, entity.entity_id.toLowerCase(), normalize(entity.entity_id)].forEach((key) => {
            if (key) {
                this.entityMap.set(key, entity);
            }
        });

        return entity;
    }

    private async request(method: string, params: any = {}): Promise<any> {
        const response = await fetchWithTimeout(this.url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method,
                params,
                id: Math.floor(Math.random() * 1000000)
            })
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`MCP request failed: ${response.status} ${response.statusText} ${errBody}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(`MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        return data.result;
    }

    async getTools(options: HaMcpRequestOptions = {}): Promise<FunctionDeclaration[]> {
        if (this.apiMode === 'rest') {
            return this.getToolsViaRest(options);
        }
        try {
            if (!options.silent) {
                console.log('[HA MCP] Fetching tools from:', this.url);
            }
            const result: MCPListToolsResponse = await this.request('tools/list');
            if (!options.silent) {
                console.log('[HA MCP] Fetched tools:', result.tools?.length || 0);
            }
            const filteredTools = (result.tools || []).filter((tool) =>
                isSupportedHomeAssistantTool(tool.name || ''),
            );
            if (!options.silent) {
                console.log('[HA MCP] Kept', filteredTools.length, 'of', result.tools?.length || 0, 'tools');
                console.log('[HA MCP] Tool names:', filteredTools.map(t => t.name).join(', '));
            }
            return filteredTools.map(tool => this.mapMCPToolToGemini(tool));
        } catch (error) {
            if (!options.silent) {
                console.error('[HA MCP] Failed to get tools:', error);
            }
            return [];
        }
    }

    /** REST API tool discovery — builds Gemini function declarations from /api/services */
    private async getToolsViaRest(options: HaMcpRequestOptions = {}): Promise<FunctionDeclaration[]> {
        try {
            const apiUrl = `${this.getBaseUrl()}/api/services`;
            if (!options.silent) console.log('[HA REST] Fetching services from:', apiUrl);

            const res = await fetchWithTimeout(apiUrl, {
                headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`REST /api/services failed: ${res.status}`);

            const domains: Array<{ domain: string; services: Record<string, { name?: string; description?: string; fields?: Record<string, any> }> }> = await res.json();

            const tools: FunctionDeclaration[] = [];
            for (const domainEntry of domains) {
                for (const [serviceName, serviceInfo] of Object.entries(domainEntry.services)) {
                    const fullName = `${domainEntry.domain}.${serviceName}`;
                    if (!isSupportedHomeAssistantTool(fullName)) continue;

                    const properties: Record<string, any> = {
                        entity_id: { type: Type.STRING, description: 'Entity ID or friendly name of the device' },
                    };

                    // Add service-specific fields
                    if (serviceInfo.fields) {
                        for (const [fieldName, fieldInfo] of Object.entries(serviceInfo.fields as Record<string, any>)) {
                            if (fieldName === 'entity_id') continue;
                            properties[fieldName] = {
                                type: Type.STRING,
                                description: fieldInfo.description || fieldName,
                            };
                            if (fieldInfo.selector?.number) {
                                properties[fieldName].type = Type.NUMBER;
                            }
                            if (fieldInfo.selector?.boolean) {
                                properties[fieldName].type = Type.BOOLEAN;
                            }
                        }
                    }

                    // Ensure light.turn_on always has brightness & color params
                    // even if HA's /api/services response omits field metadata
                    if (domainEntry.domain === 'light' && serviceName === 'turn_on') {
                        if (!properties.brightness) {
                            properties.brightness = { type: Type.NUMBER, description: 'Brightness value 0-255' };
                        }
                        if (!properties.rgb_color) {
                            properties.rgb_color = { type: Type.STRING, description: 'RGB color as comma-separated values e.g. "255,0,0" for red' };
                        }
                        if (!properties.color_temp_kelvin) {
                            properties.color_temp_kelvin = { type: Type.NUMBER, description: 'Color temperature in Kelvin (2000-6500)' };
                        }
                        if (!properties.hs_color) {
                            properties.hs_color = { type: Type.STRING, description: 'Hue/Saturation color as "hue,saturation" e.g. "300,100" for magenta' };
                        }
                    }

                    tools.push({
                        name: `homeassistant__${domainEntry.domain}__${serviceName}`,
                        description: serviceInfo.description || `Call ${fullName} on Home Assistant`,
                        parameters: { type: Type.OBJECT, properties },
                    });
                }
            }

            if (!options.silent) console.log('[HA REST] Built', tools.length, 'tools from services');
            return tools;
        } catch (error) {
            if (!options.silent) console.error('[HA REST] Failed to get tools:', error);
            return [];
        }
    }

    /**
     * Calls HA's /api/template endpoint to resolve friendly area names for every
     * entity in one round-trip. Returns a map of entity_id -> area friendly name.
     * Entities with no assigned area are omitted from the map.
     *
     * This is necessary because /api/states only surfaces area_id when it's set
     * directly on the entity. Most entities inherit their area from their parent
     * device, which isn't reflected in the state object.
     */
    private async fetchEntityAreaMap(options: HaMcpRequestOptions = {}): Promise<Map<string, string>> {
        const apiUrl = `${this.getBaseUrl()}/api/template`;
        // Produces lines like: light.kitchen_ceiling|Kitchen
        // Entities without an area are filtered out by the Jinja expression.
        const template =
            "{% for s in states %}" +
            "{% set a = area_name(s.entity_id) %}" +
            "{% if a %}{{ s.entity_id }}|{{ a }}\n{% endif %}" +
            "{% endfor %}";

        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                'Accept': 'text/plain, application/json',
            },
            body: JSON.stringify({ template }),
        });

        if (!response.ok) {
            throw new Error(`REST /api/template failed: ${response.status}`);
        }

        const text = await response.text();
        const map = new Map<string, string>();
        for (const line of text.split('\n')) {
            const sep = line.indexOf('|');
            if (sep <= 0) continue;
            const entityId = line.slice(0, sep).trim();
            const areaName = line.slice(sep + 1).trim();
            if (entityId && areaName) {
                map.set(entityId, areaName);
            }
        }
        if (!options.silent) {
            console.log(`[HA MCP] Resolved areas for ${map.size} entities via template API`);
        }
        return map;
    }

    /**
     * Fetches all HA entities via the REST API (/api/states).
     * Populates entityCache AND entityMap for deep optimization.
     */
    async listEntities(options: HaMcpRequestOptions = {}): Promise<HAEntity[]> {
        try {
            const apiUrl = `${this.getBaseUrl()}/api/states`;

            if (!options.silent) {
                console.log('[HA MCP] Fetching entities from REST API:', apiUrl);
            }
            const response = await fetchWithTimeout(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`REST /api/states failed: ${response.status} ${response.statusText}`);
            }

            const states: any[] = await response.json();
            const allEntities = states
                .map((state) => this.mapStateToEntity(state))
                .filter((entity): entity is HAEntity => Boolean(entity));

            // Enrich entities with friendly area names from HA's area registry
            // (the /api/states response only includes area_id when set directly
            // on the entity -- devices with area_id assigned at the device level
            // show up as "No Area" without this enrichment).
            try {
                const areaMap = await this.fetchEntityAreaMap(options);
                if (areaMap.size > 0) {
                    for (const entity of allEntities) {
                        const friendly = areaMap.get(entity.entity_id);
                        if (friendly) {
                            entity.area = friendly;
                            entity._normArea = normalize(friendly);
                            entity._wordSet = new Set([
                                ...wordSet(entity._normName || ''),
                                ...wordSet(entity._normSuffix || ''),
                                ...wordSet(entity._normArea),
                            ]);
                        }
                    }
                }
            } catch (areaError) {
                if (!options.silent) {
                    console.warn('[HA MCP] Area enrichment failed (non-fatal):', areaError);
                }
            }

            // Apply user's entity exclusion filter
            const { getHaExcludedEntities } = await import('../utils/settingsStorage');
            const excluded = getHaExcludedEntities();
            this.entityCache = excluded.size > 0
                ? allEntities.filter(e => !excluded.has(e.entity_id))
                : allEntities;

            // Store the full unfiltered list for the settings UI
            this._allEntities = allEntities;
             
            // Build fast lookup map across the common entity_id text forms the model may emit.
            this.entityMap = new Map();
            this.entityCache.forEach((entity) => {
                [entity.entity_id, entity.entity_id.toLowerCase(), normalize(entity.entity_id)].forEach((key) => {
                    if (key) {
                        this.entityMap.set(key, entity);
                    }
                });
            });

            if (!options.silent) {
                console.log(`[HA MCP] Cached ${this.entityCache.length} entities via REST /api/states`);
            }
            return this.entityCache;
        } catch (error) {
            if (!options.silent) {
                console.warn('[HA MCP] REST entity fetch failed (non-fatal):', error);
            }
            return [];
        }
    }

    async refreshEntityState(
        entityId: string,
        options: HaMcpRequestOptions = {},
    ): Promise<HAEntity | null> {
        if (!entityId) {
            return null;
        }

        try {
            const apiUrl = `${this.getBaseUrl()}/api/states/${encodeURIComponent(entityId)}`;
            const response = await fetchWithTimeout(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                if (!options.silent) {
                    console.warn(`[HA MCP] Failed to refresh entity ${entityId}: ${response.status}`);
                }
                return null;
            }

            const state = await response.json();
            const entity = this.mapStateToEntity(state);
            return entity ? this.cacheEntity(entity) : null;
        } catch (error) {
            if (!options.silent) {
                console.warn(`[HA MCP] Failed to refresh entity ${entityId}:`, error);
            }
            return null;
        }
    }

    async refreshEntities(
        entityIds: string[],
        options: HaMcpRequestOptions = {},
    ): Promise<HAEntity[]> {
        const uniqueIds = Array.from(new Set(entityIds.filter(Boolean)));
        if (uniqueIds.length === 0) {
            return [];
        }

        const refreshed = await Promise.all(
            uniqueIds.map((entityId) =>
                this.refreshEntityState(entityId, { silent: options.silent ?? true }),
            ),
        );

        return refreshed.filter((entity): entity is HAEntity => Boolean(entity));
    }

    private extractEntityIdsFromArgs(args: any): string[] {
        const resolvedIds = new Set<string>();
        const targetEntityIds = args?.target?.entity_id;

        const candidates = [
            args?.entity_id,
            args?.entity_ids,
            Array.isArray(targetEntityIds) ? targetEntityIds : targetEntityIds ? [targetEntityIds] : [],
        ];

        candidates.forEach((candidate) => {
            if (Array.isArray(candidate)) {
                candidate.forEach((entityId) => {
                    if (typeof entityId === 'string' && entityId) {
                        resolvedIds.add(entityId);
                    }
                });
                return;
            }

            if (typeof candidate === 'string' && candidate) {
                resolvedIds.add(candidate);
            }
        });

        return [...resolvedIds];
    }

    private classifyToolError(message: string): HomeAssistantActionStatus {
        const lower = message.toLowerCase();
        if (
            lower.includes('matchfailed') ||
            lower.includes('device not found') ||
            lower.includes('no match') ||
            lower.includes('could not find') ||
            lower.includes('ambiguous device match')
        ) {
            return 'no_match';
        }

        if (
            lower.includes('not supported') ||
            lower.includes('validation error') ||
            lower.includes('unknown service')
        ) {
            return 'unsupported';
        }

        return 'error';
    }

    /**
     * Call an HA tool with automatic fuzzy entity resolution.
     */
    async callTool(name: string, args: any): Promise<any> {
        const toolName = extractHomeAssistantToolName(name);
        const normalizedToolName = normalizeHomeAssistantToolName(name);
        let resolvedEntityIds: string[] = [];
        try {
            console.group(`[HA MCP] Tool Call: ${name}`);
            
            const parts = name.split('__');
            const toolDomain = parts.length >= 3 ? parts[1] : undefined;
            const preferredDomain = inferPreferredDomain(args, toolDomain);
            if (preferredDomain) console.log(`[HA MCP] Using domain hint: "${preferredDomain}"`);

            const haName = toolName;
            const resolvedArgs = this.resolveEntityIds(args, preferredDomain);
            resolvedEntityIds = this.extractEntityIdsFromArgs(resolvedArgs);

            // Parse comma-separated color values into arrays for HA
            if (typeof resolvedArgs.rgb_color === 'string') {
                resolvedArgs.rgb_color = resolvedArgs.rgb_color.split(',').map((v: string) => parseInt(v.trim(), 10));
            }
            if (typeof resolvedArgs.hs_color === 'string') {
                resolvedArgs.hs_color = resolvedArgs.hs_color.split(',').map((v: string) => parseFloat(v.trim()));
            }

            console.group(`[HA] Calling Tool: ${haName}`);
            console.log('Original Args:', args);
            console.log('Resolved Args:', resolvedArgs);
            
            let result: any;
            if (this.apiMode === 'rest') {
                result = await this.callToolViaRest(haName, resolvedArgs);
            } else {
                result = await this.request('tools/call', {
                    name: haName,
                    arguments: resolvedArgs
                });
            }
            const refreshedEntities = await this.refreshEntities(resolvedEntityIds, { silent: true });
            
            console.log('Result:', result);
            
            // If the result is null/empty but no exception was thrown, HA succeeded
            if (!result || (Array.isArray(result.content) && result.content.length === 0)) {
                console.groupEnd();
                console.groupEnd();
                return {
                    content: [{ type: 'text', text: `Successfully called ${haName}.` }],
                    isError: false,
                    __curio: {
                        status: 'success',
                        resolvedEntityIds,
                        refreshedEntities,
                        toolName: normalizedToolName,
                    } satisfies HomeAssistantToolMeta,
                };
            }

            console.groupEnd();
            console.groupEnd();
            return {
                ...result,
                __curio: {
                    status: 'success',
                    resolvedEntityIds,
                    refreshedEntities,
                    toolName: normalizedToolName,
                } satisfies HomeAssistantToolMeta,
            };
        } catch (error) {
            const message = (error as Error).message;
            console.error(`[HA MCP] Failed to call tool ${name}:`, error);
            console.groupEnd();
            console.groupEnd();
            return {
                error: message,
                __curio: {
                    status: this.classifyToolError(message),
                    resolvedEntityIds,
                    refreshedEntities: [],
                    toolName: normalizedToolName,
                    message,
                } satisfies HomeAssistantToolMeta,
            };
        }
    }

    /** REST API tool call — POST /api/services/{domain}/{service} */
    private async callToolViaRest(toolName: string, args: any): Promise<any> {
        // toolName is like "light.turn_on" or "homeassistant.turn_on"
        const parts = toolName.split('.');
        if (parts.length < 2) throw new Error(`Invalid tool name: ${toolName}`);
        const domain = parts[0];
        const service = parts.slice(1).join('.');

        const apiUrl = `${this.getBaseUrl()}/api/services/${domain}/${service}`;
        const body: any = {};

        // Map entity_id to the format HA REST API expects
        if (args.entity_id) {
            body.entity_id = args.entity_id;
        }
        // Copy other args (brightness, color_temp, etc.)
        for (const [key, val] of Object.entries(args)) {
            if (key !== 'entity_id' && key !== 'name') {
                body[key] = val;
            }
        }

        // Parse comma-separated color values into arrays for HA
        if (typeof body.rgb_color === 'string') {
            body.rgb_color = body.rgb_color.split(',').map((v: string) => parseInt(v.trim(), 10));
        }
        if (typeof body.hs_color === 'string') {
            body.hs_color = body.hs_color.split(',').map((v: string) => parseFloat(v.trim()));
        }

        const res = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`REST service call failed: ${res.status} ${res.statusText} ${errBody}`);
        }

        const data = await res.json();
        return {
            content: [{ type: 'text', text: `Successfully called ${domain}.${service}.` }],
            isError: false,
            _restResult: data,
        };
    }

    private resolveEntityIds(args: any, preferredDomain?: string): any {
        if (!args || typeof args !== 'object') return args;
        const resolved = { ...args };
        const fields = ['entity_id', 'entity_ids', 'target'];
        
        // 1. Resolve identified common entity fields
        fields.forEach(field => {
            const val = resolved[field];
            if (typeof val === 'string') {
                resolved[field] = this.resolveOneEntityId(val, preferredDomain);
            } else if (Array.isArray(val)) {
                resolved[field] = val.map((id: any) => 
                    typeof id === 'string' ? this.resolveOneEntityId(id, preferredDomain) : id
                );
            } else if (typeof val === 'object' && val !== null && (val as any).entity_id) {
                const target = { ...val } as any;
                target.entity_id = Array.isArray(target.entity_id)
                    ? target.entity_id.map((id: string) => this.resolveOneEntityId(id, preferredDomain))
                    : this.resolveOneEntityId(target.entity_id, preferredDomain);
                resolved[field] = target;
            }
        });

        // 2. Cross-pollinate entity_id and target for maximum HA compatibility
        // Only add target wrapper in REST mode — MCP tools don't use it
        if (this.apiMode === 'rest') {
            if (resolved.entity_id && !resolved.target) {
                resolved.target = { entity_id: Array.isArray(resolved.entity_id) ? resolved.entity_id : [resolved.entity_id] };
            } else if (resolved.target?.entity_id && !resolved.entity_id) {
                resolved.entity_id = Array.isArray(resolved.target.entity_id) ? resolved.target.entity_id[0] : resolved.target.entity_id;
            }
        }

        // 3. Fallback for 'name' field (used by HassTurnOn etc.)
        if (typeof resolved.name === 'string' && !resolved.entity_id) {
            const groupedEntities = isGroupDeviceRequest(resolved.name, preferredDomain)
                ? selectGroupedEntities(resolved.name, this.entityCache, preferredDomain)
                : [];
            if (groupedEntities.length > 0) {
                const groupedEntityIds = groupedEntities.map((entity) => entity.entity_id);
                console.log(`[HA MCP] Resolved grouped name "${resolved.name}" -> entity_ids ${JSON.stringify(groupedEntityIds)}`);
                resolved.entity_ids = groupedEntityIds;
                resolved.entity_id = groupedEntityIds[0];
                if (this.apiMode === 'rest') {
                    resolved.target = { entity_id: groupedEntityIds };
                }
                resolved.name = groupedEntities.map((entity) => entity.name).join(', ');
                return resolved;
            }

            const ambiguousCandidates = findAmbiguousEntities(resolved.name, this.entityCache, preferredDomain);
            if (ambiguousCandidates.length > 1) {
                const matches = ambiguousCandidates
                    .map((entity) => `${entity.name} (${entity.entity_id})`)
                    .join(', ');
                throw new Error(`Ambiguous device match for "${resolved.name}": ${matches}`);
            }

            const best = findBestEntity(resolved.name, this.entityCache, preferredDomain);
            if (best) {
                console.log(`[HA MCP] Resolved name "${resolved.name}" → entity_id "${best.entity_id}" (${best.name})`);
                resolved.entity_id = best.entity_id;
                resolved.name = best.name;
                // Also ensure target is updated for REST mode
                if (this.apiMode === 'rest' && !resolved.target) resolved.target = { entity_id: [best.entity_id] };
            }
        }
        return resolved;
    }

    private resolveOneEntityId(query: string, preferredDomain?: string): string {
        for (const candidateKey of [query, query.toLowerCase().trim(), normalize(query)]) {
            const exact = this.entityMap.get(candidateKey);
            if (exact) return exact.entity_id;
        }

        if (!query.includes('.') && preferredDomain) {
            for (const candidateKey of [
                `${preferredDomain}.${query}`,
                `${preferredDomain}.${query}`.toLowerCase(),
                normalize(`${preferredDomain}.${query}`),
            ]) {
                const prefixedMatch = this.entityMap.get(candidateKey);
                if (prefixedMatch) return prefixedMatch.entity_id;
            }
        }

        const ambiguousCandidates = findAmbiguousEntities(query, this.entityCache, preferredDomain);
        if (ambiguousCandidates.length > 1) {
            const matches = ambiguousCandidates
                .map((entity) => `${entity.name} (${entity.entity_id})`)
                .join(', ');
            throw new Error(`Ambiguous device match for "${query}": ${matches}`);
        }

        const best = findBestEntity(query, this.entityCache, preferredDomain);
        if (best) {
            const bestScore = fuzzyScore(query, best, preferredDomain);
            if (bestScore < 50) {
                console.warn(`[HA MCP] Low-confidence match: "${query}" → "${best.entity_id}" (score: ${bestScore}). Consider asking user for clarification.`);
            }
            console.log(`[HA MCP] Resolved "${query}" → "${best.entity_id}" (${best.name}) [Score: ${bestScore}]`);
            return best.entity_id;
        }
        return query;
    }

    private mapMCPToolToGemini(tool: MCPTool): FunctionDeclaration {
        const mapProperties = (schema: any): any => {
            if (!schema || !schema.properties) return {};
            const properties: any = {};
            for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
                const GeminiType = this.mapMCPTypeToGemini(prop.type);
                properties[key] = {
                    type: GeminiType,
                    description: prop.description || ''
                };
                if (GeminiType === Type.ARRAY && prop.items) {
                    properties[key].items = {
                        type: this.mapMCPTypeToGemini(prop.items.type || 'string'),
                        description: prop.items.description || ''
                    };
                }
                if (GeminiType === Type.OBJECT && prop.properties) {
                    properties[key].properties = mapProperties(prop);
                }
                if (prop.enum) {
                    properties[key].enum = prop.enum;
                }
            }
            return properties;
        };

        const rawName = tool.name ?? 'unknown';
        return {
            name: `homeassistant__${rawName.replace(/\./g, '__')}`,
            description: tool.description || `Call ${rawName} tool from Home Assistant`,
            parameters: {
                type: Type.OBJECT,
                properties: mapProperties(tool.inputSchema),
                required: tool.inputSchema?.required || []
            }
        };
    }

    private mapMCPTypeToGemini(mcpType: string | string[]): Type {
        const primaryType = Array.isArray(mcpType) ? mcpType[0] : mcpType;
        switch (primaryType) {
            case 'string':  return Type.STRING;
            case 'number':  return Type.NUMBER;
            case 'integer': return Type.INTEGER;
            case 'boolean': return Type.BOOLEAN;
            case 'array':   return Type.ARRAY;
            case 'object':  return Type.OBJECT;
            default:        return Type.STRING;
        }
    }
}

export interface PreparedHomeAssistantMcpSession {
    cacheKey: string;
    client: HomeAssistantMCPClient;
    tools: FunctionDeclaration[];
    toolNames: string[];
    entities: HAEntity[];
    instructionSuffix: string;
}

type HaMcpRequestOptions = {
    silent?: boolean;
};

let preparedHomeAssistantSessionKey: string | null = null;
let preparedHomeAssistantSessionPromise: Promise<PreparedHomeAssistantMcpSession> | null = null;
let preparedHomeAssistantSessionTimestamp: number = 0;
const HA_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const buildPreparedHomeAssistantSessionKey = (url: string, token: string) => {
    const normalizedUrl = url.endsWith('/api/mcp') ? url : `${url.replace(/\/$/, '')}/api/mcp`;
    return `${normalizedUrl}::${token}`;
};

export const buildHomeAssistantInstructionSuffix = (
    tools: FunctionDeclaration[],
    entities: HAEntity[],
): string => {
    const CONTROLLABLE_DOMAINS = new Set([
        'light',
        'switch',
        'fan',
        'lock',
        'cover',
        'media_player',
        'input_boolean',
        'climate',
    ]);
    
    const controllable = entities.filter(e => CONTROLLABLE_DOMAINS.has(e.domain));
    // Only include temperature and humidity sensors
    const sensors = entities.filter(e => 
        e.domain === 'sensor' && 
        (e.entity_id.includes('temperature') || e.entity_id.includes('humidity') || 
         e.name.toLowerCase().includes('temperature') || e.name.toLowerCase().includes('humidity'))
    );
    
    const allRelevant = [...controllable, ...sensors];
    
    const byDomain: Record<string, HAEntity[]> = {};
    allRelevant.forEach(e => {
        if (!byDomain[e.domain]) byDomain[e.domain] = [];
        byDomain[e.domain].push(e);
    });

    // Keep the prompt compact on embedded devices.
    const listing = Object.entries(byDomain)
        .map(([domain, ents]) => {
            const limit = domain === 'light' ? 20 : 5;
            const items = ents.slice(0, limit).map(e => `${e.name}=${e.entity_id}`).join(', ');
            const extra = ents.length > limit ? ` +${ents.length - limit} more` : '';
            return `${domain}: ${items}${extra}`;
        })
        .join('\n');

    return `
[HA DEVICES — device control only, NOT for weather/news/scores/recipes]
Tools: ${tools.length}. Prefer generic HA power tools when available; otherwise use the matching domain tool by exact name.
For lights: use light.turn_on with brightness (0-255), rgb_color ("R,G,B" e.g. "255,0,0"), color_temp_kelvin (2000-6500), or hs_color ("hue,sat").
${listing || '(no devices)'}`;
};

export const resetPreparedHomeAssistantMcpSession = (): void => {
    preparedHomeAssistantSessionKey = null;
    preparedHomeAssistantSessionPromise = null;
    preparedHomeAssistantSessionTimestamp = 0;
};

export const prepareHomeAssistantMcpSession = (
    url: string,
    token: string,
    options: HaMcpRequestOptions & { apiMode?: 'mcp' | 'rest' } = {},
): Promise<PreparedHomeAssistantMcpSession> => {
    const apiMode = options.apiMode || 'rest';
    const cacheKey = buildPreparedHomeAssistantSessionKey(url, token) + ':' + apiMode;
    const now = Date.now();
    const cacheValid =
        preparedHomeAssistantSessionPromise &&
        preparedHomeAssistantSessionKey === cacheKey &&
        (now - preparedHomeAssistantSessionTimestamp) < HA_SESSION_TTL_MS;

    if (cacheValid) {
        return preparedHomeAssistantSessionPromise!;
    }

    preparedHomeAssistantSessionKey = cacheKey;
    preparedHomeAssistantSessionTimestamp = now;
    preparedHomeAssistantSessionPromise = (async () => {
        const client = new HomeAssistantMCPClient(url, token, apiMode);
        const [tools, entities] = await Promise.all([
            client.getTools(options),
            client.listEntities(options),
        ]);

        if (!tools.length) {
            throw new Error('No Home Assistant tools were returned.');
        }

        return {
            cacheKey,
            client,
            tools,
            toolNames: tools
                .map((tool) => extractHomeAssistantToolName(tool.name || ''))
                .filter(Boolean),
            entities,
            instructionSuffix: buildHomeAssistantInstructionSuffix(tools, entities),
        };
    })().catch((error) => {
        if (preparedHomeAssistantSessionKey === cacheKey) {
            resetPreparedHomeAssistantMcpSession();
        }
        throw error;
    });

    return preparedHomeAssistantSessionPromise;
};

/**
 * Convenience helper that encapsulates the repeated boilerplate of
 * checking HA settings → getting token → calling prepareHomeAssistantMcpSession.
 *
 * Returns the prepared session, or `null` when HA is not configured/enabled.
 * Callers no longer need to individually import `getHaMcpUrl`, `getHaMcpEnabled`,
 * `getHaMcpTokenAsync`, or `getHaApiMode`.
 *
 * The underlying `prepareHomeAssistantMcpSession` already caches the result
 * with a 5-minute TTL, so repeated calls are cheap.
 */
export const getHaPreparedSession = async (
    options: HaMcpRequestOptions = {},
): Promise<PreparedHomeAssistantMcpSession | null> => {
    const { getHaMcpEnabled, getHaMcpUrl, getHaMcpTokenAsync, getHaApiMode } =
        await import('../utils/settingsStorage');

    if (!getHaMcpEnabled() || !getHaMcpUrl()) return null;

    const token = await getHaMcpTokenAsync();
    if (!token) return null;

    return prepareHomeAssistantMcpSession(
        getHaMcpUrl(),
        token,
        { ...options, silent: options.silent ?? true, apiMode: getHaApiMode() },
    );
};
