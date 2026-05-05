/**
 * DashboardCommandPalette — lazy-loaded modal for the dashboard command palette.
 *
 * Opened via Cmd+K / Ctrl+K from Dashboard.tsx. Renders as a portal to
 * document.body with focus trap, keyboard navigation, and debounced search.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { search, type CommandPaletteResult } from '../../../services/dashboardCommandPaletteService';
import { registerBuiltInSources } from '../../../services/dashboardCommandPaletteSources';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardCommandPaletteProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DashboardCommandPalette: React.FC<DashboardCommandPaletteProps> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommandPaletteResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Register built-in sources on first mount
  useEffect(() => {
    registerBuiltInSources();
  }, []);

  // Capture the previously focused element for focus restoration
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    // Focus the input on mount
    inputRef.current?.focus();

    return () => {
      // Restore focus on unmount
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setActiveIndex(0);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const searchResults = await search(query);
      setResults(searchResults);
      setActiveIndex(0);
    }, 150);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeItem = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleSelect = useCallback(
    (result: CommandPaletteResult) => {
      result.action();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
          event.preventDefault();
          if (results[activeIndex]) {
            handleSelect(results[activeIndex]);
          }
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [results, activeIndex, handleSelect, onClose],
  );

  // Focus trap: prevent Tab from leaving the modal
  const handleFocusTrap = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        // Keep focus on the input
        inputRef.current?.focus();
      }
    },
    [],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)' }}
      onClick={handleBackdropClick}
      onKeyDown={handleFocusTrap}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-[480px] rounded-xl overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'rgba(var(--ether-surface-rgb, 30 30 30), 0.85)',
          backdropFilter: 'blur(16px) saturate(1.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="p-3 border-b border-white/10">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search widgets, actions, catalog..."
            className="w-full bg-transparent text-[var(--ether-text,#fff)] placeholder:text-[var(--ether-text-muted,#888)] text-sm outline-none"
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Results list */}
        {results.length > 0 && (
          <div
            ref={listRef}
            className="max-h-[320px] overflow-y-auto p-1"
            role="listbox"
            aria-label="Search results"
          >
            {results.map((result, index) => (
              <button
                key={result.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  index === activeIndex
                    ? 'bg-[var(--ether-primary,#3b82f6)]/20 text-[var(--ether-text,#fff)]'
                    : 'text-[var(--ether-text,#fff)] hover:bg-white/5'
                }`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="font-medium">{result.label}</div>
                {result.description && (
                  <div className="text-xs text-[var(--ether-text-muted,#888)] mt-0.5 truncate">
                    {result.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.trim() && results.length === 0 && (
          <div className="p-4 text-center text-sm text-[var(--ether-text-muted,#888)]">
            No results found
          </div>
        )}

        {/* Hint when empty */}
        {!query.trim() && (
          <div className="p-4 text-center text-xs text-[var(--ether-text-muted,#888)]">
            Type to search widgets, actions, and catalog
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default DashboardCommandPalette;
