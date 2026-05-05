import type React from 'react';

interface KiroEmotionShape {
  clipLeft: string;
  clipRight: string;
}

// ================================================================
// Kiro emotion shapes.
// All emotions are authored around fixed eye centers:
//   - Left eye: cx=480, cy=365
//   - Right eye: cx=580, cy=365
// Base radii (idle): rx~30, ry~45 (matches the reference SVG ghost's
// original eye ovals). Other emotions morph from this baseline so
// transitions feel smooth instead of jumping in scale.
// ================================================================
export const KIRO_EMOTIONS: Record<string, KiroEmotionShape> = {
  idle: {
    clipLeft: 'M 450 365 C 450 340 459 320 480 320 C 501 320 510 340 510 365 C 510 390 501 410 480 410 C 459 410 450 390 450 365 Z',
    clipRight: 'M 550 365 C 550 340 559 320 580 320 C 601 320 610 340 610 365 C 610 390 601 410 580 410 C 559 410 550 390 550 365 Z',
  },
  listening: {
    clipLeft: 'M 448 365 C 448 337 462 314 480 314 C 498 314 512 337 512 365 C 512 393 498 416 480 416 C 462 416 448 393 448 365 Z',
    clipRight: 'M 548 365 C 548 337 562 314 580 314 C 598 314 612 337 612 365 C 612 393 598 416 580 416 C 562 416 548 393 548 365 Z',
  },
  happy: {
    clipLeft: 'M 446 365 C 446 355 458 340 480 340 C 502 340 514 355 514 365 C 514 380 498 392 480 392 C 462 392 446 380 446 365 Z',
    clipRight: 'M 546 365 C 546 355 558 340 580 340 C 602 340 614 355 614 365 C 614 380 598 392 580 392 C 562 392 546 380 546 365 Z',
  },
  excited: {
    clipLeft: 'M 442 365 C 442 330 459 302 480 302 C 501 302 518 330 518 365 C 518 405 502 432 480 432 C 458 432 442 405 442 365 Z',
    clipRight: 'M 542 365 C 542 330 559 302 580 302 C 601 302 618 330 618 365 C 618 405 602 432 580 432 C 558 432 542 405 542 365 Z',
  },
  sleepy: {
    clipLeft: 'M 450 362 Q 480 356 510 362 V 370 Q 480 378 450 370 Z',
    clipRight: 'M 550 362 Q 580 356 610 362 V 370 Q 580 378 550 370 Z',
  },
  wink: {
    clipLeft: 'M 450 362 Q 480 356 510 362 V 370 Q 480 378 450 370 Z',
    clipRight: 'M 550 365 C 550 337 564 314 580 314 C 596 314 610 337 610 365 C 610 393 596 416 580 416 C 564 416 550 393 550 365 Z',
  },
  curious: {
    clipLeft: 'M 450 365 C 450 340 459 320 480 320 C 501 320 510 340 510 365 C 510 390 501 410 480 410 C 459 410 450 390 450 365 Z',
    clipRight: 'M 544 365 C 544 324 562 300 580 300 C 598 300 616 324 616 365 C 616 406 598 430 580 430 C 562 430 544 406 544 365 Z',
  },
  surprised: {
    clipLeft: 'M 438 365 C 438 318 460 295 480 295 C 500 295 522 318 522 365 C 522 412 500 435 480 435 C 460 435 438 412 438 365 Z',
    clipRight: 'M 538 365 C 538 318 560 295 580 295 C 600 295 622 318 622 365 C 622 412 600 435 580 435 C 560 435 538 412 538 365 Z',
  },
  suspicious: {
    clipLeft: 'M 452 356 Q 480 348 508 360 V 374 Q 480 386 452 376 Z',
    clipRight: 'M 552 360 Q 580 348 608 356 V 376 Q 580 386 552 374 Z',
  },
  angry: {
    clipLeft: 'M 450 344 L 512 370 L 510 398 Q 480 402 450 396 Z',
    clipRight: 'M 550 370 L 612 344 L 610 396 Q 580 402 550 398 Z',
  },
  content: {
    clipLeft: 'M 448 365 Q 448 340 480 340 Q 512 340 512 365 L 480 376 Z',
    clipRight: 'M 548 365 Q 548 340 580 340 Q 612 340 612 365 L 580 376 Z',
  },
  digitized: {
    clipLeft: 'M 452 322 H 508 V 408 H 452 Z',
    clipRight: 'M 552 322 H 608 V 408 H 552 Z',
  },
  glee: {
    clipLeft: 'M 448 382 Q 480 326 512 382 V 396 Q 480 346 448 396 Z',
    clipRight: 'M 548 382 Q 580 326 612 382 V 396 Q 580 346 548 396 Z',
  },
  smug: {
    clipLeft: 'M 446 365 C 446 355 458 340 480 340 C 502 340 514 355 514 365 C 514 380 498 392 480 392 C 462 392 446 380 446 365 Z',
    clipRight: 'M 552 360 Q 580 348 608 356 V 376 Q 580 386 552 374 Z',
  },
  nervous: {
    clipLeft: 'M 470 348 A 8 8 0 1 0 486 348 A 8 8 0 1 0 470 348 M 474 374 A 8 8 0 1 0 490 374 A 8 8 0 1 0 474 374',
    clipRight: 'M 570 348 A 8 8 0 1 0 586 348 A 8 8 0 1 0 570 348 M 574 374 A 8 8 0 1 0 590 374 A 8 8 0 1 0 574 374',
  },
  loveMail: {
    clipLeft: 'M 480 346 C 480 326 452 326 452 352 C 452 380 480 404 480 404 C 480 404 508 380 508 352 C 508 326 480 326 480 346 Z',
    clipRight: 'M 552 332 H 608 V 398 H 552 Z M 552 332 L 580 365 L 608 332',
  },
  searching: {
    clipLeft: 'M 446 365 A 34 34 0 1 0 514 365 A 34 34 0 1 0 446 365 M 462 365 A 18 18 0 1 1 498 365 A 18 18 0 1 1 462 365',
    clipRight: 'M 546 365 A 34 34 0 1 0 614 365 A 34 34 0 1 0 546 365 M 562 365 A 18 18 0 1 1 598 365 A 18 18 0 1 1 562 365',
  },
  evil: {
    clipLeft: 'M 450 340 L 512 366 L 510 396 Q 480 404 450 398 Z M 476 372 A 10 10 0 1 1 476 392 A 10 10 0 1 1 476 372',
    clipRight: 'M 550 366 L 612 340 L 610 398 Q 580 404 550 396 Z M 576 372 A 10 10 0 1 1 576 392 A 10 10 0 1 1 576 372',
  },
  smileSquint: {
    clipLeft: 'M 448 370 Q 480 340 512 370 L 510 378 Q 480 354 450 378 Z',
    clipRight: 'M 548 370 Q 580 340 612 370 L 610 378 Q 580 354 550 378 Z',
  },
  glitchMatrix: {
    clipLeft: 'M 452 322 H 462 V 408 H 452 Z M 475 322 H 485 V 408 H 475 Z M 498 322 H 508 V 408 H 498 Z',
    clipRight: 'M 552 322 H 562 V 408 H 552 Z M 575 322 H 585 V 408 H 575 Z M 598 322 H 608 V 408 H 598 Z',
  },
  crying: {
    clipLeft: 'M 448 365 A 32 32 0 1 0 512 365 A 32 32 0 1 0 448 365 M 460 360 H 500 V 370 H 460 Z M 468 384 H 492 V 394 H 468 Z',
    clipRight: 'M 548 365 A 32 32 0 1 0 612 365 A 32 32 0 1 0 548 365 M 560 360 H 600 V 370 H 560 Z M 568 384 H 592 V 394 H 568 Z',
  },
  thinkingCloud: {
    clipLeft: 'M 454 372 A 22 22 0 1 1 496 372 A 22 22 0 1 1 454 372 M 464 344 A 18 18 0 1 1 500 344 A 18 18 0 1 1 464 344',
    clipRight: 'M 554 372 A 22 22 0 1 1 596 372 A 22 22 0 1 1 554 372 M 564 344 A 18 18 0 1 1 600 344 A 18 18 0 1 1 564 344',
  },
  heartEyes: {
    clipLeft: 'M 480 346 C 480 326 452 326 452 352 C 452 380 480 404 480 404 C 480 404 508 380 508 352 C 508 326 480 326 480 346 Z',
    clipRight: 'M 580 346 C 580 326 552 326 552 352 C 552 380 580 404 580 404 C 580 404 608 380 608 352 C 608 326 580 326 580 346 Z',
  },
  shiver: {
    clipLeft: 'M 452 354 Q 466 346 480 354 Q 494 362 508 354 V 372 Q 494 380 480 372 Q 466 364 452 372 Z',
    clipRight: 'M 552 354 Q 566 346 580 354 Q 594 362 608 354 V 372 Q 594 380 580 372 Q 566 364 552 372 Z',
  },
  joy: {
    clipLeft: 'M 446 388 Q 480 300 514 388 Q 480 348 446 388 Z',
    clipRight: 'M 546 388 Q 580 300 614 388 Q 580 348 546 388 Z'
  },
  joyArc: {
    clipLeft: 'M 446 388 Q 480 300 514 388 Q 480 348 446 388 Z',
    clipRight: 'M 546 388 Q 580 300 614 388 Q 580 348 546 388 Z'
  },
  arrowsIn: {
    clipLeft: 'M 452 326 L 498 365 L 452 404 L 470 418 L 514 365 L 470 312 Z',
    clipRight: 'M 608 326 L 562 365 L 608 404 L 590 418 L 546 365 L 590 312 Z',
  },
  arrowsOut: {
    clipLeft: 'M 514 326 L 468 365 L 514 404 L 496 418 L 452 365 L 496 312 Z',
    clipRight: 'M 546 326 L 592 365 L 546 404 L 564 418 L 608 365 L 564 312 Z',
  },
  dots: {
    clipLeft: 'M 470 365 A 10 10 0 1 0 490 365 A 10 10 0 1 0 470 365',
    clipRight: 'M 570 365 A 10 10 0 1 0 590 365 A 10 10 0 1 0 570 365',
  },
  sad: {
    clipLeft: 'M 448 365 A 32 32 0 1 0 512 365 A 32 32 0 1 0 448 365 M 460 360 H 500 V 370 H 460 Z M 468 384 H 492 V 394 H 468 Z',
    clipRight: 'M 548 365 A 32 32 0 1 0 612 365 A 32 32 0 1 0 548 365 M 560 360 H 600 V 370 H 560 Z M 568 384 H 592 V 394 H 568 Z',
  },
  love: {
    clipLeft: 'M 480 346 C 480 326 452 326 452 352 C 452 380 480 404 480 404 C 480 404 508 380 508 352 C 508 326 480 326 480 346 Z',
    clipRight: 'M 580 346 C 580 326 552 326 552 352 C 552 380 580 404 580 404 C 580 404 608 380 608 352 C 608 326 580 326 580 346 Z',
  },
  confused: {
    clipLeft: 'M 470 348 A 8 8 0 1 0 486 348 A 8 8 0 1 0 470 348 M 474 374 A 8 8 0 1 0 490 374 A 8 8 0 1 0 474 374',
    clipRight: 'M 570 348 A 8 8 0 1 0 586 348 A 8 8 0 1 0 570 348 M 574 374 A 8 8 0 1 0 590 374 A 8 8 0 1 0 574 374',
  },
  smirk: {
    clipLeft: 'M 446 365 C 446 355 458 340 480 340 C 502 340 514 355 514 365 C 514 380 498 392 480 392 C 462 392 446 380 446 365 Z',
    clipRight: 'M 552 360 Q 580 348 608 356 V 376 Q 580 386 552 374 Z',
  },
  puzzled: {
    clipLeft: 'M 452 365 Q 480 326 508 365 Q 480 404 452 365 Z',
    clipRight: 'M 546 365 Q 580 306 614 365 Q 580 424 546 365 Z',
  },
  unimpressed: {
    clipLeft: 'M 450 362 H 510 V 372 H 450 Z',
    clipRight: 'M 550 362 H 610 V 372 H 550 Z',
  },
  skeptical: {
    clipLeft: 'M 450 360 Q 480 350 510 360 Q 480 376 450 360 Z',
    clipRight: 'M 546 348 Q 580 316 614 348 Q 580 414 546 348 Z',
  },
  determined: {
    clipLeft: 'M 450 358 Q 488 386 512 386 V 402 Q 480 406 450 400 Z',
    clipRight: 'M 548 386 Q 572 386 610 358 V 400 Q 580 406 548 402 Z',
  },
  dazzled: {
    clipLeft: 'M 480 306 L 516 365 L 480 424 L 444 365 Z',
    clipRight: 'M 580 306 L 616 365 L 580 424 L 544 365 Z',
  },
  disgusted: {
    clipLeft: 'M 448 365 Q 480 350 512 372 Q 480 388 448 365 Z',
    clipRight: 'M 548 372 Q 580 350 612 365 Q 580 388 548 372 Z',
  },
  panicked: {
    clipLeft: 'M 466 358 A 14 14 0 1 1 494 358 A 14 14 0 1 1 466 358',
    clipRight: 'M 566 358 A 14 14 0 1 1 594 358 A 14 14 0 1 1 566 358',
  },
  dreamy: {
    clipLeft: 'M 448 365 C 448 337 462 316 480 316 C 498 316 512 337 512 365 C 512 393 498 414 480 414 C 462 414 448 393 448 365 Z',
    clipRight: 'M 548 365 C 548 337 562 316 580 316 C 598 316 612 337 612 365 C 612 393 598 414 580 414 C 562 414 548 393 548 365 Z',
  },
  mischievous: {
    clipLeft: 'M 450 360 Q 480 338 510 360 V 374 Q 480 384 450 372 Z',
    clipRight: 'M 552 360 Q 580 318 612 364 L 606 378 Q 580 350 552 372 Z',
  },
  amazed: {
    clipLeft: 'M 440 365 A 40 50 0 1 1 520 365 A 40 50 0 1 1 440 365',
    clipRight: 'M 540 365 A 40 50 0 1 1 620 365 A 40 50 0 1 1 540 365',
  },
  electronic: {
    clipLeft: 'M 448 360 H 512 V 372 H 448 Z M 448 348 H 512 V 352 H 448 Z',
    clipRight: 'M 548 360 H 612 V 372 H 548 Z M 548 348 H 612 V 352 H 548 Z',
  },
  targeting: {
    clipLeft: 'M 448 365 C 448 337 462 314 480 314 C 498 314 512 337 512 365 C 512 393 498 416 480 416 C 462 416 448 393 448 365 Z M 468 365 A 12 12 0 1 1 492 365 A 12 12 0 1 1 468 365',
    clipRight: 'M 548 365 C 548 337 562 314 580 314 C 598 314 612 337 612 365 C 612 393 598 416 580 416 C 562 416 548 393 548 365 Z M 568 365 A 12 12 0 1 1 592 365 A 12 12 0 1 1 568 365',
  },
  melancholy: {
    clipLeft: 'M 448 368 Q 480 354 512 370 L 510 382 Q 480 370 448 380 Z',
    clipRight: 'M 548 370 Q 580 354 612 368 L 610 380 Q 580 370 548 382 Z',
  },
  raging: {
    clipLeft: 'M 450 338 L 512 365 L 510 404 L 450 396 Z',
    clipRight: 'M 550 365 L 612 338 L 610 396 L 550 404 Z',
  },
  sassy: {
    clipLeft: 'M 448 365 Q 480 316 512 365 V 382 Q 480 340 448 382 Z',
    clipRight: 'M 548 365 Q 580 306 612 365 V 382 Q 580 334 548 382 Z',
  },
  shy: {
    clipLeft: 'M 464 365 A 20 20 0 1 0 504 365 A 20 20 0 1 0 464 365',
    clipRight: 'M 564 365 A 20 20 0 1 0 604 365 A 20 20 0 1 0 564 365',
  },
  playful: {
    clipLeft: 'M 446 372 Q 480 308 514 372 Q 480 430 446 372 Z',
    clipRight: 'M 546 372 Q 580 352 614 372 Q 580 324 546 372 Z',
  },
  analytical: {
    clipLeft: 'M 448 363 H 512 V 367 H 448 Z',
    clipRight: 'M 548 363 H 612 V 367 H 548 Z',
  },
  grumpy: {
    clipLeft: 'M 450 352 L 512 378 L 510 400 L 450 392 Z',
    clipRight: 'M 550 378 L 612 352 L 610 392 L 550 400 Z',
  },
  zen: {
    clipLeft: 'M 458 365 Q 480 378 502 365 L 502 371 Q 480 384 458 371 Z',
    clipRight: 'M 558 365 Q 580 378 602 365 L 602 371 Q 580 384 558 371 Z',
  },
  // --- Kiro-only signature emotion shapes ---
  sparkleEyes: {
    clipLeft: 'M 480 320 L 490 355 L 520 365 L 490 375 L 480 410 L 470 375 L 440 365 L 470 355 Z',
    clipRight: 'M 580 320 L 590 355 L 620 365 L 590 375 L 580 410 L 570 375 L 540 365 L 570 355 Z',
  },
  peekLeft: {
    clipLeft: 'M 450 365 C 450 340 459 320 480 320 C 501 320 510 340 510 365 C 510 390 501 410 480 410 C 459 410 450 390 450 365 Z',
    clipRight: 'M 550 362 Q 580 356 610 362 V 370 Q 580 378 550 370 Z',
  },
  peekRight: {
    clipLeft: 'M 450 362 Q 480 356 510 362 V 370 Q 480 378 450 370 Z',
    clipRight: 'M 550 365 C 550 340 559 320 580 320 C 601 320 610 340 610 365 C 610 390 601 410 580 410 C 559 410 550 390 550 365 Z',
  },
  squint: {
    clipLeft: 'M 450 363 Q 480 358 510 363 Q 480 372 450 367 Z',
    clipRight: 'M 550 363 Q 580 358 610 363 Q 580 372 550 367 Z',
  },
  wideEyed: {
    clipLeft: 'M 438 365 A 42 52 0 1 1 522 365 A 42 52 0 1 1 438 365',
    clipRight: 'M 538 365 A 42 52 0 1 1 622 365 A 42 52 0 1 1 538 365',
  },
  crossEyed: {
    clipLeft: 'M 492 365 A 18 24 0 1 1 528 365 A 18 24 0 1 1 492 365',
    clipRight: 'M 532 365 A 18 24 0 1 1 568 365 A 18 24 0 1 1 532 365',
  },
  upsideEyes: {
    clipLeft: 'M 450 365 Q 450 410 480 410 Q 510 410 510 365 L 480 348 Z',
    clipRight: 'M 550 365 Q 550 410 580 410 Q 610 410 610 365 L 580 348 Z',
  },
};
/**
 * Data-driven animation configs for KiroFace.
 *
 * Mirrors the pattern in animationConfigs.ts (used by CurioFace) but with
 * KiroFace-specific refs and behaviors.
 */

