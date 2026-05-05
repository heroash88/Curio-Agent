/**
 * Data-driven animation configs for AstroFace.
 *
 * Mirrors the pattern in animationConfigs.ts (used by CurioFace) but with
 * AstroFace-specific refs and behaviors.
 */
import type React from 'react';

export interface AstroAnimationRefs {
  mainEyesRef: React.RefObject<SVGGElement | null>;
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
  terminalRef: React.RefObject<SVGGElement | null>;
  blushLeftRef: React.RefObject<SVGCircleElement | null>;
  blushRightRef: React.RefObject<SVGCircleElement | null>;
  sweatRef: React.RefObject<SVGGElement | null>;
  tearsRef: React.RefObject<SVGGElement | null>;
  thinkingRef: React.RefObject<SVGGElement | null>;
  analyticalRef: React.RefObject<SVGGElement | null>;
  rangingRef: React.RefObject<SVGGElement | null>;
  blushRef: React.RefObject<SVGGElement | null>;
}

export interface AstroAnimationContext {
  refs: AstroAnimationRefs;
  setEmotion: (emotion: string) => void;
  triggerAction: (action: 'nod' | 'bob', duration?: number) => void;
  targetEyeRef: React.MutableRefObject<{ x: number; y: number }>;
  currentModeRef: React.MutableRefObject<string>;
  currentEmotionRef: React.MutableRefObject<string>;
  trackInterval: (id: number) => number;
  trackTimeout: (callback: () => void, delay: number) => number;
}

// -- Helpers --

function scheduleTimeout(ctx: AstroAnimationContext, callback: () => void, delay: number) {
  return ctx.trackTimeout(callback, delay);
}

function resetToIdle(ctx: AstroAnimationContext) {
  if (ctx.currentModeRef.current === 'idle' && ctx.currentEmotionRef.current !== 'sleepy') {
    ctx.setEmotion('idle');
  }
}

function hideEyes(ctx: AstroAnimationContext, duration: number) {
  const { refs } = ctx;
  if (refs.mainEyesRef.current) {
    refs.mainEyesRef.current.style.transition = 'opacity 0.2s';
    refs.mainEyesRef.current.style.opacity = '0';
  }
  scheduleTimeout(ctx, () => {
    if (refs.mainEyesRef.current) refs.mainEyesRef.current.style.opacity = '1';
  }, duration);
}

function showRef(ref: React.RefObject<SVGElement | null>, opacity = '1') {
  if (ref.current) ref.current.style.opacity = opacity;
}

function hideRef(ref: React.RefObject<SVGElement | null>) {
  if (ref.current) ref.current.style.opacity = '0';
}

function toggleDetail(ctx: AstroAnimationContext, ref: React.RefObject<SVGElement | null>, duration: number) {
  showRef(ref);
  scheduleTimeout(ctx, () => hideRef(ref), duration);
}

// -- Registry --

type AnimRunner = (ctx: AstroAnimationContext) => void;
const registry = new Map<number, AnimRunner>();

function reg(ids: number | number[], runner: AnimRunner) {
  for (const id of (Array.isArray(ids) ? ids : [ids])) registry.set(id, runner);
}

// 0: Wink
reg(0, (ctx) => {
  ctx.setEmotion('wink');
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1500);
});

// 1: Happy bob
reg(1, (ctx) => {
  ctx.setEmotion('happy');
  ctx.triggerAction('bob', 800);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1500);
});

// 2: Curious nod
reg(2, (ctx) => {
  ctx.setEmotion('curious');
  ctx.triggerAction('nod', 600);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1500);
});

// 4, 60: Curious nod (longer)
reg([4, 60], (ctx) => {
  ctx.triggerAction('nod', 1000);
  ctx.setEmotion('curious');
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1500);
});

// 5, 12, 50: Hearts
reg([5, 12, 50], (ctx) => {
  hideEyes(ctx, 3500);
  showRef(ctx.refs.heartsRef);
  ctx.triggerAction('bob', 1000);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.heartsRef), 3500);
});

