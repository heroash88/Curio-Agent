/**
 * Data-driven animation configs for CurioFace.
 * Each config describes what a special animation does:
 *   - emotion to set
 *   - duration before resetting to idle
 *   - action (nod/bob) to trigger
 *   - accessory refs to toggle
 *   - eye target overrides
 *   - custom runner for complex animations (intervals, multi-step)
 *
 * Replaces the ~300-line if/else chain in triggerSpecialAnimation.
 */

export interface AnimationRefs {
    heartsRef: React.RefObject<SVGGElement | null>;
    magnifyingGlassRef: React.RefObject<SVGGElement | null>;
    sunglassesRef: React.RefObject<SVGGElement | null>;
    scannerRef: React.RefObject<SVGGElement | null>;
    monocleRef: React.RefObject<SVGGElement | null>;
    mustacheRef: React.RefObject<SVGGElement | null>;
    steamLeftRef: React.RefObject<SVGGElement | null>;
    steamRightRef: React.RefObject<SVGGElement | null>;
    matrixEyesRef: React.RefObject<SVGGElement | null>;
    rainbowRef: React.RefObject<SVGGElement | null>;
    butterflyRef: React.RefObject<SVGGElement | null>;
    gumPopRef: React.RefObject<SVGGElement | null>;
    confettiRef: React.RefObject<SVGGElement | null>;
    haloRef: React.RefObject<SVGGElement | null>;
    starsRef: React.RefObject<SVGGElement | null>;
    clockRef: React.RefObject<SVGGElement | null>;
    rainRef: React.RefObject<SVGGElement | null>;
    sneezeRef: React.RefObject<SVGGElement | null>;
    thinkingCloudRef: React.RefObject<SVGGElement | null>;
    fireRef: React.RefObject<SVGGElement | null>;
    propellerRef: React.RefObject<SVGGElement | null>;
    musicNotesRef: React.RefObject<SVGGElement | null>;
    goldChainRef: React.RefObject<SVGGElement | null>;
    antennaGlowRef: React.RefObject<SVGCircleElement | null>;
    thinkingRef: React.RefObject<SVGGElement | null>;
    analyticalRef: React.RefObject<SVGGElement | null>;
    rangingRef: React.RefObject<SVGGElement | null>;
    blushRef: React.RefObject<SVGGElement | null>;
}

export interface AnimationContext {
    refs: AnimationRefs;
    setEmotion: (emotion: string) => void;
    triggerAction: (action: 'nod' | 'bob', duration?: number) => void;
    targetEyeRef: React.MutableRefObject<{ x: number; y: number }>;
    currentModeRef: React.MutableRefObject<string>;
    currentEmotionRef: React.MutableRefObject<string>;
    faceDetectionActiveRef: React.MutableRefObject<boolean>;
    trackInterval: (id: number) => number;
    trackTimeout: (callback: () => void, delay: number) => number;
    activeSubTimersRef: React.MutableRefObject<Set<number>>;
    toggleDetail: (ref: React.RefObject<SVGElement | null>, duration: number) => void;
}

/** Reset emotion to idle if still in idle mode and not sleeping. */
function resetToIdle(ctx: AnimationContext) {
    if (ctx.currentModeRef.current === 'idle' && ctx.currentEmotionRef.current !== 'sleepy') {
        ctx.setEmotion('idle');
    }
}

function scheduleTimeout(ctx: AnimationContext, callback: () => void, delay: number) {
    return ctx.trackTimeout(callback, delay);
}

function hideEyes(ctx: AnimationContext, duration: number) {
    const leftMask = document.getElementById('left-eye-mask');
    const rightMask = document.getElementById('right-eye-mask');
    if (leftMask) leftMask.style.opacity = '0';
    if (rightMask) rightMask.style.opacity = '0';
    scheduleTimeout(ctx, () => {
        if (leftMask) leftMask.style.opacity = '1';
        if (rightMask) rightMask.style.opacity = '1';
    }, duration);
}

function showRef(ref: React.RefObject<SVGElement | null>, opacity = '1') {
    if (ref.current) ref.current.style.opacity = opacity;
}

function hideRef(ref: React.RefObject<SVGElement | null>) {
    if (ref.current) ref.current.style.opacity = '0';
}

// ── Simple animation config type ────────────────────────────────────────────

interface SimpleAnimConfig {
    emotion?: string;
    resetMs?: number;
    action?: 'nod' | 'bob';
    actionDuration?: number;
    /** Ref key(s) to show, with duration before hiding */
    accessories?: Array<{ key: keyof AnimationRefs; showMs: number; opacity?: string }>;
    hideEyesMs?: number;
}

