  import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimePerformanceProfile } from '../../services/runtimePerformanceProfile';
import { getVolume } from '../../services/volumeStore';
import { type CurioState, type EngineMode, toEngineMode, getSharedVisionStream } from '../../services/emotionDetection';
import { useFaceTracking } from '../../hooks/useFaceTracking';
import type { FaceTrackingSample } from '../../services/faceTracking';
import { runKiroAnimation, type KiroAnimationRefs, type KiroAnimationContext, KIRO_EMOTIONS as EMOTIONS } from './kiroAnimationConfigs';
import { KiroCardEyeContent } from './KiroCardEyeContent';
import type { Card } from '../../services/cardTypes';

interface KiroFaceProps {
  state: CurioState;
  activeCard?: Card | null;
  eyeColor?: string;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  objectPosition?: string;
  lowPowerMode?: boolean;
  performanceMode?: boolean;
  faceTrackingEnabled?: boolean;
  mediaStream?: MediaStream | null;
  userFacingCamera?: boolean;
  runtimeProfile?: RuntimePerformanceProfile;
  onFaceDetected?: (detected: boolean) => void;
  onFaceTrackingSample?: (sample: FaceTrackingSample | null, canvas: HTMLCanvasElement | null) => void;
  idleSleepTimeout?: number;
  emotionHint?: string | null;
  animationsEnabled?: boolean;
}

// --- Kiro Bot specific Emotion shapes ---
// NOTE: EmotionShape is imported via the Record<string, ...> on KIRO_EMOTIONS; kept here for
// documentation of the structure used across animation configs.


// @ts-expect-error VISEMES used by lip-sync engine at runtime
const VISEMES = [
  { clipLeft: 'M 215 140 C 265 140 290 180 290 230 C 290 280 265 320 215 320 C 165 320 140 280 140 230 C 140 180 165 140 215 140 Z', clipRight: 'M 385 140 C 435 140 460 180 460 230 C 460 280 435 320 385 320 C 335 320 310 280 310 230 C 310 180 335 140 385 140 Z' },
  { clipLeft: 'M 215 160 C 251 160 280 194 280 230 C 280 266 251 300 215 300 C 179 300 150 266 150 230 C 150 194 179 160 215 160 Z', clipRight: 'M 385 160 C 421 160 450 194 450 230 C 450 266 421 300 385 300 C 349 300 320 266 320 230 C 320 194 349 160 385 160 Z' },
  { clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z', clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z' },
  { clipLeft: 'M 215 200 C 251 200 280 215 280 235 C 280 255 251 265 215 265 C 179 265 150 255 150 235 C 150 215 179 200 215 200 Z', clipRight: 'M 385 200 C 421 200 450 215 450 235 C 450 255 421 265 385 265 C 349 265 320 255 320 235 C 320 215 349 200 385 200 Z' },
  { clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z', clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z' },
];