export interface KiroAnimationRefs {
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
  // -- Kiro-specific ghost-themed refs --
  spectralGlowRef: React.RefObject<SVGGElement | null>;
  sparklesRef: React.RefObject<SVGGElement | null>;
  ufoBeamRef: React.RefObject<SVGGElement | null>;
  devilHornsRef: React.RefObject<SVGGElement | null>;
  ghostBodyRef: React.RefObject<SVGGElement | null>;
}

export interface KiroAnimationContext {
  refs: KiroAnimationRefs;
  setEmotion: (emotion: string) => void;
  triggerAction: (action: 'nod' | 'bob', duration?: number) => void;
  targetEyeRef: React.MutableRefObject<{ x: number; y: number }>;
  currentModeRef: React.MutableRefObject<string>;
  currentEmotionRef: React.MutableRefObject<string>;
  trackInterval: (id: number) => number;
  trackTimeout: (callback: () => void, delay: number) => number;
}

// -- Helpers --

function scheduleTimeout(ctx: KiroAnimationContext, callback: () => void, delay: number) {
  return ctx.trackTimeout(callback, delay);
}

function resetToIdle(ctx: KiroAnimationContext) {
  if (ctx.currentModeRef.current === 'idle' && ctx.currentEmotionRef.current !== 'sleepy') {
    ctx.setEmotion('idle');
  }
}

