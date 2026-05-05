import React, { useCallback, useState } from 'react';
import { Bookmark, Check, ExternalLink, Globe, Plus, Trash2, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import {
  useDashboardDropTarget,
  useDropIntentTarget,
} from '../../../hooks/useDashboardIntents';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { getBookmarks, saveBookmarks, addBookmark, deleteBookmark } from '../../../services/bookmarksPersistence';
import type { BookmarkItem } from '../../../services/bookmarksPersistence';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { setDashboardDragPayload } from '../../../services/dashboardIntents';
import { dashboardToastBus } from '../../../services/dashboardToastBus';
import { useSettingsStorageValue } from '../../../utils/settingsStorage';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, InlineQuickAdd, WidgetBody, WidgetEmptyState } from './widgetPrimitives';

const normalizeUrl = (url: string) => {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed)
    ? trimmed.replace(/^https?:\/\//i, (protocol) => protocol.toLowerCase())
    : `https://${trimmed}`;
};

const getBookmarkHost = (url: string) => {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0] || url;
  }
};

const getBookmarkNameFromUrl = (url: string) => {
  const host = getBookmarkHost(url);
  const firstSegment = host.split('.')[0] || host;
  return firstSegment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getFaviconUrl = (url: string) => {
  try {
    const domain = new URL(normalizeUrl(url)).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return null;
  }
};

// Inline parser for the quick-add primitive. Accepts either a bare URL
// (`example.com`, `https://...`) or `<name> <url>` where any token that
// looks URL-ish becomes the URL and the rest joins into a friendly
// name. Keeping the parser inline (rather than its own module) matches
// how Bookmarks treats URLs as a free-form single-field input.
interface BookmarkQuickAddResult {
  url: string;
  name: string;
}
interface BookmarkParseError {
  parseError: string;
}
const URL_LIKE = /^(?:https?:\/\/|www\.)|\.[a-z]{2,}/i;
const parseBookmarkQuickAdd = (
  input: string,
): BookmarkQuickAddResult | BookmarkParseError => {
  const trimmed = input.trim();
  if (!trimmed) return { parseError: 'URL required' };
  const parts = trimmed.split(/\s+/);
  const urlPart = parts.find((p) => URL_LIKE.test(p));
  if (!urlPart) return { parseError: 'Include a URL or domain' };
  const name = parts.filter((p) => p !== urlPart).join(' ');
  return { url: urlPart, name };
};

interface BookmarksWidgetProps {
  widget: DashboardWidget;
}

const BookmarksWidget: React.FC<BookmarksWidgetProps> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const bookmarks = useSettingsStorageValue<BookmarkItem[]>(getBookmarks, []);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const boardInteractivity = useDashboardInteractivitySettings();
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );
  const inlineQuickAddEnabled = effectiveToggle(
    'inlineQuickAddEnabled',
    boardInteractivity,
    widget.config,
  );
  const dropIntentsEnabled = effectiveToggle(
    'dropIntentsEnabled',
    boardInteractivity,
    widget.config,
  );
  const handleBookmarkDrop = useCallback(
    (payload: { payload: Record<string, unknown> }) => {
      const title = payload.payload.title;
      const url = payload.payload.url;
      if (typeof url !== 'string' || !url.trim()) return;
      const name = typeof title === 'string' && title.trim()
        ? title.trim()
        : getBookmarkNameFromUrl(url);
      // Avoid duplicates
      const existing = getBookmarks();
      if (existing.some((b) => b.url === normalizeUrl(url))) {
        dashboardToastBus.show({
          id: `bookmark-dup-${widget.id}`,
          label: `"${name}" is already bookmarked`,
        });
        return;
      }
      addBookmark(name, normalizeUrl(url));
      dashboardToastBus.show({
        id: `bookmark-added-${widget.id}`,
        label: `Bookmarked "${name}"`,
      });
    },
    [widget.id],
  );
  useDropIntentTarget(widget.id, handleBookmarkDrop, {
    enabled: dropIntentsEnabled,
  });
  const dropBindings = useDashboardDropTarget({
    widgetId: widget.id,
    widgetType: widget.type,
    enabled: dropIntentsEnabled,
  });
  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<BookmarkItem>(
    bookmarks,
    (next) => saveBookmarks(next),
    {
      keyExtractor: (item) => item.id,
      enabled: dragReorderEnabled,
    },
  );

  const handleAdd = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const url = newUrl.trim();
    if (!url) return;

    addBookmark(newName.trim() || getBookmarkNameFromUrl(url), normalizeUrl(url));
    setNewName('');
    setNewUrl('');
    setIsAdding(false);
  };

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="teal" widget={widget}>
        <div className="flex flex-1 items-center justify-center">
          <Bookmark size={24} className="text-[var(--ether-teal)]" />
          <span className="absolute bottom-2 text-[10px] font-bold opacity-40">{bookmarks.length}</span>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Bookmarks"
      icon={<Bookmark size={14} />}
      accent="teal"
      rightSlot={
        inlineQuickAddEnabled ? undefined : (
          <button
            type="button"
            aria-label={isAdding ? 'Close bookmark form' : 'Add bookmark'}
            aria-expanded={isAdding}
            onClick={() => setIsAdding(!isAdding)}
            className={`dashboard-widget-control-button ${isAdding ? 'dashboard-widget-control-button-active' : ''}`}
          >
            {isAdding ? <X size={14} /> : <Plus size={14} />}
          </button>
        )
      }
    >
      <div
        className="flex h-full min-h-0 flex-col gap-2"
        onDragOver={dropBindings.onDragOver}
        onDrop={dropBindings.onDrop}
      >
        <div role="status" aria-live="polite" className="sr-only">
          {dragAnnouncement}
        </div>
        {inlineQuickAddEnabled ? (
          <InlineQuickAdd
            placeholder="Add bookmark (e.g. Docs https://docs.example.com)"
            parser={parseBookmarkQuickAdd}
            onSubmit={(parsed) =>
              addBookmark(
                parsed.name.trim() || getBookmarkNameFromUrl(parsed.url),
                normalizeUrl(parsed.url),
              )
            }
            ariaLabel="Add bookmark"
            compact
          />
        ) : isAdding ? (
          <form
            className="grid gap-1.5 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-2 ether-widget-enter"
            onSubmit={handleAdd}
          >
            <input
              aria-label="Bookmark name"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="min-h-8 rounded-lg border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] px-2 text-[11px] text-[var(--ether-on-surface)] outline-none transition-colors placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-teal)]/60"
            />
            <div className="flex gap-1.5">
              <input
                aria-label="Bookmark URL"
                placeholder="url.com"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="min-h-8 min-w-0 flex-1 rounded-lg border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] px-2 text-[11px] text-[var(--ether-on-surface)] outline-none transition-colors placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-teal)]/60"
              />
              <button
                type="submit"
                aria-label="Save bookmark"
                disabled={!newUrl.trim()}
                className="dashboard-widget-control-button dashboard-widget-control-button-primary shrink-0"
              >
                <Check size={14} />
              </button>
            </div>
          </form>
        ) : null}

        <WidgetBody
          data-testid="bookmark-list"
          gap="sm"
          scroll="y"
        >
          {bookmarks.length === 0 ? (
            <WidgetEmptyState
              icon={<Globe size={24} />}
              title="No bookmarks"
            />
          ) : (
            bookmarks.map((b, index) => {
              const faviconUrl = getFaviconUrl(b.url);
              const host = getBookmarkHost(b.url);
              const rowBindings = getRowBindings(index);

              return (
                <div
                  key={b.id}
                  data-testid="bookmark-row"
                  data-dragging={rowBindings.isDragging ? 'true' : undefined}
                  draggable
                  onDragStart={(event) => {
                    // Tag the drag with a custom MIME so only Curio
                    // widgets (Notes, RichNote, Obsidian) react. The
                    // existing pointer-based list reorder runs through
                    // `useDragReorder` below and is untouched.
                    setDashboardDragPayload(event.dataTransfer, {
                      kind: 'bookmark',
                      sourceWidgetId: widget.id,
                      sourceWidgetType: 'bookmarks',
                      data: {
                        bookmarkId: b.id,
                        title: b.name,
                        url: normalizeUrl(b.url),
                      },
                    });
                  }}
                  className="group flex min-h-10 items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2 py-1.5 transition-colors hover:bg-[var(--ether-control-hover)] data-[dragging=true]:border-[var(--ether-primary)]/50 data-[dragging=true]:shadow-lg"
                >
                  {dragReorderEnabled && (
                    <DragReorderHandle
                      bindings={rowBindings}
                      ariaLabel={`Reorder ${b.name}`}
                      compact
                    />
                  )}
                  <a
                    href={normalizeUrl(b.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${b.name}`}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-teal)]/40"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)]">
                      {faviconUrl ? (
                        <img
                          src={faviconUrl}
                          alt=""
                          className="h-4 w-4 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Globe size={14} className={theme.onSurfaceVariant} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className={`truncate text-[11px] font-semibold ${theme.onSurface}`}>{b.name}</div>
                      <div className={`truncate text-[9px] ${theme.onSurfaceVariant}`}>
                        {host}
                      </div>
                    </div>
                    <ExternalLink size={11} className={`hidden shrink-0 opacity-35 sm:block ${theme.onSurfaceVariant}`} />
                  </a>
                  <button
                    type="button"
                    aria-label={`Delete ${b.name}`}
                    onClick={() => deleteBookmark(b.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ether-error)] transition-colors hover:bg-[var(--ether-error)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-error)]/40"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </WidgetBody>
      </div>
    </WidgetShell>
  );
};

export default BookmarksWidget;
