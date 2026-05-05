# Robot Face Architecture

How the face system is structured so you can add new robots, emotions, and animations without touching shared infrastructure.

## File Structure

```
src/
  services/
    emotionDetection.ts        # Shared types + transcript-to-emotion mapper
    faceTracking.ts            # Low-level face detection backend (TFLite)
    volumeStore.ts             # Shared audio volume state

  hooks/
    useFaceTracking.ts         # Camera lifecycle + detection polling hook

  components/curio/
    CurioFace.tsx              # "Curio" robot face (SVG, almond eyes)
    animationConfigs.ts        # CurioFace animation registry
    AstroFace.tsx              # "Astro" robot face (SVG, circular eyes)
    astroAnimationConfigs.ts   # AstroFace animation registry
    AstroCardEyeContent.tsx    # Card-type SVG icons for Astro's centered eye
    BenderFace.tsx             # "Bender" robot face (CSS-based)
    CurioAgentMode.tsx         # Orchestrator -- picks which face to render
```

## Layer Diagram

```
CurioAgentMode
  |
  +-- picks face by faceStyleId setting
  |     'curio'  -> CurioFace
  |     'astro'  -> AstroFace
  |     'bender' -> BenderFace
  |
  +-- derives emotionHint via emotionFromText(modelTranscript)
  +-- derives curioState from connection/playback state
  +-- passes both down as props

Each face component:
  [1] Imports shared types from emotionDetection.ts
  [2] Calls useFaceTracking() for camera eye-follow
  [3] Owns its EMOTIONS dictionary (SVG paths / CSS)
  [4] Owns its animation config registry
  [5] Renders its own SVG / HTML
```

## Shared Module: emotionDetection.ts

Single source of truth for types and transcript analysis used by every face.

```ts
// src/services/emotionDetection.ts

// -- The 8 states the face can be in --
export type CurioState =
  | 'idle' | 'warmup' | 'listening' | 'speaking'
  | 'thinking' | 'error' | 'capturing' | 'dancing';

// -- Reduced to 4 modes for animation engines --
export type EngineMode = 'idle' | 'listening' | 'speaking' | 'dancing';
export const toEngineMode = (state: CurioState): EngineMode => { ... };

// -- Keyword-based emotion detection from AI transcript --
export function emotionFromText(text: string | null): string | null { ... }

// -- Extract live video track from a MediaStream --
export function getSharedVisionStream(stream: MediaStream | null): MediaStream | null { ... }
```

To add a new emotion keyword mapping, add an entry to the `EMOTION_KEYWORDS` array:

```ts
// Returns 'nostalgic' when the AI says "remember when", "back in the day", etc.
[['remember when', 'back in the day', 'nostalgia', 'those were the days'], 'nostalgic'],
```

The returned string (e.g. `'nostalgic'`) must match a key in the face's `EMOTIONS` dictionary for it to have a visual effect.

## Shared Hook: useFaceTracking

Handles the entire camera face-tracking lifecycle. Each face calls it with its own refs and tuning.

```ts
// Inside any face component:
useFaceTracking({
  faceTrackingEnabled,
  allowFaceTrackingBackgroundWork,
  sharedVisionStream,
  userFacingCamera,
  isLowPower,
  faceTrackingPollIntervalMs,

  // The hook writes detected positions into these refs:
  targetEyeRef,
  currentEyeRef,
  consecutiveMissesRef,
  faceDetectionActiveRef,

  // Callbacks:
  applyEyeTransform,    // re-render eyes after position update
  registerInteraction,   // reset idle/sleep timers

  // Per-face tuning:
  logTag: 'MyNewFace',
  backoffThreshold: 30,  // misses before slowing poll rate
  backoffIntervalMs: 500,
});
```

You never need to touch this hook to add a new face. Just call it.

## Per-Face: Emotion Shapes

Each face defines its own `EMOTIONS` dictionary mapping emotion names to visual parameters. The shape of this dictionary is face-specific.

CurioFace uses SVG path data for eyes, brows, mouth, tongue, cheeks, and pupil size:

```ts
// src/components/curio/CurioFace.tsx
interface EmotionShape {
  clipLeft: string;    // SVG path for left eye mask
  clipRight: string;   // SVG path for right eye mask
  browLeft: string;    // SVG path for left eyebrow
  browRight: string;   // SVG path for right eyebrow
  mouth: string;       // SVG path for mouth curve
  tongueY: number;     // tongue vertical position
  cheekOpacity: number; // blush intensity (0-1)
  pupilRadius?: number; // pupil dilation
  noseOffsetY?: number; // nose vertical shift
}

const EMOTIONS: Record<string, EmotionShape> = {
  idle:      { clipLeft: 'M 140 200 Q 210 90 280 200 ...', ... },
  happy:     { clipLeft: '...', mouth: 'M 180 260 Q 300 320 420 260', ... },
  sad:       { ... },
  nostalgic: { ... },  // <-- add new emotions here
};
```