function hideEyes(ctx: KiroAnimationContext, duration: number) {
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

function toggleDetail(ctx: KiroAnimationContext, ref: React.RefObject<SVGElement | null>, duration: number) {
  showRef(ref);
  scheduleTimeout(ctx, () => hideRef(ref), duration);
}

// -- Registry --

type AnimRunner = (ctx: KiroAnimationContext) => void;
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

// ================================================================
// Ghost-themed unique Kiro animations (IDs 121-140).
// These are signature flourishes that should feel distinctly
// spectral/ethereal and are unique to the Kiro face.
// ================================================================

// 121: Phase fade -- whole face gently fades out and back in
reg(121, (ctx) => {
  const body = ctx.refs.ghostBodyRef;
  const eyes = ctx.refs.mainEyesRef;
  if (body.current) {
    body.current.style.transition = 'opacity 0.7s ease-in-out';
    body.current.style.opacity = '0.15';
  }
  if (eyes.current) {
    eyes.current.style.transition = 'opacity 0.7s ease-in-out';
    eyes.current.style.opacity = '0';
  }
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.opacity = '1';
    if (eyes.current) eyes.current.style.opacity = '1';
  }, 1400);
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transition = '';
    if (eyes.current) eyes.current.style.transition = 'opacity 0.3s';
    resetToIdle(ctx);
  }, 2300);
});

