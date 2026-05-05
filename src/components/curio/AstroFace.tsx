import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimePerformanceProfile } from '../../services/runtimePerformanceProfile';
import { getVolume } from '../../services/volumeStore';
import { type CurioState, type EngineMode, toEngineMode, getSharedVisionStream } from '../../services/emotionDetection';
import { useFaceTracking } from '../../hooks/useFaceTracking';
import type { FaceTrackingSample } from '../../services/faceTracking';
import { runAstroAnimation, type AstroAnimationRefs, type AstroAnimationContext } from './astroAnimationConfigs';
import { AstroCardEyeContent } from './AstroCardEyeContent';
import type { Card } from '../../services/cardTypes';

interface AstroFaceProps {
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

// --- Astro Bot specific Emotion shapes (Iconic Semi-Circle / Almond Dots) ---
interface EmotionShape {
  clipLeft: string;
  clipRight: string;
}

// --- Constants for Perfect Circle Morphing ---
// Kappa = 0.5522847 for circles. R=65, Offset=36.
const EMOTIONS: Record<string, EmotionShape> = {
  idle: {
    clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z',
    clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z',
  },
  listening: {
    clipLeft: 'M 215 175 C 251 175 280 194 280 230 C 280 266 251 285 215 285 C 179 285 150 266 150 230 C 150 194 179 175 215 175 Z',
    clipRight: 'M 385 175 C 421 175 450 194 450 230 C 450 266 421 285 385 285 C 349 285 320 266 320 230 C 320 194 349 175 385 175 Z',
  },
  happy: {
    clipLeft: 'M 215 200 C 251 200 280 215 280 235 C 280 255 251 265 215 265 C 179 265 150 255 150 235 C 150 215 179 200 215 200 Z',
    clipRight: 'M 385 200 C 421 200 450 215 450 235 C 450 255 421 265 385 265 C 349 265 320 255 320 235 C 320 215 349 200 385 200 Z',
  },
  excited: {
    clipLeft: 'M 215 150 C 265 150 290 194 290 230 C 290 266 265 310 215 310 C 165 310 140 266 140 230 C 140 194 165 150 215 150 Z',
    clipRight: 'M 385 150 C 435 150 460 194 460 230 C 460 266 435 310 385 310 C 335 310 310 266 310 230 C 310 194 335 150 385 150 Z',
  },
  sleepy: {
    clipLeft: 'M 215 220 C 251 220 270 225 270 230 C 270 235 251 240 215 240 C 179 240 160 235 160 230 C 160 225 179 220 215 220 Z',
    clipRight: 'M 385 220 C 421 220 440 225 440 230 C 440 235 421 240 385 240 C 349 240 330 235 330 230 C 330 225 349 220 385 220 Z',
  },
  wink: {
    clipLeft: 'M 215 220 C 251 220 270 225 270 230 C 270 235 251 240 215 240 C 179 240 160 235 160 230 C 160 225 179 220 215 220 Z',
    clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z',
  },
  curious: {
    clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z',
    clipRight: 'M 385 140 C 435 140 455 180 455 230 C 455 280 435 320 385 320 C 335 320 315 280 315 230 C 315 180 335 140 385 140 Z',
  },
  surprised: {
    clipLeft: 'M 215 140 C 265 140 290 180 290 230 C 290 280 265 320 215 320 C 165 320 140 280 140 230 C 140 180 165 140 215 140 Z',
    clipRight: 'M 385 140 C 435 140 460 180 460 230 C 460 280 435 320 385 320 C 335 320 310 280 310 230 C 310 180 335 140 385 140 Z',
  },
  suspicious: {
    clipLeft: 'M 150 210 Q 215 200 280 220 V 250 Q 215 260 150 240 Z',
    clipRight: 'M 320 220 Q 385 200 450 210 V 240 Q 385 260 320 250 Z',
  },
  angry: {
    clipLeft: 'M 150 180 Q 230 230 280 230 V 290 Q 215 295 150 280 Z',
    clipRight: 'M 320 230 Q 370 230 450 180 V 280 Q 385 295 320 290 Z',
  },
  content: {
    clipLeft: 'M 150 230 Q 150 180 215 180 Q 280 180 280 230 L 215 240 Z',
    clipRight: 'M 320 230 Q 320 180 385 180 Q 450 180 450 230 L 385 240 Z',
  },
  digitized: {
    clipLeft: 'M 160 170 H 270 V 280 H 160 Z',
    clipRight: 'M 330 170 H 440 V 280 H 330 Z',
  },
  glee: {
    clipLeft: 'M 150 240 Q 215 170 280 240 V 260 Q 215 200 150 260 Z',
    clipRight: 'M 320 240 Q 385 170 450 240 V 260 Q 385 200 320 260 Z',
  },
  smug: {
    clipLeft: 'M 215 200 C 251 200 280 215 280 235 C 280 255 251 265 215 265 C 179 265 150 255 150 235 C 150 215 179 200 215 200 Z',
    clipRight: 'M 320 220 Q 385 200 450 210 V 240 Q 385 260 320 250 Z',
  },
  nervous: {
    clipLeft: 'M 205 210 A 10 10 0 1 0 225 210 A 10 10 0 1 0 205 210 M 185 240 A 10 10 0 1 0 205 240 A 10 10 0 1 0 185 240',
    clipRight: 'M 375 210 A 10 10 0 1 0 395 210 A 10 10 0 1 0 375 210 M 355 240 A 10 10 0 1 0 375 240 A 10 10 0 1 0 355 240',
  },
  loveMail: {
    clipLeft: 'M 215 190 C 215 160 165 160 165 200 C 165 240 215 270 215 270 C 215 270 265 240 265 200 C 265 160 215 160 215 190 Z',
    clipRight: 'M 330 180 H 440 V 280 H 330 Z M 330 180 L 385 230 L 440 180',
  },
  searching: {
    clipLeft: 'M 150 230 A 65 65 0 1 0 280 230 A 65 65 0 1 0 150 230 M 180 230 A 35 35 0 1 1 250 230 A 35 35 0 1 1 180 230',
    clipRight: 'M 320 230 A 65 65 0 1 0 450 230 A 65 65 0 1 0 320 230 M 350 230 A 35 35 0 1 1 420 230 A 35 35 0 1 1 350 230',
  },
  evil: {
    clipLeft: 'M 150 180 Q 230 230 280 230 V 290 Q 215 295 150 280 Z M 215 215 A 15 15 0 1 1 215 245 A 15 15 0 1 1 215 215',
    clipRight: 'M 320 230 Q 370 230 450 180 V 280 Q 385 295 320 290 Z M 385 215 A 15 15 0 1 1 385 245 A 15 15 0 1 1 385 215',
  },
  smileSquint: {
    clipLeft: 'M 150 235 Q 215 190 280 235 L 280 245 Q 215 200 150 245 Z',
    clipRight: 'M 320 235 Q 385 190 450 235 L 450 245 Q 385 200 320 245 Z',
  },
  glitchMatrix: {
    clipLeft: 'M 160 170 H 180 V 280 H 160 Z M 210 170 H 230 V 280 H 210 Z M 250 170 H 270 V 280 H 250 Z',
    clipRight: 'M 330 170 H 350 V 280 H 330 Z M 380 170 H 400 V 280 H 380 Z M 420 170 H 440 V 280 H 420 Z',
  },
  crying: {
    clipLeft: 'M 150 230 A 65 65 0 1 0 280 230 A 65 65 0 1 0 150 230 M 170 230 H 260 V 240 H 170 Z M 190 260 H 240 V 270 H 190 Z',
    clipRight: 'M 320 230 A 65 65 0 1 0 450 230 A 65 65 0 1 0 320 230 M 340 230 H 430 V 240 H 340 Z M 360 260 H 410 V 270 H 360 Z',
  },
  thinkingCloud: {
    clipLeft: 'M 160 230 A 30 30 0 1 1 220 230 A 30 30 0 1 1 160 230 M 215 200 A 25 25 0 1 1 265 200 A 25 25 0 1 1 215 200',
    clipRight: 'M 380 230 A 30 30 0 1 1 440 230 A 30 30 0 1 1 380 230 M 335 200 A 25 25 0 1 1 385 200 A 25 25 0 1 1 335 200',
  },
  heartEyes: {
    clipLeft: 'M 215 190 C 215 160 165 160 165 200 C 165 240 215 270 215 270 C 215 270 265 240 265 200 C 265 160 215 160 215 190 Z',
    clipRight: 'M 385 190 C 385 160 335 160 335 200 C 335 240 385 270 385 270 C 385 270 435 240 435 200 C 435 160 385 160 385 190 Z',
  },
  shiver: {
    clipLeft: 'M 160 210 Q 185 200 210 210 Q 235 220 260 210 V 230 Q 235 240 210 230 Q 185 220 160 230 Z',
    clipRight: 'M 340 210 Q 365 200 390 210 Q 415 220 440 210 V 230 Q 415 240 390 230 Q 365 220 340 230 Z',
  },
  joy: {
    clipLeft: 'M 150 250 Q 215 150 280 250 Q 215 190 150 250 Z',
    clipRight: 'M 320 250 Q 385 150 450 250 Q 385 190 320 250 Z'
  },
  joyArc: {
    clipLeft: 'M 150 250 Q 215 150 280 250 Q 215 190 150 250 Z',
    clipRight: 'M 320 250 Q 385 150 450 250 Q 385 190 320 250 Z'
  },
  arrowsIn: {
    clipLeft: 'M 150 180 L 220 230 L 150 280 L 180 300 L 260 230 L 180 160 Z',
    clipRight: 'M 450 180 L 380 230 L 450 280 L 420 300 L 340 230 L 420 160 Z',
  },
  arrowsOut: {
    clipLeft: 'M 280 180 L 210 230 L 280 280 L 250 300 L 170 230 L 250 160 Z',
    clipRight: 'M 320 180 L 390 230 L 320 280 L 350 300 L 430 230 L 350 160 Z',
  },
  dots: {
    clipLeft: 'M 200 230 A 15 15 0 1 0 230 230 A 15 15 0 1 0 200 230',
    clipRight: 'M 370 230 A 15 15 0 1 0 400 230 A 15 15 0 1 0 370 230',
  },
  sad: {
    clipLeft: 'M 150 230 A 65 65 0 1 0 280 230 A 65 65 0 1 0 150 230 M 170 230 H 260 V 240 H 170 Z M 190 260 H 240 V 270 H 190 Z',
    clipRight: 'M 320 230 A 65 65 0 1 0 450 230 A 65 65 0 1 0 320 230 M 340 230 H 430 V 240 H 340 Z M 360 260 H 410 V 270 H 360 Z',
  },
  love: {
    clipLeft: 'M 215 190 C 215 160 165 160 165 200 C 165 240 215 270 215 270 C 215 270 265 240 265 200 C 265 160 215 160 215 190 Z',
    clipRight: 'M 385 190 C 385 160 335 160 335 200 C 335 240 385 270 385 270 C 385 270 435 240 435 200 C 435 160 385 160 385 190 Z',
  },
  confused: {
    clipLeft: 'M 205 210 A 10 10 0 1 0 225 210 A 10 10 0 1 0 205 210 M 185 240 A 10 10 0 1 0 205 240 A 10 10 0 1 0 185 240',
    clipRight: 'M 375 210 A 10 10 0 1 0 395 210 A 10 10 0 1 0 375 210 M 355 240 A 10 10 0 1 0 375 240 A 10 10 0 1 0 355 240',
  },
  smirk: {
    clipLeft: 'M 215 200 C 251 200 280 215 280 235 C 280 255 251 265 215 265 C 179 265 150 255 150 235 C 150 215 179 200 215 200 Z',
    clipRight: 'M 320 220 Q 385 200 450 210 V 240 Q 385 260 320 250 Z',
  },
  puzzled: {
    clipLeft: 'M 160 215 Q 215 170 270 215 Q 215 260 160 215 Z',
    clipRight: 'M 330 200 Q 390 140 450 200 Q 390 260 330 200 Z',
  },
  unimpressed: {
    clipLeft: 'M 150 225 H 280 V 245 H 150 Z',
    clipRight: 'M 320 225 H 450 V 245 H 320 Z',
  },
  skeptical: {
    clipLeft: 'M 150 220 Q 215 205 280 220 Q 215 240 150 220 Z',
    clipRight: 'M 320 180 Q 385 140 450 180 Q 385 300 320 180 Z',
  },
  determined: {
    clipLeft: 'M 150 210 Q 230 250 280 250 V 280 Q 215 285 150 270 Z',
    clipRight: 'M 320 250 Q 370 250 450 210 V 270 Q 385 285 320 280 Z',
  },
  dazzled: {
    clipLeft: 'M 215 160 L 250 230 L 215 300 L 180 230 Z',
    clipRight: 'M 385 160 L 420 230 L 385 300 L 350 230 Z',
  },
  disgusted: {
    clipLeft: 'M 150 230 Q 215 210 280 240 Q 215 270 150 230 Z',
    clipRight: 'M 320 240 Q 385 210 450 230 Q 385 270 320 240 Z',
  },
  panicked: {
    clipLeft: 'M 205 220 A 15 15 0 1 1 235 220 A 15 15 0 1 1 205 220',
    clipRight: 'M 375 220 A 15 15 0 1 1 405 220 A 15 15 0 1 1 375 220',
  },
  dreamy: {
    clipLeft: 'M 215 170 C 251 170 280 200 280 230 C 280 260 251 290 215 290 C 179 290 150 260 150 230 C 150 200 179 170 215 170 Z',
    clipRight: 'M 385 170 C 421 170 450 200 450 230 C 450 260 421 290 385 290 C 349 290 320 260 320 230 C 320 200 349 170 385 170 Z',
  },
  mischievous: {
    clipLeft: 'M 150 220 Q 215 180 280 220 V 240 Q 215 260 150 240 Z',
    clipRight: 'M 320 220 Q 385 150 450 230 L 420 250 Q 385 200 320 240 Z',
  },
  amazed: {
    clipLeft: 'M 215 150 A 80 80 0 1 1 215 310 A 80 80 0 1 1 215 150',
    clipRight: 'M 385 150 A 80 80 0 1 1 385 310 A 80 80 0 1 1 385 150',
  },
  electronic: {
    clipLeft: 'M 150 215 H 280 V 245 H 150 Z M 150 200 H 280 V 205 H 150 Z',
    clipRight: 'M 320 215 H 450 V 245 H 320 Z M 320 200 H 450 V 205 H 320 Z',
  },
  targeting: {
    clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z M 200 230 A 15 15 0 1 1 230 230 A 15 15 0 1 1 200 230',
    clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z M 370 230 A 15 15 0 1 1 400 230 A 15 15 0 1 1 370 230',
  },
  melancholy: {
    clipLeft: 'M 150 230 Q 215 210 280 235 L 280 250 Q 215 230 150 245 Z',
    clipRight: 'M 320 235 Q 385 210 450 230 L 450 245 Q 385 230 320 250 Z',
  },
  raging: {
    clipLeft: 'M 150 180 L 280 230 L 280 290 L 150 270 Z',
    clipRight: 'M 320 230 L 450 180 L 450 270 L 320 290 Z',
  },
  sassy: {
    clipLeft: 'M 150 230 Q 215 160 280 230 V 250 Q 215 190 150 250 Z',
    clipRight: 'M 320 230 Q 385 120 450 230 V 250 Q 385 150 320 250 Z',
  },
  shy: {
    clipLeft: 'M 180 230 A 35 35 0 1 0 250 230 A 35 35 0 1 0 180 230',
    clipRight: 'M 350 230 A 35 35 0 1 0 420 230 A 35 35 0 1 0 350 230',
  },
  playful: {
    clipLeft: 'M 150 240 Q 215 140 280 240 Q 215 320 150 240 Z',
    clipRight: 'M 320 240 Q 385 220 450 240 Q 385 170 320 240 Z',
  },
  analytical: {
    clipLeft: 'M 150 228 H 280 V 232 H 150 Z',
    clipRight: 'M 320 228 H 450 V 232 H 320 Z',
  },
  grumpy: {
    clipLeft: 'M 150 210 L 280 250 L 280 280 L 150 260 Z',
    clipRight: 'M 320 250 L 450 210 L 450 260 L 320 280 Z',
  },
  zen: {
    clipLeft: 'M 170 230 Q 215 250 260 230',
    clipRight: 'M 340 230 Q 390 250 440 230',
  },
};

// @ts-expect-error VISEMES used by lip-sync engine at runtime
const VISEMES = [
  { clipLeft: 'M 215 140 C 265 140 290 180 290 230 C 290 280 265 320 215 320 C 165 320 140 280 140 230 C 140 180 165 140 215 140 Z', clipRight: 'M 385 140 C 435 140 460 180 460 230 C 460 280 435 320 385 320 C 335 320 310 280 310 230 C 310 180 335 140 385 140 Z' },
  { clipLeft: 'M 215 160 C 251 160 280 194 280 230 C 280 266 251 300 215 300 C 179 300 150 266 150 230 C 150 194 179 160 215 160 Z', clipRight: 'M 385 160 C 421 160 450 194 450 230 C 450 266 421 300 385 300 C 349 300 320 266 320 230 C 320 194 349 160 385 160 Z' },
  { clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z', clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z' },
  { clipLeft: 'M 215 200 C 251 200 280 215 280 235 C 280 255 251 265 215 265 C 179 265 150 255 150 235 C 150 215 179 200 215 200 Z', clipRight: 'M 385 200 C 421 200 450 215 450 235 C 450 255 421 265 385 265 C 349 265 320 255 320 235 C 320 215 349 200 385 200 Z' },
  { clipLeft: 'M 215 165 C 251 165 280 194 280 230 C 280 266 251 295 215 295 C 179 295 150 266 150 230 C 150 194 179 165 215 165 Z', clipRight: 'M 385 165 C 421 165 450 194 450 230 C 450 266 421 295 385 295 C 349 295 320 266 320 230 C 320 194 349 165 385 165 Z' },
];

const AstroFaceComponent: React.FC<AstroFaceProps> = ({
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
  const maxIdleAnimationType = runtimeProfile?.maxAstroIdleAnimationType ?? 120;
  const microSaccadeIntervalMs = runtimeProfile?.microSaccadeIntervalMs ?? 150;
  const microSaccadeChance = runtimeProfile?.microSaccadeChance ?? 0.05;
  const eyeConvergedThrottleMs = runtimeProfile?.eyeConvergedThrottleMs ?? 250;
  const documentHidden = runtimeProfile?.documentHidden ?? false;
  const sharedVisionStream = getSharedVisionStream(mediaStream);

  const eyeColor = eyeColorProp ?? 'var(--robot-accent)';

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
  const antennaBallRef = useRef<SVGCircleElement>(null);
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
  const scanlinesRef = useRef<SVGPathElement>(null);
  
  // New Accessory Refs
  const thinkingRef = useRef<SVGGElement>(null);
  const analyticalRef = useRef<SVGGElement>(null);
  const rangingRef = useRef<SVGGElement>(null);
  const blushRef = useRef<SVGGElement>(null);

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

  // --- Animation Trigger Helper (data-driven via astroAnimationConfigs.ts) ---
  const triggerSpecialAnimation = useCallback((animType: number) => {
    const animCtx: AstroAnimationContext = {
      refs: {
        mainEyesRef, heartsRef, magnifyingGlassRef, sunglassesRef,
        scannerRef, monocleRef, mustacheRef, steamLeftRef, steamRightRef,
        matrixEyesRef, rainbowRef, butterflyRef, gumPopRef,
        confettiRef, haloRef, starsRef, clockRef, rainRef,
        sneezeRef, thinkingCloudRef, fireRef, propellerRef,
        musicNotesRef, goldChainRef, terminalRef,
        blushLeftRef, blushRightRef, sweatRef, tearsRef,
        thinkingRef, analyticalRef, rangingRef, blushRef,
      } as AstroAnimationRefs,
      setEmotion,
      triggerAction,
      targetEyeRef,
      currentModeRef,
      currentEmotionRef,
      trackInterval,
      trackTimeout,
    };
    runAstroAnimation(animType, animCtx);
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
        const type = Math.floor(Math.random() * 3);
        if (type === 0) {
          if (!isSeeingFace) {
            targetEyeRef.current = { x: -30, y: -10 };
            trackTimeout(() => { if (!faceDetectionActiveRef.current) targetEyeRef.current = { x: 30, y: 10 }; }, 500);
            trackTimeout(() => { if (!faceDetectionActiveRef.current) targetEyeRef.current = { x: 0, y: 0 }; }, 1000);
          }
        }
      }
    }, idleInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationsEnabled, idleAnimationChance, idleSleepTimeout, isLowPower, maxIdleAnimationType, onFaceDetected, setEmotion, trackTimeout, triggerAction, triggerSpecialAnimation]);