// 6: Surprised
reg(6, (ctx) => {
  ctx.setEmotion('surprised');
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1200);
});

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
  const sg = ctx.refs.sunglassesRef;
  if (sg.current) {
    sg.current.style.opacity = '1';
    sg.current.style.transform = 'translate(0px, 0px)';
  }
  scheduleTimeout(ctx, () => {
    if (sg.current) {
      sg.current.style.opacity = '0';
      scheduleTimeout(ctx, () => { if (sg.current) sg.current.style.transform = 'translate(0px, -200px)'; }, 500);
    }
    resetToIdle(ctx);
  }, 4500);
});

// 10: Dizzy spiral
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
  const sc = ctx.refs.scannerRef;
  if (sc.current) {
    sc.current.style.opacity = '1';
    sc.current.style.transition = 'transform 2s linear';
    sc.current.style.transform = 'translateY(150px)';
    scheduleTimeout(ctx, () => {
      if (sc.current) {
        sc.current.style.opacity = '0';
        scheduleTimeout(ctx, () => { if (sc.current) { sc.current.style.transition = 'none'; sc.current.style.transform = 'translateY(-100px)'; } }, 400);
      }
    }, 3500);
  }
  scheduleTimeout(ctx, () => resetToIdle(ctx), 3800);
});

// 13: Glitch
reg(13, (ctx) => {
  ctx.setEmotion('digitized');
  let glitches = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    glitches++;
    ctx.targetEyeRef.current = { x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 80 };
    if (glitches > 15 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.targetEyeRef.current = { x: 0, y: 0 };
      ctx.setEmotion('idle');
    }
  }, 60));
});

// 14, 36: Monocle + mustache
reg([14, 36], (ctx) => {
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
      scheduleTimeout(ctx, () => { if (ctx.refs.mustacheRef.current) ctx.refs.mustacheRef.current.style.transform = 'scale(1)'; }, 400);
    }
    resetToIdle(ctx);
  }, 4500);
});

// 16: Angry steam
reg(16, (ctx) => {
  ctx.setEmotion('angry');
  showRef(ctx.refs.steamLeftRef);
  showRef(ctx.refs.steamRightRef);
  scheduleTimeout(ctx, () => { hideRef(ctx.refs.steamLeftRef); hideRef(ctx.refs.steamRightRef); ctx.setEmotion('idle'); }, 4000);
});

// 17, 41: Matrix eyes
reg([17, 41], (ctx) => {
  hideEyes(ctx, 4500);
  showRef(ctx.refs.matrixEyesRef);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.matrixEyesRef), 4500);
});

// 18: Rainbow
reg(18, (ctx) => {
  showRef(ctx.refs.rainbowRef);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.rainbowRef), 4000);
});

// 19: Butterfly chase
reg(19, (ctx) => {
  ctx.setEmotion('curious');
  const bf = ctx.refs.butterflyRef;
  if (bf.current) {
    bf.current.style.opacity = '1';
    let frame = 0;
    const ivl = ctx.trackInterval(window.setInterval(() => {
      frame++;
      const bx = Math.sin(frame * 0.1) * 200 + 300;
      const by = Math.cos(frame * 0.15) * 100 + 150;
      ctx.targetEyeRef.current = { x: (bx - 300) / 4, y: (by - 200) / 4 };
      if (bf.current) bf.current.setAttribute('transform', `translate(${bx}, ${by})`);
      if (frame > 80 || ctx.currentModeRef.current !== 'idle') {
        clearInterval(ivl);
        if (bf.current) bf.current.style.opacity = '0';
        ctx.targetEyeRef.current = { x: 0, y: 0 };
        ctx.setEmotion('idle');
      }
    }, 50));
  }
});

// 21: Gum Pop
reg(21, (ctx) => {
  ctx.setEmotion('happy');
  showRef(ctx.refs.gumPopRef);
  scheduleTimeout(ctx, () => { hideRef(ctx.refs.gumPopRef); ctx.setEmotion('idle'); }, 4000);
});