// 122: Spectral glow -- soft purple aura pulses around face
reg(122, (ctx) => {
  ctx.setEmotion('dreamy');
  showRef(ctx.refs.spectralGlowRef);
  scheduleTimeout(ctx, () => {
    hideRef(ctx.refs.spectralGlowRef);
    resetToIdle(ctx);
  }, 3500);
});

// 123: Boo! -- surprise pop with quick scale punch
reg(123, (ctx) => {
  ctx.setEmotion('surprised');
  const body = ctx.refs.ghostBodyRef;
  if (body.current) {
    body.current.style.transition = 'transform 0.15s ease-out';
    body.current.style.transform = 'scale(1.18)';
  }
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transform = 'scale(1)';
  }, 160);
  scheduleTimeout(ctx, () => {
    if (body.current) {
      body.current.style.transition = '';
      body.current.style.transform = '';
    }
    resetToIdle(ctx);
  }, 1400);
});

// 124: Cross-eyed -- eyes converge inward comically
reg(124, (ctx) => {
  ctx.setEmotion('dots');
  ctx.targetEyeRef.current = { x: 55, y: 0 };
  scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 1500);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 2000);
});

// 125: Ghost drift -- gentle left/right sway
reg(125, (ctx) => {
  ctx.setEmotion('dreamy');
  const positions = [
    { x: -35, y: 0 }, { x: 0, y: -10 }, { x: 35, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 },
  ];
  let i = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    if (i >= positions.length || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.targetEyeRef.current = { x: 0, y: 0 };
      resetToIdle(ctx);
      return;
    }
    ctx.targetEyeRef.current = positions[i++];
  }, 700));
});

