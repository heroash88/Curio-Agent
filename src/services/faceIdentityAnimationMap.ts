import type { FaceStyleId } from '../utils/settingsStorage';

export type FaceIdentityAnimationEvent =
    | 'recognized'
    | 'returning'
    | 'changed'
    | 'uncertain';

type AnimationDetail =
    | { action: 'special'; id: number }
    | { action: 'nod' | 'bob' | 'blink' };

const FACE_STYLE_ANIMATION_MAP: Record<FaceStyleId, Record<FaceIdentityAnimationEvent, AnimationDetail>> = {
    curio: {
        recognized: { action: 'special', id: 11 },
        returning: { action: 'special', id: 20 },
        changed: { action: 'special', id: 37 },
        uncertain: { action: 'special', id: 33 },
    },
    astro: {
        recognized: { action: 'special', id: 11 },
        returning: { action: 'special', id: 1 },
        changed: { action: 'special', id: 2 },
        uncertain: { action: 'special', id: 6 },
    },
    kiro: {
        recognized: { action: 'special', id: 11 },
        returning: { action: 'special', id: 1 },
        changed: { action: 'special', id: 2 },
        uncertain: { action: 'special', id: 6 },
    },
    bender: {
        recognized: { action: 'special', id: 39 },
        returning: { action: 'special', id: 43 },
        changed: { action: 'special', id: 38 },
        uncertain: { action: 'special', id: 45 },
    },
};

export const getFaceIdentityAnimationDetail = (
    faceStyleId: FaceStyleId,
    event: FaceIdentityAnimationEvent,
): AnimationDetail => FACE_STYLE_ANIMATION_MAP[faceStyleId]?.[event] ?? { action: 'nod' };

export const playFaceIdentityAnimation = (
    faceStyleId: FaceStyleId,
    event: FaceIdentityAnimationEvent,
): void => {
    const detail = getFaceIdentityAnimationDetail(faceStyleId, event);
    window.dispatchEvent(
        new CustomEvent('curio:preview-animation', {
            detail,
        }),
    );
};
