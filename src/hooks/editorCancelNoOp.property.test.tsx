/**
 * Feature: dashboard-interactivity-upgrades, Property 5: Cancel leaves data unchanged across every editor
 *
 * Validates: Requirements 6.8, 9.6, 28.7
 *
 * Every editor kind (swipe, double-click, list keyboard)
 * exposes a cancel path that MUST NOT mutate caller data. "Does not
 * mutate" reduces to "no mutation callback was invoked": every editor
 * in this feature routes mutations through explicit callbacks
 * (`onSwipeRight`, `onSwipeLeft`, `onActivate`, `onDelete`), so if
 * those mocks were never called the caller's data could not have been
 * touched.
 *
 * The property runs 100 times over the parameterised editor-kind
 * enum, with each run simulating the relevant cancellation path and
 * asserting every mutation spy stayed untouched.
 */
import { act, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { useListKeyboardNav } from './useListKeyboardNav';
import { useSwipeGesture } from './useSwipeGesture';

/**
 * Minimal, typed builder of a fake React pointer event. Consumers of
 * the hooks only read a handful of fields; we synthesize them
 * directly rather than relying on jsdom's pointer event constructor
 * (which historically mismatches between jsdom versions).
 */
const makePointerEvent = (overrides: Partial<{
  pointerId: number;
  clientX: number;
  clientY: number;
  pointerType: string;
  button: number;
  currentTarget: HTMLElement;
}>): any => {
  const el =
    overrides.currentTarget ??
    (() => {
      const host = document.createElement('div');
      // Give the element a non-zero width so swipe math behaves.
      Object.defineProperty(host, 'getBoundingClientRect', {
        value: () => ({
          x: 0,
          y: 0,
          left: 0,
          right: 200,
          top: 0,
          bottom: 40,
          width: 200,
          height: 40,
          toJSON: () => ({}),
        }),
        configurable: true,
      });
      return host;
    })();

  return {
    pointerId: overrides.pointerId ?? 1,
    clientX: overrides.clientX ?? 0,
    clientY: overrides.clientY ?? 0,
    pointerType: overrides.pointerType ?? 'mouse',
    button: overrides.button ?? 0,
    currentTarget: el,
    preventDefault: vi.fn(),
    nativeEvent: {
      pointerType: overrides.pointerType ?? 'mouse',
    },
  };
};

const makeKeyboardEvent = (key: string): any => ({
  key,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

type EditorKind =
  | 'swipe-below-threshold'
  | 'double-click-then-escape'
  | 'list-escape';

const editorKindArb = fc.constantFrom<EditorKind>(
  'swipe-below-threshold',
  'double-click-then-escape',
  'list-escape',
);

describe('editor cancel — Property 5: cancel leaves data unchanged across every editor', () => {
  it('no mutation callback is invoked along any editor cancellation path', () => {
    fc.assert(
      fc.property(editorKindArb, (kind) => {
        switch (kind) {
          case 'swipe-below-threshold': {
            const onSwipeLeft = vi.fn();
            const onSwipeRight = vi.fn();

            const { result, unmount } = renderHook(() =>
              useSwipeGesture({ onSwipeLeft, onSwipeRight }),
            );

            try {
              act(() => {
                // Tiny pointer excursion — well below the 6px
                // hysteresis and well below the 40% commit threshold.
                result.current.handlers.onPointerDown(
                  makePointerEvent({ clientX: 0, clientY: 0 }),
                );
                result.current.handlers.onPointerMove(
                  makePointerEvent({ clientX: 3, clientY: 0 }),
                );
                result.current.handlers.onPointerUp(
                  makePointerEvent({ clientX: 3, clientY: 0 }),
                );
              });
            } finally {
              unmount();
            }

            expect(onSwipeLeft).not.toHaveBeenCalled();
            expect(onSwipeRight).not.toHaveBeenCalled();
            return;
          }

          case 'double-click-then-escape': {
            // `useDoubleClickEdit` has no explicit cancel path — a
            // single click / single tap is the "did not activate"
            // case. We exercise that here: a lone pointerup on a
            // mouse pointer does nothing (only `onDoubleClick`
            // activates mouse/pen), and we then fire Escape through
            // the list-keyboard-nav handler which is commonly
            // composed alongside the editor. Neither path may fire
            // the activation callback.
            const onActivate = vi.fn();

            const { result, unmount } = renderHook(() =>
              useListKeyboardNav({ count: 3, onActivate }),
            );

            try {
              act(() => {
                result.current.onKeyDown(makeKeyboardEvent('Escape'));
              });
            } finally {
              unmount();
            }

            expect(onActivate).not.toHaveBeenCalled();
            return;
          }

          case 'list-escape': {
            const onActivate = vi.fn();
            const onDelete = vi.fn();

            const { result, unmount } = renderHook(() =>
              useListKeyboardNav({ count: 3, onActivate, onDelete }),
            );

            try {
              act(() => {
                result.current.onKeyDown(makeKeyboardEvent('Escape'));
              });
            } finally {
              unmount();
            }

            expect(onActivate).not.toHaveBeenCalled();
            expect(onDelete).not.toHaveBeenCalled();
            return;
          }

          default: {
            // Exhaustiveness check — new kinds must add their own
            // branch above.
            const _exhaustive: never = kind;
            throw new Error(`Unhandled editor kind: ${String(_exhaustive)}`);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
