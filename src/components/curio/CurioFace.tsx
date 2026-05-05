import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimePerformanceProfile } from '../../services/runtimePerformanceProfile';
import { getVolume } from '../../services/volumeStore';
import { type CurioState, type EngineMode, toEngineMode, getSharedVisionStream } from '../../services/emotionDetection';
import { useFaceTracking } from '../../hooks/useFaceTracking';
import type { FaceTrackingSample } from '../../services/faceTracking';
import { MAX_ANIM_TYPE, runAnimation, type AnimationContext, type AnimationRefs } from './animationConfigs';

interface CurioFaceProps {
  state: CurioState;
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

// --- Emotion shape dictionaries ---
interface EmotionShape {
  clipLeft: string;
  clipRight: string;
  browLeft: string;
  browRight: string;
  mouth: string;
  tongueY: number;
  cheekOpacity: number;
  /** Pupil radius override (default 65) -- larger = dilated */
  pupilRadius?: number;
  /** Nose vertical offset from default position (0 = no shift) */
  noseOffsetY?: number;
}

const EMOTIONS: Record<string, EmotionShape> = {
  idle: {
    clipLeft: 'M 140 200 Q 210 90 280 200 Q 210 310 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 120 Q 210 100 260 130',
    browRight: 'M 340 130 Q 390 100 440 120',
    mouth: 'M 260 280 Q 300 270 340 280 Q 300 330 260 280',
    tongueY: 310, cheekOpacity: 0,
  },
  listening: {
    clipLeft: 'M 140 200 Q 210 60 280 200 Q 210 340 140 200',
    clipRight: 'M 320 200 Q 390 60 460 200 Q 390 340 320 200',
    browLeft: 'M 160 90 Q 210 60 260 110',
    browRight: 'M 340 110 Q 390 60 440 90',
    mouth: 'M 270 280 Q 300 290 330 280 Q 300 310 270 280',
    tongueY: 330, cheekOpacity: 0.3, pupilRadius: 70,
  },
  happy: {
    clipLeft: 'M 140 200 Q 210 90 280 200 Q 210 170 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 170 320 200',
    browLeft: 'M 160 100 Q 210 70 260 110',
    browRight: 'M 340 110 Q 390 70 440 100',
    mouth: 'M 240 270 Q 300 260 360 270 Q 300 380 240 270',
    tongueY: 330, cheekOpacity: 0.8, noseOffsetY: 2,
  },
  excited: {
    clipLeft: 'M 140 200 Q 210 10 280 200 Q 210 150 140 200',
    clipRight: 'M 320 200 Q 390 10 460 200 Q 390 150 320 200',
    browLeft: 'M 160 50 Q 210 20 260 60',
    browRight: 'M 340 60 Q 390 20 440 50',
    mouth: 'M 230 250 Q 300 240 370 250 Q 300 420 230 250',
    tongueY: 350, cheekOpacity: 1, pupilRadius: 75, noseOffsetY: -3,
  },
  sleepy: {
    clipLeft: 'M 140 230 Q 210 220 280 230 Q 210 280 140 230',
    clipRight: 'M 320 230 Q 390 220 460 230 Q 390 280 320 230',
    browLeft: 'M 160 140 Q 210 150 260 140',
    browRight: 'M 340 140 Q 390 150 440 140',
    mouth: 'M 280 290 Q 300 290 320 290 Q 300 300 280 290',
    tongueY: 330, cheekOpacity: 0, pupilRadius: 55,
  },
  drowsy: {
    // Halfway between idle and sleepy — eyelids drooping, brows relaxing
    clipLeft: 'M 140 215 Q 210 155 280 215 Q 210 295 140 215',
    clipRight: 'M 320 215 Q 390 155 460 215 Q 390 295 320 215',
    browLeft: 'M 160 130 Q 210 125 260 135',
    browRight: 'M 340 135 Q 390 125 440 130',
    mouth: 'M 270 285 Q 300 280 330 285 Q 300 310 270 285',
    tongueY: 320, cheekOpacity: 0, pupilRadius: 58,
  },
  thinking: {
    // Eyes looking up-right, slight head tilt feel, contemplative mouth
    clipLeft: 'M 140 200 Q 210 100 280 200 Q 210 300 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 105 Q 210 85 260 115',
    browRight: 'M 340 100 Q 390 70 440 95',
    mouth: 'M 270 285 Q 300 280 330 285 Q 300 300 270 285',
    tongueY: 310, cheekOpacity: 0.1, pupilRadius: 65,
  },
  wink: {
    clipLeft: 'M 140 200 Q 210 220 280 200 Q 210 180 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 160 Q 210 140 260 170',
    browRight: 'M 340 110 Q 390 70 440 100',
    mouth: 'M 250 280 Q 300 270 350 280 Q 300 320 250 280',
    tongueY: 305, cheekOpacity: 0.4,
  },
  curious: {
    clipLeft: 'M 140 200 Q 210 130 280 200 Q 210 270 140 200',
    clipRight: 'M 320 200 Q 390 130 460 200 Q 390 270 320 200',
    browLeft: 'M 160 110 Q 210 80 260 120',
    browRight: 'M 340 100 Q 390 60 440 90',
    mouth: 'M 260 280 Q 300 270 340 280 Q 300 310 260 280',
    tongueY: 330, cheekOpacity: 0.2, pupilRadius: 70,
  },
  surprised: {
    clipLeft: 'M 140 200 Q 210 90 280 200 Q 210 310 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 60 Q 210 30 260 80',
    browRight: 'M 340 80 Q 390 30 440 60',
    mouth: 'M 280 290 Q 300 280 320 290 Q 300 320 280 290',
    tongueY: 340, cheekOpacity: 0, pupilRadius: 75, noseOffsetY: -2,
  },
  confused: {
    clipLeft: 'M 140 200 Q 210 120 280 200 Q 210 280 140 200',
    clipRight: 'M 320 200 Q 390 80 460 200 Q 390 320 320 200',
    browLeft: 'M 160 140 Q 210 130 260 110',   // one brow lower
    browRight: 'M 340 90 Q 390 60 440 100',    // other brow raised
    mouth: 'M 260 285 Q 280 275 310 290 Q 330 300 340 285', // wavy/crooked
    tongueY: 320, cheekOpacity: 0, pupilRadius: 60,
  },
  sad: {
    clipLeft: 'M 140 200 Q 210 130 280 200 Q 210 270 140 200',
    clipRight: 'M 320 200 Q 390 130 460 200 Q 390 270 320 200',
    browLeft: 'M 160 100 Q 210 120 260 110',   // inner brow raised (sad arch)
    browRight: 'M 340 110 Q 390 120 440 100',
    mouth: 'M 260 300 Q 300 320 340 300 Q 300 290 260 300', // frown
    tongueY: 330, cheekOpacity: 0, pupilRadius: 55, noseOffsetY: 3,
  },
  love: {
    clipLeft: 'M 140 200 Q 210 60 280 200 Q 210 340 140 200',
    clipRight: 'M 320 200 Q 390 60 460 200 Q 390 340 320 200',
    browLeft: 'M 160 90 Q 210 60 260 100',
    browRight: 'M 340 100 Q 390 60 440 90',
    mouth: 'M 240 270 Q 300 260 360 270 Q 300 370 240 270',
    tongueY: 330, cheekOpacity: 1, pupilRadius: 80, noseOffsetY: 1,
  },
  smirk: {
    clipLeft: 'M 140 200 Q 210 120 280 200 Q 210 280 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 130 Q 210 120 260 135',
    browRight: 'M 340 110 Q 390 80 440 105',   // one brow cocked
    mouth: 'M 260 285 Q 290 280 320 280 Q 350 270 360 265', // lopsided grin
    tongueY: 310, cheekOpacity: 0.3,
  },
  puzzled: {
    clipLeft: 'M 150 200 Q 210 140 270 200 Q 210 260 150 200',
    clipRight: 'M 330 200 Q 390 90 450 200 Q 390 310 330 200',
    browLeft: 'M 170 120 L 250 140',
    browRight: 'M 350 100 Q 400 60 450 90',
    mouth: 'M 270 295 Q 300 280 330 295',
    tongueY: 310, cheekOpacity: 0,
  },
  unimpressed: {
    clipLeft: 'M 140 220 H 280 V 240 H 140 Z',
    clipRight: 'M 320 220 H 460 V 240 H 320 Z',
    browLeft: 'M 160 180 H 260',
    browRight: 'M 340 180 H 440',
    mouth: 'M 270 300 H 330',
    tongueY: 310, cheekOpacity: 0,
  },
  skeptical: {
    clipLeft: 'M 140 210 Q 210 160 280 210 Q 210 260 140 210',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 150 Q 210 160 260 150',
    browRight: 'M 340 90 Q 390 60 440 100',
    mouth: 'M 260 290 Q 280 300 340 280',
    tongueY: 310, cheekOpacity: 0,
  },
  determined: {
    clipLeft: 'M 140 200 Q 210 150 280 200 Q 210 250 140 200',
    clipRight: 'M 320 200 Q 390 150 460 200 Q 390 250 320 200',
    browLeft: 'M 160 130 L 260 180',
    browRight: 'M 340 180 L 440 130',
    mouth: 'M 250 310 Q 300 290 350 310',
    tongueY: 310, cheekOpacity: 0,
  },
  dazzled: {
    clipLeft: 'M 210 160 L 240 200 L 210 240 L 180 200 Z',
    clipRight: 'M 390 160 L 420 200 L 390 240 L 360 200 Z',
    browLeft: 'M 160 100 Q 210 70 260 110',
    browRight: 'M 340 110 Q 390 70 440 100',
    mouth: 'M 240 270 Q 300 240 360 270 Q 300 370 240 270',
    tongueY: 350, cheekOpacity: 1, pupilRadius: 80,
  },
  disgusted: {
    clipLeft: 'M 140 210 Q 210 190 280 230 Q 210 270 140 210',
    clipRight: 'M 320 230 Q 390 190 460 210 Q 390 270 320 230',
    browLeft: 'M 160 160 L 260 190',
    browRight: 'M 340 190 L 440 160',
    mouth: 'M 260 310 Q 300 280 340 330',
    tongueY: 310, cheekOpacity: 0,
  },
  panicked: {
    clipLeft: 'M 190 200 A 20 20 0 1 1 230 200 A 20 20 0 1 1 190 200',
    clipRight: 'M 370 200 A 20 20 0 1 1 410 200 A 20 20 0 1 1 370 200',
    browLeft: 'M 160 80 Q 210 50 260 80',
    browRight: 'M 340 80 Q 390 50 440 80',
    mouth: 'M 270 290 A 30 30 0 1 1 330 290 A 30 30 0 1 1 270 290',
    tongueY: 310, cheekOpacity: 0, pupilRadius: 40,
  },
  dreamy: {
    clipLeft: 'M 140 200 Q 210 100 280 200 Q 210 300 140 200',
    clipRight: 'M 320 200 Q 390 100 460 200 Q 390 300 320 200',
    browLeft: 'M 160 110 Q 210 80 260 110',
    browRight: 'M 340 110 Q 390 80 440 110',
    mouth: 'M 260 280 Q 300 260 340 280 Q 300 330 260 280',
    tongueY: 310, cheekOpacity: 0.5, pupilRadius: 75,
  },
  mischievous: {
    clipLeft: 'M 140 200 Q 210 120 280 200 Q 210 280 140 200',
    clipRight: 'M 320 200 Q 390 120 460 200 Q 390 280 320 200',
    browLeft: 'M 160 140 L 260 110',
    browRight: 'M 340 110 L 440 140',
    mouth: 'M 240 270 Q 340 260 360 290 Q 300 350 240 270',
    tongueY: 320, cheekOpacity: 0.6,
  },
  amazed: {
    clipLeft: 'M 140 200 A 70 70 0 1 1 280 200 A 70 70 0 1 1 140 200',
    clipRight: 'M 320 200 A 70 70 0 1 1 460 200 A 70 70 0 1 1 320 200',
    browLeft: 'M 160 60 Q 210 30 260 60',
    browRight: 'M 340 60 Q 390 30 440 60',
    mouth: 'M 250 280 A 50 50 0 1 1 350 280 A 50 50 0 1 1 250 280',
    tongueY: 360, cheekOpacity: 0.4, pupilRadius: 85,
  },
  electronic: {
    clipLeft: 'M 140 215 H 280 V 245 H 140 Z',
    clipRight: 'M 320 215 H 460 V 245 H 320 Z',
    browLeft: 'M 150 160 H 270',
    browRight: 'M 330 160 H 450',
    mouth: 'M 260 300 H 340 V 310 H 260 Z',
    tongueY: 310, cheekOpacity: 0,
  },
  targeting: {
    clipLeft: 'M 140 200 Q 210 130 280 200 Q 210 270 140 200 M 170 200 A 40 40 0 1 1 250 200 A 40 40 0 1 1 170 200',
    clipRight: 'M 320 200 Q 390 130 460 200 Q 390 270 320 200 M 350 200 A 40 40 0 1 1 430 200 A 40 40 0 1 1 350 200',
    browLeft: 'M 160 100 H 260',
    browRight: 'M 340 100 H 440',
    mouth: 'M 260 280 H 340',
    tongueY: 310, cheekOpacity: 0, pupilRadius: 60,
  },
  melancholy: {
    clipLeft: 'M 140 200 Q 210 130 280 200 Q 210 270 140 200',
    clipRight: 'M 320 200 Q 390 130 460 200 Q 390 270 320 200',
    browLeft: 'M 160 120 Q 210 140 260 120',
    browRight: 'M 340 120 Q 390 140 440 120',
    mouth: 'M 260 310 Q 300 300 340 310',
    tongueY: 330, cheekOpacity: 0, pupilRadius: 50,
  },
  raging: {
    clipLeft: 'M 140 200 L 280 180 L 280 250 L 140 270 Z',
    clipRight: 'M 320 180 L 460 200 L 460 270 L 320 250 Z',
    browLeft: 'M 140 120 L 280 190',
    browRight: 'M 320 190 L 460 120',
    mouth: 'M 220 320 L 300 260 L 380 320 Z',
    tongueY: 310, cheekOpacity: 1, pupilRadius: 90,
  },
  sassy: {
    clipLeft: 'M 140 200 Q 210 120 280 200 Q 210 280 140 200',
    clipRight: 'M 320 200 Q 390 90 460 200 Q 390 310 320 200',
    browLeft: 'M 160 100 Q 210 50 260 120',
    browRight: 'M 340 120 Q 390 50 440 100',
    mouth: 'M 260 275 Q 330 260 350 285',
    tongueY: 310, cheekOpacity: 0.7,
  },
  shy: {
    clipLeft: 'M 170 200 Q 210 160 250 200 Q 210 240 170 200',
    clipRight: 'M 350 200 Q 390 160 430 200 Q 390 240 350 200',
    browLeft: 'M 190 140 Q 210 130 230 145',
    browRight: 'M 370 145 Q 390 130 410 140',
    mouth: 'M 280 300 Q 300 290 320 300',
    tongueY: 310, cheekOpacity: 1, pupilRadius: 50,
  },
  playful: {
    clipLeft: 'M 140 200 Q 210 80 280 200 Q 210 320 140 200',
    clipRight: 'M 320 200 Q 390 220 460 200 Q 390 180 320 200',
    browLeft: 'M 160 100 Q 210 60 260 110',
    browRight: 'M 340 160 Q 390 140 440 170',
    mouth: 'M 240 270 Q 300 260 360 270 Q 300 400 240 270 M 270 330 Q 300 380 330 330', // mouth + tongue
    tongueY: 360, cheekOpacity: 0.8,
  },
  analytical: {
    clipLeft: 'M 140 225 H 280 V 235 H 140 Z',
    clipRight: 'M 320 225 H 460 V 235 H 320 Z',
    browLeft: 'M 160 160 H 260',
    browRight: 'M 340 160 H 440',
    mouth: 'M 260 300 H 340',
    tongueY: 310, cheekOpacity: 0,
  },
  grumpy: {
    clipLeft: 'M 140 220 Q 210 170 280 220 Q 210 270 140 220',
    clipRight: 'M 320 220 Q 390 170 460 220 Q 390 270 320 220',
    browLeft: 'M 140 140 L 280 200',
    browRight: 'M 320 200 L 460 140',
    mouth: 'M 260 310 Q 300 290 340 310',
    tongueY: 310, cheekOpacity: 0,
  },
  zen: {
    clipLeft: 'M 160 230 Q 210 250 260 230',
    clipRight: 'M 340 230 Q 390 250 440 230',
    browLeft: 'M 180 150 Q 210 140 240 150',
    browRight: 'M 360 150 Q 390 140 420 150',
    mouth: 'M 280 300 Q 300 305 320 300',
    tongueY: 310, cheekOpacity: 0, pupilRadius: 0,
  },
};

const VISEMES = [
  { mouth: 'M 250 280 Q 300 230 350 280 Q 300 370 250 280', tongueY: 340 },
  { mouth: 'M 275 285 Q 300 250 325 285 Q 300 325 275 285', tongueY: 300 },
  { mouth: 'M 230 280 Q 300 265 370 280 Q 300 305 230 280', tongueY: 310 },
  { mouth: 'M 250 285 Q 300 280 350 285 Q 300 290 250 285', tongueY: 315 },
  { mouth: 'M 260 280 Q 300 260 340 280 Q 300 310 260 280', tongueY: 295 },
];

const CurioFaceComponent: React.FC<CurioFaceProps> = ({
  state,
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
  const engineMode = toEngineMode(state);
  const allowAmbientAnimation = runtimeProfile?.allowAmbientAnimation ?? true;
  const allowFaceHeavyEffects = runtimeProfile?.allowFaceHeavyEffects ?? !isLowPower;
  const allowFaceTrackingBackgroundWork =
    runtimeProfile?.allowFaceTrackingBackgroundWork ?? !isLowPower;
  const faceTrackingPollIntervalMs = runtimeProfile?.faceTrackingPollIntervalMs ?? (isLowPower ? 180 : 80);
  const idleAnimationChance = runtimeProfile?.idleAnimationChance ?? 0.25;
  const maxIdleAnimationType = runtimeProfile?.maxCurioIdleAnimationType ?? MAX_ANIM_TYPE;
  const eyeConvergedThrottleMs = runtimeProfile?.eyeConvergedThrottleMs ?? 250;
  const documentHidden = runtimeProfile?.documentHidden ?? false;
  const sharedVisionStream = getSharedVisionStream(mediaStream);

  // --- SVG element refs ---
  const maskLeftRef = useRef<SVGPathElement>(null);
  const maskRightRef = useRef<SVGPathElement>(null);
  const browLeftRef = useRef<SVGPathElement>(null);
  const browRightRef = useRef<SVGPathElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const tongueRef = useRef<SVGEllipseElement>(null);
  const cheekLeftRef = useRef<SVGEllipseElement>(null);
  const cheekRightRef = useRef<SVGEllipseElement>(null);
  const eyeTrackLeftRef = useRef<SVGGElement>(null);
  const eyeTrackRightRef = useRef<SVGGElement>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const earLeftRef = useRef<SVGRectElement>(null);
  const earRightRef = useRef<SVGRectElement>(null);
  const actionWrapperRef = useRef<SVGGElement>(null);
  const headTrackRef = useRef<SVGGElement>(null);
  const noseRef = useRef<SVGGElement>(null);
  const antennaGlowRef = useRef<SVGCircleElement>(null);
  const pupilLeftRef = useRef<SVGCircleElement>(null);
  const pupilRightRef = useRef<SVGCircleElement>(null);
  const magnifyingGlassRef = useRef<SVGGElement>(null);
  const sunglassesRef = useRef<SVGGElement>(null);
  const zzzRef = useRef<SVGGElement>(null);
  const scannerRef = useRef<SVGGElement>(null);
  const heartsRef = useRef<SVGGElement>(null);
  const mustacheRef = useRef<SVGGElement>(null);
  const monocleRef = useRef<SVGGElement>(null);
  const steamLeftRef = useRef<SVGGElement>(null);
  const steamRightRef = useRef<SVGGElement>(null);
  const matrixEyesRef = useRef<SVGGElement>(null);
  const rainbowRef = useRef<SVGGElement>(null);
  const butterflyRef = useRef<SVGGElement>(null);
  const gumPopRef = useRef<SVGGElement>(null);
  const confettiRef = useRef<SVGGElement>(null);
  const haloRef = useRef<SVGGElement>(null);
  const rainRef = useRef<SVGGElement>(null);
  const starsRef = useRef<SVGGElement>(null);
  const clockRef = useRef<SVGGElement>(null);
  const sneezeRef = useRef<SVGGElement>(null);
  const thinkingCloudRef = useRef<SVGGElement>(null);
  const fireRef = useRef<SVGGElement>(null);
  const propellerRef = useRef<SVGGElement>(null);
  const musicNotesRef = useRef<SVGGElement>(null);
  const goldChainRef = useRef<SVGGElement>(null);

  // New Accessory Refs for Parity
  const thinkingRef = useRef<SVGGElement>(null);
  const analyticalRef = useRef<SVGGElement>(null);
  const rangingRef = useRef<SVGGElement>(null);
  const blushRef = useRef<SVGGElement>(null);

  // --- Emotion-reactive overlay refs ---
  const emotionConfusedRef = useRef<SVGGElement>(null);
  const emotionSadRef = useRef<SVGGElement>(null);
  const emotionLoveRef = useRef<SVGGElement>(null);
  const emotionSmirkRef = useRef<SVGGElement>(null);
  const emotionExcitedRef = useRef<SVGGElement>(null);

  // --- State tracking ---
  const [isBlinking, setIsBlinking] = useState(false);
  const currentEmotionRef = useRef('idle');
  const lastInputTimeRef = useRef(Date.now());
  const hadFaceRef = useRef(false);
  const trackedFacePresentRef = useRef(false);
  const faceDetectionActiveRef = useRef(false);
  const isActionRunningRef = useRef(false);
  const behaviorLoopRef = useRef<number>(0);
  const lipSyncLoopRef = useRef<number>(0);
  const currentModeRef = useRef<EngineMode>('idle');
  const emotionHintRef = useRef<string | null>(null);

  // --- Eye tracking state ---
  const targetEyeRef = useRef({ x: 0, y: 0 });
  const currentEyeRef = useRef({ x: 0, y: 0 });
  const eyeRafRef = useRef<number>(0);
  const eyeIntervalRef = useRef<number>(0);

  // --- Centralized timer tracking (Defects 1, 3) ---
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
    // lipSyncLoop is now RAF-based, not setInterval
    cancelAnimationFrame(lipSyncLoopRef.current);
    lipSyncLoopRef.current = 0;
    cancelAnimationFrame(eyeRafRef.current);
    eyeRafRef.current = 0;
    window.clearInterval(eyeIntervalRef.current);
    eyeIntervalRef.current = 0;
    activeSubTimersRef.current.forEach((id) => {
      window.clearInterval(id);
      window.clearTimeout(id);
    });
    activeSubTimersRef.current.clear();
  }, []);