// 22: Confetti
reg(22, (ctx) => {
  showRef(ctx.refs.confettiRef);
  ctx.triggerAction('bob', 1200);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.confettiRef), 4000);
});

// 23: Halo
reg(23, (ctx) => {
  showRef(ctx.refs.haloRef);
  ctx.setEmotion('content');
  scheduleTimeout(ctx, () => { hideRef(ctx.refs.haloRef); ctx.setEmotion('idle'); }, 4500);
});

// 24, 52: Stars
reg([24, 52], (ctx) => {
  hideEyes(ctx, 4500);
  showRef(ctx.refs.starsRef);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.starsRef), 4500);
});

// 25: Clock
reg(25, (ctx) => {
  hideEyes(ctx, 4500);
  showRef(ctx.refs.clockRef);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.clockRef), 4500);
});

// 26: Rain
reg(26, (ctx) => {
  ctx.setEmotion('surprised');
  showRef(ctx.refs.rainRef);
  scheduleTimeout(ctx, () => { hideRef(ctx.refs.rainRef); ctx.setEmotion('idle'); }, 4000);
});

// 27: Sneeze
reg(27, (ctx) => {
  ctx.setEmotion('surprised');
  scheduleTimeout(ctx, () => {
    showRef(ctx.refs.sneezeRef);
    ctx.triggerAction('nod', 400);
    scheduleTimeout(ctx, () => { hideRef(ctx.refs.sneezeRef); ctx.setEmotion('idle'); }, 600);
  }, 1000);
});

// 28: Thinking cloud
reg(28, (ctx) => {
  ctx.setEmotion('curious');
  showRef(ctx.refs.thinkingCloudRef);
  scheduleTimeout(ctx, () => { hideRef(ctx.refs.thinkingCloudRef); ctx.setEmotion('idle'); }, 5000);
});

// 29: Fire
reg(29, (ctx) => {
  hideEyes(ctx, 4000);
  showRef(ctx.refs.fireRef);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.fireRef), 4000);
});

// 30: Propeller
reg(30, (ctx) => {
  showRef(ctx.refs.propellerRef);
  ctx.triggerAction('bob', 1000);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.propellerRef), 4500);
});

// 31: Music notes
reg(31, (ctx) => {
  showRef(ctx.refs.musicNotesRef);
  ctx.triggerAction('bob', 2000);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.musicNotesRef), 4000);
});

// 32: Gold chain
reg(32, (ctx) => {
  showRef(ctx.refs.goldChainRef);
  ctx.setEmotion('happy');
  scheduleTimeout(ctx, () => { hideRef(ctx.refs.goldChainRef); ctx.setEmotion('idle'); }, 5000);
});

// 33: Terminal
reg(33, (ctx) => {
  hideEyes(ctx, 5000);
  showRef(ctx.refs.terminalRef);
  scheduleTimeout(ctx, () => hideRef(ctx.refs.terminalRef), 5000);
});

// 34: Suspicious look
reg(34, (ctx) => {
  ctx.setEmotion('suspicious');
  ctx.targetEyeRef.current = { x: -40, y: 10 };
  scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 40, y: 10 }; }, 1500);
  scheduleTimeout(ctx, () => { ctx.setEmotion('idle'); ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 3000);
});

// 35, 61, 90: Glee + blush
reg([35, 61, 90], (ctx) => {
  ctx.setEmotion('glee');
  toggleDetail(ctx,ctx.refs.blushLeftRef, 4000);
  toggleDetail(ctx,ctx.refs.blushRightRef, 4000);
  ctx.triggerAction('bob', 1200);
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 4500);
});

// 37, 62: Nervous + sweat
reg([37, 62], (ctx) => {
  ctx.setEmotion('nervous');
  toggleDetail(ctx,ctx.refs.sweatRef, 3500);
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 3500);
});