  const startListeningEngine = useCallback(() => {
    behaviorLoopRef.current = window.setInterval(() => {
      const animType = Math.random();
      if (animType < 0.20) {
        triggerAction('nod');
        setEmotion('listening');
      } else if (animType < 0.40) {
        triggerAction('nod');
        setEmotion('happy');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.60) {
        setEmotion('curious');
        triggerAction('bob');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.75) {
        setEmotion('excited');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.90) {
        setEmotion('curious');
        if (!faceDetectionActiveRef.current) {
          targetEyeRef.current = { x: 0, y: 15 };
          trackTimeout(() => { if (currentModeRef.current === 'listening') targetEyeRef.current = { x: 0, y: 0 }; }, 1200);
        }
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else {
        setEmotion('listening');
      }
    }, 2000);
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
    let ballColor = eyeColor;
    if (mode === 'speaking') ballColor = '#fb7185';
    if (mode === 'dancing') ballColor = '#818cf8';
    if (antennaBallRef.current) antennaBallRef.current.setAttribute('fill', ballColor);
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
    logTag: 'AstroFace',
    backoffThreshold: 5,
    backoffIntervalMs: 2000,
  });

  const renderEyeContent = useCallback((side: 'left' | 'right') => {
    return (
      <>
        <rect x={side === 'left' ? "130" : "290"} y="100" width="180" height="260" fill="url(#astro-dotPattern)" />
        <circle ref={side === 'left' ? eyeGlintLeftRef : eyeGlintRightRef} cx={side === 'left' ? "200" : "360"} cy="200" r="30" fill="url(#astro-eye-glint)" style={{ opacity: 0.8 }} />
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
          <linearGradient id="astro-headShellGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>

          <linearGradient id="astro-faceplateGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>

          <pattern id="astro-dotPattern" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill={eyeColorProp ? eyeColorProp : 'var(--robot-accent)'} />
          </pattern>

          {allowFaceHeavyEffects && (
            <>
              <filter id="astro-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <filter id="astro-spill" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="15" result="blur" />
                <feComponentTransfer in="blur">
                  <feFuncA type="linear" slope="0.45" />
                </feComponentTransfer>
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <filter id="astro-gloss-filter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComponentTransfer in="blur">
                  <feFuncA type="linear" slope="0.6" />
                </feComponentTransfer>
              </filter>

              <filter id="astro-glass-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="12" result="blur" />
                <feComponentTransfer in="blur">
                  <feFuncA type="linear" slope="0.3" />
                </feComponentTransfer>
              </filter>
            </>
          )}

          <radialGradient id="astro-eye-glint" cx="40%" cy="40%" r="40%" fx="30%" fy="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="astro-blush-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff0066" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff0066" stopOpacity="0" />
          </radialGradient>

          <pattern id="astro-scanline-pattern" x="0" y="0" width="100%" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="600" y2="0" stroke="#000000" strokeWidth="1" opacity="0.15" />
          </pattern>

          <clipPath id="astro-clip-left">
            <path ref={maskLeftRef} d={EMOTIONS.idle.clipLeft} />
          </clipPath>
          <clipPath id="astro-clip-right">
            <path ref={maskRightRef} d={EMOTIONS.idle.clipRight} />
          </clipPath>
        </defs>

        {/* Float + Breath are now JS-driven in applyEyeTransform via rAF loop */}
        <g style={{ transformOrigin: '300px 230px' }}>
          <g style={{ transformOrigin: '300px 230px' }}>
  



          <g ref={headTrackRef} style={isLowPower ? undefined : { willChange: 'transform' }}>
            <g ref={actionWrapperRef} style={{ transformOrigin: '300px 240px' }}>

              {/* Antenna (Centered, small arc, big ball) */}
              <g transform="translate(300, 40)">
                <path d="M 0 10 Q 40 -35 0 -80" fill="none" stroke="#f8fafc" strokeWidth="8" strokeLinecap="round" />
                <circle ref={antennaBallRef} cx="0" cy="-80" r="22" fill={eyeColorProp ? eyeColorProp : 'var(--robot-accent)'} />
                <circle cx="-5" cy="-85" r="8" fill="#ffffff" opacity="0.9" />
              </g>

              {/* White Head Shell */}
              <path
                d="M 125 65 C 250 45, 350 45, 475 65 C 555 85, 565 160, 565 240 C 565 320, 540 380, 470 400 C 350 425, 250 425, 130 400 C 60 380, 35 320, 35 240 C 35 160, 45 85, 125 65 Z"
                fill="url(#astro-headShellGrad)"
                stroke="#e2e8f0"
                strokeWidth="1"
              />



              {/* Dark Faceplate */}
              <path
                d="M 155 100 C 250 85, 350 85, 445 100 C 510 115, 525 180, 525 240 C 525 300, 510 360, 440 375 C 350 395, 250 395, 160 375 C 90 360, 75 300, 75 240 C 75 180, 90 115, 155 100 Z"
                fill="url(#astro-faceplateGrad)"
                stroke="#0f172a"
                strokeWidth="2"
              />

              {/* Scanline Polish */}
              <path
                d="M 155 100 C 250 85, 350 85, 445 100 C 510 115, 525 180, 525 240 C 525 300, 510 360, 440 375 C 350 395, 250 395, 160 375 C 90 360, 75 300, 75 240 C 75 180, 90 115, 155 100 Z"
                ref={scanlinesRef}
                fill="url(#astro-scanline-pattern)"
                style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity: 0.4 }}
              />

              {/* Facial Details Group (Blush, Sweat, Tears) */}
              <g id="facial-details" style={{ pointerEvents: 'none' }}>
                <circle ref={blushLeftRef} cx="180" cy="280" r="40" fill="url(#astro-blush-grad)" style={{ opacity: 0, transition: 'opacity 0.5s' }} />
                <circle ref={blushRightRef} cx="420" cy="280" r="40" fill="url(#astro-blush-grad)" style={{ opacity: 0, transition: 'opacity 0.5s' }} />
                <g ref={sweatRef} transform="translate(480, 150)" style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                  <path d="M 0 0 C -10 20, -10 30, 0 40 C 10 30, 10 20, 0 0" fill="#38bdf8" />
                </g>
                <g ref={tearsRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                  <path d="M 180 280 V 380" stroke="#38bdf8" strokeWidth="4" strokeDasharray="10 10" className="animate-pulse" />
                  <path d="M 420 280 V 380" stroke="#38bdf8" strokeWidth="4" strokeDasharray="10 10" className="animate-pulse" />
                </g>
              </g>

              {/* Glass Reflection Highlight */}
              <path
                d="M 180 115 Q 300 100 420 115"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.15"
              />

              {/* Eyes */}
              <g ref={mainEyesRef} className={`curio-eye-socket${isBlinking ? ' curio-is-blinking' : ''}`} style={{ transformOrigin: '300px 230px', transition: 'opacity 0.3s' }}>
                {activeCard ? (
                  <g ref={centerEyeTrackRef} filter="url(#astro-spill)" style={{ transformOrigin: '300px 230px' }}>
                    <AstroCardEyeContent activeCard={activeCard} centerGlintRef={centerGlintRef} centerTimerTextRef={centerTimerTextRef} />
                  </g>
                ) : (
                  <>
                    <g clipPath="url(#astro-clip-left)">
                      <g ref={eyeTrackLeftRef} filter="url(#astro-spill)" style={{ transformOrigin: '220px 230px' }}>
                        {renderEyeContent('left')}
                      </g>
                    </g>
                    <g clipPath="url(#astro-clip-right)">
                      <g ref={eyeTrackRightRef} filter="url(#astro-spill)" style={{ transformOrigin: '380px 230px' }}>
                        {renderEyeContent('right')}
                      </g>
                    </g>
                  </>
                )}
              </g>

              {/* --- ACCESSORIES --- */}

              {/* MAGNIFYING GLASS */}
              <g
                ref={magnifyingGlassRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  willChange: 'transform',
                  transformOrigin: '210px 230px'
                }}
              >
                <line x1="210" y1="230" x2="110" y2="380" stroke="#475569" strokeWidth="24" strokeLinecap="round" />
                <line x1="160" y1="305" x2="110" y2="380" stroke="#1e293b" strokeWidth="26" strokeLinecap="round" />
                <circle cx="210" cy="230" r="95" fill="none" stroke="#64748b" strokeWidth="16" />
                <circle cx="210" cy="230" r="95" fill="none" stroke="#94a3b8" strokeWidth="6" />
                <path d="M 135 180 Q 185 140 255 150" fill="none" stroke="#ffffff" strokeWidth="12" strokeLinecap="round" opacity="0.4" />
                <circle cx="210" cy="230" r="87" fill="#38bdf8" opacity="0.1" />
              </g>

              {/* SUNGLASSES */}
              <g
                ref={sunglassesRef}
                style={{
                  opacity: 0,
                  transform: 'translate(0px, -200px)',
                  transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-in',
                  willChange: 'transform, opacity'
                }}
              >
                <path d="M 80 210 L 150 230 L 250 230 L 280 210 L 320 210 L 350 230 L 450 230 L 520 210" fill="none" stroke="#0f172a" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 140 230 C 140 280, 260 280, 260 230 Z" fill="#020617" stroke="#1e293b" strokeWidth="6" />
                <path d="M 160 235 L 200 235" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
                <path d="M 340 230 C 340 280, 460 280, 460 230 Z" fill="#020617" stroke="#1e293b" strokeWidth="6" />
                <path d="M 360 235 L 400 235" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
              </g>

              {/* SCANNER BEAM */}
              <g
                ref={scannerRef}
                style={{
                  opacity: 0,
                  transform: 'translateY(-100px)',
                  willChange: 'transform, opacity'
                }}
              >
                <line x1="80" y1="230" x2="520" y2="230" stroke="#ef4444" strokeWidth="6" opacity="0.8" filter="url(#astro-glow)" />
                <rect x="80" y="210" width="440" height="40" opacity="0.2" fill="#ef4444" filter="url(#astro-glow)" />
              </g>

              {/* HEART EYES */}
              <g
                ref={heartsRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '300px 230px'
                }}
              >
                <path d="M 215 190 C 215 160 165 160 165 200 C 165 240 215 270 215 270 C 215 270 265 240 265 200 C 265 160 215 160 215 190 Z" fill="#ef4444" filter="url(#astro-glow)" />
                <path d="M 385 190 C 385 160 335 160 335 200 C 335 240 385 270 385 270 C 385 270 435 240 435 200 C 435 160 385 160 385 190 Z" fill="#ef4444" filter="url(#astro-glow)" />
              </g>

              {/* MUSTACHE */}
              <g
                ref={mustacheRef}
                style={{
                  opacity: 0,
                  transform: 'scale(0.1)',
                  transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-in',
                  transformOrigin: '300px 300px'
                }}
              >
                <path d="M 300 290 C 240 270, 200 300, 220 320 C 240 340, 280 300, 300 310 C 320 300, 360 340, 380 320 C 400 300, 360 270, 300 290 Z" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" />
              </g>

              {/* MONOCLE */}
              <g
                ref={monocleRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '385px 230px'
                }}
              >
                <circle cx="385" cy="230" r="75" fill="none" stroke="#fbbf24" strokeWidth="10" />
                <line x1="460" y1="230" x2="515" y2="310" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
              </g>