  // --- Centralized detail toggler ---
  const toggleDetail = useCallback((ref: React.RefObject<SVGElement | null>, duration: number) => {
    if (ref.current) {
      ref.current.style.opacity = '1';
      trackTimeout(() => {
        if (ref.current) ref.current.style.opacity = '0';
      }, duration);
    }
  }, [trackTimeout]);

  // Face-tracking refs
  const consecutiveMissesRef = useRef(0);

  // --- Helper: apply emotion shape to SVG elements ---
  const setEmotion = useCallback((emotionKey: string) => {
    const shape = EMOTIONS[emotionKey];
    if (!shape) return;
    currentEmotionRef.current = emotionKey;

    maskLeftRef.current?.setAttribute('d', shape.clipLeft);
    maskRightRef.current?.setAttribute('d', shape.clipRight);
    browLeftRef.current?.setAttribute('d', shape.browLeft);
    browRightRef.current?.setAttribute('d', shape.browRight);

    // Don't override mouth during speaking (lip-sync controls it)
    if (currentModeRef.current !== 'speaking' && !isActionRunningRef.current) {
      mouthRef.current?.setAttribute('d', shape.mouth);
      tongueRef.current?.setAttribute('cy', String(shape.tongueY));
    }

    // Pupil dilation
    const pr = String(shape.pupilRadius ?? 65);
    pupilLeftRef.current?.setAttribute('r', pr);
    pupilRightRef.current?.setAttribute('r', pr);

    // Nose shift
    const ny = shape.noseOffsetY ?? 0;
    if (noseRef.current) {
      noseRef.current.style.transform = `translateY(${ny}px)`;
      noseRef.current.setAttribute('transform', `translate(0, ${ny})`);
    }

    // --- Emotion-reactive overlays (CSS-only, no JS timers) ---
    // Use subtle opacity during speaking to avoid visual overload
    const isSpeaking = currentModeRef.current === 'speaking';
    const overlayOn = isSpeaking ? '0.3' : '0.8';
    if (emotionConfusedRef.current) emotionConfusedRef.current.style.opacity = emotionKey === 'confused' ? overlayOn : '0';
    if (emotionSadRef.current) emotionSadRef.current.style.opacity = emotionKey === 'sad' ? overlayOn : '0';
    if (emotionLoveRef.current) emotionLoveRef.current.style.opacity = emotionKey === 'love' ? overlayOn : '0';
    if (emotionSmirkRef.current) emotionSmirkRef.current.style.opacity = emotionKey === 'smirk' ? overlayOn : '0';
    if (emotionExcitedRef.current) emotionExcitedRef.current.style.opacity = emotionKey === 'excited' ? overlayOn : '0';

    // Cheeks: cap blush during speaking so it doesn't compete with other visuals
    const cheekOp = isSpeaking ? Math.min(shape.cheekOpacity, 0.25) : shape.cheekOpacity;
    cheekLeftRef.current?.setAttribute('opacity', String(cheekOp));
    cheekRightRef.current?.setAttribute('opacity', String(cheekOp));

    if (zzzRef.current) {
      zzzRef.current.style.opacity = emotionKey === 'sleepy' ? '1' : '0';
    }
  }, []);