const KiroFaceComponent: React.FC<KiroFaceProps> = ({
  state,
  activeCard,
  eyeColor: eyeColorProp,
  className = '',
  lowPowerMode,
  performanceMode,
  faceTrackingEnabled = false,
  mediaStream = null,
  userFacingCamera = true,
  runtimeProfile,
  onFaceDetected,
  onFaceTrackingSample,
  idleSleepTimeout,
  emotionHint,
  animationsEnabled = true,
}) => {
  const isLowPower = lowPowerMode ?? performanceMode ?? false;
  const allowAmbientAnimation = runtimeProfile?.allowAmbientAnimation ?? true;
  const allowFaceHeavyEffects = runtimeProfile?.allowFaceHeavyEffects ?? !isLowPower;
  const allowFaceTrackingBackgroundWork =
    runtimeProfile?.allowFaceTrackingBackgroundWork ?? !isLowPower;
  const faceTrackingPollIntervalMs = runtimeProfile?.faceTrackingPollIntervalMs ?? (isLowPower ? 180 : 80);
  const idleAnimationChance = runtimeProfile?.idleAnimationChance ?? 0.25;
  const maxIdleAnimationType = runtimeProfile?.maxKiroIdleAnimationType ?? 141;
  const microSaccadeIntervalMs = runtimeProfile?.microSaccadeIntervalMs ?? 150;
  const microSaccadeChance = runtimeProfile?.microSaccadeChance ?? 0.05;
  const eyeConvergedThrottleMs = runtimeProfile?.eyeConvergedThrottleMs ?? 250;
  const documentHidden = runtimeProfile?.documentHidden ?? false;
  const sharedVisionStream = getSharedVisionStream(mediaStream);

  const eyeColor = eyeColorProp ?? '#000000';

  // --- SVG element refs ---
  const maskLeftRef = useRef<SVGPathElement>(null);
  const maskRightRef = useRef<SVGPathElement>(null);
  const eyeTrackLeftRef = useRef<SVGGElement>(null);
  const eyeTrackRightRef = useRef<SVGGElement>(null);
  const centerEyeTrackRef = useRef<SVGGElement>(null);
  const blushLeftRef = useRef<SVGCircleElement>(null);
  const blushRightRef = useRef<SVGCircleElement>(null);
  const sweatRef = useRef<SVGGElement>(null);
  const tearsRef = useRef<SVGGElement>(null);
  const eyeGlintLeftRef = useRef<SVGCircleElement>(null);
  const eyeGlintRightRef = useRef<SVGCircleElement>(null);
  const centerGlintRef = useRef<SVGCircleElement>(null);
  const leftTimerTextRef = useRef<SVGTextElement>(null);
  const rightTimerTextRef = useRef<SVGTextElement>(null);
  const centerTimerTextRef = useRef<SVGTextElement>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const actionWrapperRef = useRef<SVGGElement>(null);
  const headTrackRef = useRef<SVGGElement>(null);
  const zzzRef = useRef<SVGGElement>(null);
  const heartsRef = useRef<SVGGElement>(null);
  const sunglassesRef = useRef<SVGGElement>(null);
  const mustacheRef = useRef<SVGGElement>(null);
  const monocleRef = useRef<SVGGElement>(null);
  const scannerRef = useRef<SVGGElement>(null);
  const confettiRef = useRef<SVGGElement>(null);
  const haloRef = useRef<SVGGElement>(null);
  const butterflyRef = useRef<SVGGElement>(null);
  const gumPopRef = useRef<SVGGElement>(null);
  const thinkingCloudRef = useRef<SVGGElement>(null);
  const fireRef = useRef<SVGGElement>(null);
  const propellerRef = useRef<SVGGElement>(null);
  const musicNotesRef = useRef<SVGGElement>(null);
  const goldChainRef = useRef<SVGGElement>(null);
  const steamLeftRef = useRef<SVGGElement>(null);
  const steamRightRef = useRef<SVGGElement>(null);
  const matrixEyesRef = useRef<SVGGElement>(null);
  const rainbowRef = useRef<SVGGElement>(null);
  const starsRef = useRef<SVGGElement>(null);
  const clockRef = useRef<SVGGElement>(null);
  const sneezeRef = useRef<SVGGElement>(null);
  const rainRef = useRef<SVGGElement>(null);
  const magnifyingGlassRef = useRef<SVGGElement>(null);
  const mainEyesRef = useRef<SVGGElement>(null);
  const terminalRef = useRef<SVGGElement>(null);

  // New Accessory Refs
  const thinkingRef = useRef<SVGGElement>(null);
  const analyticalRef = useRef<SVGGElement>(null);
  const rangingRef = useRef<SVGGElement>(null);
  const blushRef = useRef<SVGGElement>(null);

  // Kiro ghost-specific refs (unique signature flourishes)
  const spectralGlowRef = useRef<SVGGElement>(null);
  const sparklesRef = useRef<SVGGElement>(null);
  const ufoBeamRef = useRef<SVGGElement>(null);
  const devilHornsRef = useRef<SVGGElement>(null);
  const ghostBodyRef = useRef<SVGGElement>(null);

  const hadFaceRef = useRef(false);
  const trackedFacePresentRef = useRef(false);

  // --- State tracking ---
  const [isBlinking, setIsBlinking] = useState(false);
  const currentEmotionRef = useRef('idle');
  const lastInputTimeRef = useRef(Date.now());
  const isActionRunningRef = useRef(false);
  const behaviorLoopRef = useRef<number>(0);
  const lipSyncLoopRef = useRef<number>(0);
  const currentModeRef = useRef<EngineMode>('idle');
  const emotionHintRef = useRef<string | null>(null);

  // --- Eye tracking state ---
  const targetEyeRef = useRef({ x: 0, y: 0 });
  const currentEyeRef = useRef({ x: 0, y: 0 });
  const noiseRef = useRef({ x: 0, y: 0 });
  const visemeScaleYRef = useRef(1.0);
  const eyeRafRef = useRef<number>(0);
  const eyeIntervalRef = useRef<number>(0);

  // --- JS-driven animation state (replaces CSS class animations) ---
  // Phase is time-based (rad/second) so the animation runs at the same
  // speed regardless of the display refresh rate (60Hz, 90Hz, 120Hz).
  const floatPhaseOffsetRef = useRef(Math.random() * Math.PI * 2); // random start phase
  const floatStartTimeRef = useRef<number | null>(null);
  const bobStateRef = useRef({ y: 0, rot: 0, active: false });
  const bobAnimFrameRef = useRef<number>(0);

  // --- Centralized timer tracking ---
  const activeSubTimersRef = useRef<Set<number>>(new Set());

  const trackInterval = useCallback((id: number) => {
    activeSubTimersRef.current.add(id);
    return id;
  }, []);

  const trackTimeout = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      activeSubTimersRef.current.delete(id);
      callback();
    }, delay);
    activeSubTimersRef.current.add(id);
    return id;
  }, []);

  const clearAllEngineTimers = useCallback(() => {
    window.clearInterval(behaviorLoopRef.current);
    behaviorLoopRef.current = 0;
    window.clearInterval(lipSyncLoopRef.current);
    lipSyncLoopRef.current = 0;
    cancelAnimationFrame(eyeRafRef.current);
    eyeRafRef.current = 0;
    cancelAnimationFrame(bobAnimFrameRef.current);
    bobAnimFrameRef.current = 0;
    bobStateRef.current = { y: 0, rot: 0, active: false };
    isActionRunningRef.current = false;
    window.clearInterval(eyeIntervalRef.current);
    eyeIntervalRef.current = 0;
    activeSubTimersRef.current.forEach((id) => {
      window.clearInterval(id);
      window.clearTimeout(id);
    });
    activeSubTimersRef.current.clear();
  }, []);


  const faceDetectionActiveRef = useRef(false);
  const consecutiveMissesRef = useRef(0);
  const activeCardRef = useRef(activeCard);

  const setEmotion = useCallback((emotionKey: string) => {
    let finalEmotion = emotionKey;

    // Apply emotion hints if we are supposedly idle/listening/speaking, so that the robot
    // maintains its overall conversational mood instead of reverting completely to blank.
    if ((emotionKey === 'idle' || emotionKey === 'listening') && emotionHintRef.current && EMOTIONS[emotionHintRef.current]) {
      finalEmotion = emotionHintRef.current;
    }

    if (emotionKey === 'idle' && activeCardRef.current) {
      const type = activeCardRef.current.type;
      const data = activeCardRef.current.data as any;
      if (type === 'music') finalEmotion = 'dazzled';
      else if (type === 'weather') finalEmotion = 'dreamy';
      else if (type === 'calculation') finalEmotion = 'analytical';
      else if (type === 'joke') finalEmotion = 'joy';
      else if (type === 'sportsScore') finalEmotion = 'excited';
      else if (type === 'airQuality') finalEmotion = 'zen';
      else if (type === 'timer' || type === 'stopwatch') finalEmotion = data?.isRinging ? 'panicked' : 'targeting';
      else if (type === 'list' || type === 'reminder') finalEmotion = 'puzzled';
      else if (type === 'device') finalEmotion = 'electronic';
    }

    const shape = EMOTIONS[finalEmotion] || EMOTIONS['idle'];
    currentEmotionRef.current = finalEmotion;

    maskLeftRef.current?.setAttribute('d', shape.clipLeft);
    maskRightRef.current?.setAttribute('d', shape.clipRight);

    if (zzzRef.current) {
      zzzRef.current.style.opacity = finalEmotion === 'sleepy' ? '1' : '0';
    }
  }, []);

  useEffect(() => {
    activeCardRef.current = activeCard;
    if (currentModeRef.current === 'idle') {
      // Trigger a re-evaluation of the emotion
      setEmotion('idle');
    }
  }, [activeCard, setEmotion]);

  // Sync emotionHint prop â†’ ref, and immediately apply when speaking
  useEffect(() => {
    emotionHintRef.current = emotionHint || null;
    if (emotionHint && EMOTIONS[emotionHint] && currentModeRef.current === 'speaking') {
      setEmotion(emotionHint);
    }
  }, [emotionHint, setEmotion]);

  const triggerAction = useCallback((action: 'nod' | 'bob', duration: number = 1200) => {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;

    const startTime = performance.now();
    const isNod = action === 'nod';

    const animateAction = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (isNod) {
        // Nod: up-down-center with subtle rotation
        const phase = progress * Math.PI * 4; // 2 full cycles
        const ease = 1 - progress; // fade out
        bobStateRef.current.y = Math.sin(phase) * 22 * ease;
        bobStateRef.current.rot = Math.sin(phase) * 2 * ease;
      } else {
        // Bob: quick bounces
        const phase = progress * Math.PI * 6; // 3 full cycles
        const ease = 1 - progress;
        bobStateRef.current.y = -Math.abs(Math.sin(phase)) * 20 * ease;
        bobStateRef.current.rot = 0;
      }
      bobStateRef.current.active = true;

      if (progress < 1) {
        bobAnimFrameRef.current = requestAnimationFrame(animateAction);
      } else {
        bobStateRef.current = { y: 0, rot: 0, active: false };
        isActionRunningRef.current = false;
      }
    };

    cancelAnimationFrame(bobAnimFrameRef.current);
    bobAnimFrameRef.current = requestAnimationFrame(animateAction);
  }, []);


  const registerInteraction = useCallback(() => {
    lastInputTimeRef.current = Date.now();
    if (currentModeRef.current === 'idle' && currentEmotionRef.current === 'sleepy') {
      setEmotion('idle');
    }
  }, [setEmotion]);

  // --- Animation Trigger Helper (data-driven via kiroAnimationConfigs.ts) ---
  const triggerSpecialAnimation = useCallback((animType: number) => {
    const animCtx: KiroAnimationContext = {
      refs: {
        mainEyesRef, heartsRef, magnifyingGlassRef, sunglassesRef,
        scannerRef, monocleRef, mustacheRef, steamLeftRef, steamRightRef,
        matrixEyesRef, rainbowRef, butterflyRef, gumPopRef,
        confettiRef, haloRef, starsRef, clockRef, rainRef,
        sneezeRef, thinkingCloudRef, fireRef, propellerRef,
        musicNotesRef, goldChainRef, terminalRef,
        blushLeftRef, blushRightRef, sweatRef, tearsRef,
        thinkingRef, analyticalRef, rangingRef, blushRef,
        spectralGlowRef, sparklesRef, ufoBeamRef, devilHornsRef, ghostBodyRef,
      } as KiroAnimationRefs,
      setEmotion,
      triggerAction,
      targetEyeRef,
      currentModeRef,
      currentEmotionRef,
      trackInterval,
      trackTimeout,
    };
    runKiroAnimation(animType, animCtx);
  }, [setEmotion, trackInterval, trackTimeout, triggerAction]);

  // --- Animation Preview Handler ---
  useEffect(() => {
    const handlePreview = (e: Event) => {
      const customEvent = e as CustomEvent;
      const action = customEvent.detail?.action;
      const id = customEvent.detail?.id;
      
      if (action === 'special' && typeof id === 'number') {
        triggerSpecialAnimation(id);
      } else if (action === 'nod') triggerAction('nod');
      else if (action === 'bob') triggerAction('bob');
      else if (action === 'blink') {
        setIsBlinking(true);
        trackTimeout(() => setIsBlinking(false), 200);
      } else {
        // Fallback to random if no action specified
        const type = Math.floor(Math.random() * 3);
        if (type === 0) triggerAction('nod');
        else if (type === 1) triggerAction('bob');
        else {
          setIsBlinking(true);
          trackTimeout(() => setIsBlinking(false), 200);
        }
      }
    };

    window.addEventListener('curio:preview-animation', handlePreview);
    return () => window.removeEventListener('curio:preview-animation', handlePreview);
  }, [trackTimeout, triggerAction, triggerSpecialAnimation]);

  const applyEyeTransform = useCallback(() => {
    const { x, y } = currentEyeRef.current;
    const sY = visemeScaleYRef.current;
    const cssTx = `translate(${x}px, ${y}px) scale(1, ${sY})`;
    const svgTx = `translate(${x}, ${y}) scale(1, ${sY})`;
    if (eyeTrackLeftRef.current) {
      eyeTrackLeftRef.current.style.transform = cssTx;
      eyeTrackLeftRef.current.setAttribute('transform', svgTx);
    }
    if (eyeTrackRightRef.current) {
      eyeTrackRightRef.current.style.transform = cssTx;
      eyeTrackRightRef.current.setAttribute('transform', svgTx);
    }
    if (centerEyeTrackRef.current) {
      centerEyeTrackRef.current.style.transform = cssTx;
      centerEyeTrackRef.current.setAttribute('transform', svgTx);
    }

    // Premium Glint / Light Shine parallax (slight offset for glassy look)
    const glintTx = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    if (eyeGlintLeftRef.current) eyeGlintLeftRef.current.style.transform = glintTx;
    if (eyeGlintRightRef.current) eyeGlintRightRef.current.style.transform = glintTx;
    if (centerGlintRef.current) centerGlintRef.current.style.transform = glintTx;
    // --- JS-driven idle float (sinusoidal, time-based) ---
    // Phase advances at ~1.08 rad/second (matches the previous
    // frame-based speed at 60fps) so the motion speed is identical
    // across 60Hz, 90Hz, and 120Hz displays.
    if (floatStartTimeRef.current === null) {
      floatStartTimeRef.current = performance.now();
    }
    const elapsedSec = (performance.now() - floatStartTimeRef.current) / 1000;
    const phase = floatPhaseOffsetRef.current + elapsedSec * 1.08;
    const floatY = Math.sin(phase) * -14; // -14px to +14px drift
    const floatScale = 1 + Math.sin(phase * 0.7) * 0.008; // subtle breath

    // Dynamic timer text update
    if (activeCardRef.current && (activeCardRef.current.type === 'timer' || activeCardRef.current.type === 'stopwatch')) {
      const data = activeCardRef.current.data as any;
      if (data && data.targetTime) {
        const remaining = Math.max(0, data.targetTime - Date.now());
        const totalSec = Math.ceil(remaining / 1000);
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        const text = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        if (leftTimerTextRef.current && leftTimerTextRef.current.textContent !== text) {
          leftTimerTextRef.current.textContent = text;
        }
        if (rightTimerTextRef.current && rightTimerTextRef.current.textContent !== text) {
          rightTimerTextRef.current.textContent = text;
        }
        if (centerTimerTextRef.current && centerTimerTextRef.current.textContent !== text) {
          centerTimerTextRef.current.textContent = text;
        }
      } else if (data && data.startTime) { // Fallback for stopwatch
        const elapsed = Date.now() - data.startTime;
        const totalSec = Math.floor(elapsed / 1000);
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        const text = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        if (leftTimerTextRef.current && leftTimerTextRef.current.textContent !== text) {
          leftTimerTextRef.current.textContent = text;
        }
        if (rightTimerTextRef.current && rightTimerTextRef.current.textContent !== text) {
          rightTimerTextRef.current.textContent = text;
        }
        if (centerTimerTextRef.current && centerTimerTextRef.current.textContent !== text) {
          centerTimerTextRef.current.textContent = text;
        }
      }
    }

    // --- Compose head tracking + idle float ---
    if (headTrackRef.current) {
      const headX = x * 0.40;
      const headY = (y * 0.40) + floatY;
      const headCssTx = `translate(${headX}px, ${headY}px) scale(${floatScale})`;
      const headSvgTx = `translate(${headX}, ${headY}) scale(${floatScale})`;
      headTrackRef.current.style.transform = headCssTx;
      headTrackRef.current.setAttribute('transform', headSvgTx);
    }

    // --- Compose nod/bob action onto the action wrapper ---
    if (actionWrapperRef.current) {
      const bob = bobStateRef.current;
      if (bob.active) {
        const actionCss = `translate(0px, ${bob.y}px) rotate(${bob.rot}deg)`;
        const actionSvg = `translate(0, ${bob.y}) rotate(${bob.rot})`;
        actionWrapperRef.current.style.transform = actionCss;
        actionWrapperRef.current.setAttribute('transform', actionSvg);
      } else {
        actionWrapperRef.current.style.transform = '';
        actionWrapperRef.current.setAttribute('transform', '');
      }
    }
  }, []);

  const startIdleEngine = useCallback(() => {
    const idleInterval = isLowPower ? 10_000 : 7_000;
    
    behaviorLoopRef.current = window.setInterval(() => {
      const timeSinceInput = Date.now() - lastInputTimeRef.current;
      const isSeeingFace = trackedFacePresentRef.current;

      if (isSeeingFace && !hadFaceRef.current) {
        setEmotion('excited');
        triggerAction('nod');
        if (onFaceDetected) onFaceDetected(true);
        trackTimeout(() => { if (currentModeRef.current === 'idle' && currentEmotionRef.current !== 'sleepy') setEmotion('idle'); }, 1500);
      }
      hadFaceRef.current = isSeeingFace;

      const sleepThreshold = (idleSleepTimeout || 120) * 1000;
      if (timeSinceInput > sleepThreshold && !isSeeingFace) {
        if (currentEmotionRef.current !== 'sleepy') setEmotion('sleepy');
        return;
      }

      const roll = Math.random();
      if (animationsEnabled && roll < idleAnimationChance) {
        const animType = Math.floor(Math.random() * maxIdleAnimationType);
        triggerSpecialAnimation(animType);
      } else {
        // Enriched idle logic: utilize emotion hint and animate around it
        const type = Math.random();
        if (type < 0.3) {
          // Micro eye shift
          if (!isSeeingFace) {
            targetEyeRef.current = { x: (Math.random() * 60) - 30, y: (Math.random() * 20) - 10 };
            trackTimeout(() => { if (!faceDetectionActiveRef.current) targetEyeRef.current = { x: (Math.random() * 60) - 30, y: 10 }; }, 500);
            trackTimeout(() => { if (!faceDetectionActiveRef.current) targetEyeRef.current = { x: 0, y: 0 }; }, 1500);
          }
        } else if (type < 0.6) {
          // Bob or Nod randomly
          triggerAction(Math.random() > 0.5 ? 'nod' : 'bob', 800);
        } else {
          // Briefly reinforce the base emotion
          setEmotion('idle');
          if (!isSeeingFace && Math.random() > 0.5) {
             targetEyeRef.current = { x: 0, y: 15 };
             trackTimeout(() => { targetEyeRef.current = { x: 0, y: 0 }; }, 800);
          }
        }
      }
    }, idleInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationsEnabled, idleAnimationChance, idleSleepTimeout, isLowPower, maxIdleAnimationType, onFaceDetected, setEmotion, trackTimeout, triggerAction, triggerSpecialAnimation]);

  const startListeningEngine = useCallback(() => {
    behaviorLoopRef.current = window.setInterval(() => {
      const animType = Math.random();
      
      // Inherit the emotion from the transcript hint if it exists, otherwise 
      // do standard listening animations
      const hint = emotionHintRef.current;
      const baseListeningEmotion = (hint && EMOTIONS[hint]) ? hint : 'listening';
      
      setEmotion(baseListeningEmotion);

      if (animType < 0.25) {
        triggerAction('nod', 600);
      } else if (animType < 0.45) {
        triggerAction('nod', 800);
        setEmotion(hint && EMOTIONS[hint] ? hint : 'happy');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.65) {
        setEmotion(hint && EMOTIONS[hint] ? hint : 'curious');
        triggerAction('bob', 400);
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.85) {
        if (!faceDetectionActiveRef.current) {
          targetEyeRef.current = { x: (Math.random() * 40) - 20, y: Math.random() * 20 };
          trackTimeout(() => { if (currentModeRef.current === 'listening') targetEyeRef.current = { x: 0, y: 0 }; }, 1200);
        }
      } else {
        setEmotion('listening');
      }
    }, 1500);
  }, [setEmotion, trackTimeout, triggerAction]);

  const startSpeakingEngine = useCallback(() => {
    lipSyncLoopRef.current = window.setInterval(() => {
      const vol = getVolume();
      // Target scale: 1.0 (closed/narrow) to 1.5 (wide open) or 0.4 (squished)
      // For character eyes, we squish DOWN to simulate talking.
      // 1.0 is neutral, 0.4 is tight, 1.2 is wide.
      let targetScale;
      if (vol < 0.05) targetScale = 0.95; 
      else if (vol > 0.45) targetScale = 0.4;
      else targetScale = 1.0 - (vol * 1.2);
      
      // Basic smoothing
      visemeScaleYRef.current = visemeScaleYRef.current * 0.4 + targetScale * 0.6;
      applyEyeTransform();
    }, 90);

    behaviorLoopRef.current = window.setInterval(() => {
      // Prefer emotion hint from AI transcript when available
      const hint = emotionHintRef.current;
      if (hint && EMOTIONS[hint]) {
        setEmotion(hint);
      } else {
        const shift = Math.random();
        if (shift < 0.3) setEmotion('happy');
        else if (shift < 0.5) setEmotion('excited');
        else if (shift < 0.65) setEmotion('curious');
        else setEmotion('idle');
      }
      if (Math.random() < 0.4) triggerAction(Math.random() > 0.5 ? 'nod' : 'bob');
    }, 1400);
  }, [setEmotion, triggerAction]);

  const startDancingEngine = useCallback(() => {
    let beatCount = 0;
    behaviorLoopRef.current = window.setInterval(() => {
      beatCount++;
      const move = beatCount % 6;
      if (move === 0) { triggerAction('bob', 400); setEmotion('happy'); }
      else if (move === 1) { triggerAction('nod', 500); setEmotion('excited'); }
      else if (move === 2) { triggerAction('bob', 350); setEmotion('wink'); }
      else if (move === 3) { triggerAction('bob', 300); setEmotion('happy'); }
      else if (move === 4) { triggerAction('nod', 400); setEmotion('excited'); }
      else { triggerAction('bob', 500); setEmotion('happy'); }
    }, 450);
  }, [setEmotion, triggerAction]);

  useEffect(() => {
    const mode = toEngineMode(state);
    currentModeRef.current = mode;
    lastInputTimeRef.current = Date.now();
    clearAllEngineTimers();
    if (canvasRef.current) {
      canvasRef.current.className.baseVal = `curio-svg-face mode-${mode}`;
    }
    if (mode === 'idle') {
      setEmotion('idle');
      if (allowAmbientAnimation && animationsEnabled) startIdleEngine();
    } else if (mode === 'listening') {
      setEmotion('listening');
      if (allowAmbientAnimation && animationsEnabled) startListeningEngine();
    } else if (mode === 'speaking') {
      startSpeakingEngine();
    } else if (mode === 'dancing') {
      if (allowAmbientAnimation && animationsEnabled) startDancingEngine();
    }
    return () => clearAllEngineTimers();
  }, [allowAmbientAnimation, animationsEnabled, setEmotion, startIdleEngine, startListeningEngine, startSpeakingEngine, startDancingEngine, state, clearAllEngineTimers, eyeColor]);

  useEffect(() => {
    if (!allowAmbientAnimation) {
      setIsBlinking(false);
      return;
    }
    let cancelled = false;
    let blinkTimeoutId: ReturnType<typeof setTimeout>;
    let closeTimeoutId: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      const delay = Math.random() * 3500 + 2000;
      blinkTimeoutId = setTimeout(() => {
        if (cancelled) return;
        if (currentEmotionRef.current !== 'wink' && currentEmotionRef.current !== 'sleepy') {
          setIsBlinking(true);
          closeTimeoutId = setTimeout(() => { if (!cancelled) setIsBlinking(false); }, 150);
        }
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => { cancelled = true; clearTimeout(blinkTimeoutId); clearTimeout(closeTimeoutId); };
  }, [allowAmbientAnimation, animationsEnabled]);

  useEffect(() => {
    // Micro-Saccade / Noise generator for lifelike quality
    const noiseInterval = trackInterval(window.setInterval(() => {
      if (!allowAmbientAnimation || !animationsEnabled || documentHidden) return;
      // Inject tiny jitter or small saccades
      if (Math.random() < microSaccadeChance) {
        noiseRef.current = {
          x: (Math.random() - 0.5) * 15,
          y: (Math.random() - 0.5) * 10
        };
        trackTimeout(() => { noiseRef.current = { x: 0, y: 0 }; }, 200);
      }
    }, microSaccadeIntervalMs));

    // Frame-rate-independent exponential lerp. The base lerp of 0.15
    // was tuned for 60fps (~16.67ms frames). We normalize to actual
    // frame delta so the eye tracking feels identical on 60/90/120Hz.
    let lastFrameTime = performance.now();
    const BASE_LERP = 0.15;
    const BASE_DT = 1000 / 60; // 16.67ms

    const stepEyes = () => {
      const now = performance.now();
      const dt = Math.min(now - lastFrameTime, 100); // cap to avoid jumps after tab switch
      lastFrameTime = now;

      const cur = currentEyeRef.current;
      const tgt = targetEyeRef.current;
      const noise = noiseRef.current;

      // Normalize lerp to frame delta: at 60fps this equals BASE_LERP,
      // at 120fps it's ~0.077, at 30fps it's ~0.28.
      const baseLerp = faceDetectionActiveRef.current ? Math.max(BASE_LERP, 0.3) : BASE_LERP;
      const effectiveLerp = 1 - Math.pow(1 - baseLerp, dt / BASE_DT);

      cur.x += (tgt.x + noise.x - cur.x) * effectiveLerp;
      cur.y += (tgt.y + noise.y - cur.y) * effectiveLerp;

      applyEyeTransform();
    };

    if (documentHidden) {
      targetEyeRef.current = { x: 0, y: 0 };
      currentEyeRef.current = { x: 0, y: 0 };
      applyEyeTransform();
      return undefined;
    }

    // Swap to setTimeout when eyes converge so the browser can idle --
    // RAF keeps firing at 60fps even when throttled.
    const EYE_EPSILON = 0.15;
    const THROTTLED_INTERVAL_MS = eyeConvergedThrottleMs;
    let throttleTimeoutId: number | 0 = 0;

    const isConverged = () => {
      const cur = currentEyeRef.current;
      const tgt = targetEyeRef.current;
      return Math.abs(tgt.x - cur.x) < EYE_EPSILON
        && Math.abs(tgt.y - cur.y) < EYE_EPSILON;
    };

    const update = () => {
      stepEyes();

      if (isConverged()) {
        throttleTimeoutId = window.setTimeout(update, THROTTLED_INTERVAL_MS);
      } else {
        eyeRafRef.current = requestAnimationFrame(update);
      }
    };
    eyeRafRef.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(eyeRafRef.current);
      if (throttleTimeoutId) window.clearTimeout(throttleTimeoutId);
      clearInterval(noiseInterval);
    };
  }, [allowAmbientAnimation, animationsEnabled, applyEyeTransform, documentHidden, eyeConvergedThrottleMs, isBlinking, microSaccadeChance, microSaccadeIntervalMs, trackInterval, trackTimeout]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      registerInteraction();
      if (faceDetectionActiveRef.current) return;
      targetEyeRef.current.x = ((e.clientX / window.innerWidth) - 0.5) * 40;
      targetEyeRef.current.y = ((e.clientY / window.innerHeight) - 0.5) * 40;
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, [registerInteraction]);

  // ==========================================
  // CAMERA FACE TRACKING (delegated to shared hook)
  // ==========================================
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
    facePresentRef: trackedFacePresentRef,
    logTag: 'KiroFace',
    backoffThreshold: 5,
    backoffIntervalMs: 2000,
  });

  const renderEyeContent = useCallback((side: 'left' | 'right') => {
    // Fill the full ghost face area. The clipPath handles the 'socket' shape.
    // Ghost-native coords: body spans (285, 150) to (700, 755). Eye centers at
    // (481, 365) for left and (581, 365) for right.
    return (
      <>
        <rect x="200" y="100" width="560" height="700" fill="#000000" />
        <circle
          ref={side === 'left' ? eyeGlintLeftRef : eyeGlintRightRef}
          cx={side === 'left' ? 472 : 572}
          cy={352}
          r="10"
          fill="url(#kiro-eye-glint)"
          style={{ opacity: 0.85 }}
        />
      </>
    );
  }, []);


  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg
        ref={canvasRef}
        viewBox="-100 -100 800 600"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="kiro-headShellGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>

          <linearGradient id="kiro-faceplateGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>

          <pattern id="kiro-dotPattern" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill={eyeColor} />
          </pattern>

          {allowFaceHeavyEffects && (
            <>
              <filter id="kiro-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <filter id="kiro-spill" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="15" result="blur" />
                <feComponentTransfer in="blur">
                  <feFuncA type="linear" slope="0.45" />
                </feComponentTransfer>
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <filter id="kiro-gloss-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComponentTransfer in="blur">
                  <feFuncA type="linear" slope="0.6" />
                </feComponentTransfer>
              </filter>

              <filter id="kiro-glass-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="12" result="blur" />
                <feComponentTransfer in="blur">
                  <feFuncA type="linear" slope="0.3" />
                </feComponentTransfer>
              </filter>
            </>
          )}

          <radialGradient id="kiro-eye-glint" cx="40%" cy="40%" r="40%" fx="30%" fy="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="kiro-blush-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff0066" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff0066" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="kiro-spectral-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0" />
            <stop offset="55%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="kiro-beam-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="kiro-rainbow-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="20%" stopColor="#f59e0b" />
            <stop offset="40%" stopColor="#10b981" />
            <stop offset="60%" stopColor="#3b82f6" />
            <stop offset="80%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>

          <pattern id="kiro-scanline-pattern" x="0" y="0" width="100%" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="600" y2="0" stroke="#000000" strokeWidth="1" opacity="0.15" />
          </pattern>

          <clipPath id="kiro-clip-left">
            <path ref={maskLeftRef} d={EMOTIONS.idle.clipLeft} />
          </clipPath>
          <clipPath id="kiro-clip-right">
            <path ref={maskRightRef} d={EMOTIONS.idle.clipRight} />
          </clipPath>
        </defs>

        {/* Float + Breath are now JS-driven in applyEyeTransform via rAF loop */}
        <g style={{ transformOrigin: '300px 230px' }}>
          <g style={{ transformOrigin: '300px 230px' }}>

          <g ref={headTrackRef} style={isLowPower ? undefined : { willChange: 'transform' }}>
            <g transform="translate(-72, -117) scale(0.70)">
              <g ref={actionWrapperRef} style={{ transformOrigin: '531px 365px' }}>

              {/* SPECTRAL GLOW (unique Kiro) -- soft purple aura BEHIND the face */}
              <g
                ref={spectralGlowRef}
                style={{ opacity: 0, transition: 'opacity 0.8s ease-in-out', pointerEvents: 'none' }}
              >
                <ellipse
                  cx="490" cy="450" rx="280" ry="340"
                  fill="url(#kiro-spectral-grad)"
                  filter={allowFaceHeavyEffects ? 'url(#kiro-glass-glow)' : undefined}
                  style={{
                    transformOrigin: '490px 450px',
                    animation: 'kiro-spectral-pulse 2.4s ease-in-out infinite',
                  }}
                />
              </g>

              {/* Kiro Ghost Body (Solid white, no holes) */}
              <g ref={ghostBodyRef} style={{ transformOrigin: '490px 450px', willChange: 'transform, opacity' }}>
                <path fill="#FFFEFF" d="M344.989685,754.231018 C333.642181,752.248352 322.558380,749.493591 312.562897,743.430542 C292.226685,731.094971 282.608154,712.451050 281.128845,689.279297 C279.628937,665.785095 286.365692,643.933533 295.284790,622.595398 C295.539551,621.985962 295.747894,621.357117 296.119751,620.299866 C296.186432,619.919739 296.111206,619.977112 296.035950,620.034424 C294.481445,620.394348 292.860962,620.580261 291.382507,621.140808 C274.160339,627.670898 256.727570,632.692749 237.930984,631.208862 C211.120834,629.092407 199.016174,608.906921 200.556595,585.088196 C201.409592,571.898865 206.470749,560.165527 213.137817,549.128113 C234.609604,513.581299 244.269119,474.478973 248.880463,433.711670 C252.301941,403.463409 254.931198,373.045258 260.203125,343.105957 C267.621033,300.979858 280.981995,260.823090 308.004883,226.481079 C341.792297,183.542328 385.784302,157.506302 439.586792,149.307312 C506.214233,139.153931 565.774658,156.184494 617.108398,200.032669 C647.027344,225.588821 667.323181,257.960541 680.676941,294.796173 C690.672302,322.368011 695.769470,351.046387 698.500671,380.077759 C700.400574,400.273010 701.684509,420.635132 701.453125,440.902252 C700.644104,511.768707 685.892334,579.566345 655.010315,643.654907 C642.148987,670.345825 625.976929,694.500610 603.868286,714.449219 C585.770386,730.778931 566.096802,744.607178 542.528381,751.842041 C523.774536,757.598999 505.380463,758.075073 488.777710,745.382202 C479.208252,738.066345 473.400726,728.038025 469.133514,716.998840 C468.540009,715.463379 468.001953,713.906494 467.158997,711.593384 C465.083527,713.180359 463.309357,714.541504 461.530487,715.896606 C436.918091,734.645264 409.888641,748.030762 379.090607,753.060791 C376.899506,753.418640 374.718994,753.841125 371.777100,754.329346 C362.343658,754.360474 353.666656,754.295776 344.989685,754.231018" />
                <path fill="#7F46DE" d="M345.112793,754.602600 C353.666656,754.295776 362.343658,754.360474 371.491547,754.428101 C371.806732,754.719055 371.649109,755.260376 371.495575,755.259155 C362.742157,755.192810 353.989014,755.081238 345.112793,754.602600 z" />
                <path fill="#8E48FF" d="M296.024536,620.023682 C296.111206,619.977112 296.186432,619.919739 296.125732,619.929504 C295.989777,619.996582 296.013092,620.012939 296.024536,620.023682 z" />
              </g>

              {/* Facial Details Group (Blush, Sweat, Tears) */}
              {/* Facial Details Group (Blush, Sweat, Tears) -- ghost-native coords, eyes (481,365)/(581,365) */}
              <g id="facial-details" style={{ pointerEvents: 'none' }}>
                <circle ref={blushLeftRef} cx="430" cy="420" r="32" fill="url(#kiro-blush-grad)" style={{ opacity: 0, transition: 'opacity 0.5s' }} />
                <circle ref={blushRightRef} cx="632" cy="420" r="32" fill="url(#kiro-blush-grad)" style={{ opacity: 0, transition: 'opacity 0.5s' }} />
                <g ref={sweatRef} transform="translate(640, 250)" style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                  <path d="M 0 0 C -8 16, -8 24, 0 32 C 8 24, 8 16, 0 0" fill="#38bdf8" />
                </g>
                <g ref={tearsRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                  <path d="M 481 410 V 540" stroke="#38bdf8" strokeWidth="5" strokeDasharray="10 10" className="animate-pulse" />
                  <path d="M 581 410 V 540" stroke="#38bdf8" strokeWidth="5" strokeDasharray="10 10" className="animate-pulse" />
                </g>
              </g>

              {/* Eyes - clipPath shapes are authored in ghost-native coords, matching the ghost body's eye sockets at (481, 365) and (581, 365). */}
              <g ref={mainEyesRef} className={`curio-eye-socket${isBlinking ? ' curio-is-blinking' : ''}`} style={{ transformOrigin: '531px 365px', transition: 'opacity 0.3s' }}>
                {activeCard ? (
                  <g ref={centerEyeTrackRef} style={{ transformOrigin: '531px 365px' }}>
                    <KiroCardEyeContent activeCard={activeCard} centerGlintRef={centerGlintRef} centerTimerTextRef={centerTimerTextRef} />
                  </g>
                ) : (
                  <>
                    <g clipPath="url(#kiro-clip-left)">
                      <g ref={eyeTrackLeftRef} style={{ transformOrigin: '481px 365px' }}>
                        {renderEyeContent('left')}
                      </g>
                    </g>
                    <g clipPath="url(#kiro-clip-right)">
                      <g ref={eyeTrackRightRef} style={{ transformOrigin: '581px 365px' }}>
                        {renderEyeContent('right')}
                      </g>
                    </g>
                  </>
                )}
              </g>

              {/* --- ACCESSORIES -- ghost-native coords, eyes (481,365)/(581,365) --- */}

              {/* MAGNIFYING GLASS -- over the left eye */}
              <g
                ref={magnifyingGlassRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  willChange: 'transform',
                  transformOrigin: '481px 365px'
                }}
              >
                <line x1="481" y1="365" x2="360" y2="540" stroke="#475569" strokeWidth="18" strokeLinecap="round" />
                <line x1="420" y1="450" x2="360" y2="540" stroke="#1e293b" strokeWidth="20" strokeLinecap="round" />
                <circle cx="481" cy="365" r="85" fill="none" stroke="#64748b" strokeWidth="14" />
                <circle cx="481" cy="365" r="85" fill="none" stroke="#94a3b8" strokeWidth="5" />
                <path d="M 415 315 Q 470 275 545 290" fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
                <circle cx="481" cy="365" r="78" fill="#38bdf8" opacity="0.1" />
              </g>

              {/* SUNGLASSES -- spans both eyes */}
              <g
                ref={sunglassesRef}
                style={{
                  opacity: 0,
                  transform: 'translate(0px, -260px)',
                  transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-in',
                  willChange: 'transform, opacity'
                }}
              >
                <path d="M 400 350 L 438 368 L 524 368 L 538 350 L 572 350 L 586 368 L 672 368 L 710 350" fill="none" stroke="#0f172a" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 432 370 C 432 420, 530 420, 530 370 Z" fill="#020617" stroke="#1e293b" strokeWidth="5" />
                <path d="M 448 376 L 488 376" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
                <path d="M 582 370 C 582 420, 680 420, 680 370 Z" fill="#020617" stroke="#1e293b" strokeWidth="5" />
                <path d="M 598 376 L 638 376" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
              </g>

              {/* SCANNER BEAM -- swept across the eye row */}
              <g
                ref={scannerRef}
                style={{
                  opacity: 0,
                  transform: 'translateY(-160px)',
                  willChange: 'transform, opacity'
                }}
              >
                <line x1="380" y1="365" x2="680" y2="365" stroke="#ef4444" strokeWidth="6" opacity="0.8" filter="url(#kiro-glow)" />
                <rect x="380" y="345" width="300" height="40" opacity="0.2" fill="#ef4444" filter="url(#kiro-glow)" />
              </g>

              {/* HEART EYES -- centered on eye positions */}
              <g
                ref={heartsRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '531px 365px'
                }}
              >
                <path d="M 481 325 C 481 295 431 295 431 335 C 431 375 481 405 481 405 C 481 405 531 375 531 335 C 531 295 481 295 481 325 Z" fill="#ef4444" filter="url(#kiro-glow)" />
                <path d="M 581 325 C 581 295 531 295 531 335 C 531 375 581 405 581 405 C 581 405 631 375 631 335 C 631 295 581 295 581 325 Z" fill="#ef4444" filter="url(#kiro-glow)" />
              </g>

              {/* MUSTACHE (positioned below the eyes) */}
              <g
                ref={mustacheRef}
                style={{
                  opacity: 0,
                  transform: 'scale(0.1)',
                  transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-in',
                  transformOrigin: '531px 470px'
                }}
              >
                <path d="M 531 455 C 461 435, 411 465, 431 495 C 461 525, 511 475, 531 485 C 551 475, 601 525, 631 495 C 651 465, 601 435, 531 455 Z" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" />
              </g>

              {/* MONOCLE -- fitted around right eye */}
              <g
                ref={monocleRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '581px 365px'
                }}
              >
                <circle cx="581" cy="365" r="65" fill="none" stroke="#fbbf24" strokeWidth="8" />
                <line x1="641" y1="390" x2="685" y2="470" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
              </g>

              {/* THINKING (Question Mark) -- above the face */}
              <g
                ref={thinkingRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '531px 220px'
                }}
              >
                <path d="M 510 240 Q 510 200, 550 200 Q 590 200, 590 240 Q 590 270, 550 280 V 300 M 550 330 V 340" fill="none" stroke="#60a5fa" strokeWidth="12" strokeLinecap="round" />
              </g>

              {/* ANALYTICAL (Data Grid) -- overlayed around the eyes */}
              <g
                ref={analyticalRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out'
                }}
              >
                <rect x="360" y="280" width="340" height="170" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="10 10" opacity="0.3" />
                <line x1="360" y1="365" x2="700" y2="365" stroke="#34d399" strokeWidth="1" opacity="0.5" />
                <line x1="440" y1="280" x2="440" y2="450" stroke="#34d399" strokeWidth="1" opacity="0.5" />
                <line x1="530" y1="280" x2="530" y2="450" stroke="#34d399" strokeWidth="1" opacity="0.5" />
                <line x1="620" y1="280" x2="620" y2="450" stroke="#34d399" strokeWidth="1" opacity="0.5" />
              </g>

              {/* RAGING (Flame Overlay) -- around both eyes */}
              <g
                ref={rangingRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out'
                }}
              >
                <path d="M 400 340 Q 435 240 470 340 M 500 340 Q 535 220 570 340 M 600 340 Q 635 240 670 340" fill="none" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" opacity="0.6" style={{ animation: 'kiro-flame-flicker 0.4s infinite alternate' }} />
              </g>

              {/* BLUSH (Shy/Soft) */}
              <g
                ref={blushRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.5s ease-in-out'
                }}
              >
                <circle cx="410" cy="420" r="26" fill="#fda4af" opacity="0.45" filter={allowFaceHeavyEffects ? 'blur(6px)' : undefined} />
                <circle cx="652" cy="420" r="26" fill="#fda4af" opacity="0.45" filter={allowFaceHeavyEffects ? 'blur(6px)' : undefined} />
              </g>

              {/* STEAM -- rising from the sides */}
              <g ref={steamLeftRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
                <circle cx="310" cy="270" r="12" fill="#e2e8f0" style={{ animation: 'kiro-zzz-float 2s ease-in-out infinite' }} />
                <circle cx="295" cy="230" r="15" fill="#e2e8f0" opacity="0.8" style={{ animation: 'kiro-zzz-float 2.5s ease-in-out infinite 0.3s' }} />
                <circle cx="320" cy="185" r="10" fill="#e2e8f0" opacity="0.6" style={{ animation: 'kiro-zzz-float 3s ease-in-out infinite 0.6s' }} />
              </g>
              <g ref={steamRightRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
                <circle cx="720" cy="270" r="12" fill="#e2e8f0" style={{ animation: 'kiro-zzz-float 2s ease-in-out infinite 0.15s' }} />
                <circle cx="735" cy="230" r="15" fill="#e2e8f0" opacity="0.8" style={{ animation: 'kiro-zzz-float 2.5s ease-in-out infinite 0.45s' }} />
                <circle cx="712" cy="185" r="10" fill="#e2e8f0" opacity="0.6" style={{ animation: 'kiro-zzz-float 3s ease-in-out infinite 0.75s' }} />
              </g>

              {/* MATRIX RAIN EYES Overlay -- clipped to eye sockets */}
              <g ref={matrixEyesRef} style={{ opacity: 0, transition: 'opacity 0.5s', pointerEvents: 'none' }}>
                <g clipPath="url(#kiro-clip-left)">
                  <rect x="420" y="290" width="130" height="160" fill="#00ff00" opacity="0.12" />
                  {[...Array(5)].map((_, i) => (
                    <rect key={`ml-${i}`} x={430 + i * 24} y="290" width="3" height="160" fill="#00ff00" className="animate-pulse" style={{ animationDuration: `${1 + Math.random()}s` }} />
                  ))}
                </g>
                <g clipPath="url(#kiro-clip-right)">
                  <rect x="520" y="290" width="130" height="160" fill="#00ff00" opacity="0.12" />
                  {[...Array(5)].map((_, i) => (
                    <rect key={`mr-${i}`} x={530 + i * 24} y="290" width="3" height="160" fill="#00ff00" className="animate-pulse" style={{ animationDuration: `${1 + Math.random()}s` }} />
                  ))}
                </g>
              </g>

              {/* RAINBOW OVERLAY -- covers the eye band */}
              <g ref={rainbowRef} style={{ opacity: 0, transition: 'opacity 0.8s', pointerEvents: 'none' }}>
                <rect x="360" y="230" width="340" height="280" rx="130" fill="url(#kiro-rainbow-grad)" opacity="0.32" />
              </g>

              {/* BUTTERFLY -- floats around the face; animation script sets transform */}
              <g ref={butterflyRef} style={{ opacity: 0, transition: 'opacity 0.5s' }}>
                <path d="M -10 -10 Q 0 -20 10 -10 Q 20 0 10 10 Q 0 20 -10 10 Q -20 0 -10 -10" fill="#f472b6" />
                <path d="M -10 -10 Q -20 -20 -30 -10 Q -40 0 -30 10 Q -20 20 -10 10 Q 0 0 -10 -10" fill="#ec4899" />
                <circle r="4" fill="#1e293b" />
              </g>

              {/* GUM POP -- blown from mouth area below eyes */}
              <g
                ref={gumPopRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                }}
              >
                <circle cx="531" cy="530" r="10" fill="#f472bc" opacity="0.3" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
                <circle cx="531" cy="530" r="30" fill="#f472bc" opacity="0.7" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
                <circle cx="519" cy="518" r="6" fill="#ffffff" opacity="0.35" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
              </g>

              {/* CONFETTI -- falling from above the face */}
              <g ref={confettiRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                <rect x="340" y="180" width="8" height="8" rx="1" fill="#f87171" style={{ animation: 'kiro-confetti-fall 1.8s ease-in infinite' }} />
                <rect x="400" y="165" width="6" height="10" rx="1" fill="#60a5fa" style={{ animation: 'kiro-confetti-fall 2s ease-in infinite 0.15s' }} />
                <rect x="460" y="175" width="10" height="6" rx="1" fill="#34d399" style={{ animation: 'kiro-confetti-fall 1.6s ease-in infinite 0.3s' }} />
                <rect x="530" y="170" width="7" height="9" rx="1" fill="#fbbf24" style={{ animation: 'kiro-confetti-fall 2.2s ease-in infinite 0.45s' }} />
                <rect x="590" y="180" width="9" height="7" rx="1" fill="#a78bfa" style={{ animation: 'kiro-confetti-fall 1.9s ease-in infinite 0.6s' }} />
                <rect x="650" y="165" width="6" height="8" rx="1" fill="#fb923c" style={{ animation: 'kiro-confetti-fall 2.1s ease-in infinite 0.75s' }} />
                <rect x="700" y="175" width="8" height="6" rx="1" fill="#f472b6" style={{ animation: 'kiro-confetti-fall 1.7s ease-in infinite 0.9s' }} />
                <rect x="370" y="170" width="5" height="10" rx="1" fill="#2dd4bf" style={{ animation: 'kiro-confetti-fall 2.3s ease-in infinite 0.2s' }} />
              </g>

              {/* HALO -- above the head */}
              <g
                ref={haloRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.5s ease-in-out',
                }}
              >
                <ellipse cx="531" cy="180" rx="120" ry="20" fill="none" stroke="#fde047" strokeWidth="8" filter="url(#kiro-glow)" style={{ animation: 'kiro-halo-bob 2s ease-in-out infinite' }} />
                <ellipse cx="531" cy="180" rx="120" ry="20" fill="none" stroke="#fef08a" strokeWidth="3" opacity="0.5" style={{ animation: 'kiro-halo-bob 2s ease-in-out infinite' }} />
              </g>

              {/* STAR EYES Overlay -- centered on eyes */}
              <g ref={starsRef} style={{ opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
                <path d="M 481 320 L 493 348 L 524 352 L 501 372 L 510 402 L 481 386 L 452 402 L 461 372 L 438 352 L 469 348 Z" fill="#fde047" filter="url(#kiro-glow)" />
                <path d="M 581 320 L 593 348 L 624 352 L 601 372 L 610 402 L 581 386 L 552 402 L 561 372 L 538 352 L 569 348 Z" fill="#fde047" filter="url(#kiro-glow)" />
              </g>

              {/* CLOCK EYE Overlay -- centered on left eye */}
              <g ref={clockRef} style={{ opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
                <circle cx="481" cy="365" r="48" fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="8 5" opacity="0.7" style={{ transformOrigin: '481px 365px', animation: 'curio-propeller-spin 6s linear infinite' }} />
                <line x1="481" y1="365" x2="481" y2="327" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" style={{ transformOrigin: '481px 365px', animation: 'curio-propeller-spin 3s linear infinite' }} />
                <line x1="481" y1="365" x2="507" y2="365" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: '481px 365px', animation: 'curio-propeller-spin 1s linear infinite' }} />
                <circle cx="481" cy="365" r="3" fill="#ffffff" />
              </g>

              {/* RAIN -- falling through the eye area */}
              <g ref={rainRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
                <line x1="430" y1="390" x2="428" y2="412" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'kiro-confetti-fall 1.2s linear infinite' }} />
                <line x1="458" y1="400" x2="456" y2="422" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" style={{ animation: 'kiro-confetti-fall 1.4s linear infinite 0.2s' }} />
                <line x1="490" y1="395" x2="488" y2="415" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" style={{ animation: 'kiro-confetti-fall 1.1s linear infinite 0.4s' }} />
                <line x1="560" y1="390" x2="558" y2="412" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'kiro-confetti-fall 1.3s linear infinite 0.1s' }} />
                <line x1="590" y1="400" x2="588" y2="420" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" style={{ animation: 'kiro-confetti-fall 1.5s linear infinite 0.3s' }} />
                <line x1="622" y1="395" x2="620" y2="415" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" style={{ animation: 'kiro-confetti-fall 1.0s linear infinite 0.5s' }} />
              </g>

              {/* SNEEZE PARTICLES -- below eyes */}
              <g ref={sneezeRef} style={{ opacity: 0, transition: 'opacity 0.2s' }}>
                <circle cx="531" cy="480" r="6" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.4s' }} />
                <circle cx="505" cy="495" r="5" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.5s' }} />
                <circle cx="557" cy="495" r="5" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.3s' }} />
              </g>

              {/* THINKING CLOUD -- upper right of face */}
              <g
                ref={thinkingCloudRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.4s ease-in-out',
                }}
              >
                <circle cx="680" cy="240" r="8" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
                <circle cx="704" cy="218" r="13" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
                <ellipse cx="752" cy="202" rx="48" ry="32" fill="#fff" stroke="#cbd5e1" strokeWidth="3" />
                <text x="738" y="214" fontSize="32" fill="#64748b" fontWeight="bold">?</text>
              </g>

              {/* FIRE -- flames rising through eyes */}
              <g ref={fireRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                <path d="M 441 420 Q 481 280 521 420 Z" fill="#f87171" opacity="0.65" style={{ transformOrigin: '481px 420px', animation: 'kiro-flame-flicker 0.4s infinite alternate' }} />
                <path d="M 461 420 Q 481 310 501 420 Z" fill="#fbbf24" opacity="0.85" />
                <path d="M 541 420 Q 581 280 621 420 Z" fill="#f87171" opacity="0.65" style={{ transformOrigin: '581px 420px', animation: 'kiro-flame-flicker 0.4s infinite alternate' }} />
                <path d="M 561 420 Q 581 310 601 420 Z" fill="#fbbf24" opacity="0.85" />
              </g>

              {/* PROPELLER -- above the head */}
              <g ref={propellerRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                <rect x="521" y="134" width="20" height="22" fill="#475569" />
                <g style={{ transformOrigin: '531px 144px', animation: 'curio-propeller-spin 0.2s linear infinite' }}>
                  <path d="M 451 139 L 611 149 L 611 139 L 451 149 Z" fill="#94a3b8" />
                </g>
              </g>

              {/* MUSIC NOTES -- flanking the face sides */}
              <g ref={musicNotesRef} style={{ opacity: 0, transition: 'opacity 0.5s' }}>
                <path d="M 680 280 L 680 220 L 714 208 L 714 266" fill="none" stroke="#a78bfa" strokeWidth="6" style={{ animation: 'kiro-note-float 3s infinite' }} />
                <circle cx="668" cy="280" r="11" fill="#a78bfa" style={{ animation: 'kiro-note-float 3s infinite' }} />
                <path d="M 356 240 L 356 180 L 390 168 L 390 226" fill="none" stroke="#60a5fa" strokeWidth="6" style={{ animation: 'kiro-note-float 3.5s infinite 0.5s' }} />
                <circle cx="344" cy="240" r="11" fill="#60a5fa" style={{ animation: 'kiro-note-float 3.5s infinite 0.5s' }} />
              </g>

              {/* GOLD CHAIN -- draped along the ghost's body */}
              <g ref={goldChainRef} style={{ opacity: 0, transition: 'opacity 0.5s' }}>
                <path d="M 370 560 Q 531 650 692 560" fill="none" stroke="#fbbf24" strokeWidth="10" strokeLinecap="round" />
                <circle cx="531" cy="625" r="36" fill="#fbbf24" stroke="#d97706" strokeWidth="4" />
                <text x="531" y="638" fill="#d97706" fontSize="36" fontWeight="bold" textAnchor="middle">K</text>
              </g>


              {/* ZZZ FLOATS -- floating up from the right side */}
              <g
                ref={zzzRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 1s ease-in-out'
                }}
              >
                <g style={{ animation: 'kiro-zzz-float 3s ease-in-out infinite' }}>
                  <text x="620" y="340" fontSize="32" fill="#cbd5e1" fontWeight="bold" opacity="0.7">z</text>
                </g>
                <g style={{ animation: 'kiro-zzz-float 3.5s ease-in-out infinite 0.6s' }}>
                  <text x="660" y="290" fontSize="42" fill="#94a3b8" fontWeight="bold" opacity="0.85">Z</text>
                </g>
                <g style={{ animation: 'kiro-zzz-float 4s ease-in-out infinite 1.2s' }}>
                  <text x="700" y="230" fontSize="52" fill="#64748b" fontWeight="bold">Z</text>
                </g>
              </g>

              {/* ACTIVE CARD OVERLAYS - ALL VISUALS MOVED TO CENTERED EYE COMPONENT */}
              {activeCard && (activeCard.type === 'timer' || activeCard.type === 'stopwatch') && (activeCard.data as any)?.isRinging && (
                <style>{`
                  .kiro-face-container {
                     animation: kiro-shake 0.5s cubic-bezier(.36,.07,.19,.97) both infinite !important;
                  }
                  @keyframes kiro-shake {
                    10%, 90% { transform: translate3d(-2px, 0, 0); }
                    20%, 80% { transform: translate3d(4px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-8px, 0, 0); }
                    40%, 60% { transform: translate3d(8px, 0, 0); }
                  }
                `}</style>
              )}

              {/* TERMINAL MODE OVERLAY -- centered on face area */}
              <g
                ref={terminalRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.4s ease-in-out',
                  pointerEvents: 'none'
                }}
              >
                <rect x="340" y="240" width="380" height="260" rx="10" fill="#000" opacity="0.8" />
                <rect x="340" y="240" width="380" height="260" rx="10" fill="none" stroke="#0f0" strokeWidth="2" opacity="0.4" />
                <text x="360" y="280" fill="#0f0" fontSize="16" fontFamily="monospace" style={{ textShadow: '0 0 5px #0f0' }}>&gt; INIT KIRO_OS v1.0</text>
                <text x="360" y="310" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.8">&gt; LOADING KIRO_CORE... [OK]</text>
                <text x="360" y="335" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.7">&gt; ANALYZING USER... 100%</text>
                <text x="360" y="360" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.6">&gt; STATUS: ADORABLE</text>
                <text x="360" y="385" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.4" className="animate-pulse">&gt; ERROR: CUTENESS_OVERLOAD</text>
                <text x="360" y="410" fill="#0f0" fontSize="12" fontFamily="monospace" opacity="0.3">&gt; REBOOTING EMOTION_ENGINE...</text>
              </g>

              {/* SPARKLE EYES (unique Kiro) -- twinkling stars around the eyes */}
              <g
                ref={sparklesRef}
                style={{ opacity: 0, transition: 'opacity 0.4s', pointerEvents: 'none' }}
              >
                {[
                  { x: 435, y: 330, size: 12, delay: 0 },
                  { x: 525, y: 305, size: 10, delay: 0.3 },
                  { x: 470, y: 415, size: 11, delay: 0.6 },
                  { x: 540, y: 330, size: 12, delay: 0.15 },
                  { x: 625, y: 310, size: 10, delay: 0.45 },
                  { x: 580, y: 415, size: 11, delay: 0.75 },
                ].map((s, i) => (
                  <path
                    key={`kiro-sparkle-${i}`}
                    d={`M ${s.x} ${s.y - s.size} L ${s.x + s.size * 0.3} ${s.y - s.size * 0.3} L ${s.x + s.size} ${s.y} L ${s.x + s.size * 0.3} ${s.y + s.size * 0.3} L ${s.x} ${s.y + s.size} L ${s.x - s.size * 0.3} ${s.y + s.size * 0.3} L ${s.x - s.size} ${s.y} L ${s.x - s.size * 0.3} ${s.y - s.size * 0.3} Z`}
                    fill="#fde047"
                    filter={allowFaceHeavyEffects ? 'url(#kiro-glow)' : undefined}
                    style={{
                      transformOrigin: `${s.x}px ${s.y}px`,
                      animation: `kiro-sparkle-twinkle 1.4s ease-in-out infinite ${s.delay}s`,
                    }}
                  />
                ))}
              </g>

              {/* UFO TRACTOR BEAM (unique Kiro) -- purple beam descending from top */}
              <g
                ref={ufoBeamRef}
                style={{
                  opacity: 0,
                  transform: 'translateY(-200px)',
                  pointerEvents: 'none',
                  willChange: 'transform, opacity',
                }}
              >
                <ellipse cx="531" cy="100" rx="50" ry="20" fill="#a78bfa" opacity="0.9" />
                <path d="M 481 100 L 360 560 L 702 560 L 581 100 Z" fill="url(#kiro-beam-grad)" opacity="0.4" />
                <circle cx="440" cy="240" r="4" fill="#fef08a" opacity="0.8" style={{ animation: 'kiro-beam-motes 1.8s ease-in-out infinite' }} />
                <circle cx="600" cy="330" r="5" fill="#fef08a" opacity="0.6" style={{ animation: 'kiro-beam-motes 2.1s ease-in-out infinite 0.3s' }} />
                <circle cx="510" cy="440" r="4" fill="#fef08a" opacity="0.7" style={{ animation: 'kiro-beam-motes 1.5s ease-in-out infinite 0.6s' }} />
              </g>

              {/* DEVIL HORNS (unique Kiro) -- above the head */}
              <g
                ref={devilHornsRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '531px 180px',
                }}
              >
                <path d="M 405 210 L 380 130 L 460 190 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="3" strokeLinejoin="round" />
                <path d="M 657 210 L 682 130 L 602 190 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="3" strokeLinejoin="round" />
              </g>


                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
};

export const KiroFace = React.memo(KiroFaceComponent);
KiroFace.displayName = 'KiroFace';