/** Run a simple config-driven animation. */
function runSimple(config: SimpleAnimConfig, ctx: AnimationContext) {
    if (config.emotion) ctx.setEmotion(config.emotion);
    if (config.action) ctx.triggerAction(config.action, config.actionDuration);
    if (config.hideEyesMs) hideEyes(ctx, config.hideEyesMs);
    if (config.accessories) {
        for (const acc of config.accessories) {
            const ref = ctx.refs[acc.key] as React.RefObject<SVGElement | null>;
            showRef(ref, acc.opacity);
            scheduleTimeout(ctx, () => hideRef(ref), acc.showMs);
        }
    }
    if (config.resetMs) {
        scheduleTimeout(ctx, () => resetToIdle(ctx), config.resetMs);
    }
}

// ── Animation registry ──────────────────────────────────────────────────────

type AnimRunner = (ctx: AnimationContext) => void;

const registry = new Map<number, AnimRunner>();

function reg(ids: number | number[], runner: AnimRunner) {
    const arr = Array.isArray(ids) ? ids : [ids];
    for (const id of arr) registry.set(id, runner);
}

function regSimple(ids: number | number[], config: SimpleAnimConfig) {
    reg(ids, (ctx) => runSimple(config, ctx));
}

// ── Register all animations ─────────────────────────────────────────────────

// 2: Wink + nod
regSimple(2, { emotion: 'wink', action: 'nod', actionDuration: 600, resetMs: 1500 });

// 4, 60: Curious nod
regSimple([4, 60], { emotion: 'curious', action: 'nod', actionDuration: 1000, resetMs: 1500 });

// 5, 12, 50: Hearts (hide eyes)
reg([5, 12, 50], (ctx) => {
    hideEyes(ctx, 3500);
    showRef(ctx.refs.heartsRef);
    ctx.triggerAction('bob', 1000);
    scheduleTimeout(ctx, () => hideRef(ctx.refs.heartsRef), 3500);
});

// 6: Surprised
regSimple(6, { emotion: 'surprised', resetMs: 1200 });

// 7: Magnifying glass search
reg(7, (ctx) => {
    ctx.setEmotion('curious');
    showRef(ctx.refs.magnifyingGlassRef);
    ctx.targetEyeRef.current = { x: -75, y: 20 };
    scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 75, y: -20 }; }, 800);
    scheduleTimeout(ctx, () => {
        ctx.targetEyeRef.current = { x: 0, y: 0 };
        hideRef(ctx.refs.magnifyingGlassRef);
    }, 2400);
    scheduleTimeout(ctx, () => resetToIdle(ctx), 2600);
});

// 8: Double bob
reg(8, (ctx) => {
    ctx.triggerAction('bob', 500);
    scheduleTimeout(ctx, () => ctx.triggerAction('bob', 500), 600);
});

// 9, 44: Sunglasses
reg([9, 44], (ctx) => {
    ctx.setEmotion('happy');
    const ref = ctx.refs.sunglassesRef;
    if (ref.current) {
        ref.current.style.opacity = '1';
        ref.current.style.transform = 'translate(0px, 0px)';
    }
    scheduleTimeout(ctx, () => {
        if (ref.current) {
            ref.current.style.opacity = '0';
            scheduleTimeout(ctx, () => { if (ref.current) ref.current.style.transform = 'translate(0px, -200px)'; }, 500);
        }
        resetToIdle(ctx);
    }, 4500);
});

// 10: Dizzy spin
reg(10, (ctx) => {
    ctx.setEmotion('surprised');
    let step = 0;
    const ivl = ctx.trackInterval(window.setInterval(() => {
        step += 0.8;
        ctx.targetEyeRef.current = { x: Math.cos(step) * 50, y: Math.sin(step) * 50 };
        if (step > 15 || ctx.currentModeRef.current !== 'idle') {
            clearInterval(ivl);
            ctx.targetEyeRef.current = { x: 0, y: 0 };
            ctx.setEmotion('idle');
        }
    }, 60));
});

// 11: Scanner
reg(11, (ctx) => {
    ctx.setEmotion('curious');
    const ref = ctx.refs.scannerRef;
    if (ref.current) {
        ref.current.style.opacity = '1';
        ref.current.style.transition = 'transform 2s linear';
        ref.current.style.transform = 'translateY(150px)';
        scheduleTimeout(ctx, () => {
            if (ref.current) {
                ref.current.style.opacity = '0';
                scheduleTimeout(ctx, () => {
                    if (ref.current) { ref.current.style.transition = 'none'; ref.current.style.transform = 'translateY(-100px)'; }
                }, 400);
            }
        }, 3500);
    }
    scheduleTimeout(ctx, () => resetToIdle(ctx), 3800);
});