  // Sync emotionHint prop → ref, and immediately apply when speaking
  useEffect(() => {
    emotionHintRef.current = emotionHint || null;
    if (emotionHint && EMOTIONS[emotionHint] && currentModeRef.current === 'speaking') {
      setEmotion(emotionHint);
    }
  }, [emotionHint, setEmotion]);

  // --- Helper: physical behaviour (nod/bob) ---
  const triggerAction = useCallback((action: 'nod' | 'bob', duration: number = 1200) => {
    if (isActionRunningRef.current || !actionWrapperRef.current) return;
    isActionRunningRef.current = true;
    const wrapper = actionWrapperRef.current;

    const className = action === 'nod' ? 'curio-anim-nod' : 'curio-anim-bob';
    wrapper.classList.add(className);
    trackTimeout(() => {
      wrapper.classList.remove(className);
      isActionRunningRef.current = false;
    }, duration);
  }, [trackTimeout]);


  // --- Animation Trigger Helper (data-driven via animationConfigs.ts) ---
  const triggerSpecialAnimation = useCallback((animType: number) => {
    const animCtx: AnimationContext = {
      refs: {
        heartsRef, magnifyingGlassRef, sunglassesRef, scannerRef,
        monocleRef, mustacheRef, steamLeftRef, steamRightRef,
        matrixEyesRef, rainbowRef, butterflyRef, gumPopRef,
        confettiRef, haloRef, starsRef, clockRef, rainRef,
        sneezeRef, thinkingCloudRef, fireRef, propellerRef,
        musicNotesRef, goldChainRef, antennaGlowRef,
        thinkingRef, analyticalRef, rangingRef, blushRef,
      } as AnimationRefs,
      setEmotion,
      triggerAction,
      targetEyeRef,
      currentModeRef,
      currentEmotionRef,
      faceDetectionActiveRef,
      trackInterval,
      trackTimeout,
      activeSubTimersRef,
      toggleDetail,
    };
    runAnimation(animType, animCtx);
  }, [setEmotion, toggleDetail, trackInterval, trackTimeout, triggerAction]);

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

  // --- Register interaction (prevents sleep) ---
  const registerInteraction = useCallback(() => {
    lastInputTimeRef.current = Date.now();
    if (currentModeRef.current === 'idle' && (currentEmotionRef.current === 'sleepy' || currentEmotionRef.current === 'drowsy')) {
      setEmotion('idle');
    }
  }, [setEmotion]);

  const applyEyeTransform = useCallback(() => {
    const { x, y } = currentEyeRef.current;
    // CSS style.transform requires units (px); SVG transform attribute requires unitless values
    const cssTx = `translate(${x}px, ${y}px)`;
    const svgTx = `translate(${x}, ${y})`;
    if (eyeTrackLeftRef.current) {
      eyeTrackLeftRef.current.style.transform = cssTx;
      eyeTrackLeftRef.current.setAttribute('transform', svgTx);
    }
    if (eyeTrackRightRef.current) {
      eyeTrackRightRef.current.style.transform = cssTx;
      eyeTrackRightRef.current.setAttribute('transform', svgTx);
    }

    if (headTrackRef.current) {
      const headX = x * 0.60;
      const headY = y * 0.60;
      const headCssTx = `translate(${headX}px, ${headY}px)`;
      const headSvgTx = `translate(${headX}, ${headY})`;
      headTrackRef.current.style.transform = headCssTx;
      headTrackRef.current.setAttribute('transform', headSvgTx);
    }

    if (magnifyingGlassRef.current) {
      const magX = x * 1.8;
      const magY = y * 1.8;
      const magCssTx = `translate(${magX}px, ${magY}px)`;
      const magSvgTx = `translate(${magX}, ${magY})`;
      magnifyingGlassRef.current.style.transform = magCssTx;
      magnifyingGlassRef.current.setAttribute('transform', magSvgTx);
    }
  }, []);