// 126: Pop eyes -- rapid amazed pulses
reg(126, (ctx) => {
  ctx.setEmotion('amazed');
  scheduleTimeout(ctx, () => ctx.setEmotion('dots'), 250);
  scheduleTimeout(ctx, () => ctx.setEmotion('amazed'), 450);
  scheduleTimeout(ctx, () => ctx.setEmotion('dots'), 650);
  scheduleTimeout(ctx, () => ctx.setEmotion('amazed'), 850);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1700);
});

// 127: Wavy eyes -- squish/stretch oscillation without touching emotion shape
reg(127, (ctx) => {
  ctx.setEmotion('happy');
  const body = ctx.refs.ghostBodyRef;
  let t = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    t += 0.4;
    if (body.current) {
      const sx = 1 + Math.sin(t) * 0.06;
      const sy = 1 + Math.cos(t * 1.3) * 0.06;
      body.current.style.transition = 'none';
      body.current.style.transform = `scale(${sx}, ${sy})`;
    }
    if (t > 6 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      if (body.current) {
        body.current.style.transition = 'transform 0.4s ease-out';
        body.current.style.transform = '';
      }
      resetToIdle(ctx);
    }
  }, 60));
});

// 128: Melting -- eyes droop, face sags down
reg(128, (ctx) => {
  ctx.setEmotion('melancholy');
  ctx.targetEyeRef.current = { x: 0, y: 40 };
  scheduleTimeout(ctx, () => ctx.setEmotion('sleepy'), 1500);
  scheduleTimeout(ctx, () => { ctx.targetEyeRef.current = { x: 0, y: 0 }; }, 3000);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 3600);
});

