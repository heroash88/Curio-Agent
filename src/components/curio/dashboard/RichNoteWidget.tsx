import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Download,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Palette,
  Pin,
  PinOff,
  Plus,
  Settings2,
  Underline,
} from 'lucide-react';

import { useCardTheme } from '../../../hooks/useCardTheme';
import {
  useDashboardDropTarget,
  useDropIntentTarget,
} from '../../../hooks/useDashboardIntents';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { sanitizeDashboardRichHtml } from '../../../lib/dashboardContentWidgets';
import type {
  DashboardRichNoteItem,
  DashboardRichNoteColor,
  DashboardWidget,
  DashboardWidgetConfig,
  DashboardWidgetType,
} from '../../../services/dashboardTypes';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const textToHtml = (value: string) =>
  escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');

const STORED_IMAGE_PLACEHOLDER_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const isInlineImageDataUrl = (value: string) =>
  /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value.trim());

const storedImageHtml = (id: string, alt = 'Sticky note image') =>
  `<img src="${STORED_IMAGE_PLACEHOLDER_SRC}" data-dashboard-image-id="${escapeHtml(id)}" alt="${escapeHtml(alt).slice(0, 120)}">`;

const normalizeStoredImageSources = (html: string) => {
  const safeHtml = sanitizeDashboardRichHtml(html);
  if (!safeHtml || typeof document === 'undefined') return safeHtml;

  const template = document.createElement('template');
  template.innerHTML = safeHtml;
  template.content
    .querySelectorAll<HTMLImageElement>('img[data-dashboard-image-id]')
    .forEach((image) => {
      image.setAttribute('src', STORED_IMAGE_PLACEHOLDER_SRC);
    });
  return template.innerHTML.trim();
};

const migrateInlineImagesToStoredRefs = async (html: string): Promise<string> => {
  if (!html.trim() || typeof document === 'undefined') return '';

  const template = document.createElement('template');
  template.innerHTML = html;
  const inlineImages = Array.from(template.content.querySelectorAll<HTMLImageElement>('img'))
    .filter((image) => isInlineImageDataUrl(image.getAttribute('src') || ''));

  if (inlineImages.length === 0) return normalizeStoredImageSources(html);

  const { addDashboardGalleryDataUrls } = await import('../../../services/dashboardImageStore');
  const ids = await addDashboardGalleryDataUrls(
    inlineImages.map((image) => image.getAttribute('src') || ''),
  );

  inlineImages.forEach((image, index) => {
    const id = ids[index];
    if (!id) {
      image.remove();
      return;
    }
    image.setAttribute('src', STORED_IMAGE_PLACEHOLDER_SRC);
    image.setAttribute('data-dashboard-image-id', id);
    if (!image.getAttribute('alt')) {
      image.setAttribute('alt', 'Sticky note image');
    }
  });

  return normalizeStoredImageSources(template.innerHTML);
};

const storeImageFilesAsHtml = async (files: File[]): Promise<string[]> => {
  const images = files.filter((file) => file.type.startsWith('image/'));
  if (images.length === 0) return [];

  const { addDashboardGalleryImages } = await import('../../../services/dashboardImageStore');
  const ids = await addDashboardGalleryImages(images);
  return ids.map((id, index) => storedImageHtml(id, images[index]?.name || 'Sticky note image'));
};