// 38, 63: Crying + tears
reg([38, 63], (ctx) => {
  ctx.setEmotion('crying');
  toggleDetail(ctx,ctx.refs.tearsRef, 4000);
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 4000);
});

// 39, 64, 91: Evil glow
reg([39, 64, 91], (ctx) => {
  ctx.setEmotion('evil');
  if (ctx.refs.mainEyesRef.current) ctx.refs.mainEyesRef.current.style.filter = 'drop-shadow(0 0 10px #ff0000)';
  scheduleTimeout(ctx, () => {
    ctx.setEmotion('idle');
    if (ctx.refs.mainEyesRef.current) ctx.refs.mainEyesRef.current.style.filter = 'none';
  }, 3000);
});

// 40, 65: Shiver
reg([40, 65], (ctx) => {
  ctx.setEmotion('shiver');
  ctx.triggerAction('nod', 400);
  scheduleTimeout(ctx, () => ctx.triggerAction('nod', 400), 500);
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 3000);
});

// 42, 66, 80: Searching spiral
reg([42, 66, 80], (ctx) => {
  ctx.setEmotion('searching');
  let deg = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    deg += 0.2;
    ctx.targetEyeRef.current = { x: Math.sin(deg) * 30, y: Math.cos(deg) * 30 };
    if (deg > 10 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.setEmotion('idle');
      ctx.targetEyeRef.current = { x: 0, y: 0 };
    }
  }, 50));
});

// 43, 67, 92: Smug
reg([43, 67, 92], (ctx) => {
  ctx.setEmotion('smug');
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 3000);
});

// 45, 68, 93: Smile squint
reg([45, 68, 93], (ctx) => {
  ctx.setEmotion('smileSquint');
  ctx.triggerAction('bob', 800);
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 2500);
});

// 46, 69, 94: Glitch matrix
reg([46, 69, 94], (ctx) => {
  ctx.setEmotion('glitchMatrix');
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 2000);
});

// 47, 70: Thinking cloud emotion
reg([47, 70], (ctx) => {
  ctx.setEmotion('thinkingCloud');
  scheduleTimeout(ctx, () => ctx.setEmotion('idle'), 4000);
});

// 95: Disgusted squint
reg(95, (ctx) => {
  ctx.setEmotion('disgusted');
  ctx.triggerAction('nod', 600);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 2000);
});

// 96: Panicked shake
reg(96, (ctx) => {
  ctx.setEmotion('panicked');
  let shake = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    shake++;
    ctx.targetEyeRef.current = { x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 20 };
    if (shake > 20 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.targetEyeRef.current = { x: 0, y: 0 };
      ctx.setEmotion('idle');
    }
  }, 80));
});

// 97: Target tracking
reg(97, (ctx) => {
  ctx.setEmotion('targeting');
  let step = 0;
  const positions = [
    {x: -40, y: -20}, {x: 40, y: -20}, {x: 40, y: 20}, {x: -40, y: 20}, {x: 0, y: 0}
  ];
  const ivl = ctx.trackInterval(window.setInterval(() => {
    if (step < positions.length) {
      ctx.targetEyeRef.current = positions[step];
      ctx.triggerAction('bob', 300);
    } else {
      clearInterval(ivl);
      resetToIdle(ctx);
    }
    step++;
  }, 600));
});

// 98: Electronic process
reg(98, (ctx) => {
  ctx.setEmotion('electronic');
  let blink = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    blink++;
    if (ctx.refs.mainEyesRef.current) {
      ctx.refs.mainEyesRef.current.style.opacity = blink % 2 === 0 ? '1' : '0.2';
    }
    if (blink > 8 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      if (ctx.refs.mainEyesRef.current) ctx.refs.mainEyesRef.current.style.opacity = '1';
      resetToIdle(ctx);
    }
  }, 200));
});

// 99: Raging shake
reg(99, (ctx) => {
  ctx.setEmotion('raging');
  toggleDetail(ctx,ctx.refs.rangingRef, 3000);
  let shake = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    shake++;
    ctx.targetEyeRef.current = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10 };
    if (shake > 30 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.targetEyeRef.current = { x: 0, y: 0 };
      resetToIdle(ctx);
    }
  }, 50));
});