// 129: Love burst -- heart eyes + floating confetti hearts
reg(129, (ctx) => {
  hideEyes(ctx, 3500);
  showRef(ctx.refs.heartsRef);
  showRef(ctx.refs.confettiRef);
  ctx.triggerAction('bob', 1200);
  scheduleTimeout(ctx, () => {
    hideRef(ctx.refs.heartsRef);
    hideRef(ctx.refs.confettiRef);
  }, 3500);
});

// 130: Sparkle eyes -- star twinkles layered over eyes
reg(130, (ctx) => {
  ctx.setEmotion('dazzled');
  showRef(ctx.refs.sparklesRef);
  scheduleTimeout(ctx, () => {
    hideRef(ctx.refs.sparklesRef);
    resetToIdle(ctx);
  }, 3500);
});

// 131: UFO beam -- purple tractor beam descends over the face
reg(131, (ctx) => {
  ctx.setEmotion('surprised');
  const beam = ctx.refs.ufoBeamRef;
  if (beam.current) {
    beam.current.style.transition = 'opacity 0.4s, transform 1s ease-out';
    beam.current.style.opacity = '1';
    beam.current.style.transform = 'translateY(0px)';
  }
  scheduleTimeout(ctx, () => {
    if (beam.current) {
      beam.current.style.opacity = '0';
      beam.current.style.transform = 'translateY(-120px)';
    }
    resetToIdle(ctx);
  }, 3500);
});