  // ==========================================
  // ENGINE: IDLE
  // ==========================================
  const startIdleEngine = useCallback(() => {
    const idleInterval = isLowPower ? 10_000 : 7_000;
    
    behaviorLoopRef.current = window.setInterval(() => {
      const timeSinceInput = Date.now() - lastInputTimeRef.current;
      const isSeeingFace = trackedFacePresentRef.current;

      if (isSeeingFace && !hadFaceRef.current) {
        setEmotion('excited');
        triggerAction('nod');
        if (onFaceDetected) onFaceDetected(true);
        trackTimeout(() => {
          if (currentModeRef.current === 'idle' && currentEmotionRef.current !== 'sleepy') setEmotion('idle');
        }, 1500);
      }
      hadFaceRef.current = isSeeingFace;

      const sleepThreshold = (idleSleepTimeout || 120) * 1000;
      if (timeSinceInput > sleepThreshold && !isSeeingFace) {
        // Gradual sleep: step through drowsy -> sleepy over ~2 seconds
        if (currentEmotionRef.current !== 'sleepy' && currentEmotionRef.current !== 'drowsy') {
          setEmotion('drowsy');
          triggerAction('nod', 1500);
          trackTimeout(() => {
            if (currentModeRef.current === 'idle' && currentEmotionRef.current === 'drowsy') {
              setEmotion('sleepy');
            }
          }, 2000);
        }
        return;
      }

      // Low power: skip most special animations to reduce GPU work
      if (isLowPower) {
        const type = Math.floor(Math.random() * 3);
        if (type === 0 && !isSeeingFace) {
          targetEyeRef.current = { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 10 };
          trackTimeout(() => { if (!faceDetectionActiveRef.current) targetEyeRef.current = { x: 0, y: 0 }; }, 1000);
        }
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
    }, idleInterval); // Low power: 10s, normal: 7s
  }, [animationsEnabled, idleAnimationChance, isLowPower, maxIdleAnimationType, onFaceDetected, setEmotion, trackTimeout, triggerAction, triggerSpecialAnimation]);

  // ==========================================
  // ENGINE: LISTENING — more responsive with ear-perking
  // ==========================================
  const startListeningEngine = useCallback(() => {
    behaviorLoopRef.current = window.setInterval(() => {
      const animType = Math.random();

      if (animType < 0.18) {
        triggerAction('nod');
        setEmotion('listening');
      } else if (animType < 0.35) {
        triggerAction('nod');
        setEmotion('happy');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.48) {
        setEmotion('curious');
        triggerAction('bob');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.58) {
        setEmotion('surprised');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1200);
      } else if (animType < 0.68) {
        // Squint — concentrating
        maskLeftRef.current?.setAttribute('d', 'M 140 200 Q 210 130 280 200 Q 210 270 140 200');
        maskRightRef.current?.setAttribute('d', 'M 320 200 Q 390 130 460 200 Q 390 270 320 200');
        mouthRef.current?.setAttribute('d', 'M 270 285 Q 300 275 330 285 Q 300 295 270 285');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.78) {
        // Perk up
        setEmotion('excited');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.88) {
        triggerAction('bob');
        mouthRef.current?.setAttribute('d', 'M 240 275 Q 300 265 360 275 Q 300 330 240 275');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.92) {
        // Confused — processing what was said
        setEmotion('confused');
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else if (animType < 0.95) {
        // Lean in — attentive look with slight eye shift
        setEmotion('curious');
        if (!faceDetectionActiveRef.current) {
          targetEyeRef.current = { x: 0, y: 8 };
          trackTimeout(() => { if (currentModeRef.current === 'listening') targetEyeRef.current = { x: 0, y: 0 }; }, 1200);
        }
        trackTimeout(() => { if (currentModeRef.current === 'listening') setEmotion('listening'); }, 1500);
      } else {
        setEmotion('listening');
      }
    }, 2000); // Faster listening responsiveness
  }, [setEmotion, trackTimeout, triggerAction]);

  // ==========================================
  // ENGINE: SPEAKING (Lip-sync + Emotions) — smoother transitions
  // ==========================================
  const startSpeakingEngine = useCallback(() => {
    let lastIdx = -1;
    let emotionCycle = 0;

    // Lip-sync via RAF with frame-rate throttling (~110ms between updates)
    // This avoids setInterval drift and batches with the browser's paint cycle.
    let lastLipSyncTime = 0;
    const LIP_SYNC_INTERVAL_MS = 110;
    const lipSyncFrame = (timestamp: number) => {
      if (timestamp - lastLipSyncTime >= LIP_SYNC_INTERVAL_MS) {
        lastLipSyncTime = timestamp;
        const vol = getVolume();

        let nextIdx: number;
        if (vol < 0.05) {
          nextIdx = 3; // Narrow / mostly closed when quiet
        } else if (vol > 0.4) {
          nextIdx = 0; // Large wide open when loud
        } else {
          // Medium openness for normal speech
          do { nextIdx = Math.floor(Math.random() * VISEMES.length); } while (nextIdx === lastIdx || nextIdx === 0 || nextIdx === 3);
        }

        lastIdx = nextIdx;
        // Batch both SVG attribute changes in a single frame
        mouthRef.current?.setAttribute('d', VISEMES[nextIdx].mouth);
        tongueRef.current?.setAttribute('cy', String(VISEMES[nextIdx].tongueY));
      }
      lipSyncLoopRef.current = requestAnimationFrame(lipSyncFrame);
    };
    lipSyncLoopRef.current = requestAnimationFrame(lipSyncFrame);

    behaviorLoopRef.current = window.setInterval(() => {
      emotionCycle++;
      // More varied emotion cycling with occasional physical actions
      if (emotionCycle % 4 === 0) {
        triggerAction(Math.random() < 0.5 ? 'nod' : 'bob');
      }

      // If we have an emotion hint from the AI transcript, use it ~70% of the time
      const hint = emotionHintRef.current;
      if (hint && EMOTIONS[hint] && Math.random() < 0.7) {
        setEmotion(hint);
        return;
      }

      // Fallback: random emotion variety
      const shift = Math.random();
      if (shift < 0.20) setEmotion('happy');
      else if (shift < 0.30) setEmotion('excited');
      else if (shift < 0.40) setEmotion('curious');
      else if (shift < 0.48) setEmotion('surprised');
      else if (shift < 0.55) setEmotion('wink');
      else if (shift < 0.60) setEmotion('love');
      else if (shift < 0.65) setEmotion('smirk');
      else if (shift < 0.70) setEmotion('confused');
      else setEmotion('idle');
    }, 2200);
  }, [setEmotion, triggerAction]);

  // ==========================================
  // ENGINE: DANCING — more dynamic with varied moves
  // ==========================================
  const startDancingEngine = useCallback(() => {
    let beatCount = 0;
    behaviorLoopRef.current = window.setInterval(() => {
      beatCount++;
      const move = beatCount % 6;
      
      if (move === 0) {
        triggerAction('bob', 400);
        setEmotion('happy');
      } else if (move === 1) {
        triggerAction('nod', 500);
        setEmotion('excited');
      } else if (move === 2) {
        triggerAction('bob', 350);
        setEmotion('wink');
        // Sway eyes to the beat
        if (!faceDetectionActiveRef.current) {
          targetEyeRef.current = { x: -15, y: 0 };
          trackTimeout(() => { if (currentModeRef.current === 'dancing') targetEyeRef.current = { x: 15, y: 0 }; }, 300);
          trackTimeout(() => { if (currentModeRef.current === 'dancing') targetEyeRef.current = { x: 0, y: 0 }; }, 600);
        }
      } else if (move === 3) {
        triggerAction('bob', 300);
        setEmotion('happy');
      } else if (move === 4) {
        triggerAction('nod', 400);
        setEmotion('excited');
        // Quick double bob
        trackTimeout(() => { if (currentModeRef.current === 'dancing') triggerAction('bob', 300); }, 350);
      } else {
        triggerAction('bob', 500);
        setEmotion('happy');
      }
    }, 550); // ~109bpm feel
  }, [setEmotion, trackTimeout, triggerAction]);

  // ==========================================
  // MODE SWITCHING (react to state prop)
  // ==========================================
  useEffect(() => {
    const mode = toEngineMode(state);
    currentModeRef.current = mode;
    lastInputTimeRef.current = Date.now();

    if (magnifyingGlassRef.current) magnifyingGlassRef.current.style.opacity = '0';
    if (sunglassesRef.current) sunglassesRef.current.style.opacity = '0';
    if (scannerRef.current) scannerRef.current.style.opacity = '0';
    if (heartsRef.current) heartsRef.current.style.opacity = '0';
    if (mustacheRef.current) mustacheRef.current.style.opacity = '0';
    if (monocleRef.current) monocleRef.current.style.opacity = '0';
    if (steamLeftRef.current) steamLeftRef.current.style.opacity = '0';
    if (steamRightRef.current) steamRightRef.current.style.opacity = '0';
    if (matrixEyesRef.current) matrixEyesRef.current.style.opacity = '0';
    if (butterflyRef.current) butterflyRef.current.style.opacity = '0';
    if (rainbowRef.current) rainbowRef.current.style.opacity = '0';
    if (gumPopRef.current) gumPopRef.current.style.opacity = '0';
    if (confettiRef.current) confettiRef.current.style.opacity = '0';
    if (haloRef.current) haloRef.current.style.opacity = '0';
    if (rainRef.current) rainRef.current.style.opacity = '0';
    if (starsRef.current) starsRef.current.style.opacity = '0';
    if (clockRef.current) clockRef.current.style.opacity = '0';
    if (thinkingCloudRef.current) thinkingCloudRef.current.style.opacity = '0';
    if (fireRef.current) fireRef.current.style.opacity = '0';
    if (propellerRef.current) propellerRef.current.style.opacity = '0';
    if (musicNotesRef.current) musicNotesRef.current.style.opacity = '0';
    if (goldChainRef.current) goldChainRef.current.style.opacity = '0';

    // Clear emotion-reactive overlays
    if (emotionConfusedRef.current) emotionConfusedRef.current.style.opacity = '0';
    if (emotionSadRef.current) emotionSadRef.current.style.opacity = '0';
    if (emotionLoveRef.current) emotionLoveRef.current.style.opacity = '0';
    if (emotionSmirkRef.current) emotionSmirkRef.current.style.opacity = '0';
    if (emotionExcitedRef.current) emotionExcitedRef.current.style.opacity = '0';

    // Cleanup old engines
    clearAllEngineTimers();

    // Set ear colors
    let earColor = 'var(--robot-accent)';
    if (mode === 'speaking') earColor = '#fb7185';
    if (mode === 'dancing') earColor = '#818cf8'; // indigo

    earLeftRef.current?.setAttribute('fill', earColor);
    earRightRef.current?.setAttribute('fill', earColor);

    // Mouth transition speed
    if (mouthRef.current) {
      mouthRef.current.style.transitionDuration = mode === 'speaking' ? '0.12s' : '';
    }
    if (tongueRef.current) {
      tongueRef.current.style.transitionDuration = mode === 'speaking' ? '0.12s' : '';
    }

    // Set CSS mode class on canvas for ear pump CSS animation
    if (canvasRef.current) {
      canvasRef.current.className.baseVal = `curio-svg-face mode-${mode}`;
    }

    // Start new engine
    if (mode === 'idle') {
      setEmotion('idle');
      if (allowAmbientAnimation && animationsEnabled) startIdleEngine();
    } else if (mode === 'listening') {
      // Use 'thinking' emotion when the AI is processing, 'listening' when user is speaking
      setEmotion(state === 'thinking' ? 'thinking' : 'listening');
      if (state === 'thinking') {
        // Subtle eye movement up-right to convey contemplation
        targetEyeRef.current = { x: 30, y: -25 };
      }
      if (allowAmbientAnimation && animationsEnabled) startListeningEngine();
    } else if (mode === 'speaking') {
      startSpeakingEngine();
    } else if (mode === 'dancing') {
      if (allowAmbientAnimation && animationsEnabled) startDancingEngine();
    }

    return () => {
      clearAllEngineTimers();
    };
  }, [allowAmbientAnimation, animationsEnabled, setEmotion, startIdleEngine, startListeningEngine, startSpeakingEngine, startDancingEngine, state, clearAllEngineTimers, isLowPower]);

  // ==========================================
  // BLINKING (independent of mode)
  // ==========================================
  useEffect(() => {
    if (!allowAmbientAnimation || !animationsEnabled) {
      setIsBlinking(false);
      return;
    }

    let cancelled = false;
    let blinkTimeoutId: ReturnType<typeof setTimeout>;
    let closeTimeoutId: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      // Low power: blink less frequently (4-8s vs 2.5-6s)
      const delay = isLowPower
        ? Math.random() * 4000 + 4000
        : Math.random() * 3500 + 2500;
      blinkTimeoutId = setTimeout(() => {
        if (cancelled) return;
        if (currentEmotionRef.current !== 'wink' && currentEmotionRef.current !== 'sleepy') {
          setIsBlinking(true);
          closeTimeoutId = setTimeout(() => {
            if (!cancelled) setIsBlinking(false);
          }, 150);
        }
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();

    return () => {
      cancelled = true;
      clearTimeout(blinkTimeoutId);
      clearTimeout(closeTimeoutId);
    };
  }, [allowAmbientAnimation, animationsEnabled, isLowPower]);

  // ==========================================
  // DYNAMIC SPEAKING GLOW
  // ==========================================
  // ==========================================
  // EYE TRACKING — smooth lerp loop
  // ==========================================
  useEffect(() => {
    const stepEyes = (lerpAmount: number) => {
      const cur = currentEyeRef.current;
      const tgt = targetEyeRef.current;
      const effectiveLerp = faceDetectionActiveRef.current ? Math.max(lerpAmount, 0.3) : lerpAmount;
      cur.x += (tgt.x - cur.x) * effectiveLerp;
      cur.y += (tgt.y - cur.y) * effectiveLerp;
      applyEyeTransform();
    };

    if (documentHidden) {
      targetEyeRef.current = { x: 0, y: 0 };
      currentEyeRef.current = { x: 0, y: 0 };
      applyEyeTransform();
      return undefined;
    }

    if (!allowAmbientAnimation) {
      // Throttled lerp: 500ms interval instead of 60fps RAF
      stepEyes(0.45);
      eyeIntervalRef.current = window.setInterval(() => {
        stepEyes(0.45);
      }, 500);

      return () => {
        window.clearInterval(eyeIntervalRef.current);
      };
    }

    const EYE_EPSILON = 0.1;
    const isConverged = () => {
      const cur = currentEyeRef.current;
      const tgt = targetEyeRef.current;
      return Math.abs(tgt.x - cur.x) < EYE_EPSILON && Math.abs(tgt.y - cur.y) < EYE_EPSILON;
    };

    // When eyes have converged, swap to a 4fps setTimeout loop so the browser
    // can actually idle -- a throttled RAF still fires at 60fps and burns CPU
    // on the timestamp check alone.
    const THROTTLED_INTERVAL_MS = eyeConvergedThrottleMs;
    let throttleTimeoutId: number | 0 = 0;

    const update = () => {
      stepEyes(0.15);

      if (isConverged()) {
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
      window.clearInterval(eyeIntervalRef.current);
    };
  }, [allowAmbientAnimation, applyEyeTransform, documentHidden, eyeConvergedThrottleMs]);

  // Mouse tracking (fallback when no camera tracking)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      registerInteraction();
      if (faceDetectionActiveRef.current) return;
      const maxMove = 20;
      targetEyeRef.current.x = ((e.clientX / window.innerWidth) - 0.5) * (maxMove * 2);
      targetEyeRef.current.y = ((e.clientY / window.innerHeight) - 0.5) * (maxMove * 2);
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, [registerInteraction]);

  // Touch tracking (for mobile)
  useEffect(() => {
    const handler = (e: TouchEvent) => {
      registerInteraction();
      if (faceDetectionActiveRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const maxMove = 20;
      targetEyeRef.current.x = ((touch.clientX / window.innerWidth) - 0.5) * (maxMove * 2);
      targetEyeRef.current.y = ((touch.clientY / window.innerHeight) - 0.5) * (maxMove * 2);
    };
    document.addEventListener('touchmove', handler, { passive: true });
    return () => document.removeEventListener('touchmove', handler);
  }, [registerInteraction]);

  // Wandering eyes when idle
  useEffect(() => {
    if (!allowAmbientAnimation) return;
    // Low power: wander less frequently to reduce RAF wake-ups
    const interval = isLowPower ? 5000 : 1500;
    const id = window.setInterval(() => {
      if (!faceDetectionActiveRef.current && (Date.now() - lastInputTimeRef.current > 4000)) {
        if (Math.random() < 0.4) {
          targetEyeRef.current.x = (Math.random() - 0.5) * 28;
          targetEyeRef.current.y = (Math.random() - 0.5) * 16;
        } else {
          targetEyeRef.current.x = 0;
          targetEyeRef.current.y = 0;
        }
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [allowAmbientAnimation, isLowPower]);

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
    logTag: 'CurioFace',
    backoffThreshold: 30,
    backoffIntervalMs: 500,
  });

  // ==========================================
  // RENDER
  // ==========================================
  const isError = state === 'error';

  return (
    <div className={`relative flex items-center justify-center ${className}`}>


      {/* SVG Robot Face */}
      <svg
        ref={canvasRef}
        className={`curio-svg-face mode-${engineMode}${isLowPower ? ' curio-low-power' : ''}`}
        viewBox="0 0 600 400"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          maxWidth: 'none',
          maxHeight: 'none',
          overflow: 'visible',
        }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="curio-headGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="80%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor={isError ? '#fca5a5' : '#94a3b8'} />
          </linearGradient>
          <radialGradient id="curio-eyeRimGrad" cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor="#020617" />
            <stop offset="95%" stopColor={isError ? '#ef4444' : 'var(--robot-eye-rim-outer)'} />
            <stop offset="100%" stopColor={isError ? '#f87171' : 'var(--robot-accent)'} />
          </radialGradient>
          {allowFaceHeavyEffects && (
            <>
              <filter id="curio-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="curio-antenna-glow" x="-200%" y="-200%" width="500%" height="500%" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="curio-blur-sm" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </>
          )}
          <clipPath id="curio-clip-left">
            <path ref={maskLeftRef} className="curio-morph-path"
              d={EMOTIONS.idle.clipLeft} />
          </clipPath>
          <clipPath id="curio-clip-right">
            <path ref={maskRightRef} className="curio-morph-path"
              d={EMOTIONS.idle.clipRight} />
          </clipPath>
          <clipPath id="curio-mouth-clip">
            <use href="#curio-mouth-hole" />
          </clipPath>
        </defs>

        {/* Entire head group — floating animation */}
        <g className={allowAmbientAnimation ? 'curio-head-float' : ''}>
          <g ref={headTrackRef} style={isLowPower ? undefined : { willChange: 'transform' }}>
            {/* Action wrapper for nod/bob animations */}
            <g ref={actionWrapperRef} style={{ transformOrigin: '300px 200px' }}>

            {/* Ear Dials */}
            <rect x="50" y="140" width="60" height="120" rx="30" fill="#0f172a" stroke="#334155" strokeWidth="4" />
            <rect ref={earLeftRef} id="curio-ear-glow-left" x="40" y="160" width="30" height="80" rx="15" fill="var(--robot-accent)" className="curio-smooth-trans" />
            {/* Ear detail — small indicator dots */}
            <circle cx="80" cy="170" r="3" fill="#475569" opacity="0.6" />
            <circle cx="80" cy="200" r="3" fill="#475569" opacity="0.6" />
            <circle cx="80" cy="230" r="3" fill="#475569" opacity="0.6" />

            <rect x="490" y="140" width="60" height="120" rx="30" fill="#0f172a" stroke="#334155" strokeWidth="4" />
            <rect ref={earRightRef} id="curio-ear-glow-right" x="530" y="160" width="30" height="80" rx="15" fill="var(--robot-accent)" className="curio-smooth-trans" />
            {/* Ear detail — small indicator dots */}
            <circle cx="520" cy="170" r="3" fill="#475569" opacity="0.6" />
            <circle cx="520" cy="200" r="3" fill="#475569" opacity="0.6" />
            <circle cx="520" cy="230" r="3" fill="#475569" opacity="0.6" />

            {/* Main Head */}
            <rect x="90" y="50" width="420" height="320" rx="140" fill="url(#curio-headGrad)" stroke="#cbd5e1" strokeWidth="6" />
            <rect x="110" y="70" width="380" height="280" rx="120" fill="none" stroke="#f8fafc" strokeWidth="4" opacity="0.5" />

            {/* Forehead circuit lines — decorative panel detail */}
            <g opacity="0.15" style={{ pointerEvents: 'none' }}>
              <line x1="200" y1="85" x2="260" y2="85" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
              <line x1="260" y1="85" x2="260" y2="100" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
              <line x1="340" y1="85" x2="400" y2="85" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
              <line x1="340" y1="85" x2="340" y2="100" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
              <circle cx="260" cy="100" r="3" fill="#64748b" />
              <circle cx="340" cy="100" r="3" fill="#64748b" />
              <line x1="270" y1="95" x2="330" y2="95" stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 4" />
            </g>

            {/* Antenna */}
            <g>
              <line x1="300" y1="50" x2="300" y2="20" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
              <circle cx="300" cy="16" r="6" fill="var(--robot-accent)" opacity="0.6" className="curio-smooth-trans" />
              <circle ref={antennaGlowRef} cx="300" cy="16" r="6" fill="var(--robot-accent)" opacity="0.6" className="curio-antenna-pulse" />
            </g>

            {/* Chin / jaw detail */}
            <path d="M 230 340 Q 300 370 370 340" fill="none" stroke="#cbd5e1" strokeWidth="2" opacity="0.4" strokeLinecap="round" />

            {/* Eyebrows */}
            <path ref={browLeftRef} className="curio-morph-path"
              d={EMOTIONS.idle.browLeft}
              fill="none" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
            <path ref={browRightRef} className="curio-morph-path"
              d={EMOTIONS.idle.browRight}
              fill="none" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />

            {/* Cheeks */}
            <ellipse ref={cheekLeftRef} cx="150" cy="230" rx="25" ry="15" fill="#fb7185" filter="url(#curio-glow)" opacity="0" className="curio-smooth-trans" />
            <ellipse ref={cheekRightRef} cx="450" cy="230" rx="25" ry="15" fill="#fb7185" filter="url(#curio-glow)" opacity="0" className="curio-smooth-trans" />

            {/* LEFT EYE */}
            <g
              className={`curio-eye-socket curio-eye-left-socket${isBlinking ? ' curio-is-blinking' : ''}`}
              style={{ transformOrigin: '210px 200px' }}
            >
              <g clipPath="url(#curio-clip-left)">
                <rect x="100" y="80" width="200" height="240" fill="#020617" />
                <g ref={eyeTrackLeftRef} style={isLowPower ? undefined : { willChange: 'transform' }}>
                  <circle ref={pupilLeftRef} cx="210" cy="200" r="65" fill="url(#curio-eyeRimGrad)" className="curio-smooth-trans" />
                  <circle cx="185" cy="175" r="28" fill="#ffffff" filter={allowFaceHeavyEffects ? "url(#curio-blur-sm)" : undefined} />
                  <circle cx="235" cy="225" r="12" fill="#ffffff" filter={allowFaceHeavyEffects ? "url(#curio-blur-sm)" : undefined} />
                  {/* Eye sparkle catchlight */}
                  <circle cx="190" cy="180" r="5" fill="#ffffff" opacity="0.9" className="curio-sparkle" />
                  <path d="M 170 240 Q 210 260 250 240" fill="none" stroke="var(--robot-eye-arc)"
                    strokeWidth="6" strokeLinecap="round" filter="url(#curio-glow)" opacity="0.8" />
                </g>
              </g>
            </g>

            {/* RIGHT EYE */}
            <g
              className={`curio-eye-socket curio-eye-right-socket${isBlinking ? ' curio-is-blinking' : ''}`}
              style={{ transformOrigin: '390px 200px' }}
            >
              <g clipPath="url(#curio-clip-right)">
                <rect x="280" y="80" width="200" height="240" fill="#020617" />
                <g ref={eyeTrackRightRef} style={isLowPower ? undefined : { willChange: 'transform' }}>
                  <circle ref={pupilRightRef} cx="390" cy="200" r="65" fill="url(#curio-eyeRimGrad)" className="curio-smooth-trans" />
                  <circle cx="365" cy="175" r="28" fill="#ffffff" filter={allowFaceHeavyEffects ? "url(#curio-blur-sm)" : undefined} />
                  <circle cx="415" cy="225" r="12" fill="#ffffff" filter={allowFaceHeavyEffects ? "url(#curio-blur-sm)" : undefined} />
                  {/* Eye sparkle catchlight */}
                  <circle cx="370" cy="180" r="5" fill="#ffffff" opacity="0.9" className="curio-sparkle" />
                  <path d="M 350 240 Q 390 260 430 240" fill="none" stroke="var(--robot-eye-arc)"
                    strokeWidth="6" strokeLinecap="round" filter="url(#curio-glow)" opacity="0.8" />
                </g>
              </g>
            </g>

            {/* MAGNIFYING GLASS (Visible when searching) */}
            <g
              ref={magnifyingGlassRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out',
                willChange: 'transform',
                transformOrigin: '210px 200px'
              }}
            >
              <line x1="210" y1="200" x2="110" y2="350" stroke="#475569" strokeWidth="24" strokeLinecap="round" />
              <line x1="160" y1="275" x2="110" y2="350" stroke="#1e293b" strokeWidth="26" strokeLinecap="round" />
              <circle cx="210" cy="200" r="95" fill="none" stroke="#64748b" strokeWidth="16" />
              <circle cx="210" cy="200" r="95" fill="none" stroke="#94a3b8" strokeWidth="6" />
              <path d="M 135 150 Q 185 110 255 120" fill="none" stroke="#ffffff" strokeWidth="12" strokeLinecap="round" opacity="0.4" />
              <circle cx="210" cy="200" r="87" fill="var(--robot-accent)" opacity="0.1" />
            </g>

            {/* LIGHTBULB (Visible when thinking) — repositioned inside viewBox */}
            <g
              style={{
                opacity: state === 'thinking' ? 1 : 0,
                transform: state === 'thinking' ? 'translate(0px, 0px)' : 'translate(0px, 20px)',
                transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              <circle cx="300" cy="60" r="30" fill="#fef08a" opacity="0.3" filter="url(#curio-glow)" />
              <path d="M 288 85 C 288 100, 312 100, 312 85 L 308 70 C 325 62, 325 40, 300 32 C 275 40, 275 62, 292 70 Z" fill="#fde047" stroke="#ca8a04" strokeWidth="4" strokeLinejoin="round" />
              <rect x="288" y="85" width="24" height="10" rx="3" fill="#94a3b8" />
              <rect x="292" y="95" width="16" height="8" rx="2" fill="#64748b" />
              <g className={state === 'thinking' ? 'animate-pulse' : ''}>
                <line x1="300" y1="22" x2="300" y2="10" stroke="#fde047" strokeWidth="4" strokeLinecap="round" />
                <line x1="265" y1="45" x2="252" y2="38" stroke="#fde047" strokeWidth="4" strokeLinecap="round" />
                <line x1="335" y1="45" x2="348" y2="38" stroke="#fde047" strokeWidth="4" strokeLinecap="round" />
              </g>
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
              <path d="M 80 180 L 150 200 L 250 200 L 280 180 L 320 180 L 350 200 L 450 200 L 520 180" fill="none" stroke="#0f172a" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 140 200 C 140 250, 260 250, 260 200 Z" fill="#020617" stroke="#1e293b" strokeWidth="6" />
              <path d="M 160 205 L 200 205" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
              <path d="M 340 200 C 340 250, 460 250, 460 200 Z" fill="#020617" stroke="#1e293b" strokeWidth="6" />
              <path d="M 360 205 L 400 205" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
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
              <line x1="80" y1="200" x2="520" y2="200" stroke="#ef4444" strokeWidth="6" opacity="0.8" filter="url(#curio-glow)" />
              <rect x="80" y="180" width="440" height="40" opacity="0.2" fill="#ef4444" filter="url(#curio-glow)" />
            </g>

            {/* HEARTS */}
            <g
              ref={heartsRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out',
                transformOrigin: '300px 200px'
              }}
            >
              <path d="M 210 160 C 210 130 160 130 160 170 C 160 210 210 240 210 240 C 210 240 260 210 260 170 C 260 130 210 130 210 160 Z" fill="#ef4444" filter="url(#curio-glow)" />
              <path d="M 390 160 C 390 130 340 130 340 170 C 340 210 390 240 390 240 C 390 240 440 210 440 170 C 440 130 390 130 390 160 Z" fill="#ef4444" filter="url(#curio-glow)" />
            </g>

            {/* MUSTACHE */}
            <g
              ref={mustacheRef}
              style={{
                opacity: 0,
                transform: 'scale(0.1)',
                transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-in',
                transformOrigin: '300px 270px'
              }}
            >
              <path d="M 300 260 C 240 240, 200 270, 220 290 C 240 310, 280 270, 300 280 C 320 270, 360 310, 380 290 C 400 270, 360 240, 300 260 Z" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" />
            </g>

            {/* MONOCLE */}
            <g
              ref={monocleRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out',
                transformOrigin: '390px 200px'
              }}
            >
              <circle cx="390" cy="200" r="75" fill="none" stroke="#fbbf24" strokeWidth="10" />
              <line x1="465" y1="200" x2="520" y2="280" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
            </g>

            {/* STEAM — rising puffs with fade-up animation */}
            <g ref={steamLeftRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
              <circle cx="80" cy="140" r="12" fill="#e2e8f0" style={{ animation: 'curio-zzz-float 2s ease-in-out infinite' }} />
              <circle cx="65" cy="115" r="16" fill="#e2e8f0" opacity="0.8" style={{ animation: 'curio-zzz-float 2.5s ease-in-out infinite 0.3s' }} />
              <circle cx="85" cy="90" r="10" fill="#e2e8f0" opacity="0.6" style={{ animation: 'curio-zzz-float 3s ease-in-out infinite 0.6s' }} />
            </g>
            <g ref={steamRightRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
              <circle cx="520" cy="140" r="12" fill="#e2e8f0" style={{ animation: 'curio-zzz-float 2s ease-in-out infinite 0.15s' }} />
              <circle cx="535" cy="115" r="16" fill="#e2e8f0" opacity="0.8" style={{ animation: 'curio-zzz-float 2.5s ease-in-out infinite 0.45s' }} />
              <circle cx="515" cy="90" r="10" fill="#e2e8f0" opacity="0.6" style={{ animation: 'curio-zzz-float 3s ease-in-out infinite 0.75s' }} />
            </g>

            {/* MATRIX RAIN EYES Overlay */}
            <g ref={matrixEyesRef} style={{ opacity: 0, transition: 'opacity 0.5s', pointerEvents: 'none' }}>
              <g clipPath="url(#curio-clip-left)">
                 <rect x="100" y="80" width="200" height="240" fill="#00ff00" opacity="0.1" />
                 {[...Array(5)].map((_, i) => (
                   <rect key={`ml-${i}`} x={130 + i*30} y="80" width="4" height="240" fill="#00ff00" className="animate-pulse" style={{ animationDuration: `${1 + Math.random()}s` }} />
                 ))}
              </g>
              <g clipPath="url(#curio-clip-right)">
                 <rect x="280" y="80" width="200" height="240" fill="#00ff00" opacity="0.1" />
                 {[...Array(5)].map((_, i) => (
                   <rect key={`mr-${i}`} x={310 + i*30} y="80" width="4" height="240" fill="#00ff00" className="animate-pulse" style={{ animationDuration: `${1 + Math.random()}s` }} />
                 ))}
              </g>
            </g>

            {/* RAINBOW OVERLAY */}
            <g ref={rainbowRef} style={{ opacity: 0, transition: 'opacity 0.8s', pointerEvents: 'none' }}>
               <rect x="90" y="50" width="420" height="320" rx="140" fill="url(#rainbow-grad)" opacity="0.3" />
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

            {/* GUM POP -- inflating gum animation */}
            <g
              ref={gumPopRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out',
              }}
            >
               <circle cx="300" cy="310" r="10" fill="#f472bc" opacity="0.3" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
               <circle cx="300" cy="310" r="30" fill="#f472bc" opacity="0.7" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
               <circle cx="288" cy="298" r="6" fill="#ffffff" opacity="0.35" style={{ animation: 'curio-gum-inflate 3s ease-in-out infinite' }} />
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
              <path d="M 280 90 Q 280 50, 320 50 Q 360 50, 360 90 Q 360 120, 320 130 V 150 M 320 180 V 190" fill="none" stroke="#60a5fa" strokeWidth="12" strokeLinecap="round" />
            </g>

            {/* ANALYTICAL (Data Grid) */}
            <g
              ref={analyticalRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out'
              }}
            >
              <rect x="100" y="120" width="400" height="160" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="10 10" opacity="0.3" />
              <line x1="100" y1="200" x2="500" y2="200" stroke="#34d399" strokeWidth="1" opacity="0.5" />
              <line x1="200" y1="120" x2="200" y2="280" stroke="#34d399" strokeWidth="1" opacity="0.5" />
              <line x1="300" y1="120" x2="300" y2="280" stroke="#34d399" strokeWidth="1" opacity="0.5" />
              <line x1="400" y1="120" x2="400" y2="280" stroke="#34d399" strokeWidth="1" opacity="0.5" />
            </g>

            {/* RAGING (Flame Overlay) */}
            <g
              ref={rangingRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.3s ease-in-out'
              }}
            >
              <path d="M 120 180 Q 150 80 180 180 M 240 180 Q 270 60 300 180 M 360 180 Q 390 80 420 180" fill="none" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" opacity="0.6" style={{ animation: 'astro-flame-flicker 0.4s infinite alternate' }} />
            </g>

            {/* BLUSH (Shy/Soft) */}
            <g
              ref={blushRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.5s ease-in-out'
              }}
            >
              <circle cx="160" cy="270" r="25" fill="#fda4af" opacity="0.4" filter="blur(8px)" />
              <circle cx="440" cy="270" r="25" fill="#fda4af" opacity="0.4" filter="blur(8px)" />
            </g>

            {/* CONFETTI — more particles with varied colors and staggered animations */}
            <g ref={confettiRef} style={{ opacity: 0, transition: 'opacity 0.3s' }}>
               <rect x="120" y="70" width="8" height="8" rx="1" fill="#f87171" style={{ animation: 'curio-confetti-fall 1.8s ease-in infinite' }} />
               <rect x="180" y="55" width="6" height="10" rx="1" fill="#60a5fa" style={{ animation: 'curio-confetti-fall 2s ease-in infinite 0.15s' }} />
               <rect x="240" y="65" width="10" height="6" rx="1" fill="#34d399" style={{ animation: 'curio-confetti-fall 1.6s ease-in infinite 0.3s' }} />
               <rect x="310" y="60" width="7" height="9" rx="1" fill="#fbbf24" style={{ animation: 'curio-confetti-fall 2.2s ease-in infinite 0.45s' }} />
               <rect x="370" y="70" width="9" height="7" rx="1" fill="#a78bfa" style={{ animation: 'curio-confetti-fall 1.9s ease-in infinite 0.6s' }} />
               <rect x="430" y="55" width="6" height="8" rx="1" fill="#fb923c" style={{ animation: 'curio-confetti-fall 2.1s ease-in infinite 0.75s' }} />
               <rect x="480" y="65" width="8" height="6" rx="1" fill="#f472b6" style={{ animation: 'curio-confetti-fall 1.7s ease-in infinite 0.9s' }} />
               <rect x="150" y="60" width="5" height="10" rx="1" fill="#2dd4bf" style={{ animation: 'curio-confetti-fall 2.3s ease-in infinite 0.2s' }} />
               <rect x="350" y="58" width="8" height="5" rx="1" fill="#facc15" style={{ animation: 'curio-confetti-fall 1.5s ease-in infinite 0.5s' }} />
               <rect x="270" y="72" width="7" height="7" rx="1" fill="#818cf8" style={{ animation: 'curio-confetti-fall 2.4s ease-in infinite 0.35s' }} />
            </g>

            {/* HALO — repositioned inside viewBox */}
            <g
              ref={haloRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.5s ease-in-out',
              }}
            >
              <ellipse cx="300" cy="55" rx="90" ry="18" fill="none" stroke="#fde047" strokeWidth="7" filter="url(#curio-glow)" style={{ animation: 'curio-halo-bob 2s ease-in-out infinite' }} />
              <ellipse cx="300" cy="55" rx="90" ry="18" fill="none" stroke="#fef08a" strokeWidth="3" opacity="0.5" style={{ animation: 'curio-halo-bob 2s ease-in-out infinite' }} />
            </g>

            {/* STAR EYES Overlay */}
            <g ref={starsRef} style={{ opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
               <path d="M 210 170 L 220 190 L 245 190 L 225 205 L 235 230 L 210 215 L 185 230 L 195 205 L 175 190 L 200 190 Z" fill="#fde047" filter="url(#curio-glow)" />
               <path d="M 390 170 L 400 190 L 425 190 L 405 205 L 415 230 L 390 215 L 365 230 L 375 205 L 355 190 L 380 190 Z" fill="#fde047" filter="url(#curio-glow)" />
            </g>

            {/* CLOCK EYE Overlay — improved with proper SVG rotation */}
            <g ref={clockRef} style={{ opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
               <circle cx="210" cy="200" r="50" fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="8 4" opacity="0.6" style={{ transformOrigin: '210px 200px', animation: 'curio-propeller-spin 6s linear infinite' }} />
               <line x1="210" y1="200" x2="210" y2="165" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" style={{ transformOrigin: '210px 200px', animation: 'curio-propeller-spin 3s linear infinite' }} />
               <line x1="210" y1="200" x2="235" y2="200" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: '210px 200px', animation: 'curio-propeller-spin 1s linear infinite' }} />
               <circle cx="210" cy="200" r="3" fill="#ffffff" />
            </g>

            {/* RAIN — more drops with staggered fall animation */}
            <g ref={rainRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
               <line x1="150" y1="230" x2="148" y2="250" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'curio-confetti-fall 1.2s linear infinite' }} />
               <line x1="175" y1="240" x2="173" y2="260" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" style={{ animation: 'curio-confetti-fall 1.4s linear infinite 0.2s' }} />
               <line x1="200" y1="235" x2="198" y2="252" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" style={{ animation: 'curio-confetti-fall 1.1s linear infinite 0.4s' }} />
               <line x1="400" y1="230" x2="398" y2="250" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'curio-confetti-fall 1.3s linear infinite 0.1s' }} />
               <line x1="425" y1="240" x2="423" y2="258" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" style={{ animation: 'curio-confetti-fall 1.5s linear infinite 0.3s' }} />
               <line x1="450" y1="235" x2="448" y2="252" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" style={{ animation: 'curio-confetti-fall 1.0s linear infinite 0.5s' }} />
            </g>

            {/* SNEEZE PARTICLES */}
            <g ref={sneezeRef} style={{ opacity: 0, transition: 'opacity 0.2s' }}>
               <circle cx="300" cy="280" r="4" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.4s' }} />
               <circle cx="280" cy="290" r="3" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.5s' }} />
               <circle cx="320" cy="290" r="3" fill="#cbd5e1" className="animate-ping" style={{ animationDuration: '0.3s' }} />
            </g>

            {/* THINKING CLOUD — repositioned inside viewBox */}
            <g
              ref={thinkingCloudRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.4s ease-in-out',
              }}
            >
              <circle cx="430" cy="80" r="8" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
              <circle cx="450" cy="65" r="12" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
              <ellipse cx="490" cy="55" rx="45" ry="30" fill="#fff" stroke="#cbd5e1" strokeWidth="3" />
              <text x="478" y="65" fontSize="30" fill="#64748b" fontWeight="bold">?</text>
            </g>