              {/* THINKING (Question Mark) */}
              <g
                ref={thinkingRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                  transformOrigin: '300px 100px'
                }}
              >
                <path d="M 280 120 Q 280 80, 320 80 Q 360 80, 360 120 Q 360 150, 320 160 V 180 M 320 210 V 220" fill="none" stroke="#60a5fa" strokeWidth="12" strokeLinecap="round" />
              </g>

              {/* ANALYTICAL (Data Grid) */}
              <g
                ref={analyticalRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out'
                }}
              >
                <rect x="100" y="150" width="400" height="160" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="10 10" opacity="0.3" />
                <line x1="100" y1="230" x2="500" y2="230" stroke="#34d399" strokeWidth="1" opacity="0.5" />
                <line x1="200" y1="150" x2="200" y2="310" stroke="#34d399" strokeWidth="1" opacity="0.5" />
                <line x1="300" y1="150" x2="300" y2="310" stroke="#34d399" strokeWidth="1" opacity="0.5" />
                <line x1="400" y1="150" x2="400" y2="310" stroke="#34d399" strokeWidth="1" opacity="0.5" />
              </g>

              {/* RAGING (Flame Overlay) */}
              <g
                ref={rangingRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out'
                }}
              >
                <path d="M 120 200 Q 150 100 180 200 M 240 200 Q 270 80 300 200 M 360 200 Q 390 100 420 200" fill="none" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" opacity="0.6" style={{ animation: 'astro-flame-flicker 0.4s infinite alternate' }} />
              </g>

              {/* BLUSH (Shy/Soft) */}
              <g
                ref={blushRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.5s ease-in-out'
                }}
              >
                <circle cx="160" cy="270" r="25" fill="#fda4af" opacity="0.4" filter={allowFaceHeavyEffects ? 'blur(8px)' : undefined} />
                <circle cx="440" cy="270" r="25" fill="#fda4af" opacity="0.4" filter={allowFaceHeavyEffects ? 'blur(8px)' : undefined} />
              </g>

              {/* STEAM */}
              <g ref={steamLeftRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
                <circle cx="80" cy="170" r="12" fill="#e2e8f0" style={{ animation: 'astro-zzz-float 2s ease-in-out infinite' }} />
                <circle cx="65" cy="145" r="16" fill="#e2e8f0" opacity="0.8" style={{ animation: 'astro-zzz-float 2.5s ease-in-out infinite 0.3s' }} />
                <circle cx="85" cy="120" r="10" fill="#e2e8f0" opacity="0.6" style={{ animation: 'astro-zzz-float 3s ease-in-out infinite 0.6s' }} />
              </g>
              <g ref={steamRightRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
                <circle cx="520" cy="170" r="12" fill="#e2e8f0" style={{ animation: 'astro-zzz-float 2s ease-in-out infinite 0.15s' }} />
                <circle cx="535" cy="145" r="16" fill="#e2e8f0" opacity="0.8" style={{ animation: 'astro-zzz-float 2.5s ease-in-out infinite 0.45s' }} />
                <circle cx="515" cy="120" r="10" fill="#e2e8f0" opacity="0.6" style={{ animation: 'astro-zzz-float 3s ease-in-out infinite 0.75s' }} />
              </g>

              {/* MATRIX RAIN EYES Overlay */}
              <g ref={matrixEyesRef} style={{ opacity: 0, transition: 'opacity 0.5s', pointerEvents: 'none' }}>
                <g clipPath="url(#astro-clip-left)">
                  <rect x="100" y="80" width="200" height="300" fill="#00ff00" opacity="0.1" />
                  {[...Array(5)].map((_, i) => (
                    <rect key={`ml-${i}`} x={130 + i * 35} y="80" width="4" height="300" fill="#00ff00" className="animate-pulse" style={{ animationDuration: `${1 + Math.random()}s` }} />
                  ))}
                </g>
                <g clipPath="url(#astro-clip-right)">
                  <rect x="280" y="80" width="250" height="300" fill="#00ff00" opacity="0.1" />
                  {[...Array(5)].map((_, i) => (
                    <rect key={`mr-${i}`} x={340 + i * 35} y="80" width="4" height="300" fill="#00ff00" className="animate-pulse" style={{ animationDuration: `${1 + Math.random()}s` }} />
                  ))}
                </g>
              </g>

              {/* RAINBOW OVERLAY */}
              <g ref={rainbowRef} style={{ opacity: 0, transition: 'opacity 0.8s', pointerEvents: 'none' }}>
                <rect x="90" y="80" width="420" height="300" rx="140" fill="url(#rainbow-grad)" opacity="0.3" />
                <defs>
                  <linearGradient id="rainbow-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="20%" stopColor="#f59e0b" />
                    <stop offset="40%" stopColor="#10b981" />
                    <stop offset="60%" stopColor="#3b82f6" />
                    <stop offset="80%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </g>

              {/* BUTTERFLY */}
              <g ref={butterflyRef} style={{ opacity: 0, transition: 'opacity 0.5s' }}>
                <path d="M -10 -10 Q 0 -20 10 -10 Q 20 0 10 10 Q 0 20 -10 10 Q -20 0 -10 -10" fill="#f472b6" />
                <path d="M -10 -10 Q -20 -20 -30 -10 Q -40 0 -30 10 Q -20 20 -10 10 Q 0 0 -10 -10" fill="#ec4899" />
                <circle r="4" fill="#1e293b" />
              </g>

              {/* GUM POP */}
              <g
                ref={gumPopRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.3s ease-in-out',
                }}
              >
                <circle cx="300" cy="340" r="10" fill="#f472bc" opacity="0.3" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
                <circle cx="300" cy="340" r="30" fill="#f472bc" opacity="0.7" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
                <circle cx="288" cy="328" r="6" fill="#ffffff" opacity="0.35" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
              </g>

              {/* CONFETTI */}
              <g ref={confettiRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                <rect x="120" y="100" width="8" height="8" rx="1" fill="#f87171" style={{ animation: 'astro-confetti-fall 1.8s ease-in infinite' }} />
                <rect x="180" y="85" width="6" height="10" rx="1" fill="#60a5fa" style={{ animation: 'astro-confetti-fall 2s ease-in infinite 0.15s' }} />
                <rect x="240" y="95" width="10" height="6" rx="1" fill="#34d399" style={{ animation: 'astro-confetti-fall 1.6s ease-in infinite 0.3s' }} />
                <rect x="310" y="90" width="7" height="9" rx="1" fill="#fbbf24" style={{ animation: 'astro-confetti-fall 2.2s ease-in infinite 0.45s' }} />
                <rect x="370" y="100" width="9" height="7" rx="1" fill="#a78bfa" style={{ animation: 'astro-confetti-fall 1.9s ease-in infinite 0.6s' }} />
                <rect x="430" y="85" width="6" height="8" rx="1" fill="#fb923c" style={{ animation: 'astro-confetti-fall 2.1s ease-in infinite 0.75s' }} />
                <rect x="480" y="95" width="8" height="6" rx="1" fill="#f472b6" style={{ animation: 'astro-confetti-fall 1.7s ease-in infinite 0.9s' }} />
                <rect x="150" y="90" width="5" height="10" rx="1" fill="#2dd4bf" style={{ animation: 'astro-confetti-fall 2.3s ease-in infinite 0.2s' }} />
              </g>

              {/* HALO */}
              <g
                ref={haloRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.5s ease-in-out',
                }}
              >
                <ellipse cx="300" cy="85" rx="90" ry="18" fill="none" stroke="#fde047" strokeWidth="7" filter="url(#astro-glow)" style={{ animation: 'astro-halo-bob 2s ease-in-out infinite' }} />
                <ellipse cx="300" cy="85" rx="90" ry="18" fill="none" stroke="#fef08a" strokeWidth="3" opacity="0.5" style={{ animation: 'astro-halo-bob 2s ease-in-out infinite' }} />
              </g>

              {/* STAR EYES Overlay */}
              <g ref={starsRef} style={{ opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
                <path d="M 215 200 L 225 220 L 250 220 L 230 235 L 240 260 L 215 245 L 190 260 L 200 235 L 180 220 L 205 220 Z" fill="#fde047" filter="url(#astro-glow)" />
                <path d="M 385 200 L 395 220 L 420 220 L 400 235 L 410 260 L 385 245 L 360 260 L 370 235 L 350 220 L 375 220 Z" fill="#fde047" filter="url(#astro-glow)" />
              </g>

              {/* CLOCK EYE Overlay */}
              <g ref={clockRef} style={{ opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
                <circle cx="215" cy="230" r="50" fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="8 4" opacity="0.6" style={{ transformOrigin: '215px 230px', animation: 'curio-propeller-spin 6s linear infinite' }} />
                <line x1="215" y1="230" x2="215" y2="195" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" style={{ transformOrigin: '215px 230px', animation: 'curio-propeller-spin 3s linear infinite' }} />
                <line x1="215" y1="230" x2="240" y2="230" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: '215px 230px', animation: 'curio-propeller-spin 1s linear infinite' }} />
                <circle cx="215" cy="230" r="3" fill="#ffffff" />
              </g>

              {/* RAIN */}
              <g ref={rainRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
                <line x1="150" y1="260" x2="148" y2="280" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'astro-confetti-fall 1.2s linear infinite' }} />
                <line x1="175" y1="270" x2="173" y2="290" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" style={{ animation: 'astro-confetti-fall 1.4s linear infinite 0.2s' }} />
                <line x1="200" y1="265" x2="198" y2="282" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" style={{ animation: 'astro-confetti-fall 1.1s linear infinite 0.4s' }} />
                <line x1="400" y1="260" x2="398" y2="280" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'astro-confetti-fall 1.3s linear infinite 0.1s' }} />
                <line x1="425" y1="270" x2="423" y2="288" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" style={{ animation: 'astro-confetti-fall 1.5s linear infinite 0.3s' }} />
                <line x1="450" y1="265" x2="448" y2="282" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" style={{ animation: 'astro-confetti-fall 1.0s linear infinite 0.5s' }} />
              </g>

              {/* SNEEZE PARTICLES */}
              <g ref={sneezeRef} style={{ opacity: 0, transition: 'opacity 0.2s' }}>
                <circle cx="300" cy="310" r="4" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.4s' }} />
                <circle cx="280" cy="320" r="3" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.5s' }} />
                <circle cx="320" cy="320" r="3" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.3s' }} />
              </g>

              {/* THINKING CLOUD */}
              <g
                ref={thinkingCloudRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.4s ease-in-out',
                }}
              >
                <circle cx="430" cy="110" r="8" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
                <circle cx="450" cy="95" r="12" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
                <ellipse cx="490" cy="85" rx="45" ry="30" fill="#fff" stroke="#cbd5e1" strokeWidth="3" />
                <text x="478" y="95" fontSize="30" fill="#64748b" fontWeight="bold">?</text>
              </g>

              {/* FIRE */}
              <g ref={fireRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                <path d="M 170 280 Q 215 150 260 280 Z" fill="#f87171" opacity="0.6" style={{ animation: 'curio-is-blinking 0.4s infinite alternate' }} />
                <path d="M 190 280 Q 215 180 240 280 Z" fill="#fbbf24" opacity="0.8" />
                <path d="M 340 280 Q 385 150 430 280 Z" fill="#f87171" opacity="0.6" style={{ animation: 'curio-is-blinking 0.4s infinite alternate' }} />
                <path d="M 360 280 Q 385 180 410 280 Z" fill="#fbbf24" opacity="0.8" />
              </g>

              {/* PROPELLER */}
              <g ref={propellerRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
                <rect x="290" y="30" width="20" height="20" fill="#475569" />
                <g style={{ transformOrigin: '300px 40px', animation: 'curio-propeller-spin 0.2s linear infinite' }}>
                  <path d="M 220 35 L 380 45 L 380 35 L 220 45 Z" fill="#94a3b8" />
                </g>
              </g>

              {/* MUSIC NOTES */}
              <g ref={musicNotesRef} style={{ opacity: 0, transition: 'opacity 0.5s' }}>
                <path d="M 480 150 L 480 100 L 510 90 L 510 140" fill="none" stroke="#a78bfa" strokeWidth="6" style={{ animation: 'astro-note-float 3s infinite' }} />
                <circle cx="470" cy="150" r="10" fill="#a78bfa" style={{ animation: 'astro-note-float 3s infinite' }} />
                <path d="M 120 120 L 120 70 L 150 60 L 150 110" fill="none" stroke="#60a5fa" strokeWidth="6" style={{ animation: 'astro-note-float 3.5s infinite 0.5s' }} />
                <circle cx="110" cy="120" r="10" fill="#60a5fa" style={{ animation: 'astro-note-float 3.5s infinite 0.5s' }} />
              </g>

              {/* GOLD CHAIN */}
              <g ref={goldChainRef} style={{ opacity: 0, transition: 'opacity 0.5s' }}>
                <path d="M 120 380 Q 300 480 480 380" fill="none" stroke="#fbbf24" strokeWidth="12" strokeLinecap="round" />
                <circle cx="300" cy="460" r="40" fill="#fbbf24" stroke="#d97706" strokeWidth="4" />
                <text x="300" y="475" fill="#d97706" fontSize="40" fontWeight="bold" textAnchor="middle">C</text>
              </g>


              {/* ZZZ FLOATS */}
              <g
                ref={zzzRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 1s ease-in-out'
                }}
              >
                <g style={{ animation: 'astro-zzz-float 3s ease-in-out infinite' }}>
                  <text x="420" y="230" fontSize="28" fill="#cbd5e1" fontWeight="bold" opacity="0.7">z</text>
                </g>
                <g style={{ animation: 'astro-zzz-float 3.5s ease-in-out infinite 0.6s' }}>
                  <text x="450" y="195" fontSize="36" fill="#94a3b8" fontWeight="bold" opacity="0.8">Z</text>
                </g>
                <g style={{ animation: 'astro-zzz-float 4s ease-in-out infinite 1.2s' }}>
                  <text x="480" y="150" fontSize="44" fill="#64748b" fontWeight="bold">Z</text>
                </g>
              </g>

              {/* ACTIVE CARD OVERLAYS - ALL VISUALS MOVED TO CENTERED EYE COMPONENT */}
              {activeCard && (activeCard.type === 'timer' || activeCard.type === 'stopwatch') && (activeCard.data as any)?.isRinging && (
                <style>{`
                  .astro-face-container {
                     animation: astro-shake 0.5s cubic-bezier(.36,.07,.19,.97) both infinite !important;
                  }
                  @keyframes astro-shake {
                    10%, 90% { transform: translate3d(-2px, 0, 0); }
                    20%, 80% { transform: translate3d(4px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-8px, 0, 0); }
                    40%, 60% { transform: translate3d(8px, 0, 0); }
                  }
                `}</style>
              )}

              {/* TERMINAL MODE OVERLAY */}
              <g
                ref={terminalRef}
                style={{
                  opacity: 0,
                  transition: 'opacity 0.4s ease-in-out',
                  pointerEvents: 'none'
                }}
              >
                <rect x="100" y="100" width="400" height="260" rx="10" fill="#000" opacity="0.8" />
                <rect x="100" y="100" width="400" height="260" rx="10" fill="none" stroke="#0f0" strokeWidth="2" opacity="0.4" />
                <text x="125" y="145" fill="#0f0" fontSize="16" fontFamily="monospace" style={{ textShadow: '0 0 5px #0f0' }}>&gt; INIT ASTRO_OS v5.1</text>
                <text x="125" y="175" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.8">&gt; LOADING KV_CORE... [OK]</text>
                <text x="125" y="200" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.7">&gt; ANALYZING USER... 100%</text>
                <text x="125" y="225" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.6">&gt; STATUS: ADORABLE</text>
                <text x="125" y="250" fill="#0f0" fontSize="14" fontFamily="monospace" opacity="0.4" className="animate-pulse">&gt; ERROR: CUTENESS_OVERLOAD</text>
                <text x="125" y="275" fill="#0f0" fontSize="12" fontFamily="monospace" opacity="0.3">&gt; REBOOTING EMOTION_ENGINE...</text>
              </g>

              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
};

export const AstroFace = React.memo(AstroFaceComponent);
AstroFace.displayName = 'AstroFace';