// 100: Zen float
reg(100, (ctx) => {
  ctx.setEmotion('zen');
  ctx.targetEyeRef.current = { x: 0, y: -30 };
  scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 3000);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 3500);
});

// 101: Mischievous squint
reg(101, (ctx) => {
  ctx.setEmotion('mischievous');
  ctx.targetEyeRef.current = { x: -60, y: 0 };
  scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 60, y: 0 }; }, 1000);
  scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 2000);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
});

// 102: Dazzled spin
reg(102, (ctx) => {
  ctx.setEmotion('dazzled');
  let step = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    step += 0.5;
    ctx.targetEyeRef.current = { x: Math.cos(step) * 20, y: Math.sin(step) * 20 };
    if (step > 15 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.targetEyeRef.current = { x: 0, y: 0 };
      resetToIdle(ctx);
    }
  }, 50));
});

// 103: Playful double nod
reg(103, (ctx) => {
  ctx.setEmotion('playful');
  ctx.triggerAction('nod', 400);
  scheduleTimeout(ctx, () => ctx.triggerAction('nod', 400), 500);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1500);
});

// 104: Grumpy grumble
reg(104, (ctx) => {
    ctx.setEmotion('grumpy');
    ctx.triggerAction('bob', 300);
    scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 30 }; }, 400);
    scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 2500);
    scheduleTimeout(ctx, () => resetToIdle(ctx), 3000);
});

// 105: Amazed bounce
reg(105, (ctx) => {
    ctx.setEmotion('amazed');
    ctx.triggerAction('bob', 500);
    ctx.targetEyeRef.current = { x: 0, y: -20 };
    scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; resetToIdle(ctx); }, 2000);
});

// 106: Dreamy drift
reg(106, (ctx) => {
    ctx.setEmotion('dreamy');
    ctx.targetEyeRef.current = { x: 40, y: -20 };
    scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: -40, y: -20 }; }, 2000);
    scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; resetToIdle(ctx); }, 4000);
});

// 71-120 (not already registered): Random emotion + accessory
const RANDOM_EMOTIONS = [
  'happy', 'curious', 'content', 'idle', 'joyArc', 'arrowsIn', 'arrowsOut',
  'dots', 'glee', 'loveMail', 'puzzled', 'unimpressed', 'skeptical',
  'determined', 'dazzled', 'disgusted', 'panicked', 'dreamy', 'mischievous',
  'amazed', 'electronic', 'targeting', 'melancholy', 'raging', 'sassy',
  'shy', 'playful', 'analytical', 'grumpy', 'zen',
];

function runRandomEmotion(ctx: AstroAnimationContext) {
  const selected = RANDOM_EMOTIONS[Math.floor(Math.random() * RANDOM_EMOTIONS.length)];
  ctx.setEmotion(selected);
  if (selected === 'puzzled') toggleDetail(ctx,ctx.refs.thinkingRef, 3000);
  if (selected === 'analytical') toggleDetail(ctx,ctx.refs.analyticalRef, 4000);
  if (selected === 'raging') toggleDetail(ctx,ctx.refs.rangingRef, 3000);
  if (selected === 'shy' || selected === 'loveMail') toggleDetail(ctx,ctx.refs.blushRef, 3000);
  if (Math.random() > 0.5) ctx.triggerAction(Math.random() > 0.5 ? 'nod' : 'bob');
  scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
}

// Register all unregistered IDs in the 71-120 range
for (let i = 71; i <= 120; i++) {
  if (!registry.has(i)) reg(i, runRandomEmotion);
}

// -- Public API --

export function runAstroAnimation(animType: number, ctx: AstroAnimationContext): boolean {
  const runner = registry.get(animType);
  if (runner) { runner(ctx); return true; }
  return false;
}
