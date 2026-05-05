/**
 * Session / camera-toggle handlers: disconnect, toggleCamera, flipCamera,
 * navigateToSubject.
 */

import { register } from '../router';

register('disconnectSession', async (_args, ctx) => {
    ctx.disconnect();
    return { result: { success: true }, emittedCard: false };
});

register('toggleCamera', async (args, ctx) => {
    const enabled = args?.enabled !== false;
    if (ctx.handler?.toggleCamera) {
        const cameraResult = await ctx.handler.toggleCamera(enabled);
        if (cameraResult && typeof cameraResult === 'object' && 'success' in cameraResult) {
            return {
                result: {
                    ...cameraResult,
                    cameraEnabled: cameraResult.enabled,
                    visionStatus: cameraResult.success
                        ? `Fresh camera frame${cameraResult.framesCaptured === 1 ? '' : 's'} ready`
                        : 'No usable camera frame available',
                },
                emittedCard: false,
            };
        }
        return { result: { success: true, cameraEnabled: enabled, visionStatus: 'Camera toggled' }, emittedCard: false };
    }
    return { result: { success: false, error: 'Camera control not available' }, emittedCard: false };
});

register('flipCamera', async (_args, ctx) => {
    if (ctx.handler?.flipCamera) {
        const cameraResult = await ctx.handler.flipCamera();
        if (cameraResult && typeof cameraResult === 'object' && 'success' in cameraResult) {
            return {
                result: {
                    ...cameraResult,
                    cameraEnabled: cameraResult.enabled,
                    visionStatus: cameraResult.success
                        ? `Camera switched to ${cameraResult.facingMode || 'the other camera'}`
                        : 'No alternate device camera available',
                },
                emittedCard: false,
            };
        }
        return { result: { success: true, cameraEnabled: true, visionStatus: 'Camera switched' }, emittedCard: false };
    }
    return { result: { success: false, error: 'Camera flip control not available' }, emittedCard: false };
});

register('navigateToSubject', async (args, ctx) => {
    try {
        ctx.handler?.navigateToSubject?.(args.subject);
        return { result: { success: true }, emittedCard: false };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
