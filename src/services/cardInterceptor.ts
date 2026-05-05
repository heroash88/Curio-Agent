import type {
    CardEvent,
    DeviceCardData,
    MediaCardData,
} from './cardTypes';
import type {
    HAEntity,
    HomeAssistantActionStatus,
    HomeAssistantToolMeta,
} from './haMcpService';
import {
    getDeviceControlKind,
    getSupportedDeviceActions,
    getSupportedMediaActions,
} from './haWidgetSupport';

const NON_ACTIONABLE_PATTERNS = [
    'get_state', 'get_live_context', 'get_history', 'get_config',
    'get_entities', 'get_services', 'list_', 'search', 'check_',
    'get_attributes', 'render_template', 'get_error_log',
    'getlivecontext', 'getstate', 'gethistory', 'getconfig',
    'assist_search', 'assist.search', 'conversation', 'query',
];

export interface HomeAssistantToolOutcome {
    status: HomeAssistantActionStatus;
    entityId?: string;
    entity?: HAEntity;
    cardType?: 'device' | 'media';
    cardData?: DeviceCardData | MediaCardData;
    error?: string;
}

function isNonActionable(service: string): boolean {
    const lower = service.toLowerCase();
    return NON_ACTIONABLE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isNonActionableName(fullName: string): boolean {
    const lower = fullName.toLowerCase();
    return lower.includes('search') || lower.includes('query') || lower.includes('conversation_process');
}

function extractToolMeta(result: any): HomeAssistantToolMeta | null {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return null;
    }

    const meta = (result as { __curio?: HomeAssistantToolMeta }).__curio;
    return meta ?? null;
}

function extractEntityId(args: any, meta: HomeAssistantToolMeta | null): string | undefined {
    if (meta?.resolvedEntityIds?.length === 1) {
        return meta.resolvedEntityIds[0];
    }

    const entityId = args?.entity_id || args?.target?.entity_id?.[0] || args?.target?.entity_id;
    return Array.isArray(entityId) ? entityId[0] : entityId || undefined;
}

function extractError(result: any): string | undefined {
    if (result?.error) {
        return typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
    }

    if (result?.isError && result?.content) {
        const textContent = Array.isArray(result.content)
            ? result.content.find((content: any) => content.type === 'text')?.text
            : typeof result.content === 'string' ? result.content : undefined;
        if (textContent) return textContent;
    }

    if (result?.content && Array.isArray(result.content)) {
        const textContent = result.content.find((content: any) => content.type === 'text')?.text || '';
        if (
            textContent.includes('Error') ||
            textContent.includes('MatchFailed') ||
            textContent.includes('error')
        ) {
            return textContent;
        }
    }

    return undefined;
}

function findEntityById(entityId: string | undefined, entityCache: HAEntity[]): HAEntity | undefined {
    if (!entityId) {
        return undefined;
    }

    return entityCache.find((entity) => entity.entity_id === entityId)
        || entityCache.find((entity) => entity.entity_id.toLowerCase() === entityId.toLowerCase());
}

function inferDomain(name: string, service: string, entity?: HAEntity): string {
    if (entity?.domain) {
        return entity.domain;
    }

    const parts = name.split('__');
    const rawDomain = parts.length >= 3 ? parts[1] : 'unknown';
    const lowerService = service.toLowerCase();

    if (rawDomain !== 'unknown' && rawDomain !== 'homeassistant') {
        return rawDomain;
    }

    if (lowerService.includes('light')) return 'light';
    if (lowerService.includes('switch')) return 'switch';
    if (lowerService.includes('climate')) return 'climate';
    if (lowerService.includes('cover')) return 'cover';
    if (lowerService.includes('media') || lowerService.includes('player')) return 'media_player';
    if (lowerService.includes('fan')) return 'fan';
    if (lowerService.includes('lock')) return 'lock';
    if (lowerService.includes('vacuum')) return 'vacuum';

    return rawDomain;
}

function resolveState(action: string, resultState?: string, entityState?: string): string {
    if (resultState) return resultState;
    if (entityState) return entityState;
    if (action.includes('On')) return 'on';
    if (action.includes('Off')) return 'off';
    if (action === 'Locked') return 'locked';
    if (action === 'Unlocked') return 'unlocked';
    if (action === 'Opened') return 'open';
    if (action === 'Closed') return 'closed';
    return 'ok';
}

