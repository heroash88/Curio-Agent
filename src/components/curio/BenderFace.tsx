import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { CurioState } from '../../services/emotionDetection';
import { getSharedVisionStream } from '../../services/emotionDetection';
import { useFaceTracking } from '../../hooks/useFaceTracking';
import { getVolume } from '../../services/volumeStore';
import type { FaceTrackingSample } from '../../services/faceTracking';

interface BenderFaceProps {
  state: CurioState;
  className?: string;
  lowPowerMode?: boolean;
  faceTrackingEnabled?: boolean;
  mediaStream?: MediaStream | null;
  userFacingCamera?: boolean;
  runtimeProfile?: any;
  onFaceDetected?: (detected?: boolean) => void;
  onFaceTrackingSample?: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void;
  idleSleepTimeout?: number;
  emotionHint?: string | null;
}

// -- Mouth shapes for lip sync (scaleY values for the mouth) --
const VISEME_SCALES = [1.15, 1.08, 0.95, 0.85, 1.0];

const BenderFace: React.FC<BenderFaceProps> = ({
  state,
  className,
  lowPowerMode = false,
  faceTrackingEnabled = false,
  mediaStream = null,
  userFacingCamera = true,
  runtimeProfile,
  onFaceDetected,
  onFaceTrackingSample,
  idleSleepTimeout,
  emotionHint,
}) => {
  const isLowPower = lowPowerMode;
  const allowFaceTrackingBackgroundWork =
    runtimeProfile?.allowFaceTrackingBackgroundWork ?? !isLowPower;
  const faceTrackingPollIntervalMs =
    runtimeProfile?.faceTrackingPollIntervalMs ?? (isLowPower ? 180 : 80);
  const allowAmbientAnimation = runtimeProfile?.allowAmbientAnimation ?? true;
  const documentHidden = runtimeProfile?.documentHidden ?? false;
  const sharedVisionStream = getSharedVisionStream(mediaStream);

  const [animationId, setAnimationId] = useState<number>(0);
  const [showCigar, setShowCigar] = useState(false);
  const [eyelidDroop, setEyelidDroop] = useState(0); // 0 = open, 1 = fully closed
  const [mouthScaleY, setMouthScaleY] = useState(1);
  const [mouthOffsetY, setMouthOffsetY] = useState(0);

  // -- Refs for eye tracking --
  const targetEyeRef = useRef({ x: 0, y: 0 });
  const currentEyeRef = useRef({ x: 0, y: 0 });
  const consecutiveMissesRef = useRef(0);
  const faceDetectionActiveRef = useRef(false);
  const eyeRafRef = useRef<number>(0);
  const lastInputTimeRef = useRef(Date.now());
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);
  const eyeContainerRef = useRef<HTMLDivElement>(null);
  const lipSyncRafRef = useRef<number>(0);

  // -- Apply eye transform to pupils --
  const applyEyeTransform = useCallback(() => {
    const { x, y } = currentEyeRef.current;
    const tx = `translate(${x}px, ${y}px)`;
    if (leftPupilRef.current) leftPupilRef.current.style.transform = tx;
    if (rightPupilRef.current) rightPupilRef.current.style.transform = tx;
    // Subtle parallax on the whole eye container
    if (eyeContainerRef.current) {
      eyeContainerRef.current.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    }
  }, []);

  const registerInteraction = useCallback(() => {
    lastInputTimeRef.current = Date.now();
    if (onFaceDetected) onFaceDetected(true);
  }, [onFaceDetected]);

  // -- Face tracking via shared hook --
  useFaceTracking({
    faceTrackingEnabled,
    allowFaceTrackingBackgroundWork,
    sharedVisionStream,
    userFacingCamera,
    isLowPower,
    faceTrackingPollIntervalMs,
    targetEyeRef,
    currentEyeRef,
    consecutiveMissesRef,
    faceDetectionActiveRef,
    applyEyeTransform,
    registerInteraction,
    onTrackingSample: onFaceTrackingSample,
    logTag: 'BenderFace',
    backoffThreshold: 30,
    backoffIntervalMs: 500,
  });

  // -- Eye smooth lerp RAF loop (same pattern as CurioFace) --
  useEffect(() => {
    if (documentHidden) {
      targetEyeRef.current = { x: 0, y: 0 };
      currentEyeRef.current = { x: 0, y: 0 };
      applyEyeTransform();
      return;
    }

    const EYE_EPSILON = 0.1;
    const THROTTLED_INTERVAL_MS = 250;
    let throttleTimeoutId: number | 0 = 0;

    const update = () => {
      const cur = currentEyeRef.current;
      const tgt = targetEyeRef.current;
      const lerp = faceDetectionActiveRef.current ? 0.3 : 0.15;
      cur.x += (tgt.x - cur.x) * lerp;
      cur.y += (tgt.y - cur.y) * lerp;
      applyEyeTransform();

      const converged =
        Math.abs(tgt.x - cur.x) < EYE_EPSILON &&
        Math.abs(tgt.y - cur.y) < EYE_EPSILON;

      if (converged) {
        // Swap to setTimeout when converged so the browser can idle.
        throttleTimeoutId = window.setTimeout(update, THROTTLED_INTERVAL_MS);
      } else {
        eyeRafRef.current = requestAnimationFrame(update);
      }
    };

    eyeRafRef.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(eyeRafRef.current);
      eyeRafRef.current = 0;
      if (throttleTimeoutId) window.clearTimeout(throttleTimeoutId);
    };
  }, [applyEyeTransform, documentHidden]);

  // -- Mouse tracking fallback --
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      lastInputTimeRef.current = Date.now();
      if (faceDetectionActiveRef.current) return;
      const maxMove = 25;
      targetEyeRef.current.x = ((e.clientX / window.innerWidth) - 0.5) * (maxMove * 2);
      targetEyeRef.current.y = ((e.clientY / window.innerHeight) - 0.5) * (maxMove * 2);
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, []);

  // -- Touch tracking fallback --
  useEffect(() => {
    const handler = (e: TouchEvent) => {
      lastInputTimeRef.current = Date.now();
      if (faceDetectionActiveRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const maxMove = 25;
      targetEyeRef.current.x = ((touch.clientX / window.innerWidth) - 0.5) * (maxMove * 2);
      targetEyeRef.current.y = ((touch.clientY / window.innerHeight) - 0.5) * (maxMove * 2);
    };
    document.addEventListener('touchmove', handler, { passive: true });
    return () => document.removeEventListener('touchmove', handler);
  }, []);

  // -- Wandering eyes when idle --
  useEffect(() => {
    if (!allowAmbientAnimation || state !== 'idle') return;
    const interval = isLowPower ? 5000 : 2500;
    const id = setInterval(() => {
      if (!faceDetectionActiveRef.current && Date.now() - lastInputTimeRef.current > 3000) {
        const roll = Math.random();
        if (roll < 0.3) {
          // Shifty eyes -- classic Bender
          targetEyeRef.current = { x: -20, y: 0 };
          setTimeout(() => { targetEyeRef.current = { x: 20, y: 0 }; }, 400);
          setTimeout(() => { targetEyeRef.current = { x: 0, y: 0 }; }, 800);
        } else if (roll < 0.5) {
          // Look up (scheming)
          targetEyeRef.current = { x: 0, y: -15 };
          setTimeout(() => { targetEyeRef.current = { x: 0, y: 0 }; }, 1200);
        } else if (roll < 0.65) {
          // Random wander
          targetEyeRef.current = {
            x: (Math.random() - 0.5) * 30,
            y: (Math.random() - 0.5) * 18,
          };
          setTimeout(() => { targetEyeRef.current = { x: 0, y: 0 }; }, 1500);
        } else {
          targetEyeRef.current = { x: 0, y: 0 };
        }
      }
    }, interval);
    return () => clearInterval(id);
  }, [allowAmbientAnimation, isLowPower, state]);

  // -- Lip sync during speaking --
  useEffect(() => {
    if (state !== 'speaking') {
      setMouthScaleY(1);
      setMouthOffsetY(0);
      cancelAnimationFrame(lipSyncRafRef.current);
      lipSyncRafRef.current = 0;
      return;
    }

    let lastTime = 0;
    const LIP_INTERVAL = 100;

    const frame = (timestamp: number) => {
      if (timestamp - lastTime >= LIP_INTERVAL) {
        lastTime = timestamp;
        const vol = getVolume();
        let idx: number;
        if (vol < 0.05) idx = 3;
        else if (vol > 0.4) idx = 0;
        else idx = 1 + Math.floor(Math.random() * 3);
        setMouthScaleY(VISEME_SCALES[idx]);
        setMouthOffsetY(vol > 0.3 ? -3 : 0);
      }
      lipSyncRafRef.current = requestAnimationFrame(frame);
    };
    lipSyncRafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(lipSyncRafRef.current);
      lipSyncRafRef.current = 0;
    };
  }, [state]);

  // -- Proactive state-aware animations --
  // Different animation pools per state so Bender reacts appropriately.
  // During speaking, emotion-driven animations take priority (see below),
  // so this loop only fires idle/listening/dancing flavor.
  useEffect(() => {
    if (!allowAmbientAnimation) return;

    // Curated pools per state -- avoids jarring mismatches
    const IDLE_POOL = [6, 7, 8, 9, 16, 17, 19, 20, 22, 26, 27, 28, 29, 30, 35, 36, 37, 42, 43, 45, 48, 49];
    const LISTENING_POOL = [14, 22, 26, 37, 38, 39, 45];
    const DANCING_POOL = [1, 16, 21, 23, 42, 50];

    let pool: number[];
    let intervalMs: number;
    if (state === 'listening' || state === 'thinking' || state === 'warmup') {
      pool = LISTENING_POOL;
      intervalMs = 2500;
    } else if (state === 'dancing') {
      pool = DANCING_POOL;
      intervalMs = 1500;
    } else if (state === 'speaking') {
      // Speaking is driven by emotion hints below -- only do occasional filler
      pool = [42, 43, 35, 8, 9];
      intervalMs = 4000;
    } else {
      pool = IDLE_POOL;
      intervalMs = 4000 + Math.random() * 3000;
    }

    const interval = setInterval(() => {
      // During speaking, skip ~60% of ticks so emotion-driven anims dominate
      if (state === 'speaking' && Math.random() < 0.6) return;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setAnimationId(pick);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [allowAmbientAnimation, state]);

  // -- Cigar animation (idle only, appears periodically) --
  useEffect(() => {
    if (state !== 'idle' || isLowPower) {
      setShowCigar(false);
      return;
    }
    // Show cigar every 8-18s for 6-10s
    let showTimeout: ReturnType<typeof setTimeout>;
    let hideTimeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const scheduleCigar = () => {
      if (cancelled) return;
      const delay = 8000 + Math.random() * 10000;
      showTimeout = setTimeout(() => {
        if (cancelled) return;
        setShowCigar(true);
        const duration = 6000 + Math.random() * 4000;
        hideTimeout = setTimeout(() => {
          if (cancelled) return;
          setShowCigar(false);
          scheduleCigar();
        }, duration);
      }, delay);
    };
    scheduleCigar();

    return () => {
      cancelled = true;
      clearTimeout(showTimeout);
      clearTimeout(hideTimeout);
      setShowCigar(false);
    };
  }, [state, isLowPower]);

  // -- Eyelid droop for sleepy/bored states --
  useEffect(() => {
    if (state === 'idle') {
      const sleepThreshold = (idleSleepTimeout || 120) * 1000;
      const checkDroop = setInterval(() => {
        const elapsed = Date.now() - lastInputTimeRef.current;
        if (elapsed > sleepThreshold) {
          setEyelidDroop(0.7);
        } else if (elapsed > sleepThreshold * 0.6) {
          setEyelidDroop(0.35);
        } else {
          setEyelidDroop(0);
        }
      }, 2000);
      return () => clearInterval(checkDroop);
    }
    setEyelidDroop(0);
  }, [state, idleSleepTimeout]);

  // -- Comprehensive emotion -> Bender animation mapping --
  // Maps every emotion that emotionFromText can return to one or more
  // fitting Bender animation IDs. When multiple IDs are listed, one is
  // picked at random so repeated hits of the same emotion feel varied.
  const EMOTION_TO_ANIMS: Record<string, number[]> = {
    // Positive
    happy:        [42, 23, 43, 50],    // evil grin, wide grin, wink, belly laugh
    excited:      [24, 14, 33, 50],    // big eyes, raised visor, open mouth, belly laugh
    love:         [46, 43, 21],        // love eyes, wink, bright eyes
    dazzled:      [21, 25, 39],        // bright eyes, red antenna, antenna flash
    playful:      [49, 43, 16, 50],    // mischievous, wink, drunk sway, belly laugh
    amazed:       [14, 33, 34],        // raised visor, open mouth, jumped up
    // Negative
    sad:          [44, 30, 28],        // droopy sad, flat mouth, bored lids
    melancholy:   [44, 28, 29],        // droopy, bored lids, side-eye
    panicked:     [12, 15, 11],        // rage eyes, red socket glow, angry squint
    disgusted:    [13, 45, 11],        // clenched jaw, suspicious squint, angry squint
    grumpy:       [11, 13, 30],        // angry squint, clenched jaw, flat mouth
    raging:       [12, 15, 11, 13],    // rage eyes, red socket, angry squint, clenched jaw
    // Cognitive
    confused:     [38, 27, 19],        // antenna wobble, eye roll, tilted head
    curious:      [37, 24, 26],        // side glance, big eyes, eyes up
    surprised:    [14, 33, 34],        // raised visor, open mouth, jumped up
    thinking:     [26, 29, 37],        // eyes up, side-eye, side glance (scheming look)
    analytical:   [22, 45, 37],        // tiny pupils, suspicious squint, side glance
    skeptical:    [45, 8, 29],         // suspicious squint, half-lidded, side-eye
    dreamy:       [26, 48, 28],        // eyes up, sleepy blink, bored lids
    // Attitude
    smirk:        [42, 36, 35, 49],    // evil grin, smug grin, smug wink, mischievous
    mischievous:  [49, 42, 9, 6],      // mischievous, evil grin, crooked grin, look left
    sassy:        [35, 36, 43],        // smug wink, smug grin, wink
    determined:   [11, 22, 14],        // angry squint, tiny pupils, raised visor
    shy:          [29, 17, 48],        // side-eye, one eye droopy, sleepy blink
    // Physical
    sleepy:       [48, 28, 17],        // sleepy blink, bored lids, one eye droopy
    unimpressed:  [28, 29, 30, 8],     // bored lids, side-eye, flat mouth, half-lidded
    // Tech
    electronic:   [40, 41, 39],        // glitch eye, pupil twitch, antenna flash
    targeting:    [22, 45, 37],        // tiny pupils, suspicious squint, side glance
    // Humor
    zen:          [48, 28, 26],        // sleepy blink, bored lids, eyes up
  };

  const pickEmotionAnim = (emotion: string): number | null => {
    const pool = EMOTION_TO_ANIMS[emotion];
    if (!pool || pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // -- Emotion hint reactivity (from CurioAgentMode) --
  // emotionHint is derived from the active transcript upstream so the face
  // can still emote from text without subscribing to every transcript chunk.
  useEffect(() => {
    if (!emotionHint) return;
    const anim = pickEmotionAnim(emotionHint);
    if (anim !== null) setAnimationId(anim);
  }, [emotionHint]);

  // Animation Preview Handler
  useEffect(() => {
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
    const handlePreview = (e: Event) => {
      const customEvent = e as CustomEvent;
      const action = customEvent.detail?.action;
      const id = customEvent.detail?.id;

      if (action === 'special' && typeof id === 'number') {
        if (id === 99) {
          // Special: cigar preview
          setShowCigar(true);
          pendingTimeouts.push(setTimeout(() => setShowCigar(false), 5000));
        } else {
          setAnimationId(id);
        }
      } else if (action === 'nod') {
        setAnimationId(28);
        pendingTimeouts.push(setTimeout(() => setAnimationId(0), 1000));
      } else if (action === 'bob') {
        setAnimationId(26);
        pendingTimeouts.push(setTimeout(() => setAnimationId(0), 1000));
      } else if (action === 'blink') {
        setAnimationId(29);
        pendingTimeouts.push(setTimeout(() => setAnimationId(0), 400));
      }
    };

    window.addEventListener('curio:preview-animation', handlePreview);
    return () => {
      window.removeEventListener('curio:preview-animation', handlePreview);
      pendingTimeouts.forEach(clearTimeout);
    };
  }, []);

  const benderStateClass = useMemo(() => {
    switch (state) {
      case 'speaking': return 'speaking';
      case 'listening': return 'listening';
      case 'thinking': return 'thinking';
      case 'warmup': return 'warmup';
      case 'dancing': return 'dancing';
      case 'error': return 'error';
      default: return 'idle';
    }
  }, [state]);

  const currentAnimationClass = `anim-${animationId}`;

  return (
    <div className={`Bender ${benderStateClass} ${currentAnimationClass} ${className ?? ''}`}>
      <style>{`
        .Bender {
          height: 100%;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-direction: column;
          background: transparent;
          overflow: hidden;
          margin: 0;
          padding: 0;
          position: relative;
        }

        /* ===== ANTENNA ===== */
        .Bender__antenna {
          position: relative;
          width: 6px;
          height: min(60px, 8vw);
          background: linear-gradient(to top, #6b7b8d, #8a9bae);
          border-radius: 3px;
          margin-bottom: -2px;
          z-index: 2;
        }
        .Bender__antenna-ball {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          width: 16px;
          height: 16px;
          background: radial-gradient(circle at 40% 35%, #c0d0e0, #7a8fa3);
          border-radius: 50%;
          border: 2px solid #5a6a7a;
          box-shadow: 0 0 8px rgba(100, 200, 255, 0.3);
        }
        .Bender__antenna-ball--glow {
          animation: antennaGlow 2s ease-in-out infinite;
        }
        @keyframes antennaGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(100, 200, 255, 0.3); }
          50% { box-shadow: 0 0 20px rgba(100, 200, 255, 0.8), 0 0 40px rgba(100, 200, 255, 0.3); }
        }

        /* ===== EYES ===== */
        .Bender__eyes {
          width: min(620px, 83vw);
          height: min(210px, 28vw);
          border: 6px solid #3a4a5a;
          border-radius: 120px;
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          background: linear-gradient(180deg, #8a9bae 0%, #7a8b9e 100%);
          box-shadow: inset 0 4px 8px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.2);
        }

        .Bender__socket {
          width: min(580px, 78vw);
          height: min(185px, 25vw);
          border: 5px solid #2a3a4a;
          border-radius: 200px;
          background: #0a0a0a;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: inset 0 4px 12px rgba(0,0,0,0.8);
        }

        .Bender__eye {
          height: min(170px, 23vw);
          width: min(220px, 29vw);
          background: linear-gradient(180deg, #fefdd0 0%, #f5f0a0 100%);
          border-radius: 45%;
          margin: 0 min(6px, 0.8vw);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          border: 3px solid rgba(0,0,0,0.1);
        }

        /* Eyelids -- top and bottom */
        .Bender__eyelid-top {
          position: absolute;
          width: 100%;
          height: 50%;
          top: -50%;
          background: #0a0a0a;
          animation: 5s ease-in-out 1s infinite topEyelid;
          z-index: 3;
          transition: transform 0.4s ease;
        }
        .Bender__eyelid-bottom {
          position: absolute;
          width: 100%;
          height: 50%;
          bottom: -50%;
          background: #0a0a0a;
          animation: 5s ease-in-out 1s infinite bottomEyelid;
          z-index: 3;
          transition: transform 0.4s ease;
        }

        /* Droop override -- controlled by eyelidDroop state */
        .Bender__eyelid-top.droop {
          animation: none;
        }
        .Bender__eyelid-bottom.droop {
          animation: none;
        }

        .Bender__pupil {
          width: 38px;
          height: 38px;
          background: #0a0a0a;
          border-radius: 3px;
          box-shadow: none;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1;
          position: relative;
        }
        /* Pupil highlight */
        .Bender__pupil::after {
          content: none;
        }

        /* ===== MOUTH ===== */
        .Bender__mouth-wrapper {
          position: relative;
          display: flex;
          justify-content: center;
        }

        /* Smoking puff animation -- mouth purses on inhale, relaxes on exhale */
        .Bender__mouth-wrapper.smoking .Bender__mouth {
          animation: smokingPuff 3s ease-in-out infinite !important;
        }
        .Bender__mouth-wrapper.smoking .Bender__tooth {
          animation: smokingTeeth 3s ease-in-out infinite;
        }
        @keyframes smokingPuff {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          /* Inhale -- mouth tightens, pulls toward cigar side */
          20% { transform: scaleY(0.75) scaleX(0.88) translateX(4px); }
          35% { transform: scaleY(0.7) scaleX(0.85) translateX(5px); }
          /* Hold */
          50% { transform: scaleY(0.8) scaleX(0.9) translateX(3px); }
          /* Exhale -- mouth opens slightly */
          70% { transform: scaleY(1.08) scaleX(1.02); }
          85% { transform: scaleY(1.03) scaleX(1.01); }
        }
        @keyframes smokingTeeth {
          0%, 100% { opacity: 0.7; }
          20%, 50% { opacity: 0.5; transform: scaleX(0.8); }
          70% { opacity: 0.8; transform: scaleX(1.1); }
        }
        .Bender__mouth {
          width: min(440px, 58vw);
          height: min(150px, 20vw);
          background: linear-gradient(180deg, #fefdd0 0%, #e8e090 100%);
          margin-top: min(100px, 13vw);
          border-radius: 70px;
          border: 8px solid #2a3a4a;
          display: flex;
          align-items: center;
          justify-content: space-evenly;
          overflow: hidden;
          position: relative;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        }

        .Bender__tooth {
          height: 100%;
          width: 6px;
          background: #2a3a4a;
          opacity: 0.85;
          flex-shrink: 0;
          z-index: 2;
        }

        .Bender__lip {
          position: absolute;
          width: 100%;
          height: 6px;
          background: #2a3a4a;
          opacity: 0.85;
          z-index: 1;
          transition: top 0.12s ease;
          left: 0;
        }
        .Bender__lip--top {
          top: 42%;
        }
        .Bender__lip--bottom {
          top: 58%;
        }

        /* Speaking: both lines shift up/down AND wobble/bend */
        .Bender.speaking .Bender__lip--top {
          animation: lipJawTop 0.25s ease-in-out infinite;
        }
        .Bender.speaking .Bender__lip--bottom {
          animation: lipJawBottom 0.25s ease-in-out infinite;
        }
        @keyframes lipJawTop {
          0% { top: 42%; transform: skewX(0deg) scaleY(1); }
          20% { top: 33%; transform: skewX(3deg) scaleY(1.3); }
          50% { top: 30%; transform: skewX(-2deg) scaleY(0.8); }
          80% { top: 35%; transform: skewX(4deg) scaleY(1.2); }
          100% { top: 42%; transform: skewX(0deg) scaleY(1); }
        }
        @keyframes lipJawBottom {
          0% { top: 58%; transform: skewX(0deg) scaleY(1); }
          20% { top: 48%; transform: skewX(-3deg) scaleY(1.2); }
          50% { top: 44%; transform: skewX(2deg) scaleY(0.8); }
          80% { top: 50%; transform: skewX(-4deg) scaleY(1.3); }
          100% { top: 58%; transform: skewX(0deg) scaleY(1); }
        }

        /* Grid lines -- no longer using ::after */
        .Bender__mouth::after {
          content: none;
        }

        /* ===== CIGAR ===== */
        .Bender__cigar-container {
          position: absolute;
          right: min(-50px, -7vw);
          top: 50%;
          transform: translateY(-60%) translateX(20px) rotate(-25deg);
          z-index: 10;
          opacity: 0;
          transition: opacity 0.8s ease, transform 0.8s ease;
          pointer-events: none;
        }
        .Bender__cigar-container.visible {
          opacity: 1;
          transform: translateY(-60%) translateX(0) rotate(-25deg);
        }
        .Bender__cigar {
          width: min(200px, 26vw);
          height: min(44px, 5.5vw);
          background: linear-gradient(90deg, #7a5a10 0%, #9a7828 20%, #b8923a 50%, #a07828 80%, #7a5a10 100%);
          border-radius: 7px 4px 4px 7px;
          position: relative;
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
        }
        /* Cigar band */
        .Bender__cigar::before {
          content: '';
          position: absolute;
          left: 12%;
          top: 0;
          width: 18%;
          height: 100%;
          background: linear-gradient(180deg, #d4b050, #8B6914, #d4b050);
          border-radius: 2px;
        }
        /* Cigar ash tip -- grey crumbly end */
        .Bender__cigar-tip {
          position: absolute;
          right: -5px;
          top: 3px;
          width: min(18px, 2.2vw);
          height: calc(100% - 6px);
          background: linear-gradient(90deg, #888, #aaa, #999);
          border-radius: 0 5px 5px 0;
          opacity: 0.9;
        }
        /* Ember glow -- thin line at the ash boundary */
        .Bender__cigar-tip::after {
          content: '';
          position: absolute;
          left: -3px;
          top: 10%;
          width: 5px;
          height: 80%;
          background: linear-gradient(180deg, #ff6600, #ff3300, #ff6600);
          border-radius: 3px;
          animation: emberGlow 1.5s ease-in-out infinite;
        }
        @keyframes emberGlow {
          0%, 100% { opacity: 0.8; filter: brightness(1); }
          50% { opacity: 1; filter: brightness(1.4); }
        }
        /* Smoke particles */
        .Bender__smoke {
          position: absolute;
          right: -8px;
          top: -8px;
        }
        .Bender__smoke-particle {
          position: absolute;
          width: 10px;
          height: 10px;
          background: rgba(190, 195, 205, 0.45);
          border-radius: 50%;
          animation: smokeRise 3.5s ease-out infinite;
        }
        .Bender__smoke-particle:nth-child(1) { animation-delay: 0s; left: 0; }
        .Bender__smoke-particle:nth-child(2) { animation-delay: 1s; left: 5px; width: 14px; height: 14px; }
        .Bender__smoke-particle:nth-child(3) { animation-delay: 2s; left: -3px; width: 16px; height: 16px; }
        .Bender__smoke-particle:nth-child(4) { animation-delay: 2.6s; left: 10px; width: 8px; height: 8px; }
        @keyframes smokeRise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 0.5; }
          50% { transform: translateY(-50px) translateX(10px) scale(2); opacity: 0.3; }
          100% { transform: translateY(-100px) translateX(20px) scale(3); opacity: 0; }
        }

        /* ===== KEYFRAMES ===== */
        @keyframes topEyelid {
          0%, 85%, 100% { transform: translateY(-100%); }
          90%, 95% { transform: translateY(0); }
        }
        @keyframes bottomEyelid {
          0%, 85%, 100% { transform: translateY(100%); }
          90%, 95% { transform: translateY(0); }
        }

        /* ===== STATE ANIMATIONS ===== */
        .Bender.speaking .Bender__tooth {
          animation: toothJitter 0.2s infinite alternate;
        }

        @keyframes toothJitter {
          0% { transform: scaleX(1); }
          100% { transform: scaleX(1.15); }
        }

        /* Speaking: horizontal grid lines stretch apart */
        .Bender.speaking .Bender__mouth::after {
          animation: gridStretch 0.15s infinite alternate;
        }
        @keyframes gridStretch {
          0% { transform: scaleY(1); }
          100% { transform: scaleY(1.06); }
        }

        .Bender.listening .Bender__eyes {
          box-shadow: inset 0 4px 8px rgba(0,0,0,0.15), 0 0 40px rgba(255, 255, 0, 0.3), 0 0 80px rgba(255, 255, 0, 0.1);
        }
        .Bender.listening .Bender__antenna-ball {
          animation: antennaGlow 1s ease-in-out infinite;
        }

        .Bender.thinking .Bender__antenna-ball {
          animation: antennaGlow 0.6s ease-in-out infinite;
        }
        .Bender.thinking .Bender__pupil {
          animation: thinkingPupil 2s ease-in-out infinite;
        }
        @keyframes thinkingPupil {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(8px, -8px); }
          75% { transform: translate(-5px, -5px); }
        }

        .Bender.dancing {
          animation: benderDance 0.5s infinite alternate ease-in-out;
        }
        .Bender.dancing .Bender__mouth {
          animation: danceMouth 0.25s infinite alternate;
        }
        @keyframes danceMouth {
          0% { transform: scaleY(0.95) rotate(-2deg); }
          100% { transform: scaleY(1.05) rotate(2deg); }
        }

        .Bender.idle .Bender__mouth {
          animation: idleMouthPulse 4s infinite ease-in-out;
        }
        @keyframes idleMouthPulse {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 1; transform: scale(1.005); }
        }

        @keyframes benderDance {
          from { transform: rotate(-5deg); }
          to { transform: rotate(5deg); }
        }

        .Bender.warmup .Bender__antenna-ball {
          animation: antennaGlow 0.4s ease-in-out infinite;
        }
        .Bender.warmup .Bender__eyes {
          animation: warmupPulse 1.5s ease-in-out infinite;
        }
        @keyframes warmupPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        .Bender.error .Bender__eye {
          background: linear-gradient(180deg, #ffcccc 0%, #ff9999 100%);
        }
        .Bender.error .Bender__pupil {
          background: radial-gradient(circle, #cc0000, #660000);
          box-shadow: 0 0 12px rgba(255, 0, 0, 0.5);
        }
        .Bender.error .Bender__antenna-ball {
          background: radial-gradient(circle at 40% 35%, #ff4444, #cc0000);
          box-shadow: 0 0 15px rgba(255, 0, 0, 0.6);
        }

        /* ===== 50 BENDER-THEMED ANIMATIONS ===== */
        /* Every animation uses multi-property keyframes for lifelike feel */

        /* 1: Head Tilt -- whole visor tilts with pupils sliding */
        .anim-1 .Bender__eyes { animation: a1eyes 2.5s ease-in-out infinite alternate; }
        .anim-1 .Bender__pupil { animation: a1pupil 2.5s ease-in-out infinite alternate; }
        .anim-1 .Bender__mouth { animation: a1mouth 2.5s ease-in-out infinite alternate; }
        @keyframes a1eyes { 0% { transform: rotate(-6deg) translateX(-4px); } 100% { transform: rotate(6deg) translateX(4px); } }
        @keyframes a1pupil { 0% { transform: translate(-8px, 2px); } 100% { transform: translate(8px, -2px); } }
        @keyframes a1mouth { 0% { transform: rotate(-3deg); } 100% { transform: rotate(3deg); } }

        /* 2: Skewed Eyes -- asymmetric distortion */
        .anim-2 .Bender__eye:first-child { animation: a2left 1.8s ease-in-out infinite alternate; }
        .anim-2 .Bender__eye:last-child { animation: a2right 1.8s ease-in-out infinite alternate; }
        .anim-2 .Bender__pupil { animation: a2pupil 0.9s ease-in-out infinite alternate; }
        @keyframes a2left { 0% { transform: skewX(-8deg) scaleY(0.9); } 100% { transform: skewX(5deg) scaleY(1.05); } }
        @keyframes a2right { 0% { transform: skewX(8deg) scaleY(1.05); } 100% { transform: skewX(-5deg) scaleY(0.9); } }
        @keyframes a2pupil { 0% { transform: translate(-3px, 0); } 100% { transform: translate(3px, 0); } }

        /* 3: Squished Eyes -- compressed then spring back */
        .anim-3 .Bender__eye { animation: a3eye 2s ease-in-out infinite; }
        .anim-3 .Bender__mouth { animation: a3mouth 2s ease-in-out infinite; }
        @keyframes a3eye { 0%, 100% { transform: scaleX(1) scaleY(1); } 30% { transform: scaleX(0.7) scaleY(1.15); } 60% { transform: scaleX(1.1) scaleY(0.85); } }
        @keyframes a3mouth { 0%, 100% { transform: scaleX(1); } 30% { transform: scaleX(0.85); } 60% { transform: scaleX(1.08); } }

        /* 4: Red Socket -- menacing red glow pulses in socket */
        .anim-4 .Bender__socket { animation: a4socket 1.5s ease-in-out infinite; }
        .anim-4 .Bender__pupil { animation: a4pupil 1.5s ease-in-out infinite; }
        .anim-4 .Bender__eye { animation: a4eye 1.5s ease-in-out infinite; }
        @keyframes a4socket { 0%, 100% { background: #0a0a0a; box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); } 50% { background: #2a0000; box-shadow: inset 0 0 30px rgba(255,0,0,0.4); } }
        @keyframes a4pupil { 0%, 100% { box-shadow: 0 0 6px rgba(0,0,0,0.5); } 50% { box-shadow: 0 0 12px rgba(255,50,0,0.6); } }
        @keyframes a4eye { 0%, 100% { border-color: rgba(0,0,0,0.15); } 50% { border-color: rgba(200,0,0,0.3); } }

        /* 5: Flushed Eyes -- embarrassed pink pulse */
        .anim-5 .Bender__eye { animation: a5eye 2s ease-in-out infinite; }
        .anim-5 .Bender__pupil { animation: a5pupil 2s ease-in-out infinite; }
        .anim-5 .Bender__mouth { animation: a5mouth 2s ease-in-out infinite; }
        @keyframes a5eye { 0%, 100% { background: linear-gradient(180deg, #fefdd0, #f5f0a0); } 50% { background: linear-gradient(180deg, #ffe0e0, #ffbbbb); } }
        @keyframes a5pupil { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.8) translateY(3px); } }
        @keyframes a5mouth { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.75) scaleX(0.9); } }

        /* 6: Look Left -- shifty glance with body lean */
        .anim-6 { animation: a6body 2.5s ease-in-out infinite; }
        .anim-6 .Bender__pupil { animation: a6pupil 2.5s ease-in-out infinite; }
        .anim-6 .Bender__eye { animation: a6eye 2.5s ease-in-out infinite; }
        @keyframes a6body { 0%, 100% { transform: translateX(0); } 30%, 70% { transform: translateX(-6px); } }
        @keyframes a6pupil { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-18px, -2px); } 80% { transform: translate(-18px, 2px); } }
        @keyframes a6eye { 0%, 100% { transform: scaleY(1); } 30%, 70% { transform: scaleY(0.75); } }

        /* 7: Look Right -- mirror of look left */
        .anim-7 { animation: a7body 2.5s ease-in-out infinite; }
        .anim-7 .Bender__pupil { animation: a7pupil 2.5s ease-in-out infinite; }
        .anim-7 .Bender__eye { animation: a7eye 2.5s ease-in-out infinite; }
        @keyframes a7body { 0%, 100% { transform: translateX(0); } 30%, 70% { transform: translateX(6px); } }
        @keyframes a7pupil { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(18px, -2px); } 80% { transform: translate(18px, 2px); } }
        @keyframes a7eye { 0%, 100% { transform: scaleY(1); } 30%, 70% { transform: scaleY(0.75); } }

        /* 8: Half-Lidded -- bored droopy lids with slow pupil drift */
        .anim-8 .Bender__eye { animation: a8eye 3s ease-in-out infinite; }
        .anim-8 .Bender__pupil { animation: a8pupil 4s ease-in-out infinite; }
        .anim-8 .Bender__mouth { transform: scaleY(0.7) scaleX(0.95); }
        @keyframes a8eye { 0%, 100% { transform: scaleY(0.45); } 50% { transform: scaleY(0.55); } }
        @keyframes a8pupil { 0%, 100% { transform: translate(-5px, 4px); } 50% { transform: translate(5px, 4px); } }

        /* 9: Crooked Grin -- asymmetric smirk */
        .anim-9 .Bender__mouth { animation: a9mouth 2s ease-in-out infinite alternate; }
        .anim-9 .Bender__eye:first-child { animation: a9left 2s ease-in-out infinite alternate; }
        .anim-9 .Bender__pupil { animation: a9pupil 2s ease-in-out infinite alternate; }
        @keyframes a9mouth { 0% { transform: skewX(6deg) scaleY(0.85) rotate(2deg); } 100% { transform: skewX(10deg) scaleY(0.8) rotate(3deg); } }
        @keyframes a9left { 0% { transform: scaleY(0.7); } 100% { transform: scaleY(0.6); } }
        @keyframes a9pupil { 0% { transform: translate(5px, 2px); } 100% { transform: translate(8px, 0); } }

        /* 10: Dilated Pupils -- wide-eyed interest, pupils pulse big */
        .anim-10 .Bender__pupil { animation: a10pupil 1.5s ease-in-out infinite; }
        .anim-10 .Bender__eye { animation: a10eye 1.5s ease-in-out infinite; }
        .anim-10 .Bender__eyes { animation: a10visor 1.5s ease-in-out infinite; }
        @keyframes a10pupil { 0%, 100% { transform: scale(1.6); } 50% { transform: scale(2); } }
        @keyframes a10eye { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes a10visor { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }

        /* 11: Angry Squint -- narrowed eyes, tense body */
        .anim-11 .Bender__eye { animation: a11eye 1.8s ease-in-out infinite; }
        .anim-11 .Bender__pupil { animation: a11pupil 1.8s ease-in-out infinite; }
        .anim-11 .Bender__mouth { animation: a11mouth 1.8s ease-in-out infinite; }
        .anim-11 .Bender__eyes { animation: a11visor 0.8s ease-in-out infinite alternate; }
        @keyframes a11eye { 0%, 100% { transform: scaleY(0.35) translateY(8px); } 50% { transform: scaleY(0.4) translateY(10px); } }
        @keyframes a11pupil { 0%, 100% { transform: scale(0.7) translateY(2px); } 50% { transform: scale(0.65) translateY(3px); } }
        @keyframes a11mouth { 0%, 100% { transform: scaleY(0.65) scaleX(0.9); border-radius: 30px; } 50% { transform: scaleY(0.6) scaleX(0.88); border-radius: 25px; } }
        @keyframes a11visor { 0% { transform: translateY(0); } 100% { transform: translateY(-3px); } }

        /* 12: Rage Eyes -- red pulsing pupils with socket glow */
        .anim-12 .Bender__pupil { animation: a12pupil 0.8s ease-in-out infinite; }
        .anim-12 .Bender__socket { animation: a12socket 0.8s ease-in-out infinite; }
        .anim-12 .Bender__eye { animation: a12eye 0.8s ease-in-out infinite; }
        .anim-12 .Bender__mouth { transform: scaleY(0.7) scaleX(0.92); border-radius: 30px; }
        @keyframes a12pupil { 0%, 100% { background: radial-gradient(circle, #ee0000, #440000); box-shadow: 0 0 8px red; transform: scale(0.9); } 50% { background: radial-gradient(circle, #ff3300, #660000); box-shadow: 0 0 20px red, 0 0 40px rgba(255,0,0,0.3); transform: scale(1.1); } }
        @keyframes a12socket { 0%, 100% { box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); } 50% { box-shadow: inset 0 0 20px rgba(255,0,0,0.4); } }
        @keyframes a12eye { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(0.45); } }

        /* 13: Clenched Jaw -- tight mouth with grinding teeth */
        .anim-13 .Bender__mouth { animation: a13mouth 1.5s ease-in-out infinite; }
        .anim-13 .Bender__tooth { animation: a13tooth 0.3s ease-in-out infinite alternate; }
        .anim-13 .Bender__eye { animation: a13eye 1.5s ease-in-out infinite; }
        @keyframes a13mouth { 0%, 100% { transform: scaleY(0.6) scaleX(0.95); border-radius: 30px; } 50% { transform: scaleY(0.55) scaleX(0.9); border-radius: 25px; } }
        @keyframes a13tooth { 0% { transform: scaleX(1.1); } 100% { transform: scaleX(1.4); opacity: 0.9; } }
        @keyframes a13eye { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(0.45) translateY(5px); } }

        /* 14: Raised Visor -- startled upward jolt */
        .anim-14 .Bender__eyes { animation: a14visor 2s ease-out infinite; }
        .anim-14 .Bender__pupil { animation: a14pupil 2s ease-out infinite; }
        .anim-14 .Bender__antenna { animation: a14ant 2s ease-out infinite; }
        @keyframes a14visor { 0% { transform: translateY(0); } 15% { transform: translateY(-18px) scale(1.04); } 40% { transform: translateY(-12px); } 100% { transform: translateY(0); } }
        @keyframes a14pupil { 0% { transform: scale(1); } 15% { transform: scale(1.5) translateY(-3px); } 100% { transform: scale(1); } }
        @keyframes a14ant { 0% { transform: scaleY(1); } 15% { transform: scaleY(1.3); } 100% { transform: scaleY(1); } }

        /* 15: Red Socket Glow -- ominous pulsing */
        .anim-15 .Bender__socket { animation: a15socket 2s ease-in-out infinite; }
        .anim-15 .Bender__antenna-ball { animation: a15ball 2s ease-in-out infinite; }
        .anim-15 .Bender__eye { animation: a15eye 2s ease-in-out infinite; }
        @keyframes a15socket { 0%, 100% { box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); } 50% { box-shadow: inset 0 0 30px rgba(255,0,0,0.5), inset 0 0 60px rgba(255,0,0,0.2); } }
        @keyframes a15ball { 0%, 100% { box-shadow: 0 0 8px rgba(100,200,255,0.3); } 50% { box-shadow: 0 0 20px rgba(255,50,50,0.8); background: radial-gradient(circle, #ff5555, #aa2222); } }
        @keyframes a15eye { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.6); } }

        /* 16: Drunk Sway -- full body wobble with misaligned eyes */
        .anim-16 { animation: a16body 3s ease-in-out infinite; }
        .anim-16 .Bender__eye:first-child { animation: a16left 3s ease-in-out infinite; }
        .anim-16 .Bender__eye:last-child { animation: a16right 3s ease-in-out infinite; }
        .anim-16 .Bender__pupil { animation: a16pupil 2s ease-in-out infinite; }
        .anim-16 .Bender__mouth { animation: a16mouth 3s ease-in-out infinite; }
        @keyframes a16body { 0%, 100% { transform: rotate(0) translateX(0); } 25% { transform: rotate(4deg) translateX(10px); } 75% { transform: rotate(-4deg) translateX(-10px); } }
        @keyframes a16left { 0%, 100% { transform: scaleY(0.7); } 50% { transform: scaleY(0.9); } }
        @keyframes a16right { 0%, 100% { transform: scaleY(0.9); } 50% { transform: scaleY(0.6); } }
        @keyframes a16pupil { 0%, 100% { transform: translate(0, 5px); } 50% { transform: translate(5px, -3px); } }
        @keyframes a16mouth { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(4deg) translateX(3px); } 75% { transform: rotate(-4deg) translateX(-3px); } }

        /* 17: One Eye Droopy -- asymmetric sleepy */
        .anim-17 .Bender__eye:first-child { animation: a17left 3s ease-in-out infinite; }
        .anim-17 .Bender__eye:last-child { animation: a17right 3s ease-in-out infinite; }
        .anim-17 .Bender__mouth { animation: a17mouth 3s ease-in-out infinite; }
        @keyframes a17left { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(0.5); } }
        @keyframes a17right { 0%, 100% { transform: scaleY(0.9); } 50% { transform: scaleY(0.85); } }
        @keyframes a17mouth { 0%, 100% { transform: skewX(3deg) scaleY(0.8); } 50% { transform: skewX(5deg) scaleY(0.75); } }

        /* 18: Round Pupils -- dazed/confused look */
        .anim-18 .Bender__pupil { animation: a18pupil 2s ease-in-out infinite; }
        .anim-18 .Bender__eyes { animation: a18visor 4s ease-in-out infinite; }
        @keyframes a18pupil { 0%, 100% { width: 32px; height: 32px; transform: rotate(0); } 50% { width: 26px; height: 26px; transform: rotate(180deg); } }
        @keyframes a18visor { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-3deg); } }

        /* 19: Tilted Head -- quizzical angle */
        .anim-19 .Bender__eyes { animation: a19visor 2.5s ease-in-out infinite alternate; }
        .anim-19 .Bender__mouth { animation: a19mouth 2.5s ease-in-out infinite alternate; }
        .anim-19 .Bender__pupil { animation: a19pupil 2.5s ease-in-out infinite alternate; }
        @keyframes a19visor { 0% { transform: rotate(-6deg) translateX(-3px); } 100% { transform: rotate(2deg) translateX(2px); } }
        @keyframes a19mouth { 0% { transform: rotate(-4deg); } 100% { transform: rotate(1deg); } }
        @keyframes a19pupil { 0% { transform: translate(-6px, 3px); } 100% { transform: translate(4px, -2px); } }

        /* 20: Lopsided Mouth -- crooked jaw */
        .anim-20 .Bender__mouth { animation: a20mouth 2s ease-in-out infinite; }
        .anim-20 .Bender__tooth { animation: a20tooth 2s ease-in-out infinite; }
        @keyframes a20mouth { 0%, 100% { transform: rotate(5deg) translateX(5px) scaleY(0.9); } 50% { transform: rotate(7deg) translateX(8px) scaleY(0.85); } }
        @keyframes a20tooth { 0%, 100% { opacity: 0.7; } 50% { opacity: 0.9; transform: scaleX(1.2); } }

        /* 21: Bright Eyes -- glowing golden excitement */
        .anim-21 .Bender__eye { animation: a21eye 1.5s ease-in-out infinite; }
        .anim-21 .Bender__pupil { animation: a21pupil 1.5s ease-in-out infinite; }
        .anim-21 .Bender__antenna-ball { animation: a21ball 1.5s ease-in-out infinite; }
        @keyframes a21eye { 0%, 100% { background: linear-gradient(180deg, #ffe066, #ffcc00); box-shadow: inset 0 0 15px rgba(255,200,0,0.3); } 50% { background: linear-gradient(180deg, #fff0a0, #ffe040); box-shadow: inset 0 0 25px rgba(255,200,0,0.5); } }
        @keyframes a21pupil { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.3); } }
        @keyframes a21ball { 0%, 100% { box-shadow: 0 0 8px rgba(255,200,0,0.3); } 50% { box-shadow: 0 0 25px rgba(255,200,0,0.8); } }

        /* 22: Tiny Pupils -- intense focus, pinpoint stare */
        .anim-22 .Bender__pupil { animation: a22pupil 2s ease-in-out infinite; }
        .anim-22 .Bender__eye { animation: a22eye 2s ease-in-out infinite; }
        @keyframes a22pupil { 0%, 100% { transform: scale(0.5); } 50% { transform: scale(0.4); } }
        @keyframes a22eye { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }

        /* 23: Wide Grin -- maniacal smile spreading */
        .anim-23 .Bender__mouth { animation: a23mouth 2s ease-in-out infinite; }
        .anim-23 .Bender__eye { animation: a23eye 2s ease-in-out infinite; }
        .anim-23 .Bender__tooth { animation: a23tooth 1s ease-in-out infinite alternate; }
        @keyframes a23mouth { 0%, 100% { transform: scaleX(1.05) scaleY(1.05); border-radius: 70px; } 50% { transform: scaleX(1.15) scaleY(1.12); border-radius: 55px; } }
        @keyframes a23eye { 0%, 100% { transform: scaleY(0.6); } 50% { transform: scaleY(0.5); } }
        @keyframes a23tooth { 0% { opacity: 0.7; } 100% { opacity: 0.95; } }

        /* 24: Big Eyes -- wide alert stare */
        .anim-24 .Bender__eyes { animation: a24visor 2s ease-in-out infinite; }
        .anim-24 .Bender__eye { animation: a24eye 2s ease-in-out infinite; }
        .anim-24 .Bender__pupil { animation: a24pupil 2s ease-in-out infinite; }
        @keyframes a24visor { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes a24eye { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        @keyframes a24pupil { 0%, 100% { transform: scale(1.2); } 50% { transform: scale(1.5); } }

        /* 25: Red Antenna -- danger signal */
        .anim-25 .Bender__antenna-ball { animation: a25ball 1s ease-in-out infinite; }
        .anim-25 .Bender__antenna { animation: a25ant 1s ease-in-out infinite; }
        .anim-25 .Bender__eye { animation: a25eye 1s ease-in-out infinite; }
        @keyframes a25ball { 0%, 100% { box-shadow: 0 0 15px rgba(255,50,50,0.6); background: radial-gradient(circle, #ff5555, #cc2222); } 50% { box-shadow: 0 0 35px rgba(255,50,50,1), 0 0 60px rgba(255,0,0,0.4); background: radial-gradient(circle, #ff7777, #ee3333); } }
        @keyframes a25ant { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.08); } }
        @keyframes a25eye { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.85); } }

        /* 26: Eyes Up -- scheming upward glance */
        .anim-26 .Bender__pupil { animation: a26pupil 2.5s ease-in-out infinite; }
        .anim-26 .Bender__eye { animation: a26eye 2.5s ease-in-out infinite; }
        .anim-26 .Bender__mouth { animation: a26mouth 2.5s ease-in-out infinite; }
        @keyframes a26pupil { 0%, 100% { transform: translateY(0); } 30%, 70% { transform: translateY(-18px) scale(0.9); } }
        @keyframes a26eye { 0%, 100% { transform: scaleY(1); } 30%, 70% { transform: scaleY(0.7); } }
        @keyframes a26mouth { 0%, 100% { transform: scaleY(1); } 30%, 70% { transform: scaleY(0.75) skewX(3deg); } }

        /* 27: Eye Roll -- full circular roll with attitude */
        .anim-27 .Bender__pupil { animation: a27pupil 2s ease-in-out infinite; }
        .anim-27 .Bender__eye { animation: a27eye 2s ease-in-out infinite; }
        .anim-27 .Bender__mouth { animation: a27mouth 2s ease-in-out infinite; }
        @keyframes a27pupil { 0% { transform: translate(0, 0); } 20% { transform: translate(12px, -8px); } 40% { transform: translate(0, -18px); } 60% { transform: translate(-12px, -8px); } 80% { transform: translate(-5px, 5px); } 100% { transform: translate(0, 0); } }
        @keyframes a27eye { 0%, 100% { transform: scaleY(1); } 40% { transform: scaleY(0.8); } }
        @keyframes a27mouth { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.7) skewX(-3deg); } }

        /* 28: Bored Lids -- heavy drooping with slow drift */
        .anim-28 .Bender__eye { animation: a28eye 4s ease-in-out infinite; }
        .anim-28 .Bender__pupil { animation: a28pupil 6s ease-in-out infinite; }
        .anim-28 .Bender__mouth { animation: a28mouth 4s ease-in-out infinite; }
        @keyframes a28eye { 0%, 100% { transform: scaleY(0.45); } 50% { transform: scaleY(0.55); } }
        @keyframes a28pupil { 0%, 100% { transform: translate(-4px, 5px); } 33% { transform: translate(6px, 4px); } 66% { transform: translate(-2px, 6px); } }
        @keyframes a28mouth { 0%, 100% { transform: scaleY(0.6) scaleX(0.92); } 50% { transform: scaleY(0.65) scaleX(0.95); } }

        /* 29: Side-Eye -- judgmental sideways glance */
        .anim-29 .Bender__pupil { animation: a29pupil 3s ease-in-out infinite; }
        .anim-29 .Bender__eye { animation: a29eye 3s ease-in-out infinite; }
        .anim-29 .Bender__eyes { animation: a29visor 3s ease-in-out infinite; }
        @keyframes a29pupil { 0%, 100% { transform: translate(-12px, 4px); } 50% { transform: translate(-14px, 5px); } }
        @keyframes a29eye { 0%, 100% { transform: scaleY(0.6); } 50% { transform: scaleY(0.55); } }
        @keyframes a29visor { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-2deg); } }

        /* 30: Flat Mouth -- deadpan unimpressed */
        .anim-30 .Bender__mouth { animation: a30mouth 3s ease-in-out infinite; }
        .anim-30 .Bender__eye { animation: a30eye 3s ease-in-out infinite; }
        .anim-30 .Bender__pupil { animation: a30pupil 5s ease-in-out infinite; }
        @keyframes a30mouth { 0%, 100% { transform: scaleY(0.5) scaleX(0.88); border-radius: 30px; } 50% { transform: scaleY(0.45) scaleX(0.85); border-radius: 25px; } }
        @keyframes a30eye { 0%, 100% { transform: scaleY(0.6); } 50% { transform: scaleY(0.55); } }
        @keyframes a30pupil { 0%, 100% { transform: translate(0, 3px); } 50% { transform: translate(3px, 4px); } }

        /* 31: Wide Eyes -- shocked stare with jolt */
        .anim-31 .Bender__eye { animation: a31eye 2s ease-out infinite; }
        .anim-31 .Bender__pupil { animation: a31pupil 2s ease-out infinite; }
        .anim-31 .Bender__eyes { animation: a31visor 2s ease-out infinite; }
        .anim-31 .Bender__mouth { animation: a31mouth 2s ease-out infinite; }
        @keyframes a31eye { 0% { transform: scale(1); } 15% { transform: scale(1.2); } 100% { transform: scale(1.12); } }
        @keyframes a31pupil { 0% { transform: scale(1); } 15% { transform: scale(1.6); } 100% { transform: scale(1.4); } }
        @keyframes a31visor { 0% { transform: translateY(0); } 15% { transform: translateY(-8px) scale(1.04); } 100% { transform: translateY(-4px) scale(1.02); } }
        @keyframes a31mouth { 0% { transform: scaleY(1); } 15% { transform: scaleY(1.3) scaleX(0.85); border-radius: 50%; } 100% { transform: scaleY(1.2) scaleX(0.88); border-radius: 50%; } }

        /* 32: Huge Pupils -- mind-blown dilated */
        .anim-32 .Bender__pupil { animation: a32pupil 1.8s ease-in-out infinite; }
        .anim-32 .Bender__eye { animation: a32eye 1.8s ease-in-out infinite; }
        @keyframes a32pupil { 0%, 100% { transform: scale(1.8); } 50% { transform: scale(2.2); } }
        @keyframes a32eye { 0%, 100% { transform: scale(1.05); } 50% { transform: scale(1.1); } }

        /* 33: Open Mouth -- jaw drop */
        .anim-33 .Bender__mouth { animation: a33mouth 2s ease-out infinite; }
        .anim-33 .Bender__tooth { animation: a33tooth 2s ease-out infinite; }
        .anim-33 .Bender__eye { animation: a33eye 2s ease-out infinite; }
        @keyframes a33mouth { 0% { transform: scaleY(1); } 20% { transform: scaleY(1.4) scaleX(0.82); border-radius: 50%; } 100% { transform: scaleY(1.3) scaleX(0.85); border-radius: 50%; } }
        @keyframes a33tooth { 0%, 100% { opacity: 0.7; } 20% { opacity: 0.9; transform: scaleY(1.1); } }
        @keyframes a33eye { 0% { transform: scale(1); } 20% { transform: scale(1.15); } 100% { transform: scale(1.1); } }

        /* 34: Jumped Up -- startled bounce */
        .anim-34 { animation: a34body 1.5s ease-out infinite; }
        .anim-34 .Bender__pupil { animation: a34pupil 1.5s ease-out infinite; }
        @keyframes a34body { 0% { transform: translateY(0); } 15% { transform: translateY(-20px); } 30% { transform: translateY(-5px); } 45% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
        @keyframes a34pupil { 0% { transform: scale(1); } 15% { transform: scale(1.8) translateY(-5px); } 100% { transform: scale(1.2); } }

        /* 35: Smug Wink -- one eye closed, knowing look */
        .anim-35 .Bender__eye:first-child { animation: a35left 3s ease-in-out infinite; }
        .anim-35 .Bender__eye:last-child { animation: a35right 3s ease-in-out infinite; }
        .anim-35 .Bender__mouth { animation: a35mouth 3s ease-in-out infinite; }
        @keyframes a35left { 0%, 100% { transform: scaleY(1); } 20%, 80% { transform: scaleY(0.08); } }
        @keyframes a35right { 0%, 100% { transform: scaleY(1); } 20%, 80% { transform: scaleY(0.65); } }
        @keyframes a35mouth { 0%, 100% { transform: scaleY(1); } 20%, 80% { transform: skewX(-5deg) scaleY(0.8); } }

        /* 36: Smug Grin -- self-satisfied expression */
        .anim-36 .Bender__mouth { animation: a36mouth 2.5s ease-in-out infinite alternate; }
        .anim-36 .Bender__eye { animation: a36eye 2.5s ease-in-out infinite alternate; }
        .anim-36 .Bender__pupil { animation: a36pupil 2.5s ease-in-out infinite alternate; }
        @keyframes a36mouth { 0% { transform: skewX(-4deg) scaleY(0.78); } 100% { transform: skewX(-6deg) scaleY(0.75) scaleX(1.05); } }
        @keyframes a36eye { 0% { transform: scaleY(0.6); } 100% { transform: scaleY(0.55); } }
        @keyframes a36pupil { 0% { transform: translate(6px, 2px); } 100% { transform: translate(8px, 3px); } }

        /* 37: Side Glance -- subtle knowing look */
        .anim-37 .Bender__pupil { animation: a37pupil 3s ease-in-out infinite; }
        .anim-37 .Bender__eye { animation: a37eye 3s ease-in-out infinite; }
        @keyframes a37pupil { 0%, 100% { transform: translate(10px, -4px); } 50% { transform: translate(12px, -2px); } }
        @keyframes a37eye { 0%, 100% { transform: scaleY(0.7); } 50% { transform: scaleY(0.65); } }

        /* 38: Antenna Wobble -- confused signal with eye reaction */
        .anim-38 .Bender__antenna { animation: a38ant 0.4s ease-in-out 5; }
        .anim-38 .Bender__antenna-ball { animation: a38ball 0.4s ease-in-out 5; }
        .anim-38 .Bender__pupil { animation: a38pupil 2s ease-in-out infinite; }
        .anim-38 .Bender__eye { animation: a38eye 2s ease-in-out infinite; }
        @keyframes a38ant { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(12deg); } 75% { transform: rotate(-12deg); } }
        @keyframes a38ball { 0%, 100% { box-shadow: 0 0 8px rgba(100,200,255,0.3); } 50% { box-shadow: 0 0 20px rgba(255,200,0,0.8); } }
        @keyframes a38pupil { 0%, 100% { transform: translate(0, -5px); } 50% { transform: translate(0, -12px) scale(0.9); } }
        @keyframes a38eye { 0%, 100% { transform: scaleY(0.8); } 50% { transform: scaleY(0.9); } }

        /* 39: Antenna Flash -- rapid strobe */
        .anim-39 .Bender__antenna-ball { animation: a39ball 0.25s ease-in-out infinite; }
        .anim-39 .Bender__antenna { animation: a39ant 0.5s ease-in-out infinite; }
        .anim-39 .Bender__eye { animation: a39eye 0.5s ease-in-out infinite; }
        @keyframes a39ball { 0%, 100% { box-shadow: 0 0 5px rgba(100,200,255,0.2); opacity: 0.6; } 50% { box-shadow: 0 0 30px rgba(100,200,255,1), 0 0 60px rgba(100,200,255,0.5); opacity: 1; } }
        @keyframes a39ant { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.05); } }
        @keyframes a39eye { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.9); } }

        /* 40: Glitch Eye -- digital malfunction */
        .anim-40 .Bender__eye { animation: a40eye 0.15s steps(3) infinite; }
        .anim-40 .Bender__pupil { animation: a40pupil 0.2s steps(2) infinite; }
        .anim-40 .Bender__mouth { animation: a40mouth 0.3s steps(2) infinite; }
        .anim-40 .Bender__socket { animation: a40socket 0.4s steps(2) infinite; }
        @keyframes a40eye { 0% { transform: translateX(0) scaleY(1); } 33% { transform: translateX(4px) skewX(8deg) scaleY(0.9); } 66% { transform: translateX(-3px) skewX(-5deg) scaleY(1.05); } 100% { transform: translateX(0) scaleY(1); } }
        @keyframes a40pupil { 0%, 100% { transform: translate(0, 0); opacity: 1; } 50% { transform: translate(5px, -3px); opacity: 0.6; } }
        @keyframes a40mouth { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px) skewX(3deg); } }
        @keyframes a40socket { 0%, 100% { box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); } 50% { box-shadow: inset 0 0 15px rgba(0,255,100,0.2); } }

        /* 41: Pupil Twitch -- nervous jitter */
        .anim-41 .Bender__pupil { animation: a41pupil 0.12s infinite; }
        .anim-41 .Bender__eye { animation: a41eye 2s ease-in-out infinite; }
        .anim-41 .Bender__antenna { animation: a41ant 0.8s ease-in-out infinite; }
        @keyframes a41pupil { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(4px, -4px); } 50% { transform: translate(-4px, 3px); } 75% { transform: translate(3px, 4px); } }
        @keyframes a41eye { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.85); } }
        @keyframes a41ant { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(3deg); } }

        /* 42: Evil Grin -- signature Bender scheming face */
        .anim-42 .Bender__eye { animation: a42eye 2.5s ease-in-out infinite; }
        .anim-42 .Bender__pupil { animation: a42pupil 2.5s ease-in-out infinite; }
        .anim-42 .Bender__mouth { animation: a42mouth 2.5s ease-in-out infinite; }
        .anim-42 .Bender__antenna-ball { animation: a42ball 2.5s ease-in-out infinite; }
        @keyframes a42eye { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(0.45); } }
        @keyframes a42pupil { 0%, 100% { transform: scale(0.65) translate(3px, 2px); } 50% { transform: scale(0.6) translate(5px, 3px); } }
        @keyframes a42mouth { 0%, 100% { transform: scaleX(1.12) scaleY(0.82); border-radius: 50px; } 50% { transform: scaleX(1.18) scaleY(0.78); border-radius: 45px; } }
        @keyframes a42ball { 0%, 100% { box-shadow: 0 0 8px rgba(255,100,0,0.3); } 50% { box-shadow: 0 0 15px rgba(255,100,0,0.6); } }

        /* 43: Wink -- charming one-eye close */
        .anim-43 .Bender__eye:first-child { animation: a43left 2.5s ease-in-out infinite; }
        .anim-43 .Bender__eye:last-child { animation: a43right 2.5s ease-in-out infinite; }
        .anim-43 .Bender__mouth { animation: a43mouth 2.5s ease-in-out infinite; }
        @keyframes a43left { 0%, 100% { transform: scaleY(1); } 25%, 75% { transform: scaleY(0.05); } }
        @keyframes a43right { 0%, 100% { transform: scaleY(1); } 25%, 75% { transform: scaleY(0.8); } }
        @keyframes a43mouth { 0%, 100% { transform: skewX(0); } 25%, 75% { transform: skewX(-4deg) scaleY(0.9); } }

        /* 44: Droopy Sad -- whole face sags */
        .anim-44 .Bender__eyes { animation: a44visor 3s ease-in-out infinite; }
        .anim-44 .Bender__eye { animation: a44eye 3s ease-in-out infinite; }
        .anim-44 .Bender__pupil { animation: a44pupil 4s ease-in-out infinite; }
        .anim-44 .Bender__mouth { animation: a44mouth 3s ease-in-out infinite; }
        .anim-44 .Bender__antenna { animation: a44ant 3s ease-in-out infinite; }
        @keyframes a44visor { 0%, 100% { transform: translateY(6px); } 50% { transform: translateY(10px); } }
        @keyframes a44eye { 0%, 100% { transform: scaleY(0.6); } 50% { transform: scaleY(0.55); } }
        @keyframes a44pupil { 0%, 100% { transform: translate(-2px, 8px); } 50% { transform: translate(2px, 10px); } }
        @keyframes a44mouth { 0%, 100% { transform: scaleY(0.45) translateY(8px); } 50% { transform: scaleY(0.4) translateY(10px); } }
        @keyframes a44ant { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }

        /* 45: Suspicious Squint -- narrow-eyed scrutiny */
        .anim-45 .Bender__eye { animation: a45eye 2.5s ease-in-out infinite; }
        .anim-45 .Bender__pupil { animation: a45pupil 2.5s ease-in-out infinite; }
        .anim-45 .Bender__mouth { animation: a45mouth 2.5s ease-in-out infinite; }
        @keyframes a45eye { 0%, 100% { transform: scaleY(0.3) scaleX(1.05); } 50% { transform: scaleY(0.35) scaleX(1.08); } }
        @keyframes a45pupil { 0%, 100% { transform: scale(0.75) translate(0, 3px); } 50% { transform: scale(0.7) translate(3px, 4px); } }
        @keyframes a45mouth { 0%, 100% { transform: scaleY(0.7) scaleX(0.9); } 50% { transform: scaleY(0.65) scaleX(0.88); } }

        /* 46: Love Eyes -- smitten with pulsing pink */
        .anim-46 .Bender__eye { animation: a46eye 1.5s ease-in-out infinite; }
        .anim-46 .Bender__pupil { animation: a46pupil 1.5s ease-in-out infinite; }
        .anim-46 .Bender__mouth { animation: a46mouth 1.5s ease-in-out infinite; }
        .anim-46 .Bender__antenna-ball { animation: a46ball 1.5s ease-in-out infinite; }
        @keyframes a46eye { 0%, 100% { background: linear-gradient(180deg, #ffccdd, #ff99bb); } 50% { background: linear-gradient(180deg, #ffdde8, #ffaacc); transform: scale(1.05); } }
        @keyframes a46pupil { 0%, 100% { background: radial-gradient(circle, #ff3366, #cc0044); transform: scale(1.2); } 50% { transform: scale(1.5); } }
        @keyframes a46mouth { 0%, 100% { transform: scaleX(1.05) scaleY(1.05); } 50% { transform: scaleX(1.1) scaleY(1.1); } }
        @keyframes a46ball { 0%, 100% { box-shadow: 0 0 10px rgba(255,100,150,0.4); } 50% { box-shadow: 0 0 25px rgba(255,100,150,0.8); } }

        /* 47: Vibrating Rage -- full body tremor with red flash */
        .anim-47 { animation: a47body 0.2s infinite; }
        .anim-47 .Bender__eye { animation: a47eye 0.5s ease-in-out infinite; }
        .anim-47 .Bender__pupil { animation: a47pupil 0.3s ease-in-out infinite; }
        .anim-47 .Bender__mouth { animation: a47mouth 0.15s infinite; }
        .anim-47 .Bender__socket { animation: a47socket 0.5s ease-in-out infinite; }
        @keyframes a47body { 0%, 100% { transform: translateX(0) translateY(0); } 25% { transform: translateX(-3px) translateY(-1px); } 50% { transform: translateX(2px) translateY(1px); } 75% { transform: translateX(-1px) translateY(-2px); } }
        @keyframes a47eye { 0%, 100% { background: linear-gradient(180deg, #fefdd0, #f5f0a0); } 50% { background: linear-gradient(180deg, #ffe0e0, #ffaaaa); transform: scaleY(0.5); } }
        @keyframes a47pupil { 0%, 100% { transform: scale(0.7); } 50% { transform: scale(0.6); box-shadow: 0 0 8px rgba(255,0,0,0.5); } }
        @keyframes a47mouth { 0%, 100% { transform: scaleY(0.65); } 50% { transform: scaleY(0.6) translateX(2px); } }
        @keyframes a47socket { 0%, 100% { box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); } 50% { box-shadow: inset 0 0 20px rgba(255,0,0,0.3); } }

        /* 48: Sleepy Blink -- heavy slow blinks */
        .anim-48 .Bender__eye { animation: a48eye 4s ease-in-out infinite; }
        .anim-48 .Bender__pupil { animation: a48pupil 4s ease-in-out infinite; }
        .anim-48 .Bender__mouth { animation: a48mouth 4s ease-in-out infinite; }
        .anim-48 .Bender__antenna { animation: a48ant 4s ease-in-out infinite; }
        @keyframes a48eye { 0%, 100% { transform: scaleY(0.3); } 30% { transform: scaleY(0.08); } 60% { transform: scaleY(0.35); } }
        @keyframes a48pupil { 0%, 100% { transform: translateY(5px) scale(0.8); } 50% { transform: translateY(8px) scale(0.7); } }
        @keyframes a48mouth { 0%, 100% { transform: scaleY(0.4); opacity: 0.7; } 50% { transform: scaleY(0.35); opacity: 0.6; } }
        @keyframes a48ant { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }

        /* 49: Mischievous -- sneaky asymmetric plotting */
        .anim-49 .Bender__eye:first-child { animation: a49left 2.5s ease-in-out infinite; }
        .anim-49 .Bender__eye:last-child { animation: a49right 2.5s ease-in-out infinite; }
        .anim-49 .Bender__pupil { animation: a49pupil 2.5s ease-in-out infinite; }
        .anim-49 .Bender__mouth { animation: a49mouth 2.5s ease-in-out infinite; }
        @keyframes a49left { 0%, 100% { transform: scaleY(0.8); } 50% { transform: scaleY(0.7); } }
        @keyframes a49right { 0%, 100% { transform: scaleY(0.45); } 50% { transform: scaleY(0.4); } }
        @keyframes a49pupil { 0%, 100% { transform: translate(-8px, 2px); } 50% { transform: translate(-10px, 3px); } }
        @keyframes a49mouth { 0%, 100% { transform: skewX(5deg) scaleY(0.85); } 50% { transform: skewX(7deg) scaleY(0.8); } }

        /* 50: Belly Laugh -- whole body shaking with open mouth */
        .anim-50 { animation: a50body 0.25s ease-in-out infinite; }
        .anim-50 .Bender__mouth { animation: a50mouth 0.5s ease-in-out infinite; }
        .anim-50 .Bender__eye { animation: a50eye 0.5s ease-in-out infinite; }
        .anim-50 .Bender__tooth { animation: a50tooth 0.25s ease-in-out infinite alternate; }
        .anim-50 .Bender__antenna { animation: a50ant 0.25s ease-in-out infinite alternate; }
        @keyframes a50body { 0%, 100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-6px) rotate(1.5deg); } 75% { transform: translateY(-6px) rotate(-1.5deg); } }
        @keyframes a50mouth { 0%, 100% { transform: scaleY(1.25) scaleX(1.08); } 50% { transform: scaleY(1.15) scaleX(1.05); } }
        @keyframes a50eye { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(0.6); } }
        @keyframes a50tooth { 0% { opacity: 0.8; transform: scaleX(1); } 100% { opacity: 1; transform: scaleX(1.3); } }
        @keyframes a50ant { 0% { transform: rotate(-3deg); } 100% { transform: rotate(3deg); } }

      `}</style>

      {/* Antenna */}
      <div className="Bender__antenna">
        <div className={`Bender__antenna-ball ${state === 'listening' || state === 'thinking' || state === 'warmup' ? 'Bender__antenna-ball--glow' : ''}`} />
      </div>

      {/* Eyes */}
      <div className="Bender__eyes" ref={eyeContainerRef}>
        <div className="Bender__socket">
          <div className="Bender__eye">
            <div
              className={`Bender__eyelid-top ${eyelidDroop > 0 ? 'droop' : ''}`}
              style={eyelidDroop > 0 ? { transform: `translateY(${-100 + eyelidDroop * 100}%)` } : undefined}
            />
            <div className="Bender__pupil" ref={leftPupilRef} />
            <div
              className={`Bender__eyelid-bottom ${eyelidDroop > 0 ? 'droop' : ''}`}
              style={eyelidDroop > 0 ? { transform: `translateY(${100 - eyelidDroop * 60}%)` } : undefined}
            />
          </div>
          <div className="Bender__eye">
            <div
              className={`Bender__eyelid-top ${eyelidDroop > 0 ? 'droop' : ''}`}
              style={eyelidDroop > 0 ? { transform: `translateY(${-100 + eyelidDroop * 100}%)` } : undefined}
            />
            <div className="Bender__pupil" ref={rightPupilRef} />
            <div
              className={`Bender__eyelid-bottom ${eyelidDroop > 0 ? 'droop' : ''}`}
              style={eyelidDroop > 0 ? { transform: `translateY(${100 - eyelidDroop * 60}%)` } : undefined}
            />
          </div>
        </div>
      </div>

      {/* Mouth with lip sync */}
      <div className={`Bender__mouth-wrapper ${showCigar ? 'smoking' : ''}`}>
        <div
          className="Bender__mouth"
          style={{
            transform: `scaleY(${mouthScaleY}) translateY(${mouthOffsetY}px)`,
          }}
        >
          <div className="Bender__tooth" />
          <div className="Bender__tooth" />
          <div className="Bender__tooth" />
          <div className="Bender__tooth" />
          <div className="Bender__tooth" />
          <div className="Bender__lip Bender__lip--top" />
          <div className="Bender__lip Bender__lip--bottom" />
        </div>

        {/* Cigar -- positioned outside mouth overflow */}
        <div className={`Bender__cigar-container ${showCigar ? 'visible' : ''}`}>
          <div className="Bender__cigar">
            <div className="Bender__cigar-tip" />
          </div>
          <div className="Bender__smoke">
            <div className="Bender__smoke-particle" />
            <div className="Bender__smoke-particle" />
            <div className="Bender__smoke-particle" />
            <div className="Bender__smoke-particle" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BenderFace);
