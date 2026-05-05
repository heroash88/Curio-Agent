import React from 'react';
import { GripVertical } from 'lucide-react';
import type { DragReorderRowBindings } from '../../../../hooks/useDragReorder';

export interface DragReorderHandleProps {
  /** Bindings returned from `useDragReorder().getRowBindings(index)`. */
  bindings: DragReorderRowBindings;
  /** Accessible label for the handle, e.g. "Reorder Buy groceries". */
  ariaLabel: string;
  /** Compact visual mode for small rows (12px icon). */
  compact?: boolean;
  /** Override outer classes. Useful for adding tone-specific spacing. */
  className?: string;
}

/**
 * Standalone drag handle for row-level reorder across list widgets.
 *
 * Rendered as a focusable `div` instead of a `button` so the row's
 * primary action (click target) keeps its role; pointer/keyboard
 * bindings attach to the handle only, which prevents swallowing
 * clicks on the row body.
 *
 * Invisible when `bindings` are the no-op bindings returned by
 * `useDragReorder` when the toggle is disabled.
 */
const DragReorderHandle: React.FC<DragReorderHandleProps> = ({
  bindings,
  ariaLabel,
  compact = false,
  className,
}) => {
  const iconSize = compact ? 12 : 14;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-grabbed={bindings['aria-grabbed']}
      data-drag-handle="true"
      data-dragging={bindings.isDragging ? 'true' : undefined}
      onPointerDown={bindings.onPointerDown}
      onKeyDown={bindings.onKeyDown}
      className={[
        // Absolutely positioned over the left edge of the parent row.
        // Uses group-hover/drag-row so only the immediate row's hover
        // reveals the handle (not an ancestor group).
        'absolute left-0 top-1/2 -translate-y-1/2 z-10',
        'flex items-center justify-center text-[var(--ether-on-surface-variant)] transition-opacity duration-150',
        // Hidden by default, visible on row hover or active drag
        'opacity-0 group-hover/drag-row:opacity-50 group-focus-within/drag-row:opacity-50',
        'hover:!opacity-80 focus-visible:!opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-primary)]/40',
        'data-[dragging=true]:!opacity-90',
        compact ? 'h-6 w-5 -ml-1 rounded' : 'h-7 w-6 -ml-1.5 rounded-md',
        "cursor-[grab] data-[dragging=true]:cursor-[grabbing]",
        className || '',
      ].filter(Boolean).join(' ')}
      style={{ touchAction: 'none' }}
    >
      <GripVertical size={iconSize} aria-hidden />
    </div>
  );
};

export default DragReorderHandle;
