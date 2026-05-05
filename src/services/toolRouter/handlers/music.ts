/**
 * Music playback and dashboard widget open handlers.
 *
 * open_dashboard_widget is registered here (rather than a separate file)
 * because it shares the widget intent helpers with play_youtube_video and
 * play_music; they all delegate to the YouTube widget for explicit video
 * intent.
 */

import { WIDGET_CATALOG } from '../../dashboardTypes';
import { musicPlaybackService } from '../../musicPlaybackService';
import { searchMusic } from '../../musicSearchService';
import {
    buildDashboardWidgetConfigPatch,
    dispatchDashboardWidgetIntent,
    resolveDashboardWidgetType,
} from '../dashboardWidgetIntent';
import { register } from '../router';
import {
    emitMusicCardEvent,
    isExplicitVideoIntent,
    normalizeVideoSearchQuery,
} from '../utils';

register('open_dashboard_widget', async (args, ctx) => {
    const requestedWidget = String(args?.widget || args?.widgetType || args?.name || '').trim();
    const widgetType = resolveDashboardWidgetType(requestedWidget);
    if (!widgetType) {
        return {
            result: {
                success: false,
                error: `Unknown widget "${requestedWidget}".`,
                availableWidgets: WIDGET_CATALOG.map((item) => item.type),
            },
            emittedCard: false,
        };
    }

    const configPatch = buildDashboardWidgetConfigPatch(widgetType, args);
    const dispatched = dispatchDashboardWidgetIntent(widgetType, configPatch);

    if (!dispatched && widgetType === 'youtube_video' && ctx.onCardEvent) {
        try {
            ctx.onCardEvent({
                type: 'youtube',
                data: {
                    searchQuery: String(args?.query || args?.title || '').trim(),
                    videoId: String(args?.videoId || '').trim() || undefined,
                    title: String(args?.title || args?.query || 'YouTube Video'),
                },
                persistent: true,
            });
            return {
                result: {
                    success: true,
                    widget: widgetType,
                    fallback: 'Card event fallback used.',
                },
                emittedCard: true,
            };
        } catch {}
    }

    return {
        result: {
            success: dispatched,
            widget: widgetType,
            message: dispatched
                ? `${widgetType} widget is now available on the dashboard.`
                : 'Dashboard widget intent could not be dispatched in this runtime.',
        },
        emittedCard: false,
    };
});

register('play_youtube_video', async (args, ctx) => {
    const rawQuery = String(args?.query || args?.title || '').trim();
    const searchQuery = normalizeVideoSearchQuery(rawQuery) || rawQuery;
    const videoId = String(args?.videoId || '').trim();
    const title = String(args?.title || searchQuery || 'YouTube Video').trim();
    const autoplay = args?.autoplay !== false;
    if (!searchQuery && !videoId) {
        return {
            result: { success: false, error: 'A YouTube query or videoId is required.' },
            emittedCard: false,
        };
    }

    const widgetPatch = {
        ...(searchQuery ? { youtubeQuery: searchQuery } : {}),
        ...(videoId ? { youtubeVideoId: videoId } : {}),
        ...(title ? { youtubeTitle: title } : {}),
        youtubeAutoplay: autoplay,
        youtubeRequestNonce: Date.now(),
    };

    let emittedCard = false;
    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({
                type: 'youtube',
                data: {
                    ...(searchQuery ? { searchQuery } : {}),
                    ...(videoId ? { videoId } : {}),
                    title,
                },
                persistent: true,
            });
            emittedCard = true;
        } catch {}
    }

    if (!emittedCard) {
        dispatchDashboardWidgetIntent('youtube_video', widgetPatch);
    }

    return {
        result: {
            success: true,
            searchQuery,
            videoId,
            title,
            autoplay,
            routedToDashboardWidget: true,
        },
        emittedCard,
    };
});

register('play_music', async (args, ctx) => {
    const query = String(args?.query || '').trim();
    if (!query) return { result: { success: false, error: 'A music query is required.' }, emittedCard: false };

    if (isExplicitVideoIntent(query)) {
        const searchQuery = normalizeVideoSearchQuery(query) || query;
        await musicPlaybackService.stop();
        let emittedCard = false;
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({ type: 'youtube', data: { searchQuery, title: searchQuery }, persistent: true });
                emittedCard = true;
            } catch {}
        }
        if (!emittedCard) {
            dispatchDashboardWidgetIntent('youtube_video', {
                youtubeQuery: searchQuery,
                youtubeTitle: searchQuery,
                youtubeAutoplay: true,
                youtubeRequestNonce: Date.now(),
            });
        }
        return { result: { success: true, redirectedToVideo: true, searchQuery, reason: 'Explicit video intent should open a YouTube video, not the audio mini-player.' }, emittedCard };
    }

    const searchResult = await searchMusic(query);
    if (!searchResult.success || !searchResult.track) {
        return { result: { success: false, error: searchResult.error || `Could not find a playable result for "${query}".` }, emittedCard: false };
    }
    const snapshot = await musicPlaybackService.play(searchResult.track);
    emitMusicCardEvent(ctx.onCardEvent, snapshot);
    return {
        result: { success: true, source: snapshot.source, videoId: snapshot.videoId, id: snapshot.id, uri: snapshot.uri, title: snapshot.title, artistOrChannel: snapshot.artistOrChannel, playbackState: snapshot.playbackState, autoplayBlocked: snapshot.autoplayBlocked === true },
        emittedCard: true,
    };
});

register('pause_music', async (_args, ctx) => {
    const current = musicPlaybackService.getState();
    if (!current.videoId && !current.uri && !current.id) return { result: { success: false, error: 'No active in-app music track is playing.' }, emittedCard: false };
    const snapshot = await musicPlaybackService.pause();
    emitMusicCardEvent(ctx.onCardEvent, snapshot);
    return { result: { success: true, playbackState: snapshot.playbackState, title: snapshot.title }, emittedCard: true };
});

register('resume_music', async (_args, ctx) => {
    const current = musicPlaybackService.getState();
    if (!current.videoId && !current.uri && !current.id) return { result: { success: false, error: 'No paused music track is available to resume.' }, emittedCard: false };
    const snapshot = await musicPlaybackService.resume();
    emitMusicCardEvent(ctx.onCardEvent, snapshot);
    return { result: { success: true, playbackState: snapshot.playbackState, title: snapshot.title, autoplayBlocked: snapshot.autoplayBlocked === true }, emittedCard: true };
});

register('stop_music', async (_args, _ctx) => {
    const current = musicPlaybackService.getState();
    if (!current.videoId && !current.uri && !current.id) return { result: { success: false, error: 'No active in-app music track is currently loaded.' }, emittedCard: false };
    await musicPlaybackService.stop();
    return { result: { success: true, playbackState: 'idle' }, emittedCard: true };
});

register('get_music_state', async (_args, _ctx) => {
    const snapshot = musicPlaybackService.getState();
    return {
        result: { success: true, hasActiveTrack: Boolean(snapshot.videoId || snapshot.uri || snapshot.id), source: snapshot.source, playbackState: snapshot.playbackState, videoId: snapshot.videoId, id: snapshot.id, uri: snapshot.uri, title: snapshot.title, artistOrChannel: snapshot.artistOrChannel, autoplayBlocked: snapshot.autoplayBlocked === true },
        emittedCard: false,
    };
});