// 132: Spiral eyes -- tight spiral around the eye center
reg(132, (ctx) => {
  ctx.setEmotion('dazzled');
  let t = 0;
  const ivl = ctx.trackInterval(window.setInterval(() => {
    t += 0.4;
    const r = 20 + Math.min(t, 6) * 3;
    ctx.targetEyeRef.current = { x: Math.cos(t * 2) * r, y: Math.sin(t * 2) * r };
    if (t > 8 || ctx.currentModeRef.current !== 'idle') {
      clearInterval(ivl);
      ctx.targetEyeRef.current = { x: 0, y: 0 };
      resetToIdle(ctx);
    }
  }, 50));
});

// 133: Glitch teleport -- fade, shift, fade back
reg(133, (ctx) => {
  ctx.setEmotion('digitized');
  const body = ctx.refs.ghostBodyRef;
  if (body.current) {
    body.current.style.transition = 'opacity 0.15s, transform 0.15s';
    body.current.style.opacity = '0';
    body.current.style.transform = 'translateX(-30px)';
  }
  scheduleTimeout(ctx, () => {
    if (body.current) {
      body.current.style.transform = 'translateX(30px)';
      body.current.style.opacity = '1';
    }
  }, 180);
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transform = 'translateX(0)';
  }, 500);
  scheduleTimeout(ctx, () => {
    if (body.current) {
      body.current.style.transition = '';
      body.current.style.transform = '';
    }
    resetToIdle(ctx);
  }, 1400);
});

// 134: Devil horns -- brief mischievous horns
reg(134, (ctx) => {
  ctx.setEmotion('mischievous');
  showRef(ctx.refs.devilHornsRef);
  ctx.triggerAction('nod', 500);
  scheduleTimeout(ctx, () => {
    hideRef(ctx.refs.devilHornsRef);
    resetToIdle(ctx);
  }, 2800);
});

// 135: Triple blink -- quick three-blink combo via opacity
reg(135, (ctx) => {
  const eyes = ctx.refs.mainEyesRef;
  const blink = (delay: number) => {
    scheduleTimeout(ctx, () => {
      if (eyes.current) eyes.current.style.opacity = '0';
    }, delay);
    scheduleTimeout(ctx, () => {
      if (eyes.current) eyes.current.style.opacity = '1';
    }, delay + 140);
  };
  blink(0);
  blink(300);
  blink(600);
  scheduleTimeout(ctx, () => resetToIdle(ctx), 1100);
});

// 136: Peekaboo -- hide behind, then pop back with surprise
reg(136, (ctx) => {
  const body = ctx.refs.ghostBodyRef;
  if (body.current) {
    body.current.style.transition = 'transform 0.5s ease-in, opacity 0.5s ease-in';
    body.current.style.transform = 'translateY(220px) scale(0.4)';
    body.current.style.opacity = '0.3';
  }
  scheduleTimeout(ctx, () => {
    ctx.setEmotion('surprised');
    if (body.current) {
      body.current.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s';
      body.current.style.transform = 'translateY(0) scale(1.1)';
      body.current.style.opacity = '1';
    }
  }, 700);
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transform = '';
  }, 1200);
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transition = '';
    resetToIdle(ctx);
  }, 1800);
});

// 137: Playful tilt -- lean left then right with curious emotion
reg(137, (ctx) => {
  ctx.setEmotion('curious');
  const body = ctx.refs.ghostBodyRef;
  if (body.current) body.current.style.transition = 'transform 0.5s ease-in-out';
  const setRot = (deg: number) => {
    if (body.current) body.current.style.transform = `rotate(${deg}deg)`;
  };
  setRot(-8);
  scheduleTimeout(ctx, () => setRot(8), 600);
  scheduleTimeout(ctx, () => setRot(0), 1200);
  scheduleTimeout(ctx, () => {
    if (body.current) { body.current.style.transition = ''; body.current.style.transform = ''; }
    resetToIdle(ctx);
  }, 1800);
});