export function analyzeHomeAssistantToolCall(
    name: string,
    args: any,
    result: any,
    entityCache: HAEntity[],
): HomeAssistantToolOutcome {
    if (!name.startsWith('homeassistant__')) {
        return { status: 'non_actionable' };
    }

    if (isNonActionableName(name)) {
        return { status: 'non_actionable' };
    }

    const parts = name.split('__');
    const service = parts.length >= 3 ? parts.slice(2).join('.') : parts.slice(1).join('.');

    if (isNonActionable(service)) {
        return { status: 'non_actionable' };
    }

    const meta = extractToolMeta(result);
    if (meta?.status && meta.status !== 'success') {
        return {
            status: meta.status,
            error: meta.message || extractError(result),
        };
    }

    const error = extractError(result);
    if (error) {
        return {
            status: meta?.status ?? 'error',
            error,
        };
    }

    if (meta?.resolvedEntityIds && meta.resolvedEntityIds.length > 1) {
        return { status: 'unsupported' };
    }

    const entityId = extractEntityId(args, meta);
    const nameArg = args?.name || '';
    if (!entityId) {
        return { status: 'no_match' };
    }

    const refreshedEntity = entityId
        ? meta?.refreshedEntities?.find((entity) => entity.entity_id === entityId)
        : undefined;
    const cacheEntity = findEntityById(entityId, entityCache);
    const entity = refreshedEntity || cacheEntity;

    const action = describeAction(service, args);
    const entityDomain = inferDomain(name, service, entity);
    const friendlyName = entity?.name || nameArg || entityId || 'Device';
    const resolvedState = resolveState(action, result?.state, entity?.state);

    if (entityDomain === 'media_player') {
        const data: MediaCardData = {
            entityId: entity?.entity_id || entityId || '',
            playerName: friendlyName,
            playbackState: inferPlaybackState(service, resolvedState),
            trackTitle: result?.media_title || args?.media_content_id,
            artistName: result?.media_artist,
            supportedActions: getSupportedMediaActions(),
        };

        return {
            status: 'success',
            entityId: data.entityId,
            entity,
            cardType: 'media',
            cardData: data,
        };
    }

    const data: DeviceCardData = {
        entityId: entity?.entity_id || entityId || '',
        friendlyName,
        domain: entityDomain,
        action,
        state: resolvedState,
        resolvedState,
        controlKind: getDeviceControlKind(entityDomain),
        supportedActions: getSupportedDeviceActions(entityDomain),
        error: undefined,
    };

    return {
        status: 'success',
        entityId: data.entityId,
        entity,
        cardType: 'device',
        cardData: data,
    };
}

export function interceptToolCall(
    name: string,
    args: any,
    result: any,
    entityCache: HAEntity[],
): CardEvent | null {
    try {
        const outcome = analyzeHomeAssistantToolCall(name, args, result, entityCache);
        if (outcome.status !== 'success' || !outcome.cardType || !outcome.cardData) {
            // Log non-success outcomes for debugging (not errors, just skipped cards)
            if (outcome.status === 'error' && outcome.error) {
                console.warn('[CardInterceptor] Tool call failed:', name, '→', outcome.error);
            }
            return null;
        }

        if (outcome.cardType === 'media') {
            const data = outcome.cardData as MediaCardData;
            return {
                type: 'media',
                data: data as unknown as Record<string, unknown>,
                persistent: data.playbackState === 'playing',
            };
        }

        return {
            type: 'device',
            data: outcome.cardData as unknown as Record<string, unknown>,
        };
    } catch (e) {
        // Structured error logging — never silently drop
        console.error('[CardInterceptor] Failed to process tool call:', {
            toolName: name,
            args: JSON.stringify(args)?.substring(0, 500),
            result: JSON.stringify(result)?.substring(0, 500),
            error: e instanceof Error ? e.message : String(e),
        });
        return null;
    }
}

function describeAction(service: string, args: any): string {
    const normalizedService = service.toLowerCase();
    if (normalizedService.includes('turnon') || normalizedService.includes('turn_on')) return 'Turned On';
    if (normalizedService.includes('turnoff') || normalizedService.includes('turn_off')) return 'Turned Off';
    if (normalizedService.includes('toggle')) return 'Toggled';
    if (normalizedService.includes('lightset') || normalizedService.includes('light_set')) {
        if (args?.brightness) return `Brightness ${Math.round((args.brightness / 255) * 100)}%`;
        if (args?.color_temp) return `Color Temp ${args.color_temp}`;
        return 'Updated';
    }
    if (normalizedService.includes('unlock')) return 'Unlocked';
    if (normalizedService.includes('lock')) return 'Locked';
    if (normalizedService.includes('open')) return 'Opened';
    if (normalizedService.includes('close') || normalizedService.includes('closed')) return 'Closed';
    if (normalizedService.includes('set_temperature') && args?.temperature) return `Set to ${args.temperature}°`;
    if (normalizedService.includes('set_hvac_mode') && args?.hvac_mode) return `Mode: ${args.hvac_mode}`;
    if (args?.brightness) return `Brightness ${Math.round((args.brightness / 255) * 100)}%`;
    return service
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/^Hass\s*/i, '')
        .replace(/\b\w/g, (value) => value.toUpperCase());
}

function inferPlaybackState(service: string, state: string): 'playing' | 'paused' | 'idle' {
    const normalizedService = service.toLowerCase();
    const normalizedState = state.toLowerCase();
    if (normalizedService.includes('play')) return 'playing';
    if (normalizedService.includes('pause')) return 'paused';
    if (normalizedService.includes('stop')) return 'idle';
    if (normalizedState === 'playing') return 'playing';
    if (normalizedState === 'paused') return 'paused';
    return 'idle';
}