            {/* FIRE EYES Overlay — contained within eye sockets */}
            <g ref={fireRef} style={{ opacity: 0, transition: 'opacity 0.4s', pointerEvents: 'none' }}>
               <g clipPath="url(#curio-clip-left)">
                 <path d="M 185 240 Q 210 160 235 240 Q 220 200 210 260 Q 200 200 185 240" fill="#ef4444" className="animate-pulse" filter="url(#curio-glow)" />
                 <path d="M 195 230 Q 210 175 225 230 Q 215 200 210 245 Q 205 200 195 230" fill="#f97316" className="animate-pulse" filter="url(#curio-glow)" style={{ animationDelay: '0.2s' }} />
               </g>
               <g clipPath="url(#curio-clip-right)">
                 <path d="M 365 240 Q 390 160 415 240 Q 400 200 390 260 Q 380 200 365 240" fill="#ef4444" className="animate-pulse" filter="url(#curio-glow)" />
                 <path d="M 375 230 Q 390 175 405 230 Q 395 200 390 245 Q 385 200 375 230" fill="#f97316" className="animate-pulse" filter="url(#curio-glow)" style={{ animationDelay: '0.2s' }} />
               </g>
            </g>

            {/* PROPELLER HAT — repositioned inside viewBox */}
            <g
              ref={propellerRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.5s',
              }}
            >
               <path d="M 250 60 L 350 60 L 300 50 Z" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
               <g style={{ transformOrigin: '300px 55px', animation: 'curio-propeller-spin 0.4s linear infinite' }}>
                  <path d="M 220 55 L 380 55" stroke="#fbbf24" strokeWidth="10" strokeLinecap="round" />
               </g>
               <circle cx="300" cy="55" r="6" fill="#1e293b" />
            </g>

            {/* MUSIC NOTES — repositioned inside viewBox with float animation */}
            <g ref={musicNotesRef} style={{ opacity: 0, transition: 'opacity 0.4s' }}>
               <text x="110" y="100" fontSize="30" fill="#818cf8" style={{ animation: 'curio-note-float 2.5s ease-in-out infinite' }}>♪</text>
               <text x="480" y="120" fontSize="40" fill="#a78bfa" style={{ animation: 'curio-note-float 3s ease-in-out infinite 0.3s' }}>♫</text>
               <text x="160" y="80" fontSize="35" fill="#c084fc" style={{ animation: 'curio-note-float 2.8s ease-in-out infinite 0.6s' }}>♩</text>
               <text x="430" y="90" fontSize="28" fill="#e879f9" style={{ animation: 'curio-note-float 3.2s ease-in-out infinite 0.9s' }}>♬</text>
            </g>

            {/* THUG LIFE CHAIN — repositioned inside viewBox */}
            <g
              ref={goldChainRef}
              style={{
                opacity: 0,
                transition: 'opacity 0.5s ease-in-out',
              }}
            >
               <path d="M 170 310 Q 300 370 430 310" fill="none" stroke="#fbbf24" strokeWidth="12" strokeLinecap="round" filter="url(#curio-glow)" />
               <path d="M 190 315 Q 300 360 410 315" fill="none" stroke="#d97706" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
               <rect x="282" y="340" width="36" height="36" rx="4" fill="#fbbf24" stroke="#d97706" strokeWidth="3" />
               <text x="291" y="367" fontSize="22" fill="#92400e" fontWeight="bold">$</text>
            </g>

            {/* ═══ EMOTION-REACTIVE OVERLAYS ═══ */}
            {/* All CSS-only animations — no JS timers, lightweight */}

            {/* CONFUSED — floating question marks */}
            <g ref={emotionConfusedRef} style={{ opacity: 0, transition: 'opacity 0.3s' }} aria-hidden="true">
              <text x="430" y="100" fontSize="28" fill="#94a3b8" fontWeight="bold" className="curio-emotion-float-a" style={{ fontFamily: 'sans-serif' }}>?</text>
              <text x="460" y="75" fontSize="20" fill="#cbd5e1" fontWeight="bold" className="curio-emotion-float-b" style={{ fontFamily: 'sans-serif' }}>?</text>
              <text x="140" y="90" fontSize="22" fill="#94a3b8" fontWeight="bold" className="curio-emotion-float-c" style={{ fontFamily: 'sans-serif' }}>?</text>
              {/* Spiral scribble over head */}
              <path d="M 280 65 Q 290 50 300 60 Q 310 70 320 55 Q 330 45 340 58" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" className="curio-emotion-float-a" />
            </g>

            {/* SAD — sweat drop + tear streaks */}
            <g ref={emotionSadRef} style={{ opacity: 0, transition: 'opacity 0.3s' }} aria-hidden="true">
              {/* Sweat drop on right side */}
              <path d="M 440 155 Q 445 140 450 155 Q 450 165 445 168 Q 440 165 440 155 Z" fill="#93c5fd" opacity="0.8" className="curio-emotion-drip" />
              {/* Tear streaks under eyes */}
              <line x1="175" y1="235" x2="170" y2="265" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" className="curio-emotion-drip" />
              <line x1="425" y1="235" x2="430" y2="265" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" className="curio-emotion-drip" style={{ animationDelay: '0.4s' }} />
              {/* Small cloud overhead */}
              <ellipse cx="300" cy="40" rx="40" ry="14" fill="#cbd5e1" opacity="0.35" className="curio-emotion-float-a" />
              <ellipse cx="280" cy="38" rx="20" ry="10" fill="#cbd5e1" opacity="0.25" className="curio-emotion-float-b" />
            </g>

            {/* LOVE — mini floating hearts */}
            <g ref={emotionLoveRef} style={{ opacity: 0, transition: 'opacity 0.3s' }} aria-hidden="true">
              <text x="130" y="110" fontSize="22" className="curio-emotion-heart-a" style={{ fontFamily: 'sans-serif' }}>❤</text>
              <text x="450" y="90" fontSize="18" className="curio-emotion-heart-b" style={{ fontFamily: 'sans-serif' }}>❤</text>
              <text x="170" y="70" fontSize="14" className="curio-emotion-heart-c" style={{ fontFamily: 'sans-serif' }}>💕</text>
              <text x="410" y="60" fontSize="16" className="curio-emotion-heart-a" style={{ fontFamily: 'sans-serif' }}>💗</text>
            </g>

            {/* SMIRK — cool sparkle / glint */}
            <g ref={emotionSmirkRef} style={{ opacity: 0, transition: 'opacity 0.3s' }} aria-hidden="true">
              {/* Sparkle near the raised brow eye */}
              <g className="curio-emotion-sparkle-ping" style={{ transformOrigin: '440px 110px' }}>
                <line x1="440" y1="95" x2="440" y2="125" stroke="#fde047" strokeWidth="2" strokeLinecap="round" />
                <line x1="425" y1="110" x2="455" y2="110" stroke="#fde047" strokeWidth="2" strokeLinecap="round" />
                <line x1="430" y1="100" x2="450" y2="120" stroke="#fde047" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="450" y1="100" x2="430" y2="120" stroke="#fde047" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            </g>

            {/* EXCITED — small lightning bolts */}
            <g ref={emotionExcitedRef} style={{ opacity: 0, transition: 'opacity 0.3s' }} aria-hidden="true">
              <path d="M 140 80 L 150 95 L 143 95 L 155 115" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="curio-emotion-float-a" />
              <path d="M 450 70 L 460 85 L 453 85 L 465 105" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="curio-emotion-float-b" />
              {/* Small energy dots */}
              <circle cx="120" cy="120" r="3" fill="#fbbf24" className="curio-emotion-sparkle-ping" style={{ transformOrigin: '120px 120px' }} />
              <circle cx="480" cy="110" r="3" fill="#fbbf24" className="curio-emotion-sparkle-ping" style={{ transformOrigin: '480px 110px', animationDelay: '0.3s' }} />
            </g>

            {/* ZZZ FLOATS — repositioned inside viewBox with gentle float */}
            <g
              ref={zzzRef}
              style={{
                opacity: 0,
                transition: 'opacity 1s ease-in-out'
              }}
            >
              <g style={{ animation: 'curio-zzz-float 3s ease-in-out infinite' }}>
                <text x="420" y="200" fontSize="28" fill="#cbd5e1" fontWeight="bold" opacity="0.7" style={{ fontFamily: 'sans-serif' }}>z</text>
              </g>
              <g style={{ animation: 'curio-zzz-float 3.5s ease-in-out infinite 0.6s' }}>
                <text x="450" y="165" fontSize="36" fill="#94a3b8" fontWeight="bold" opacity="0.8" style={{ fontFamily: 'sans-serif' }}>Z</text>
              </g>
              <g style={{ animation: 'curio-zzz-float 4s ease-in-out infinite 1.2s' }}>
                <text x="480" y="120" fontSize="44" fill="#64748b" fontWeight="bold" style={{ fontFamily: 'sans-serif' }}>Z</text>
              </g>
            </g>

            {/* HEADPHONES (Visible when dancing) — fitted inside viewBox */}
            <g
              style={{
                opacity: state === 'dancing' ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
                transformOrigin: '300px 200px'
              }}
            >
              {/* Headband */}
              <path d="M 95 180 C 95 55, 505 55, 505 180" fill="none" stroke="#1e293b" strokeWidth="22" strokeLinecap="round" />
              <path d="M 95 180 C 95 55, 505 55, 505 180" fill="none" stroke="#818cf8" strokeWidth="8" strokeLinecap="round" className="curio-smooth-trans" />
              
              {/* Left Earcup */}
              <rect x="60" y="145" width="42" height="110" rx="18" fill="#1e293b" />
              <rect x="52" y="160" width="18" height="80" rx="9" fill="#818cf8" className="curio-smooth-trans" style={{ animation: state === 'dancing' ? 'curio-ear-pump 0.5s ease-in-out infinite' : 'none' }} />
              <circle cx="82" cy="200" r="12" fill="#334155" />

              {/* Right Earcup */}
              <rect x="498" y="145" width="42" height="110" rx="18" fill="#1e293b" />
              <rect x="530" y="160" width="18" height="80" rx="9" fill="#818cf8" className="curio-smooth-trans" style={{ animation: state === 'dancing' ? 'curio-ear-pump 0.5s ease-in-out infinite 0.25s' : 'none' }} />
              <circle cx="518" cy="200" r="12" fill="#334155" />
              
              {/* Sound waves */}
              <path d="M 55 185 Q 42 200 55 215" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
              <path d="M 545 185 Q 558 200 545 215" fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            </g>

            {/* NOSE — subtle rounded triangle between eyes and mouth */}
            <g ref={noseRef} className="curio-smooth-trans" style={{ transformOrigin: '300px 260px' }}>
              <path d="M 293 252 Q 300 240 307 252 Q 303 258 300 260 Q 297 258 293 252 Z" fill="#cbd5e1" opacity="0.5" />
              <path d="M 295 254 Q 300 248 305 254" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            </g>

            {/* MOUTH */}
            <path ref={mouthRef} id="curio-mouth-hole" className="curio-morph-path"
              d={EMOTIONS.idle.mouth}
              fill="#1f040a" stroke="#0f0205" strokeWidth="4" strokeLinejoin="round" />

            <ellipse ref={tongueRef} cx="300" cy="310" rx="35" ry="25" fill="#fb7185"
              clipPath="url(#curio-mouth-clip)" className="curio-smooth-trans" />
          </g>
          </g>
        </g>
      </svg>
    </div>
  );
};

export const CurioFace = React.memo(CurioFaceComponent);
CurioFace.displayName = 'CurioFace';
