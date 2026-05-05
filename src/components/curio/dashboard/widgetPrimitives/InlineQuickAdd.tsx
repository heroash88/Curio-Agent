import React, { useCallback, useId, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import WidgetIconButton from './WidgetIconButton';

/**
 * InlineQuickAdd is the shared single-line quick-add input used by
 * Tasks, Reminders, Timers, Stocks, Weather Outlook, World Clock, and
 * Bookmarks widgets.
 *
 * Behavior:
 *
 * - Enter runs the supplied `parser` on the input text. When the parser
 *   returns a `{ parseError }`, the primitive renders an inline hint
 *   below the field and does not call `onSubmit`. When the parser
 *   returns a normal result, the primitive calls `onSubmit(parsed)` and
 *   clears the input.
 * - Escape clears the input and calls `onDismiss` (if provided).
 * - An optional shortcut hint (for example "Ctrl+N" or "Cmd+N") is
 *   rendered when `showShortcutHint === true`.
 *
 * The primitive is intentionally stateless about what "parsed" means so
 * every callsite can plug in its own parser (taskParser,
 * reminderParser, timerParser, stockSymbolParser, or anything custom).
 */

export interface InlineQuickAddProps<T> {
  placeholder: string;
  parser: (input: string) => T | { parseError: string };
  onSubmit: (parsed: T) => void;
  onDismiss?: () => void;
  /** Render a small "Ctrl+N" / "Cmd+N" hint next to the input. */
  showShortcutHint?: boolean;
  ariaLabel?: string;
  /** Render in a tighter vertical layout for narrow widget bodies. */
  compact?: boolean;
  className?: string;
}

const isMacLike = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
};

const shortcutLabel = (): string => (isMacLike() ? '⌘N' : 'Ctrl+N');

const isParseError = <T,>(
  result: T | { parseError: string },
): result is { parseError: string } =>
  typeof result === 'object' &&
  result !== null &&
  typeof (result as { parseError?: unknown }).parseError === 'string';

// `React.memo` does not play well with generic components, so we render
// the component directly and lean on the caller to memoize props when
// they care about re-render cost.
function InlineQuickAddImpl<T>({
  placeholder,
  parser,
  onSubmit,
  onDismiss,
  showShortcutHint = false,
  ariaLabel,
  compact = false,
  className = '',
}: InlineQuickAddProps<T>): React.ReactElement {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hintId = useId();
  const errorId = useId();

  const commit = useCallback(() => {
    const text = value.trim();
    if (text.length === 0) return;
    const parsed = parser(text);
    if (isParseError(parsed)) {
      setError(parsed.parseError);
      return;
    }
    setError(null);
    setValue('');
    onSubmit(parsed as T);
  }, [value, parser, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setValue('');
        setError(null);
        onDismiss?.();
      }
    },
    [commit, onDismiss],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
      if (error) setError(null);
    },
    [error],
  );

  const describedBy = error ? errorId : showShortcutHint ? hintId : undefined;

  return (
    <div
      data-widget-primitive="inline-quick-add"
      data-compact={compact ? 'true' : 'false'}
      className={`flex flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${className}`.trim()}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={`flex items-center gap-2 min-w-0 flex-1 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] ${
            compact ? 'px-3 py-1.5' : 'px-3.5 py-2'
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel ?? placeholder}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--ether-on-surface)] placeholder:text-[var(--ether-on-surface-variant)]"
          />
          {showShortcutHint ? (
            <kbd
              id={hintId}
              className="shrink-0 rounded border border-[var(--ether-glass-border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ether-on-surface-variant)]"
            >
              {shortcutLabel()}
            </kbd>
          ) : null}
        </div>
        <WidgetIconButton
          icon={<ChevronRight size={16} aria-hidden="true" />}
          ariaLabel="Add"
          tone="primary"
          compact
          disabled={value.trim().length === 0}
          onClick={commit}
        />
      </div>
      {error ? (
        <p
          id={errorId}
          role="status"
          className="text-xs text-[var(--ether-error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const InlineQuickAdd = InlineQuickAddImpl;
(InlineQuickAdd as React.FunctionComponent).displayName = 'InlineQuickAdd';

export default InlineQuickAdd;