AstroFace uses simpler clip paths (just left/right eye shapes):

```ts
// src/components/curio/AstroFace.tsx
interface EmotionShape {
  clipLeft: string;
  clipRight: string;
}

const EMOTIONS: Record<string, EmotionShape> = {
  idle: {
    clipLeft:  'M 215 165 C 251 165 280 194 ...',
    clipRight: 'M 385 165 C 421 165 450 194 ...',
  },
  // ...
};
```

BenderFace uses CSS classes instead of SVG paths -- emotions are expressed through CSS transforms and filters on the eye/mouth DOM elements.

To add a new emotion to a face, add an entry to that face's `EMOTIONS` dictionary. The emotion name must match what `emotionFromText()` returns for it to trigger automatically from conversation.

## Per-Face: Animation Configs

Animations are triggered by the idle/listening/speaking engines at random intervals. Each face has its own registry file.

Both CurioFace and AstroFace use the same pattern -- a `Map<number, AnimRunner>` registry where each animation ID maps to a function:

```ts
// Registration helper
function reg(ids: number | number[], runner: AnimRunner) { ... }

// Simple: just set emotion + action + reset
reg(1, (ctx) => {
  ctx.setEmotion('happy');
  ctx.triggerAction('bob', 800);
  setTimeout(() => resetToIdle(ctx), 1500);
});

// Complex: multi-step with intervals
reg(10, (ctx) => {
  ctx.setEmotion('surprised');
  let step = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    step += 0.8;
    ctx.targetEyeRef.current = { x: Math.cos(step) * 50, y: Math.sin(step) * 50 };
    if (step > 15) { clearInterval(ivl); ctx.setEmotion('idle'); }
  }, 60));
});
```

CurioFace also supports a declarative `regSimple` shorthand:

```ts
regSimple(2, {
  emotion: 'curious',
  action: 'nod',
  actionDuration: 600,
  resetMs: 1500,
});
```

To add a new animation, pick an unused ID and register it in the face's config file. The face's idle engine will randomly trigger it.

## Adding a New Robot Face

1. Create `src/components/curio/MyFace.tsx`
2. Import shared utilities:

```tsx
import {
  type CurioState, type EngineMode,
  toEngineMode, emotionFromText, getSharedVisionStream,
} from '../../services/emotionDetection';
import { useFaceTracking } from '../../hooks/useFaceTracking';
```

3. Define your `EMOTIONS` dictionary with whatever shape your face needs
4. Create `myAnimationConfigs.ts` with a registry of animations
5. Inside the component, call `useFaceTracking()` with your refs
6. Wire it into `CurioAgentMode.tsx`:

```tsx
// In CurioAgentMode.tsx, add to the face selection:
{faceStyleId === 'myface' ? (
  <MyFace state={curioState} ... />
) : faceStyleId === 'astro' ? (
  ...
```

7. Add `'myface'` to the `FaceStyleId` type in `settingsStorage.ts`

The face gets emotion hints, face tracking, and state management for free. You only write the visual rendering and face-specific animation behaviors.

## Quick Reference: What Goes Where

| I want to...                        | Edit this file                          |
|-------------------------------------|-----------------------------------------|
| Add emotion keyword triggers        | `src/services/emotionDetection.ts`      |
| Add a new CurioState                | `src/services/emotionDetection.ts`      |
| Add CurioFace emotion shape         | `src/components/curio/CurioFace.tsx`    |
| Add AstroFace emotion shape         | `src/components/curio/AstroFace.tsx`    |
| Add CurioFace animation             | `src/components/curio/animationConfigs.ts` |
| Add AstroFace animation             | `src/components/curio/astroAnimationConfigs.ts` |
| Add Astro card-eye icon             | `src/components/curio/AstroCardEyeContent.tsx` |
| Tune face tracking behavior         | `src/hooks/useFaceTracking.ts`          |
| Add a new robot face                | New `*Face.tsx` + wire in `CurioAgentMode.tsx` |
| Change face selection setting       | `src/utils/settingsStorage.ts` (`FaceStyleId`) |
