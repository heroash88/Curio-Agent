import { useEffect, useRef } from 'react';

/**
 * A hook that allows a container to be horizontally scrolled via the mouse wheel
 * or by clicking and dragging.
 */
export function useDraggableScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let startX: number;
    let scrollLeft: number;
    let isDragging = false;

    const handlePointerDown = (e: PointerEvent) => {
      // Only handle primary button (left click)
      if (e.button !== 0) return;
      isDown = true;
      isDragging = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      // Optional: visual cue, but might override children. We'll leave it out to keep it clean.
    };

    const handlePointerLeave = () => {
      isDown = false;
    };

    const handlePointerUp = () => {
      isDown = false;
      // We don't reset isDragging here immediately because click capture happens after pointerup.
      // We let the click capture handler reset it or just reset it on next pointerdown.
      setTimeout(() => {
        isDragging = false;
      }, 0);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      
      if (Math.abs(walk) > 5) {
        isDragging = true;
      }

      if (isDragging) {
        // Prevent default to avoid text selection while dragging
        e.preventDefault();
        el.scrollLeft = scrollLeft - walk;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Convert vertical scroll to horizontal scroll if there's no horizontal scroll intent
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) {
        // Only prevent default if we have scrollable area
        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        if (maxScrollLeft > 0) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      if (isDragging) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', handlePointerDown, { capture: true });
    el.addEventListener('pointerleave', handlePointerLeave);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointermove', handlePointerMove, { passive: false });
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('click', handleClickCapture, { capture: true });

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      el.removeEventListener('pointerleave', handlePointerLeave);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('click', handleClickCapture, { capture: true });
    };
  }, []);

  return ref;
}
