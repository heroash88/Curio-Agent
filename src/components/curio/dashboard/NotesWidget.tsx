import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, ExternalLink, Plus, RefreshCcw, Trash2, Pin, PinOff } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import {
  useDashboardDropTarget,
  useDropIntentTarget,
} from '../../../hooks/useDashboardIntents';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardNotesProvider,
  DashboardWidget,
} from '../../../services/dashboardTypes';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { WidgetBody, WidgetText } from './widgetPrimitives';
import { IconEdit } from './widgetIcons';
import {
  getNotes,
  saveNote,
  deleteNote,
  updateNote,
  togglePinNote,
  type SavedNote,
} from '../../../services/notesPersistence';
import {
  getRecentObsidianNotes,
  rememberObsidianNote,
  rememberObsidianNotes,
  type RecentObsidianNote,
} from '../../../services/obsidianRecentNotesStore';
import {
  useObsidianEnabled,
  useSettingsStorageValue,
} from '../../../utils/settingsStorage';
import type { NotionWidgetDetail, NotionWidgetItem } from '../../../services/notionMcpWidgetService';
import type { ZapierWidgetDetail, ZapierWidgetItem } from '../../../services/zapierMcpWidgetService';

const buildObsidianInboxPath = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `Curio Inbox/Curio Note ${stamp}.md`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const noteTextToHtml = (value: string) => {
  const lines = value.split(/\r?\n/);
  const output: string[] = [];
  let listOpen = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (listOpen) {
        output.push('</ul>');
        listOpen = false;
      }
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)/);
    if (bullet) {
      if (!listOpen) {
        output.push('<ul>');
        listOpen = true;
      }
      output.push(`<li>${escapeHtml(bullet[1] || '')}</li>`);
      return;
    }
    if (listOpen) {
      output.push('</ul>');
      listOpen = false;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      const level = heading[1].length + 1;
      output.push(`<h${level}>${escapeHtml(heading[2] || '')}</h${level}>`);
      return;
    }
    output.push(`<p>${escapeHtml(trimmed)}</p>`);
  });
  if (listOpen) {
    output.push('</ul>');
  }
  return output.join('');
};

const isMarkdownFile = (path: string) => /\.md$/i.test(path);

const NotesWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const internalNotes = useSettingsStorageValue<SavedNote[]>(getNotes, []);
  const obsidianNotes = useSettingsStorageValue<RecentObsidianNote[]>(getRecentObsidianNotes, []);
  const obsidianEnabled = useObsidianEnabled();

  const [draft, setDraft] = useState('');
  const [detailNoteId, setDetailNoteId] = useState<string | null>(null);
  const [detailText, setDetailText] = useState('');
  const [detailEditing, setDetailEditing] = useState(false);
  const [obsidianDetailPath, setObsidianDetailPath] = useState<string | null>(null);
  const [obsidianDetailText, setObsidianDetailText] = useState('');
  const [obsidianDetailLoading, setObsidianDetailLoading] = useState(false);
  const [obsidianSaving, setObsidianSaving] = useState(false);
  const [obsidianError, setObsidianError] = useState<string | null>(null);
  const [obsidianSyncing, setObsidianSyncing] = useState(false);
  const [notionNotes, setNotionNotes] = useState<NotionWidgetItem[]>([]);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [notionDetail, setNotionDetail] = useState<NotionWidgetDetail | null>(null);
  const [notionDetailLoading, setNotionDetailLoading] = useState(false);
  const [zapierNotes, setZapierNotes] = useState<ZapierWidgetItem[]>([]);
  const [zapierLoading, setZapierLoading] = useState(false);
  const [zapierError, setZapierError] = useState<string | null>(null);
  const [zapierDetail, setZapierDetail] = useState<ZapierWidgetDetail | null>(null);
  const [zapierDetailLoading, setZapierDetailLoading] = useState(false);

  const provider = (widget.config.notesProvider || 'internal') as DashboardNotesProvider;
  // `zapier` and `mcp` share item shape and rendering in this widget.
  // `mcp` additionally accepts a `mcpServerId`/`mcpQuery` to pick which
  // enabled general MCP server feeds the notes list.
  const isZapierLike = provider === 'zapier' || provider === 'mcp';

  const visibleInternalNotes = useMemo(() => {
    const sorted = [...internalNotes].sort((left, right) => {
      if (left.pinned && !right.pinned) return -1;
      if (!left.pinned && right.pinned) return 1;
      return right.createdAt - left.createdAt;
    });
    return sorted;
  }, [internalNotes]);

  const visibleObsidianNotes = useMemo(
    () => [...obsidianNotes].sort((left, right) => right.updatedAt - left.updatedAt),
    [obsidianNotes],
  );

  const noteCount = provider === 'notion'
    ? notionNotes.length
    : isZapierLike
      ? zapierNotes.length
    : provider === 'obsidian'
      ? obsidianNotes.length
      : internalNotes.length;

  const handleAdd = async () => {
    const value = draft.trim();
    if (!value) return;

    if (provider === 'obsidian') {
      if (!obsidianEnabled) return;

      setObsidianSaving(true);
      setObsidianError(null);
      try {
        const path = buildObsidianInboxPath();
        const { createNote } = await import('../../../services/obsidianApi');
        await createNote(path, value);
        rememberObsidianNote({
          path,
          title: path.split('/').pop()?.replace(/\.md$/i, '') || path,
          preview: value.slice(0, 280),
          updatedAt: Date.now(),
        });
        setDraft('');
      } catch (error) {
        setObsidianError((error as Error).message || 'Could not save to Obsidian.');
      } finally {
        setObsidianSaving(false);
      }
      return;
    }

    if (provider === 'notion') {
      setNotionError('Creating Notion pages from widgets needs a Notion database source. Add notes in Notion, then refresh here.');
      return;
    }

    if (provider === 'zapier') {
      setZapierError('Create notes in the connected Zapier app, then refresh here.');
      return;
    }

    if (provider === 'mcp') {
      setZapierError('Create notes in the MCP\'s source app, then refresh here.');
      return;
    }

    saveNote(value);
    setDraft('');
  };

  const syncObsidianNotes = useCallback(async () => {
    if (!obsidianEnabled || obsidianSyncing) return;
    setObsidianSyncing(true);
    setObsidianError(null);
    try {
      const { listVaultFiles } = await import('../../../services/obsidianApi');
      const queue = ['/'];
      const synced: RecentObsidianNote[] = [];
      while (queue.length > 0 && synced.length < 200) {
        const dir = queue.shift()!;
        const files = await listVaultFiles(dir);
        files.forEach((file) => {
          if (file.isDir) {
            queue.push(file.path);
            return;
          }
          if (!isMarkdownFile(file.path)) return;
          synced.push({
            path: file.path,
            title: file.path.split('/').pop()?.replace(/\.md$/i, '') || file.path,
            updatedAt: Date.now(),
          });
        });
      }
      rememberObsidianNotes(synced);
    } catch (error) {
      setObsidianError((error as Error).message || 'Could not sync Obsidian notes.');
    } finally {
      setObsidianSyncing(false);
    }
  }, [obsidianEnabled, obsidianSyncing]);

  useEffect(() => {
    if (provider === 'obsidian' && obsidianEnabled && obsidianNotes.length === 0) {
      void syncObsidianNotes();
    }
  }, [obsidianEnabled, obsidianNotes.length, provider, syncObsidianNotes]);

  const syncNotionNotes = useCallback(async () => {
    setNotionLoading(true);
    setNotionError(null);
    try {
      const { listNotionWidgetItems } = await import('../../../services/notionMcpWidgetService');
      setNotionNotes(await listNotionWidgetItems({
        kind: 'notes',
        query: String(widget.config.notionQuery || 'notes'),
        maxItems: Number(widget.config.maxItems || 20),
      }));
    } catch (error) {
      setNotionError((error as Error).message || 'Could not load Notion notes.');
      setNotionNotes([]);
    } finally {
      setNotionLoading(false);
    }
  }, [widget.config.maxItems, widget.config.notionQuery]);

  const syncZapierNotes = useCallback(async () => {
    setZapierLoading(true);
    setZapierError(null);
    try {
      const zapierMcpService = await import('../../../services/zapierMcpWidgetService');
      const items = provider === 'mcp'
        ? await zapierMcpService.listMcpWidgetItems({
            serverId: widget.config.mcpServerId,
            toolName: widget.config.mcpToolName,
            kind: 'notes',
            query: String(widget.config.mcpQuery || widget.config.zapierQuery || widget.config.notionQuery || 'notes'),
            maxItems: Number(widget.config.maxItems || 20),
          })
        : await zapierMcpService.listZapierWidgetItems({
            kind: 'notes',
            query: String(widget.config.zapierQuery || widget.config.notionQuery || 'notes'),
            maxItems: Number(widget.config.maxItems || 20),
          });
      setZapierNotes(items);
    } catch (error) {
      setZapierError((error as Error).message || 'Could not load notes from MCP server.');
      setZapierNotes([]);
    } finally {
      setZapierLoading(false);
    }
  }, [
    provider,
    widget.config.maxItems,
    widget.config.notionQuery,
    widget.config.zapierQuery,
    widget.config.mcpQuery,
    widget.config.mcpServerId,
  ]);

  useEffect(() => {
    if (provider === 'notion') {
      void syncNotionNotes();
    } else {
      setNotionDetail(null);
    }
    if (isZapierLike) {
      void syncZapierNotes();
    } else {
      setZapierDetail(null);
    }
  }, [provider, isZapierLike, syncNotionNotes, syncZapierNotes]);

  const openInternalDetail = (note: SavedNote) => {
    setDetailNoteId(note.id);
    setDetailText(note.text);
    setDetailEditing(false);
  };

  const saveInternalDetail = () => {
    if (detailNoteId && detailText.trim()) {
      updateNote(detailNoteId, detailText.trim());
    }
    setDetailEditing(false);
  };

  const openObsidianDetail = async (note: RecentObsidianNote) => {
    setObsidianDetailPath(note.path);
    setObsidianDetailText(note.preview || '');
    setDetailEditing(false);
    setObsidianDetailLoading(true);
    setObsidianError(null);
    try {
      const { readNote } = await import('../../../services/obsidianApi');
      setObsidianDetailText(await readNote(note.path));
    } catch (error) {
      setObsidianError((error as Error).message || 'Could not read Obsidian note.');
    } finally {
      setObsidianDetailLoading(false);
    }
  };

  const openNotionDetail = async (note: NotionWidgetItem) => {
    setNotionDetail({
      ...note,
      content: note.preview || note.title,
    });
    setNotionDetailLoading(true);
    setNotionError(null);
    try {
      const { fetchNotionWidgetItem } = await import('../../../services/notionMcpWidgetService');
      setNotionDetail(await fetchNotionWidgetItem(note));
    } catch (error) {
      setNotionError((error as Error).message || 'Could not read Notion note.');
    } finally {
      setNotionDetailLoading(false);
    }
  };

  const openZapierDetail = async (note: ZapierWidgetItem) => {
    setZapierDetail({
      ...note,
      content: note.preview || note.title,
    });
    setZapierDetailLoading(true);
    setZapierError(null);
    try {
      const zapierMcpService = await import('../../../services/zapierMcpWidgetService');
      setZapierDetail(provider === 'mcp'
        ? await zapierMcpService.fetchMcpWidgetItem(note, {
            serverId: widget.config.mcpServerId,
            toolName: widget.config.mcpToolName,
            kind: 'notes',
          })
        : await zapierMcpService.fetchZapierWidgetItem(note));
    } catch (error) {
      setZapierError((error as Error).message || 'Could not read note.');
    } finally {
      setZapierDetailLoading(false);
    }
  };

  const saveObsidianDetail = async () => {
    if (!obsidianDetailPath || !obsidianDetailText.trim()) return;
    setObsidianSaving(true);
    setObsidianError(null);
    try {
      const { createNote } = await import('../../../services/obsidianApi');
      await createNote(obsidianDetailPath, obsidianDetailText.trim());
      rememberObsidianNote({
        path: obsidianDetailPath,
        title: obsidianDetailPath.split('/').pop()?.replace(/\.md$/i, '') || obsidianDetailPath,
        preview: obsidianDetailText.trim().slice(0, 280),
        updatedAt: Date.now(),
      });
      setDetailEditing(false);
    } catch (error) {
      setObsidianError((error as Error).message || 'Could not save Obsidian note.');
    } finally {
      setObsidianSaving(false);
    }
  };

  const detailNote = detailNoteId
    ? internalNotes.find((note) => note.id === detailNoteId) || null
    : null;
  const obsidianDetailNote = obsidianDetailPath
    ? obsidianNotes.find((note) => note.path === obsidianDetailPath) || null
    : null;

  // Cross-widget drop intents: bookmarks and news articles drop onto
  // this widget to append a new note line (design Requirement 10.2 /
  // 10.6). We use `saveNote` for the internal store and
  // `rememberObsidianNote` for the Obsidian provider so the drop
  // surfaces in whichever list the user is looking at. Other
  // providers (Notion, Zapier, MCP) do not accept drops because they
  // are read-only mirrors of an external store.
  const boardInteractivity = useDashboardInteractivitySettings();
  const dropIntentsEnabled = effectiveToggle(
    'dropIntentsEnabled',
    boardInteractivity,
    widget.config,
  );
  useDropIntentTarget(
    widget.id,
    useCallback(
      async (dropPayload) => {
        const data = dropPayload.payload as {
          kind?: string;
          title?: string;
          url?: string;
        };
        const title = String(data?.title || '').trim();
        const url = String(data?.url || '').trim();
        if (!title && !url) return;
        const line = title && url
          ? `[${title}](${url})`
          : title || url;

        if (provider === 'obsidian') {
          if (!obsidianEnabled) return;
          try {
            const path = buildObsidianInboxPath();
            const { createNote } = await import('../../../services/obsidianApi');
            await createNote(path, line);
            rememberObsidianNote({
              path,
              title: title || path.split('/').pop()?.replace(/\.md$/i, '') || path,
              preview: line.slice(0, 280),
              updatedAt: Date.now(),
            });
          } catch (error) {
            setObsidianError((error as Error).message || 'Could not save to Obsidian.');
          }
          return;
        }

        if (provider === 'internal') {
          saveNote(line);
        }
      },
      [obsidianEnabled, provider],
    ),
    { enabled: dropIntentsEnabled && (provider === 'internal' || provider === 'obsidian') },
  );
  const dropBindings = useDashboardDropTarget({
    widgetId: widget.id,
    widgetType: widget.type,
    enabled: dropIntentsEnabled,
  });

  const renderInternalDetail = (note: SavedNote) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setDetailNoteId(null)}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
          aria-label="Back to notes"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="faint">
            {new Date(note.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </WidgetText>
          <h3 className={`mt-1 truncate text-lg font-semibold ${theme.onSurface}`}>
            {note.text.split(/\r?\n/).find(Boolean)?.replace(/^#+\s*/, '').slice(0, 80) || 'Note'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setDetailEditing((value) => !value)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
          aria-label="Edit note"
        >
          <Edit3 size={14} />
        </button>
      </div>

      {detailEditing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <textarea
            aria-label="Note details"
            value={detailText}
            onChange={(event) => setDetailText(event.target.value)}
            className={`min-h-0 flex-1 resize-none rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4 text-sm leading-6 outline-none ${theme.onSurface}`}
          />
          <button
            type="button"
            onClick={saveInternalDetail}
            className="rounded-full bg-[var(--ether-emerald)] px-4 py-2 text-sm font-bold text-black"
            aria-label="Save note details"
          >
            Save note
          </button>
        </div>
      ) : (
        <div
          className={`dashboard-widget-touch-scroll min-h-0 flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-4 text-sm leading-6 ${theme.onSurface}`}
          dangerouslySetInnerHTML={{ __html: noteTextToHtml(note.text) }}
        />
      )}
    </div>
  );

  const renderObsidianDetail = (note: RecentObsidianNote) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setObsidianDetailPath(null)}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
          aria-label="Back to notes"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="faint">
            {note.path}
          </WidgetText>
          <h3 className={`mt-1 truncate text-lg font-semibold ${theme.onSurface}`}>
            {note.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setDetailEditing((value) => !value)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
          aria-label="Edit note"
        >
          <Edit3 size={14} />
        </button>
      </div>

      {obsidianDetailLoading ? (
        <div className="flex flex-1 items-center justify-center opacity-60">Loading note...</div>
      ) : detailEditing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <textarea
            aria-label="Note details"
            value={obsidianDetailText}
            onChange={(event) => setObsidianDetailText(event.target.value)}
            className={`min-h-0 flex-1 resize-none rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4 text-sm leading-6 outline-none ${theme.onSurface}`}
          />
          <button
            type="button"
            onClick={() => void saveObsidianDetail()}
            disabled={obsidianSaving}
            className="rounded-full bg-[var(--ether-emerald)] px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
            aria-label="Save note details"
          >
            Save note
          </button>
        </div>
      ) : (
        <div
          className={`dashboard-widget-touch-scroll min-h-0 flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-4 text-sm leading-6 ${theme.onSurface}`}
          dangerouslySetInnerHTML={{ __html: noteTextToHtml(obsidianDetailText || note.preview || '') }}
        />
      )}
    </div>
  );

  const renderNotionDetail = (note: NotionWidgetDetail) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setNotionDetail(null)}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
          aria-label="Back to Notion notes"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="faint">
            {note.updatedAt
              ? new Date(note.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : 'Notion'}
          </WidgetText>
          <h3 className={`mt-1 truncate text-lg font-semibold ${theme.onSurface}`}>
            {note.title}
          </h3>
        </div>
        {note.url && (
          <a
            href={note.url}
            target="_blank"
            rel="noreferrer"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
            aria-label="Open in Notion"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {notionDetailLoading ? (
        <div className="flex flex-1 items-center justify-center opacity-60">Loading Notion note...</div>
      ) : (
        <div
          className={`dashboard-widget-touch-scroll min-h-0 flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-4 text-sm leading-6 ${theme.onSurface}`}
          dangerouslySetInnerHTML={{ __html: noteTextToHtml(note.content || note.preview || note.title) }}
        />
      )}
    </div>
  );

  const renderZapierDetail = (note: ZapierWidgetDetail) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setZapierDetail(null)}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
          aria-label="Back to Zapier notes"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <WidgetText variant="label" tone="faint">
            {note.updatedAt
              ? new Date(note.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : 'Zapier'}
          </WidgetText>
          <h3 className={`mt-1 truncate text-lg font-semibold ${theme.onSurface}`}>
            {note.title}
          </h3>
        </div>
        {note.url && (
          <a
            href={note.url}
            target="_blank"
            rel="noreferrer"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ether-control-bg)] ${theme.onSurfaceVariant}`}
            aria-label="Open Zapier source"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {zapierDetailLoading ? (
        <div className="flex flex-1 items-center justify-center opacity-60">Loading Zapier note...</div>
      ) : (
        <div
          className={`dashboard-widget-touch-scroll min-h-0 flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-4 text-sm leading-6 ${theme.onSurface}`}
          dangerouslySetInnerHTML={{ __html: noteTextToHtml(note.content || note.preview || note.title) }}
        />
      )}
    </div>
  );

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="emerald" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${theme.onSurface} ${theme.headline}`}>
            {noteCount}
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            {provider === 'notion' ? 'Notion' : provider === 'mcp' ? 'MCP' : provider === 'zapier' ? 'Zapier' : provider === 'obsidian' ? 'Vault' : 'Note'}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={provider === 'notion' ? 'Notion Notes' : provider === 'mcp' ? 'MCP Notes' : provider === 'zapier' ? 'Zapier Notes' : provider === 'obsidian' ? 'Obsidian Notes' : 'Personal Notes'}
      icon={<IconEdit />}
      accent="emerald"
      rightSlot={
        <div className="flex items-center gap-2">
          <WidgetText variant="label" tone="muted">
            {provider}
          </WidgetText>
          {provider === 'notion' && (
            <button
              type="button"
              onClick={() => void syncNotionNotes()}
              className="dashboard-widget-control-button"
              aria-label="Sync Notion notes"
            >
              <RefreshCcw size={13} className={notionLoading ? 'animate-spin' : ''} />
            </button>
          )}
          {isZapierLike && (
            <button
              type="button"
              onClick={() => void syncZapierNotes()}
              className="dashboard-widget-control-button"
              aria-label={provider === 'mcp' ? 'Sync MCP notes' : 'Sync Zapier notes'}
            >
              <RefreshCcw size={13} className={zapierLoading ? 'animate-spin' : ''} />
            </button>
          )}
          {provider === 'obsidian' && obsidianEnabled && (
            <button
              type="button"
              onClick={() => void syncObsidianNotes()}
              className="dashboard-widget-control-button"
              aria-label="Sync Obsidian notes"
            >
              <RefreshCcw size={13} className={obsidianSyncing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      }
    >
      <div
        className="flex h-full flex-col"
        onDragOver={dropBindings.onDragOver}
        onDrop={dropBindings.onDrop}
      >
        {!detailNote && !obsidianDetailNote && !notionDetail && !zapierDetail && provider !== 'notion' && !isZapierLike && (
        <div className="mb-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleAdd();
            }}
            placeholder={provider === 'obsidian' ? 'Capture to Obsidian...' : 'Write something...'}
            className={`flex-1 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/50 px-4 py-2.5 text-sm outline-none focus:border-[var(--ether-emerald)]/50 transition-all ${theme.onSurface}`}
          />
          <button
            onClick={() => void handleAdd()}
            disabled={provider === 'obsidian' && (!obsidianEnabled || obsidianSaving)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ether-emerald)] text-black shadow-lg shadow-[var(--ether-emerald)]/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
        )}

        {detailNote ? (
          renderInternalDetail(detailNote)
        ) : obsidianDetailNote ? (
          renderObsidianDetail(obsidianDetailNote)
        ) : notionDetail ? (
          renderNotionDetail(notionDetail)
        ) : zapierDetail ? (
          renderZapierDetail(zapierDetail)
        ) : provider === 'obsidian' && !obsidianEnabled ? (
          <div className="flex flex-1 items-center justify-center opacity-60">
            <p className="text-xs font-medium uppercase tracking-widest text-center">
              Enable Obsidian in Accounts & Keys
            </p>
          </div>
        ) : provider === 'notion' ? (
          <>
            {notionError && (
              <div className="mb-3 rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
                {notionError}
              </div>
            )}
            {notionLoading && notionNotes.length === 0 ? (
              <div className="flex flex-1 items-center justify-center opacity-60">
                <p className="text-xs font-medium uppercase tracking-widest text-center">
                  Loading Notion notes
                </p>
              </div>
            ) : notionNotes.length === 0 ? (
              <div className="flex flex-1 items-center justify-center opacity-60">
                <p className="text-xs font-medium uppercase tracking-widest text-center">
                  No Notion notes found
                </p>
              </div>
            ) : (
              <WidgetBody gap="md" scroll="y">
                {notionNotes.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => void openNotionDetail(note)}
                    className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-3 text-left transition hover:bg-[var(--ether-surface-container-high)]"
                    aria-label={`Open Notion note ${note.title}`}
                  >
                    <p className={`text-[13px] font-semibold truncate ${theme.onSurface}`}>{note.title}</p>
                    {note.preview && (
                      <p className={`mt-1 text-[11px] leading-relaxed ${theme.onSurfaceVariant} line-clamp-3`}>
                        {note.preview}
                      </p>
                    )}
                    <div className="mt-2">
                      <WidgetText variant="label" tone="faint">
                        {note.updatedAt
                          ? new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
                          : 'Notion'}
                      </WidgetText>
                    </div>
                  </button>
                ))}
              </WidgetBody>
            )}
          </>
        ) : isZapierLike ? (
          <>
            {zapierError && (
              <div className="mb-3 rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
                {zapierError}
              </div>
            )}
            {zapierLoading && zapierNotes.length === 0 ? (
              <div className="flex flex-1 items-center justify-center opacity-60">
                <p className="text-xs font-medium uppercase tracking-widest text-center">
                  Loading Zapier notes
                </p>
              </div>
            ) : zapierNotes.length === 0 ? (
              <div className="flex flex-1 items-center justify-center opacity-60">
                <p className="text-xs font-medium uppercase tracking-widest text-center">
                  No Zapier notes found
                </p>
              </div>
            ) : (
              <WidgetBody gap="md" scroll="y">
                {zapierNotes.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => void openZapierDetail(note)}
                    className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-3 text-left transition hover:bg-[var(--ether-surface-container-high)]"
                    aria-label={`Open Zapier note ${note.title}`}
                  >
                    <p className={`text-[13px] font-semibold truncate ${theme.onSurface}`}>{note.title}</p>
                    {note.preview && (
                      <p className={`mt-1 text-[11px] leading-relaxed ${theme.onSurfaceVariant} line-clamp-3`}>
                        {note.preview}
                      </p>
                    )}
                    <div className="mt-2">
                      <WidgetText variant="label" tone="faint">
                        {note.updatedAt
                          ? new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
                          : 'Zapier'}
                      </WidgetText>
                    </div>
                  </button>
                ))}
              </WidgetBody>
            )}
          </>
        ) : provider === 'obsidian' ? (
          <>
            {obsidianError && (
              <div className="mb-3 rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
                {obsidianError}
              </div>
            )}
            {visibleObsidianNotes.length === 0 ? (
              <div className="flex flex-1 items-center justify-center opacity-60">
                <p className="text-xs font-medium uppercase tracking-widest text-center">
                  Notes created from Curio will appear here
                </p>
              </div>
            ) : (
              <WidgetBody gap="md" scroll="y">
                {visibleObsidianNotes.map((note) => (
                  <button
                    type="button"
                    key={note.path}
                    onClick={() => void openObsidianDetail(note)}
                    className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-3"
                    aria-label={`Open note ${note.title}`}
                  >
                    <p className={`text-[13px] font-semibold truncate ${theme.onSurface}`}>{note.title}</p>
                    {note.preview && (
                      <p className={`mt-1 text-[11px] leading-relaxed ${theme.onSurfaceVariant} line-clamp-3`}>
                        {note.preview}
                      </p>
                    )}
                    <div className="mt-2">
                      <WidgetText variant="label" tone="faint">
                        {note.path}
                      </WidgetText>
                    </div>
                  </button>
                ))}
              </WidgetBody>
            )}
          </>
        ) : visibleInternalNotes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center opacity-60">
            <p className="text-xs font-medium uppercase tracking-widest">No thoughts captured</p>
          </div>
        ) : (
          <WidgetBody gap="sm" scroll="y">
            {visibleInternalNotes.map((note) => (
              <div
                key={note.id}
                className={`group relative rounded-xl px-3 py-2 border transition-all duration-300 ${
                  note.pinned
                    ? 'bg-[var(--ether-emerald)]/5 border-[var(--ether-emerald)]/20'
                    : 'bg-[var(--ether-surface-container)] border-[var(--ether-glass-border)]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openInternalDetail(note)}
                    aria-label={`Open note ${note.text.split(/\r?\n/).find(Boolean)?.slice(0, 60) || note.id}`}
                  >
                    <p className={`line-clamp-2 text-[12px] font-medium leading-snug cursor-text ${theme.onSurface}`}>
                      {note.text}
                    </p>
                    <div className="mt-1">
                      <WidgetText variant="label" tone="faint">
                        {new Date(note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </WidgetText>
                    </div>
                  </button>
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => togglePinNote(note.id)}
                      className={`p-1 rounded-md transition-colors ${
                        note.pinned
                          ? 'text-[var(--ether-emerald)] bg-[var(--ether-emerald)]/10'
                          : 'text-[var(--ether-on-surface-variant)] hover:bg-white/5'
                      }`}
                    >
                      {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1 rounded-md text-[var(--ether-error)] hover:bg-[var(--ether-error)]/10 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                {note.pinned && (
                  <div className="absolute top-2 right-2 p-1 pointer-events-none opacity-40 group-hover:opacity-0 transition-opacity">
                    <Pin size={10} fill="currentColor" className="text-[var(--ether-emerald)]" />
                  </div>
                )}
              </div>
            ))}
          </WidgetBody>
        )}
      </div>
    </WidgetShell>
  );
};

export default NotesWidget;
