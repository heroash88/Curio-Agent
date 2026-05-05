/**
 * Entity resolution for device/camera/thermostat cards using HA entity cache.
 */

import type { CardEvent, DeviceCardData, CameraCardData, ThermostatCardData } from '../cardTypes';

/**
 * Resolve entity IDs for device/camera/thermostat cards using the HA entity cache.
 * Call this after analyzeTranscript returns a device/camera/thermostat card event
 * to fill in the entityId field via fuzzy matching.
 */
export function resolveCardEntityId(
    event: CardEvent,
    entityCache: Array<{ entity_id: string; name: string; domain: string; state?: string; area?: string }>,
): CardEvent {
    if (!event || !entityCache.length) return event;

    if (event.type === 'device') {
        const data = event.data as unknown as DeviceCardData;
        if (data.entityId) return event;

        // Pre-filter to the detected domain and closely related domains
        // to prevent cross-domain mismatches (e.g., a light matching a camera)
        const RELATED_DOMAINS: Record<string, string[]> = {
            light: ['light'],
            switch: ['switch'],
            fan: ['fan'],
            lock: ['lock'],
            cover: ['cover'],
            media_player: ['media_player'],
            vacuum: ['vacuum'],
            climate: ['climate'],
            sensor: ['sensor'],
        };
        const allowedDomains = RELATED_DOMAINS[data.domain] || [data.domain];
        const domainEntities = entityCache.filter(e => allowedDomains.includes(e.domain));
        // Fall back to full cache only if no domain-specific entities exist
        const searchEntities = domainEntities.length > 0 ? domainEntities : entityCache;

        const resolved = fuzzyMatchEntity(data.friendlyName, data.domain, searchEntities);
        if (resolved) {
            return {
                ...event,
                data: {
                    ...event.data,
                    entityId: resolved.entity_id,
                    friendlyName: resolved.name || data.friendlyName,
                    domain: resolved.domain || data.domain,
                    state: resolved.state || data.state,
                } as unknown as Record<string, unknown>,
            };
        }
    }

    if (event.type === 'camera') {
        const data = event.data as unknown as CameraCardData;
        if (data.entityId) return event;

        // Only match camera entities -- never resolve a non-camera as a camera
        const cameraEntities = entityCache.filter(e => e.domain === 'camera');
        const resolved = fuzzyMatchEntity(data.cameraName, 'camera', cameraEntities);
        if (resolved) {
            const allCameras = cameraEntities
                .map(e => ({ entity_id: e.entity_id, name: e.name }));

            return {
                ...event,
                data: {
                    ...event.data,
                    entityId: resolved.entity_id,
                    cameraName: resolved.name || data.cameraName,
                    cameras: allCameras.length > 1 ? allCameras : undefined,
                } as unknown as Record<string, unknown>,
            };
        }
    }

    if (event.type === 'thermostat') {
        const data = event.data as unknown as ThermostatCardData;
        if (data.entityId) return event;

        // Only match climate entities
        const climateEntities = entityCache.filter(e => e.domain === 'climate');
        const resolved = fuzzyMatchEntity(data.name, 'climate', climateEntities);
        if (resolved) {
            return {
                ...event,
                data: {
                    ...event.data,
                    entityId: resolved.entity_id,
                    name: resolved.name || data.name,
                } as unknown as Record<string, unknown>,
            };
        }
    }

    return event;
}

/**
 * Simple fuzzy matching for entity resolution.
 * Uses token overlap scoring -- self-contained so the transcript analyzer
 * has no hard dependency on the MCP service module.
 */
function fuzzyMatchEntity(
    query: string,
    preferredDomain: string,
    entities: Array<{ entity_id: string; name: string; domain: string; state?: string; area?: string }>,
): { entity_id: string; name: string; domain: string; state?: string } | null {
    if (!query || !entities.length) return null;

    const normalizeStr = (s: string) => s.toLowerCase().replace(/[_\-.'']/g, ' ').replace(/\s+/g, ' ').trim();
    const tokenize = (s: string) => normalizeStr(s).split(' ').filter(t => t.length > 1);

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return null;

    let bestEntity: (typeof entities)[number] | null = null;
    let bestScore = 0;

    for (const entity of entities) {
        let score = 0;

        const normName = normalizeStr(entity.name);
        const normSuffix = normalizeStr(entity.entity_id.replace(/^[^.]+\./, ''));
        const normArea = normalizeStr(entity.area || '');
        const normQuery = normalizeStr(query);

        // Exact match
        if (normQuery === normName || normQuery === normSuffix) {
            score = 100;
        } else {
            // Substring match
            if (normName.includes(normQuery) || normSuffix.includes(normQuery)) score = 85;
            else if (normQuery.includes(normName) || normQuery.includes(normSuffix)) score = 80;

            // Token overlap
            if (score === 0) {
                const targetTokens = new Set([...tokenize(entity.name), ...tokenize(normSuffix), ...tokenize(normArea)]);
                const hits = queryTokens.filter(qt =>
                    [...targetTokens].some(tt => tt === qt || tt.startsWith(qt) || qt.startsWith(tt))
                );
                const ratio = hits.length / queryTokens.length;
                if (ratio >= 0.5) {
                    score = Math.round(40 + ratio * 40);
                }
            }
        }

        // Domain boost
        if (entity.domain === preferredDomain) score += 20;
        else score -= 10;

        // Area match boost
        if (normArea && queryTokens.some(qt => normalizeStr(normArea).includes(qt))) {
            score += 15;
        }

        if (score > bestScore) {
            bestScore = score;
            bestEntity = entity;
        }
    }

    // Minimum confidence threshold
    if (bestScore < 40 || !bestEntity) return null;

    return bestEntity;
}