// 13: Glitch
reg(13, (ctx) => {
    ctx.setEmotion('surprised');
    let glitches = 0;
    const ivl = ctx.trackInterval(window.setInterval(() => {
        glitches++;
        ctx.targetEyeRef.current = { x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 80 };
        if (glitches > 15 || ctx.currentModeRef.current !== 'idle') {
            clearInterval(ivl);
            ctx.activeSubTimersRef.current.delete(ivl);
            ctx.targetEyeRef.current = { x: 0, y: 0 };
        }
    }, 60));
    scheduleTimeout(ctx, () => resetToIdle(ctx), 3000);
});

// 14, 15: Monocle + mustache
reg([14, 15], (ctx) => {
    ctx.setEmotion('happy');
    showRef(ctx.refs.monocleRef);
    if (ctx.refs.mustacheRef.current) {
        ctx.refs.mustacheRef.current.style.opacity = '1';
        ctx.refs.mustacheRef.current.style.transform = 'scale(1.2)';
    }
    scheduleTimeout(ctx, () => {
        hideRef(ctx.refs.monocleRef);
        if (ctx.refs.mustacheRef.current) {
            ctx.refs.mustacheRef.current.style.opacity = '0';
            scheduleTimeout(ctx, () => { if (ctx.refs.mustacheRef.current) ctx.refs.mustacheRef.current.style.transform = 'scale(0.1)'; }, 400);
        }
        resetToIdle(ctx);
    }, 4500);
});

// 16: Steam
regSimple(16, { emotion: 'surprised', resetMs: 4000, accessories: [{ key: 'steamLeftRef', showMs: 4000 }, { key: 'steamRightRef', showMs: 4000 }] });

// 17: Matrix eyes
regSimple(17, { accessories: [{ key: 'matrixEyesRef', showMs: 4500 }] });

// 18: Rainbow
regSimple(18, { accessories: [{ key: 'rainbowRef', showMs: 4000 }] });

// 19: Butterfly chase
reg(19, (ctx) => {
    ctx.setEmotion('curious');
    const ref = ctx.refs.butterflyRef;
    if (!ref.current) return;
    ref.current.style.opacity = '1';
    let frame = 0;
    const ivl = ctx.trackInterval(window.setInterval(() => {
        frame++;
        const bx = Math.sin(frame * 0.1) * 200 + 300;
        const by = Math.cos(frame * 0.15) * 100 + 150;
        if (!ctx.faceDetectionActiveRef.current) ctx.targetEyeRef.current = { x: (bx - 300) / 3, y: (by - 200) / 3 };
        if (ref.current) ref.current.setAttribute('transform', `translate(${bx}, ${by})`);
        if (frame > 100 || ctx.currentModeRef.current !== 'idle') {
            clearInterval(ivl);
            ctx.activeSubTimersRef.current.delete(ivl);
            hideRef(ref);
            ctx.targetEyeRef.current = { x: 0, y: 0 };
            ctx.setEmotion('idle');
        }
    }, 40));
});

// 20: Happy bob
regSimple(20, { emotion: 'happy', action: 'bob', actionDuration: 2000, resetMs: 2000 });

// 21: Gum Pop
regSimple(21, { emotion: 'happy', resetMs: 4500, accessories: [{ key: 'gumPopRef', showMs: 4500 }] });

// 22: Confetti
reg(22, (ctx) => {
    showRef(ctx.refs.confettiRef);
    ctx.triggerAction('bob', 1000);
    scheduleTimeout(ctx, () => hideRef(ctx.refs.confettiRef), 4000);
});

// 23: Halo
regSimple(23, { accessories: [{ key: 'haloRef', showMs: 4000 }] });

// 24: Stars
regSimple(24, { emotion: 'happy', resetMs: 4500, accessories: [{ key: 'starsRef', showMs: 4500 }] });

// 25: Clock
regSimple(25, { accessories: [{ key: 'clockRef', showMs: 4500 }] });

// 26: Rain
regSimple(26, { emotion: 'surprised', resetMs: 4000, accessories: [{ key: 'rainRef', showMs: 4000, opacity: '0.6' }] });

// 27: Sneeze
reg(27, (ctx) => {
    ctx.setEmotion('surprised');
    showRef(ctx.refs.sneezeRef);
    ctx.triggerAction('bob', 400);
    scheduleTimeout(ctx, () => {
        hideRef(ctx.refs.sneezeRef);
        ctx.triggerAction('nod', 600);
        resetToIdle(ctx);
    }, 800);
});