const htmlToPlainText = (html: string) => {
  if (!html.trim() || typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = sanitizeDashboardRichHtml(html);
  template.content.querySelectorAll('br').forEach((breakNode) => {
    breakNode.replaceWith(document.createTextNode('\n'));
  });
  template.content
    .querySelectorAll('p,div,h1,h2,h3,h4,li,blockquote,pre,tr')
    .forEach((block) => {
      block.appendChild(document.createTextNode('\n'));
    });
  return (template.content.textContent || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const slugifyFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'sticky-note';

const selectionBelongsTo = (selection: Selection | null, parent: HTMLElement) => {
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return parent.contains(range.commonAncestorContainer);
};

const insertHtmlIntoEditor = (editor: HTMLElement, html: string) => {
  const template = document.createElement('template');
  template.innerHTML = sanitizeDashboardRichHtml(html);
  const fragment = template.content.cloneNode(true);
  const selection = window.getSelection();

  if (selectionBelongsTo(selection, editor)) {
    const range = selection!.getRangeAt(0);
    range.deleteContents();
    range.insertNode(fragment);
    range.collapse(false);
    selection!.removeAllRanges();
    selection!.addRange(range);
    return;
  }

  editor.appendChild(fragment);
};

const STICKY_COLORS: Array<{
  id: DashboardRichNoteColor;
  label: string;
  paper: string;
  border: string;
  text: string;
  shadow: string;
}> = [
  {
    id: 'canary',
    label: 'canary',
    paper: 'linear-gradient(145deg, #fff8b8 0%, #ffe886 100%)',
    border: 'rgba(187, 141, 27, 0.42)',
    text: '#34280b',
    shadow: '0 22px 42px rgba(97, 64, 7, 0.28)',
  },
  {
    id: 'rose',
    label: 'rose',
    paper: 'linear-gradient(145deg, #ffd4dd 0%, #fda4af 100%)',
    border: 'rgba(190, 18, 60, 0.34)',
    text: '#4a1022',
    shadow: '0 22px 42px rgba(136, 19, 55, 0.24)',
  },
  {
    id: 'mint',
    label: 'mint',
    paper: 'linear-gradient(145deg, #d9f99d 0%, #86efac 100%)',
    border: 'rgba(22, 101, 52, 0.30)',
    text: '#14341f',
    shadow: '0 22px 42px rgba(20, 83, 45, 0.22)',
  },
  {
    id: 'sky',
    label: 'sky',
    paper: 'linear-gradient(145deg, #dbeafe 0%, #93c5fd 100%)',
    border: 'rgba(29, 78, 216, 0.30)',
    text: '#14294f',
    shadow: '0 22px 42px rgba(30, 64, 175, 0.22)',
  },
  {
    id: 'lavender',
    label: 'lavender',
    paper: 'linear-gradient(145deg, #ede9fe 0%, #c4b5fd 100%)',
    border: 'rgba(109, 40, 217, 0.30)',
    text: '#2f1c57',
    shadow: '0 22px 42px rgba(76, 29, 149, 0.22)',
  },
  {
    id: 'peach',
    label: 'peach',
    paper: 'linear-gradient(145deg, #fed7aa 0%, #fdba74 100%)',
    border: 'rgba(194, 65, 12, 0.30)',
    text: '#44210c',
    shadow: '0 22px 42px rgba(154, 52, 18, 0.22)',
  },
];

const getStickyColor = (value: unknown) =>
  STICKY_COLORS.find((color) => color.id === value) || STICKY_COLORS[0]!;

const htmlHasVisibleContent = (html: string) => {
  if (!html.trim() || typeof document === 'undefined') return false;
  const template = document.createElement('template');
  template.innerHTML = sanitizeDashboardRichHtml(html);
  return Boolean(
    template.content.textContent?.trim() ||
      template.content.querySelector('img,table,hr,blockquote'),
  );
};

const editorHasVisibleContent = (editor: HTMLElement) =>
  Boolean(editor.textContent?.trim() || editor.querySelector('img,table,hr,blockquote'));

const createRichNoteId = () =>
  `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeNoteTitle = (value: unknown, fallback = 'Sticky Note') => {
  const title = String(value || '').trim();
  return title || fallback;
};

const buildLegacyNote = (config: DashboardWidgetConfig): DashboardRichNoteItem => ({
  id: 'default',
  title: normalizeNoteTitle(config.richNoteTitle),
  html: String(config.richNoteHtml || ''),
  color: getStickyColor(config.richNoteColor || 'canary').id,
});

const normalizeRichNotes = (config: DashboardWidgetConfig): DashboardRichNoteItem[] => {
  const configured = Array.isArray(config.richNotes) ? config.richNotes : [];
  const normalized = configured
    .slice(0, 12)
    .map((note, index) => ({
      id: String(note?.id || `note-${index + 1}`),
      title: normalizeNoteTitle(note?.title, `Sticky Note ${index + 1}`),
      html: sanitizeDashboardRichHtml(String(note?.html || '')),
      color: getStickyColor(note?.color || 'canary').id,
      createdAt: Number.isFinite(Number(note?.createdAt)) ? Number(note?.createdAt) : undefined,
      updatedAt: Number.isFinite(Number(note?.updatedAt)) ? Number(note?.updatedAt) : undefined,
    }));

  return normalized.length > 0 ? normalized : [buildLegacyNote(config)];
};

const legacyPatchForNote = (
  note: DashboardRichNoteItem,
): Pick<DashboardWidgetConfig, 'richNoteTitle' | 'richNoteHtml' | 'richNoteColor'> => ({
  richNoteTitle: note.title,
  richNoteHtml: note.html,
  richNoteColor: note.color,
});

const notesPatch = (
  notes: DashboardRichNoteItem[],
  activeId: string,
): Partial<DashboardWidgetConfig> => {
  const active = notes.find((note) => note.id === activeId) || notes[0]!;
  return {
    richNotes: notes,
    richNoteActiveId: activeId,
    ...legacyPatchForNote(active),
  };
};

const ToolbarButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ label, icon, onClick }) => (
  <button
    type="button"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
    aria-label={label}
    title={label}
  >
    {icon}
  </button>
);

const RichNoteWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
  onCreateWidget?: (
    type: DashboardWidgetType,
    configPatch?: Partial<DashboardWidgetConfig>,
    options?: { afterWidgetId?: string },
  ) => void;
}> = ({ widget, onUpdateWidgetConfig, onCreateWidget }) => {
  // TODO: [ttsWordHighlightEnabled] When effectiveToggle('ttsWordHighlightEnabled', boardInteractivity, widget.config)
  // is true, highlight the word currently being spoken/dictated via ttsProgress events.
  // Subscribe to ttsProgress and map word offsets to DOM ranges in the editor content.
  // Gate behind: effectiveToggle('ttsWordHighlightEnabled', boardInteractivity, widget.config)

  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const notes = useMemo(
    () => normalizeRichNotes(widget.config),
    [
      widget.config.richNoteActiveId,
      widget.config.richNoteColor,
      widget.config.richNoteHtml,
      widget.config.richNoteTitle,
      widget.config.richNotes,
    ],
  );
  const activeId =
    notes.find((note) => note.id === widget.config.richNoteActiveId)?.id ||
    notes[0]!.id;
  const activeNote = notes.find((note) => note.id === activeId) || notes[0]!;
  const hasPersistedNoteStack = Array.isArray(widget.config.richNotes) && widget.config.richNotes.length > 0;
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const storedImageUrlsRef = useRef<string[]>([]);
  const hydratedRef = useRef(false);
  const hydratedNoteIdRef = useRef(activeNote.id);
  const lastSavedHtmlRef = useRef(activeNote.html);
  const [hasContent, setHasContent] = useState(htmlHasVisibleContent(activeNote.html));
  const hasContentRef = useRef(hasContent);
  const [toolsOpen, setToolsOpen] = useState(false);
  const title = activeNote.title;
  const color = getStickyColor(activeNote.color);
  const plainText = htmlToPlainText(activeNote.html);
  const exportHref = `data:text/plain;charset=utf-8,${encodeURIComponent(plainText)}`;
  const pinnedToGrid = widget.config.richNotePinnedToGrid === true;

  const commitActiveNote = useCallback(
    (patch: Partial<DashboardRichNoteItem>) => {
      const updatedActiveNote: DashboardRichNoteItem = {
        ...activeNote,
        ...patch,
        updatedAt: Date.now(),
      };

      const nextNotes = notes.map((note) =>
        note.id === activeNote.id ? updatedActiveNote : note,
      );

      if (hasPersistedNoteStack || nextNotes.length > 1) {
        onUpdateWidgetConfig?.(widget.id, notesPatch(nextNotes, updatedActiveNote.id));
        return;
      }

      onUpdateWidgetConfig?.(widget.id, legacyPatchForNote(updatedActiveNote));
    },
    [activeNote, hasPersistedNoteStack, notes, onUpdateWidgetConfig, widget.id],
  );

  const saveHtml = useCallback(
    (html: string, immediate = false) => {
      const safeHtml = normalizeStoredImageSources(html);
      if (safeHtml === lastSavedHtmlRef.current) return;

      const commit = () => {
        lastSavedHtmlRef.current = safeHtml;
        const nextHasContent = htmlHasVisibleContent(safeHtml);
        if (nextHasContent !== hasContentRef.current) {
          hasContentRef.current = nextHasContent;
          setHasContent(nextHasContent);
        }
        commitActiveNote({ html: safeHtml });
      };

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      if (immediate) {
        commit();
        return;
      }

      saveTimerRef.current = window.setTimeout(commit, 700);
    },
    [commitActiveNote],
  );

  const updateHasContentFromEditor = (editor: HTMLElement) => {
    const nextHasContent = editorHasVisibleContent(editor);
    if (nextHasContent === hasContentRef.current) return;
    hasContentRef.current = nextHasContent;
    setHasContent(nextHasContent);
  };

  const revokeStoredImageUrls = useCallback(() => {
    storedImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    storedImageUrlsRef.current = [];
  }, []);

  const hydrateStoredImagesInEditor = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const images = Array.from(
      editor.querySelectorAll<HTMLImageElement>('img[data-dashboard-image-id]'),
    );
    const ids = Array.from(
      new Set(
        images
          .map((image) => image.getAttribute('data-dashboard-image-id') || '')
          .filter(Boolean),
      ),
    );

    revokeStoredImageUrls();
    if (ids.length === 0) return;

    try {
      const { getDashboardGalleryImageBlobUrls } = await import('../../../services/dashboardImageStore');
      const urls = await getDashboardGalleryImageBlobUrls(ids);
      if (editorRef.current !== editor) {
        Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      storedImageUrlsRef.current = Object.values(urls);
      images.forEach((image) => {
        const id = image.getAttribute('data-dashboard-image-id') || '';
        image.src = urls[id] || STORED_IMAGE_PLACEHOLDER_SRC;
      });
    } catch (error) {
      console.warn('[RichNoteWidget] Failed to hydrate stored note images:', error);
      images.forEach((image) => {
        image.src = STORED_IMAGE_PLACEHOLDER_SRC;
      });
    }
  }, [revokeStoredImageUrls]);

  useEffect(() => {
    const nextHtml = activeNote.html;
    if (
      hydratedRef.current &&
      hydratedNoteIdRef.current === activeNote.id &&
      nextHtml === lastSavedHtmlRef.current
    ) {
      return;
    }
    hydratedRef.current = true;
    hydratedNoteIdRef.current = activeNote.id;
    lastSavedHtmlRef.current = nextHtml;
    const nextHasContent = htmlHasVisibleContent(nextHtml);
    hasContentRef.current = nextHasContent;
    setHasContent(nextHasContent);
    if (editorRef.current && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
    void hydrateStoredImagesInEditor();
  }, [activeNote.html, activeNote.id, hydrateStoredImagesInEditor]);

  useEffect(() => {
    let cancelled = false;

    const migrateExistingInlineImages = async () => {
      if (!activeNote.html.includes('data:image/')) return;

      try {
        const migratedHtml = await migrateInlineImagesToStoredRefs(activeNote.html);
        if (cancelled || migratedHtml === normalizeStoredImageSources(activeNote.html)) return;
        lastSavedHtmlRef.current = migratedHtml;
        commitActiveNote({ html: migratedHtml });
        if (editorRef.current && hydratedNoteIdRef.current === activeNote.id) {
          editorRef.current.innerHTML = migratedHtml;
          void hydrateStoredImagesInEditor();
        }
      } catch (error) {
        console.warn('[RichNoteWidget] Failed to move sticky note images to IndexedDB:', error);
      }
    };

    void migrateExistingInlineImages();

    return () => {
      cancelled = true;
    };
  }, [activeNote.html, activeNote.id, commitActiveNote, hydrateStoredImagesInEditor]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (editorRef.current) {
        saveHtml(editorRef.current.innerHTML, true);
      }
      revokeStoredImageUrls();
    },
    [revokeStoredImageUrls, saveHtml],
  );

  const updateActiveNote = (patch: Partial<DashboardRichNoteItem>) => {
    commitActiveNote(patch);
  };

  const switchNote = (noteId: string) => {
    const selected = notes.find((note) => note.id === noteId);
    if (!selected) return;
    onUpdateWidgetConfig?.(widget.id, notesPatch(notes, selected.id));
  };

  const addNote = () => {
    const activeHtml = editorRef.current
      ? normalizeStoredImageSources(editorRef.current.innerHTML)
      : activeNote.html;
    if (onCreateWidget) {
      if (activeHtml !== activeNote.html) {
        commitActiveNote({ html: activeHtml });
      }
      const nextColor = STICKY_COLORS[notes.length % STICKY_COLORS.length]!.id;
      onCreateWidget(
        'rich_note',
        {
          richNoteTitle: `Sticky Note ${notes.length + 1}`,
          richNoteHtml: '',
          richNoteColor: nextColor,
          richNotePinnedToGrid: false,
          w: Number(widget.config.w || 3),
          h: Number(widget.config.h || 3),
        },
        { afterWidgetId: widget.id },
      );
      setToolsOpen(false);
      return;
    }
    const now = Date.now();
    const savedNotes = notes.map((note) =>
      note.id === activeNote.id
        ? { ...note, html: activeHtml, updatedAt: now }
        : note,
    );
    const nextColor = STICKY_COLORS[savedNotes.length % STICKY_COLORS.length]!.id;
    const nextNote: DashboardRichNoteItem = {
      id: createRichNoteId(),
      title: `Sticky Note ${savedNotes.length + 1}`,
      html: '',
      color: nextColor,
      createdAt: now,
      updatedAt: now,
    };
    onUpdateWidgetConfig?.(widget.id, notesPatch([...savedNotes, nextNote], nextNote.id));
    setToolsOpen(false);
  };

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      saveHtml(editorRef.current.innerHTML);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');

    if (!html && files.length === 0) {
      return;
    }

    event.preventDefault();
    const pastedParts = [
      await migrateInlineImagesToStoredRefs(html || textToHtml(text)),
    ];

    try {
      pastedParts.push(...(await storeImageFilesAsHtml(files.slice(0, 4))));
    } catch (error) {
      console.warn('[RichNoteWidget] Failed to store pasted note images:', error);
    }

    editorRef.current?.focus();
    if (editorRef.current) {
      insertHtmlIntoEditor(editorRef.current, sanitizeDashboardRichHtml(pastedParts.join('')));
      updateHasContentFromEditor(editorRef.current);
      void hydrateStoredImagesInEditor();
    }
    if (editorRef.current) {
      saveHtml(editorRef.current.innerHTML);
    }
  };

  const handleImageFiles = async (files: FileList | null) => {
    const images = Array.from(files || []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (images.length === 0) return;

    let parts: string[] = [];
    try {
      parts = await storeImageFilesAsHtml(images.slice(0, 6));
    } catch (error) {
      console.warn('[RichNoteWidget] Failed to store selected note images:', error);
    }

    if (parts.length === 0) return;
    editorRef.current?.focus();
    if (editorRef.current) {
      insertHtmlIntoEditor(editorRef.current, sanitizeDashboardRichHtml(parts.join('')));
      updateHasContentFromEditor(editorRef.current);
      void hydrateStoredImagesInEditor();
    }
    if (editorRef.current) {
      saveHtml(editorRef.current.innerHTML);
    }
  };

  const compact = size.pixelHeight < 260;
  const pinLabel = pinnedToGrid ? 'Float sticky note' : 'Pin sticky note to grid';

  // Drop-intent wiring: accept bookmark + news-article drops and
  // append the title/url to the active note body. Reuses the existing
  // `saveHtml` persistence path so the committed HTML round-trips
  // through the widget's config like any other edit.
  const boardInteractivity = useDashboardInteractivitySettings();
  const dropIntentsEnabled = effectiveToggle(
    'dropIntentsEnabled',
    boardInteractivity,
    widget.config,
  );
  const handleRichNoteDrop = useCallback(
    (payload: {
      payload: Record<string, unknown>;
    }) => {
      const rawTitle = payload.payload.title;
      const rawUrl = payload.payload.url;
      const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
      const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!title && !url) return;

      // Append a markdown-style heading + url. When the editor has
      // been mounted, merge into its live innerHTML so the active
      // cursor does not drop the new content on the next keystroke;
      // otherwise stitch onto the persisted note html directly.
      const appendedHtml = `<h2>${escapeHtml(title || url)}</h2>${
        url ? `<p><a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(url)}</a></p>` : ''
      }`;
      const editor = editorRef.current;
      const existing = editor ? editor.innerHTML : activeNote.html;
      const nextHtml = `${existing}${existing && !existing.endsWith('</p>') ? '' : ''}${appendedHtml}`;
      if (editor) {
        editor.innerHTML = nextHtml;
      }
      saveHtml(nextHtml, true);
    },
    [activeNote.html, saveHtml],
  );
  useDropIntentTarget(widget.id, handleRichNoteDrop, {
    enabled: dropIntentsEnabled,
  });
  const dropBindings = useDashboardDropTarget({
    widgetId: widget.id,
    widgetType: widget.type,
    enabled: dropIntentsEnabled,
  });

  return (
    <WidgetShell
      widget={widget}
      accent="amber"
      bare
      ghost
      quiet
      glowEnabled={false}
      padded={false}
      className="dashboard-sticky-note-shell"
      bodyClassName="p-0"
    >
      <div
        className="dashboard-sticky-note-root group/sticky relative flex h-full min-h-0 w-full flex-col overflow-visible p-2"
        onDragOver={dropBindings.onDragOver}
        onDrop={dropBindings.onDrop}
      >
        <div className={`pointer-events-auto absolute bottom-4 right-4 z-40 flex items-center gap-1.5 transition-opacity duration-150 group-focus-within/sticky:opacity-100 group-hover/sticky:opacity-100 ${toolsOpen ? 'opacity-100' : 'pointer-events-none opacity-0 group-focus-within/sticky:pointer-events-auto group-hover/sticky:pointer-events-auto'}`}>
          <button
            type="button"
            aria-label="Add sticky note"
            title="Add sticky note"
            onClick={addNote}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/78 text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:scale-105 hover:bg-white"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            aria-label={pinLabel}
            title={pinLabel}
            onClick={() =>
              onUpdateWidgetConfig?.(widget.id, {
                richNotePinnedToGrid: !pinnedToGrid,
              })
            }
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/78 text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:scale-105 hover:bg-white"
          >
            {pinnedToGrid ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            type="button"
            aria-label={toolsOpen ? 'Close sticky note tools' : 'Open sticky note tools'}
            title={toolsOpen ? 'Close sticky note tools' : 'Open sticky note tools'}
            onClick={() => setToolsOpen((open) => !open)}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl transition hover:scale-105 ${
              toolsOpen
                ? 'border-[var(--ether-primary)]/45 bg-[var(--ether-primary)] text-[var(--ether-control-active-text)]'
                : 'border-black/10 bg-white/78 text-slate-700 hover:bg-white'
            }`}
          >
            <Settings2 size={15} />
          </button>
        </div>

        {toolsOpen && (
          <div className="dashboard-widget-touch-scroll-x dashboard-sticky-note-tools absolute inset-x-3 bottom-16 z-30 max-h-[70%] rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)]/94 p-2 shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                aria-label="Sticky note name"
                value={title}
                onChange={(event) => updateActiveNote({ title: event.target.value })}
                className="h-8 min-w-0 flex-1 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 text-xs font-bold text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]"
                placeholder="Sticky note name"
              />
              <a
                href={exportHref}
                download={`${slugifyFileName(title)}.txt`}
                aria-label="Save sticky note as text"
                title="Save sticky note as text"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] transition hover:bg-[var(--ether-control-hover)] ${theme.onSurfaceVariant}`}
                onClick={(event) => {
                  if (!plainText) {
                    event.preventDefault();
                  }
                }}
              >
                <Download size={14} />
              </a>
            </div>

            {notes.length > 1 && (
              <div className="dashboard-widget-touch-scroll-x mt-2 flex gap-1 pb-1">
                {notes.map((note, index) => {
                  const noteColor = getStickyColor(note.color);
                  return (
                    <button
                      key={note.id}
                      type="button"
                      aria-label={`Open sticky note ${index + 1}: ${note.title}`}
                      onClick={() => switchNote(note.id)}
                      className={`min-w-24 rounded-xl border px-2.5 py-1.5 text-left text-[10px] font-bold transition ${
                        note.id === activeNote.id
                          ? 'border-[var(--ether-on-surface)]/35 bg-[var(--ether-control-hover)] text-[var(--ether-on-surface)]'
                          : 'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
                      }`}
                    >
                      <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: noteColor.paper }} />
                      <span className="align-middle">{note.title}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!compact && (
              <div className="mt-2 grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToolbarButton label="Bold" icon={<Bold size={14} />} onClick={() => runCommand('bold')} />
                  <ToolbarButton label="Italic" icon={<Italic size={14} />} onClick={() => runCommand('italic')} />
                  <ToolbarButton label="Underline" icon={<Underline size={14} />} onClick={() => runCommand('underline')} />
                  <ToolbarButton label="Text highlight" icon={<Highlighter size={14} />} onClick={() => runCommand('hiliteColor', '#fff59d')} />
                  <ToolbarButton label="Heading" icon={<Heading2 size={14} />} onClick={() => runCommand('formatBlock', 'h2')} />
                  <ToolbarButton label="Bulleted list" icon={<List size={14} />} onClick={() => runCommand('insertUnorderedList')} />
                  <ToolbarButton label="Numbered list" icon={<ListOrdered size={14} />} onClick={() => runCommand('insertOrderedList')} />
                  <ToolbarButton label="Add image" icon={<ImagePlus size={14} />} onClick={() => imageInputRef.current?.click()} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-xl">
                    <Palette size={13} />
                    <WidgetText variant="label" tone="muted">Color</WidgetText>
                  </span>
                  {STICKY_COLORS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={`Use ${option.label} sticky note color`}
                      title={`Use ${option.label} sticky note color`}
                      onClick={() => updateActiveNote({ color: option.id })}
                      className={`h-7 w-7 rounded-full border transition hover:scale-105 ${
                        option.id === color.id
                          ? 'border-[var(--ether-on-surface)] shadow-[0_0_0_2px_rgba(255,255,255,0.28)]'
                          : 'border-[var(--ether-glass-border)]'
                      }`}
                      style={{ background: option.paper }}
                    />
                  ))}
                </div>
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleImageFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        )}

        <div
          className="relative min-h-0 flex-1 overflow-visible px-1 pb-1 pt-2"
        >
          <div
            data-testid="sticky-note-paper"
            className="relative flex h-full min-h-0 rotate-[-0.45deg] flex-col overflow-hidden rounded-[0.35rem] border px-4 pb-3 pt-5 transition-transform duration-300 hover:rotate-0"
            style={{
              background: color.paper,
              borderColor: color.border,
              boxShadow: 'none',
              color: color.text,
            }}
          >
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-6 w-28 -translate-x-1/2 -translate-y-1/2 rotate-[-1.5deg] rounded-sm bg-white/35 shadow-sm backdrop-blur-[2px]"
              aria-hidden
            />
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-label={`${title} note body`}
            data-empty={hasContent ? 'false' : 'true'}
            suppressContentEditableWarning
            onInput={(event) => {
              updateHasContentFromEditor(event.currentTarget);
              saveHtml(event.currentTarget.innerHTML);
            }}
            onBlur={(event) => saveHtml(event.currentTarget.innerHTML, true)}
            onPaste={(event) => {
              void handlePaste(event);
            }}
            className="dashboard-rich-note-content dashboard-rich-note-editor relative z-10 min-h-0 flex-1 overflow-y-auto rounded-sm px-1 py-1 text-sm leading-6 outline-none"
            style={{
              color: color.text,
              userSelect: 'text',
              WebkitUserSelect: 'text',
              touchAction: 'pan-y',
            }}
          />
          </div>
        </div>
      </div>
    </WidgetShell>
  );
};

export default React.memo(RichNoteWidget);
