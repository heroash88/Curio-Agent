/**
 * Home Assistant camera handlers. show_camera resolves the camera entity
 * from the cached entity list, prefers a signed proxy URL, and falls back
 * to a blob fetch when signing is unavailable.
 */

import { getHaMcpUrl, getHaMcpTokenAsync } from '../../../utils/settingsStorage';
import { register } from '../router';

register('show_camera', async (args, ctx) => {
    let entityId = String(args?.entityId || '').trim();
    let cameraName = String(args?.cameraName || entityId || 'Camera').trim();
    let snapshotUrl = '';
    let baseUrl = '';
    let haToken = '';
    const cameraList = (ctx.entityCache || [])
        .filter(e => e.entity_id?.startsWith('camera.'))
        .map(e => ({ entity_id: e.entity_id, name: e.name || e.entity_id }));

    // Resolve entity ID from cache
    if ((entityId || cameraName) && ctx.entityCache && ctx.entityCache.length > 0) {
        const cameras = ctx.entityCache.filter(e => e.entity_id.startsWith('camera.'));
        let found = entityId ? cameras.find(e => e.entity_id === entityId) : null;
        if (!found) {
            const searchName = (cameraName || entityId).toLowerCase();
            found = cameras.find(e => e.entity_id.toLowerCase().includes(searchName.replace(/\s+/g, '_')) || (e.name || '').toLowerCase().includes(searchName));
            if (!found && entityId) {
                const parts = entityId.replace('camera.', '').toLowerCase().split('_');
                found = cameras.find(e => parts.every((p: string) => e.entity_id.toLowerCase().includes(p)));
            }
        }
        if (found) {
            entityId = found.entity_id;
            cameraName = found.name || cameraName || found.entity_id;
        }
    }

    if (!entityId) {
        return {
            result: {
                success: false,
                error: 'No matching Home Assistant camera was found.',
                availableCameras: cameraList,
            },
            emittedCard: false,
        };
    }

    if (entityId) {
        try {
            const rawUrl = getHaMcpUrl();
            haToken = await getHaMcpTokenAsync();
            baseUrl = rawUrl.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');

            // Try signed path first
            try {
                const signRes = await fetch(`${baseUrl}/api/auth/sign_path`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: `/api/camera_proxy/${entityId}` }),
                });
                if (signRes.ok) {
                    const signData = await signRes.json();
                    snapshotUrl = `${baseUrl}${signData.path}`;
                    await ctx.startHaCameraStream(entityId, baseUrl, haToken);
                }
            } catch {}

            // Fallback: fetch as blob
            if (!snapshotUrl) {
                try {
                    const proxyRes = await fetch(`${baseUrl}/api/camera_proxy/${entityId}`, { headers: { Authorization: `Bearer ${haToken}` } });
                    if (proxyRes.ok) {
                        const blob = await proxyRes.blob();
                        snapshotUrl = URL.createObjectURL(blob);
                        await ctx.startHaCameraStream(entityId, baseUrl, haToken);
                    }
                } catch {}
            }
        } catch {}
    }

    if (!baseUrl || !haToken) {
        return {
            result: {
                success: false,
                error: 'Home Assistant camera credentials are not available.',
                entityId,
                cameraName,
            },
            emittedCard: false,
        };
    }

    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({ type: 'camera', data: { entityId, cameraName, snapshotUrl, haUrl: baseUrl, haToken, isStreaming: true, cameras: cameraList }, persistent: true });
        } catch {}
    }
    return {
        result: {
            success: true,
            entityId,
            cameraName,
            streaming: Boolean(snapshotUrl || ctx.isHaCameraStreaming),
            message: `Camera feed for ${cameraName} is now open. If the user asks visual questions, answer from this Home Assistant camera feed when frames are available.`,
        },
        emittedCard: true,
    };
});

register('close_camera', async (_args, ctx) => {
    ctx.stopHaCameraStream(true);
    if (ctx.onCardEvent) { try { ctx.onCardEvent({ type: 'close_camera', data: {} }); } catch {} }
    return { result: { success: true, message: 'Camera feed closed.' }, emittedCard: false };
});