// 28: Thinking cloud
regSimple(28, { accessories: [{ key: 'thinkingCloudRef', showMs: 5000 }] });

// 29: Fire
regSimple(29, { emotion: 'surprised', resetMs: 4000, accessories: [{ key: 'fireRef', showMs: 4000 }] });

// 30: Propeller
regSimple(30, { accessories: [{ key: 'propellerRef', showMs: 4500 }] });

// 31: Music notes
regSimple(31, { accessories: [{ key: 'musicNotesRef', showMs: 4000 }] });

// 32: Gold chain
regSimple(32, { emotion: 'happy', resetMs: 5000, accessories: [{ key: 'goldChainRef', showMs: 5000 }] });

// 33: Confused look-around
reg(33, (ctx) => {
    ctx.setEmotion('confused');
    if (!ctx.faceDetectionActiveRef.current) {
        ctx.targetEyeRef.current = { x: 30, y: -10 };
        scheduleTimeout(ctx, () => { if (!ctx.faceDetectionActiveRef.current) ctx.targetEyeRef.current = { x: -20, y: 5 }; }, 1000);
        scheduleTimeout(ctx, () => { if (!ctx.faceDetectionActiveRef.current) ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 2000);
    }
    scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
});

// 34: Sad → curious recovery
reg(34, (ctx) => {
    ctx.setEmotion('sad');
    scheduleTimeout(ctx, () => {
        if (ctx.currentModeRef.current === 'idle') { ctx.setEmotion('curious'); ctx.triggerAction('bob'); }
    }, 1800);
    scheduleTimeout(ctx, () => resetToIdle(ctx), 3000);
});

// 35: Love + hearts
reg(35, (ctx) => {
    ctx.setEmotion('love');
    showRef(ctx.refs.heartsRef);
    ctx.triggerAction('bob', 800);
    scheduleTimeout(ctx, () => { hideRef(ctx.refs.heartsRef); resetToIdle(ctx); }, 3500);
});

// 36: Smirk side-eye
reg(36, (ctx) => {
    ctx.setEmotion('smirk');
    if (!ctx.faceDetectionActiveRef.current) {
        ctx.targetEyeRef.current = { x: -20, y: 0 };
        scheduleTimeout(ctx, () => { if (!ctx.faceDetectionActiveRef.current) ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 2000);
    }
    scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
});

// 37: Antenna glow
reg(37, (ctx) => {
    ctx.setEmotion('curious');
    const ref = ctx.refs.antennaGlowRef;
    if (ref.current) {
        ref.current.style.transition = 'r 0.3s, opacity 0.3s';
        ref.current.setAttribute('r', '12');
        ref.current.style.opacity = '1';
    }
    scheduleTimeout(ctx, () => {
        if (ref.current) { ref.current.setAttribute('r', '6'); ref.current.style.opacity = '0.6'; }
    }, 1200);
    scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
});

// 38-64: Random emotion showcase
const SHOWCASE_EMOTIONS = [
    'puzzled', 'unimpressed', 'skeptical', 'determined', 'dazzled', 'disgusted',
    'panicked', 'dreamy', 'mischievous', 'amazed', 'electronic', 'targeting',
    'melancholy', 'raging', 'sassy', 'shy', 'playful', 'analytical', 'grumpy', 'zen',
];

const EMOTION_ACCESSORY_MAP: Partial<Record<string, { key: keyof AnimationRefs; showMs: number }>> = {
    puzzled: { key: 'thinkingRef', showMs: 3000 },
    analytical: { key: 'analyticalRef', showMs: 4000 },
    raging: { key: 'rangingRef', showMs: 3000 },
    shy: { key: 'blushRef', showMs: 3000 },
};

for (let i = 38; i < 65; i++) {
    if (registry.has(i)) continue; // skip 44 and 60 already registered
    reg(i, (ctx) => {
        const selected = SHOWCASE_EMOTIONS[Math.floor(Math.random() * SHOWCASE_EMOTIONS.length)];
        ctx.setEmotion(selected);
        const acc = EMOTION_ACCESSORY_MAP[selected];
        if (acc) ctx.toggleDetail(ctx.refs[acc.key] as React.RefObject<SVGElement | null>, acc.showMs);
        scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
    });
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Total number of registered animation types (for random selection). */
export const MAX_ANIM_TYPE = 65;

/**
 * Run a special animation by its numeric ID.
 * Returns false if no animation is registered for that ID.
 */
export function runAnimation(animType: number, ctx: AnimationContext): boolean {
    const runner = registry.get(animType);
    if (!runner) return false;
    runner(ctx);
    return true;
}