// 138: Heartbeat -- quick double pulse, heart emotion
reg(138, (ctx) => {
  ctx.setEmotion('heartEyes');
  const body = ctx.refs.ghostBodyRef;
  const pulse = (delay: number) => {
    scheduleTimeout(ctx, () => {
      if (body.current) {
        body.current.style.transition = 'transform 0.15s ease-out';
        body.current.style.transform = 'scale(1.08)';
      }
    }, delay);
    scheduleTimeout(ctx, () => {
      if (body.current) body.current.style.transform = 'scale(1)';
    }, delay + 160);
  };
  pulse(0);
  pulse(400);
  scheduleTimeout(ctx, () => {
    if (body.current) { body.current.style.transition = ''; body.current.style.transform = ''; }
    resetToIdle(ctx);
  }, 2000);
});

// 139: Spooky squeeze -- quick vertical squish
reg(139, (ctx) => {
  ctx.setEmotion('excited');
  const body = ctx.refs.ghostBodyRef;
  if (body.current) {
    body.current.style.transition = 'transform 0.25s ease-out';
    body.current.style.transform = 'scale(1.15, 0.85)';
  }
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transform = 'scale(0.92, 1.12)';
  }, 260);
  scheduleTimeout(ctx, () => {
    if (body.current) body.current.style.transform = 'scale(1)';
  }, 520);
  scheduleTimeout(ctx, () => {
    if (body.current) { body.current.style.transition = ''; body.current.style.transform = ''; }
    resetToIdle(ctx);
  }, 900);
});

// 140: Wiggle tail -- the bottom flicks back and forth (body rotate)
reg(140, (ctx) => {
  ctx.setEmotion('playful');
  const body = ctx.refs.ghostBodyRef;
  if (body.current) body.current.style.transition = 'transform 0.12s ease-in-out';
  let i = 0;
  const seq = [-4, 4, -4, 4, -2, 2, 0];
  const ivl = ctx.trackInterval(window.setInterval(() => {
    if (i >= seq.length) {
      clearInterval(ivl);
      if (body.current) { body.current.style.transition = ''; body.current.style.transform = ''; }
      resetToIdle(ctx);
      return;
    }
    if (body.current) body.current.style.transform = `rotate(${seq[i++]}deg)`;
  }, 110));
});


const RANDOM_EMOTIONS = [
  'happy', 'curious', 'content', 'idle', 'joyArc', 'arrowsIn', 'arrowsOut',
  'dots', 'glee', 'loveMail', 'puzzled', 'unimpressed', 'skeptical',
  'determined', 'dazzled', 'disgusted', 'panicked', 'dreamy', 'mischievous',
  'amazed', 'electronic', 'targeting', 'melancholy', 'raging', 'sassy',
  'shy', 'playful', 'analytical', 'grumpy', 'zen',
];

function runRandomEmotion(ctx: KiroAnimationContext) {
  const selected = RANDOM_EMOTIONS[Math.floor(Math.random() * RANDOM_EMOTIONS.length)];
  ctx.setEmotion(selected);
  if (selected === 'puzzled') toggleDetail(ctx,ctx.refs.thinkingRef, 3000);
  if (selected === 'analytical') toggleDetail(ctx,ctx.refs.analyticalRef, 4000);
  if (selected === 'raging') toggleDetail(ctx,ctx.refs.rangingRef, 3000);
  if (selected === 'shy' || selected === 'loveMail') toggleDetail(ctx,ctx.refs.blushRef, 3000);
  if (Math.random() > 0.5) ctx.triggerAction(Math.random() > 0.5 ? 'nod' : 'bob');
  scheduleTimeout(ctx, () => resetToIdle(ctx), 2500);
}

// Register all unregistered IDs in the 71-140 range with fallback random emotion
for (let i = 71; i <= 140; i++) {
  if (!registry.has(i)) reg(i, runRandomEmotion);
}

// -- Public API --

export function runKiroAnimation(animType: number, ctx: KiroAnimationContext): boolean {
  const runner = registry.get(animType);
  if (runner) { runner(ctx); return true; }
  return false;
}

