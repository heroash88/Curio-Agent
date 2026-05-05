import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  BringToFront,
  Check,
  Circle,
  Copy,
  Diamond,
  Eraser,
  FileDown,
  FolderOpen,
  Grid3X3,
  Highlighter,
  ImageDown,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Palette,
  Paperclip,
  Pencil,
  Plus,
  Save,
  SendToBack,
  Square,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { useDraggableScroll } from '../../../hooks/useDraggableScroll';
import {
  createStoredSketchProject,
  createDeferredSketchProjectWriter,
  deleteStoredSketchLibraryEntry,
  readStoredSketchLibrary,
  readStoredSketchProjectFromStorage,
  saveStoredSketchLibraryEntry,
  writeStoredSketchProjectToStorage,
  type DeferredSketchProjectWriter,
  type FreeformSketchLibraryEntry,
  type FreeformSketchProject,
} from '../../../lib/freeformSketchStore';
import {
  appendSmoothedSketchPoint,
  moveSketchItemToBack,
  moveSketchItemToFront,
  shouldEditSelectedConnectorFromControl,
} from '../../../lib/freeformSketchOperations';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { useThemeMode } from '../../../utils/settingsStorage';
import WidgetShell from './WidgetShell';
import { IconEdit } from './widgetIcons';
import { WidgetBody, WidgetEmptyState, WidgetText } from './widgetPrimitives';
import ColorWheelInput from '../ColorWheelInput';

type SketchTool =
  | 'select'
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'connector';
type DrawingTool = Exclude<SketchTool, 'select' | 'eraser'>;
type ShapeTool = Extract<DrawingTool, 'rect' | 'ellipse' | 'diamond'>;
type SketchPoint = { x: number; y: number };
type ConnectorStyle = 'straight' | 'elbow' | 'curve';
type ConnectorArrow = 'none' | 'end' | 'both';
type EndpointAnchor = 'left' | 'right' | 'top' | 'bottom' | 'center';
type ConnectorEndpoint =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'item'; itemId: string; anchor: EndpointAnchor };

type SketchPath = {
  id: string;
  kind: 'path';
  points: SketchPoint[];
  color: string;
  width: number;
  opacity: number;
};

type SketchShape = {
  id: string;
  kind: 'shape';
  shape: ShapeTool;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fill: string;
  width?: number;
  label: string;
};

type SketchText = {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize?: number;
};

type SketchImage = {
  id: string;
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  name: string;
};

type SketchFile = {
  id: string;
  kind: 'file';
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  mime: string;
  size: number;
  src?: string;
};

type SketchConnector = {
  id: string;
  kind: 'connector';
  from: ConnectorEndpoint;
  to: ConnectorEndpoint;
  color: string;
  width: number;
  style: ConnectorStyle;
  arrow: ConnectorArrow;
  label: string;
};

type SketchItem = SketchPath | SketchShape | SketchText | SketchImage | SketchFile | SketchConnector;

type ActiveGesture =
  | { mode: 'draw'; id: string }
  | { mode: 'shape'; id: string; start: SketchPoint }
  | { mode: 'connector'; id: string; startClientX: number; startClientY: number }
  | { mode: 'connector-endpoint'; id: string; endpoint: 'from' | 'to' }
  | { mode: 'move'; id: string; start: SketchPoint; snapshot: SketchItem[] }
  | { mode: 'resize'; id: string; start: SketchPoint; original: SketchItem }
  | { mode: 'pan'; startClientX: number; startClientY: number; originX: number; originY: number };

type PinchGesture = {
  distance: number;
  zoom: number;
};

type SketchProject = FreeformSketchProject<SketchItem>;
type SketchLibraryEntry = FreeformSketchLibraryEntry<SketchItem>;

const STORAGE_PREFIX = 'curio_sketch_widget_v2_';
const LIBRARY_STORAGE_KEY = 'curio_sketch_library_v1';
const PROJECT_EXT = 'curio-sketch.json';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const BOARD_WIDTH = 2400;
const BOARD_HEIGHT = 1600;
const LIGHT_MODE_DRAW_COLOR = '#000000';
const DARK_MODE_DRAW_COLOR = '#ffffff';
const DEFAULT_COLORS = [LIGHT_MODE_DRAW_COLOR, '#f43f5e', '#f59e0b', '#10b981', '#39b8fd', '#8b5cf6'];
const DARK_MODE_COLORS = [DARK_MODE_DRAW_COLOR, '#f43f5e', '#f59e0b', '#10b981', '#39b8fd', '#8b5cf6'];
const DRAWING_TOOLS: DrawingTool[] = ['pen', 'marker', 'text', 'rect', 'ellipse', 'diamond', 'connector'];
const DRAWING_TOOL_SET = new Set<SketchTool>(DRAWING_TOOLS);
const TOOL_SIZE_CONFIG: Record<DrawingTool, { label: string; min: number; max: number; step: number; defaultSize: number }> = {
  pen: { label: 'Pen', min: 1, max: 18, step: 0.5, defaultSize: 4 },
  marker: { label: 'Marker', min: 4, max: 36, step: 1, defaultSize: 13 },
  text: { label: 'Text', min: 12, max: 48, step: 1, defaultSize: 18 },
  rect: { label: 'Rectangle', min: 1, max: 14, step: 1, defaultSize: 3 },
  ellipse: { label: 'Ellipse', min: 1, max: 14, step: 1, defaultSize: 3 },
  diamond: { label: 'Diamond', min: 1, max: 14, step: 1, defaultSize: 3 },
  connector: { label: 'Connector', min: 1, max: 14, step: 0.5, defaultSize: 3 },
};
const CONNECTOR_MIN_LENGTH = 12;
const TOOL_CURSOR: Record<SketchTool, string> = {
  select: 'grab',
  pen: 'crosshair',
  marker: 'crosshair',
  eraser: 'cell',
  text: 'text',
  rect: 'crosshair',
  ellipse: 'crosshair',
  diamond: 'crosshair',
  connector: 'crosshair',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const createId = () => `sketch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const storageKey = (widgetId: string) => `${STORAGE_PREFIX}${widgetId}`;
const svgIdPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');
const connectorMarkerId = (widgetId: string, itemId: string) => (
  `sketch-arrow-${svgIdPart(widgetId)}-${svgIdPart(itemId)}`
);

const toHex = (value: string) => {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return LIGHT_MODE_DRAW_COLOR;
};

const isDrawingTool = (value: SketchTool): value is DrawingTool => DRAWING_TOOL_SET.has(value);

const createDefaultToolColors = (defaultColor: string): Record<DrawingTool, string> => ({
  pen: defaultColor,
  marker: defaultColor,
  text: defaultColor,
  rect: defaultColor,
  ellipse: defaultColor,
  diamond: defaultColor,
  connector: defaultColor,
});

const createDefaultToolSizes = (): Record<DrawingTool, number> => ({
  pen: TOOL_SIZE_CONFIG.pen.defaultSize,
  marker: TOOL_SIZE_CONFIG.marker.defaultSize,
  text: TOOL_SIZE_CONFIG.text.defaultSize,
  rect: TOOL_SIZE_CONFIG.rect.defaultSize,
  ellipse: TOOL_SIZE_CONFIG.ellipse.defaultSize,
  diamond: TOOL_SIZE_CONFIG.diamond.defaultSize,
  connector: TOOL_SIZE_CONFIG.connector.defaultSize,
});

const hexToAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(0,0,0,${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const pathData = (points: SketchPoint[]) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    const midY = (previous.y + point.y) / 2;
    return `${path} Q ${previous.x} ${previous.y} ${midX} ${midY}`;
  }, '');
};

const isResizableItem = (item: SketchItem): item is SketchShape | SketchText | SketchImage | SketchFile => (
  item.kind === 'shape' || item.kind === 'text' || item.kind === 'image' || item.kind === 'file'
);

const isAttachableItem = (item: SketchItem): item is SketchShape | SketchText | SketchImage | SketchFile => (
  item.kind === 'shape' || item.kind === 'text' || item.kind === 'image' || item.kind === 'file'
);

const readStoredProject = (widgetId: string): SketchProject => {
  if (typeof window === 'undefined') {
    return { version: 2, savedAt: 0, items: [] };
  }
  return readStoredSketchProjectFromStorage<SketchItem>(window.localStorage, storageKey(widgetId));
};

const writeStoredProject = (widgetId: string, project: SketchProject) => {
  if (typeof window === 'undefined') return;
  writeStoredSketchProjectToStorage(window.localStorage, storageKey(widgetId), project);
};

const readSketchLibrary = (): SketchLibraryEntry[] => {
  if (typeof window === 'undefined') return [];
  return readStoredSketchLibrary<SketchItem>(window.localStorage, LIBRARY_STORAGE_KEY);
};

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read file.'));
  reader.readAsDataURL(file);
});

const cloneEndpoint = (endpoint: ConnectorEndpoint): ConnectorEndpoint => ({ ...endpoint });

const cloneSketchItems = (sourceItems: SketchItem[]): SketchItem[] => sourceItems.map((item) => {
  if (item.kind === 'path') {
    return { ...item, points: item.points.map((point) => ({ ...point })) };
  }
  if (item.kind === 'connector') {
    return { ...item, from: cloneEndpoint(item.from), to: cloneEndpoint(item.to) };
  }
  return { ...item };
});

const ToolButton: React.FC<{
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active = false, label, onClick, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    onClick={onClick}
    onPointerDown={(event) => event.stopPropagation()}
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
      active
        ? 'border-[var(--ether-on-surface)]/20 bg-[var(--ether-on-surface)] text-[var(--ether-surface)] shadow-sm'
        : 'border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]'
    }`}
  >
    {children}
  </button>
);

const SegmentButton: React.FC<{
  active?: boolean;
  label: string;
  onClick: () => void;
}> = ({ active = false, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    onPointerDown={(event) => event.stopPropagation()}
    className={`flex min-w-0 flex-1 items-center justify-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition ${
      active
        ? 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]'
        : 'bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
    }`}
  >
    {label}
  </button>
);

const SketchWidget: React.FC<{ widget: DashboardWidget; focused?: boolean }> = ({ widget, focused = false }) => {
  const mainToolbarRef = useDraggableScroll<HTMLDivElement>();
  const connectorToolbarRef = useDraggableScroll<HTMLDivElement>();
  const libraryToolbarRef = useDraggableScroll<HTMLDivElement>();

  const themeMode = useThemeMode();
  const defaultPenColor = themeMode === 'dark' ? DARK_MODE_DRAW_COLOR : LIGHT_MODE_DRAW_COLOR;
  const size = useWidgetSize(widget);
  const initialProject = useMemo(() => readStoredProject(widget.id), [widget.id]);
  const [items, setItems] = useState<SketchItem[]>(initialProject.items);
  const [lastSavedAt, setLastSavedAt] = useState(initialProject.savedAt);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [toolColors, setToolColors] = useState<Record<DrawingTool, string>>(() => createDefaultToolColors(defaultPenColor));
  const [toolSizes, setToolSizes] = useState<Record<DrawingTool, number>>(() => createDefaultToolSizes());
  const [toolOptionsTool, setToolOptionsTool] = useState<DrawingTool | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectorStyle, setConnectorStyle] = useState<ConnectorStyle>('elbow');
  const [connectorArrow, setConnectorArrow] = useState<ConnectorArrow>('end');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [savedSketches, setSavedSketches] = useState<SketchLibraryEntry[]>(() => readSketchLibrary());
  const [libraryOpen, setLibraryOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const activeGestureRef = useRef<ActiveGesture | null>(null);
  const pointerMapRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchGesture | null>(null);
  const pendingMoveRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const itemsRef = useRef<SketchItem[]>(items);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const hydratedRef = useRef(false);
  const skipDirtyRef = useRef(false);
  const toolColorTouchedRef = useRef<Partial<Record<DrawingTool, boolean>>>({});
  const autosaveWriterRef = useRef<DeferredSketchProjectWriter<SketchItem> | null>(null);

  const compactToolbar = size.pixelWidth < 620 || size.pixelHeight < 360;
  const showFullTools = size.sizeClass !== 'tiny';
  const paletteColors = themeMode === 'dark' ? DARK_MODE_COLORS : DEFAULT_COLORS;
  const activeToolOptionsTool = toolOptionsTool && showFullTools ? toolOptionsTool : null;

  useEffect(() => {
    setToolColors((current) => {
      let changed = false;
      const next = { ...current };
      DRAWING_TOOLS.forEach((entry) => {
        if (toolColorTouchedRef.current[entry]) return;
        if (next[entry] !== defaultPenColor) {
          next[entry] = defaultPenColor;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [defaultPenColor]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const writer = createDeferredSketchProjectWriter<SketchItem>(
      window.localStorage,
      storageKey(widget.id),
    );
    const flushPendingAutosave = () => {
      writer.flush();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        writer.flush();
      }
    };
    autosaveWriterRef.current = writer;
    window.addEventListener('pagehide', flushPendingAutosave);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flushPendingAutosave);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      writer.flush();
      if (autosaveWriterRef.current === writer) {
        autosaveWriterRef.current = null;
      }
    };
  }, [widget.id]);

  useEffect(() => {
    const refreshLibrary = (event?: StorageEvent) => {
      if (event && event.key !== LIBRARY_STORAGE_KEY) return;
      setSavedSketches(readSketchLibrary());
    };
    window.addEventListener('storage', refreshLibrary);
    return () => window.removeEventListener('storage', refreshLibrary);
  }, []);

  useEffect(() => {
    const project = { version: 2, savedAt: lastSavedAt || Date.now(), items };
    if (hydratedRef.current) {
      if (skipDirtyRef.current) {
        skipDirtyRef.current = false;
        return;
      }
      setDirty(true);
      autosaveWriterRef.current?.schedule(project);
      return;
    }
    hydratedRef.current = true;
  }, [items, lastSavedAt, widget.id]);

  const setZoomSafe = (nextZoom: number) => {
    const clamped = Math.round(clamp(nextZoom, 0.35, focused ? 3 : 2.2) * 1000) / 1000;
    zoomRef.current = clamped;
    setZoom(clamped);
  };

  const setPanSafe = (nextPan: { x: number; y: number }) => {
    panRef.current = nextPan;
    setPan(nextPan);
  };

  const resetView = () => {
    setPanSafe({ x: 0, y: 0 });
    setZoomSafe(1);
  };

  const getToolColor = (targetTool: DrawingTool) => toHex(toolColors[targetTool] || defaultPenColor);

  const getToolSize = (targetTool: DrawingTool) => {
    const config = TOOL_SIZE_CONFIG[targetTool];
    return clamp(toolSizes[targetTool] ?? config.defaultSize, config.min, config.max);
  };

  const getShapeStrokeWidth = (item: SketchShape) => (
    item.width ?? TOOL_SIZE_CONFIG[item.shape].defaultSize
  );

  const replaceCurrentProject = (sourceItems: SketchItem[], timestamp = Date.now()) => {
    const nextItems = cloneSketchItems(sourceItems);
    autosaveWriterRef.current?.cancel();
    itemsRef.current = nextItems;
    skipDirtyRef.current = true;
    setItems(nextItems);
    setSelectedId(null);
    setDirty(false);
    setLastSavedAt(timestamp);
    setTool('select');
    setToolOptionsTool(null);
    resetView();
    writeStoredProject(widget.id, createStoredSketchProject(nextItems, timestamp));
  };

  const boardPointFromClient = (clientX: number, clientY: number): SketchPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left - panRef.current.x) / zoomRef.current, 0, BOARD_WIDTH),
      y: clamp((clientY - rect.top - panRef.current.y) / zoomRef.current, 0, BOARD_HEIGHT),
    };
  };

  const resolveEndpoint = (endpoint: ConnectorEndpoint, sourceItems: SketchItem[]): SketchPoint => {
    if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y };
    const target = sourceItems.find((item) => item.id === endpoint.itemId);
    if (!target || !isAttachableItem(target)) {
      return { x: 0, y: 0 };
    }
    const bounds = { x: target.x, y: target.y, w: target.w, h: target.h };
    if (endpoint.anchor === 'left') return { x: bounds.x, y: bounds.y + bounds.h / 2 };
    if (endpoint.anchor === 'right') return { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 };
    if (endpoint.anchor === 'top') return { x: bounds.x + bounds.w / 2, y: bounds.y };
    if (endpoint.anchor === 'bottom') return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h };
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  };

  const itemBounds = (item: SketchItem, sourceItems: SketchItem[]) => {
    if (item.kind === 'path') {
      if (item.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      const xs = item.points.map((point) => point.x);
      const ys = item.points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(24, Math.max(...xs) - x), h: Math.max(24, Math.max(...ys) - y) };
    }
    if (item.kind === 'connector') {
      const from = resolveEndpoint(item.from, sourceItems);
      const to = resolveEndpoint(item.to, sourceItems);
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      return { x, y, w: Math.max(24, Math.abs(to.x - from.x)), h: Math.max(24, Math.abs(to.y - from.y)) };
    }
    return { x: item.x, y: item.y, w: item.w, h: item.h };
  };

  const nearestAnchor = (point: SketchPoint, bounds: { x: number; y: number; w: number; h: number }): EndpointAnchor => {
    const anchors: Array<{ key: EndpointAnchor; x: number; y: number }> = [
      { key: 'left', x: bounds.x, y: bounds.y + bounds.h / 2 },
      { key: 'right', x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
      { key: 'top', x: bounds.x + bounds.w / 2, y: bounds.y },
      { key: 'bottom', x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
      { key: 'center', x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
    ];
    return anchors
      .map((entry) => ({ ...entry, score: (entry.x - point.x) ** 2 + (entry.y - point.y) ** 2 }))
      .sort((left, right) => left.score - right.score)[0].key;
  };

  const attachEndpoint = (point: SketchPoint, sourceItems: SketchItem[], excludeId?: string): ConnectorEndpoint => {
    for (let index = sourceItems.length - 1; index >= 0; index -= 1) {
      const item = sourceItems[index];
      if (!isAttachableItem(item) || item.id === excludeId) continue;
      const bounds = { x: item.x, y: item.y, w: item.w, h: item.h };
      const inside = (
        point.x >= bounds.x
        && point.x <= bounds.x + bounds.w
        && point.y >= bounds.y
        && point.y <= bounds.y + bounds.h
      );
      if (!inside) continue;
      return {
        kind: 'item',
        itemId: item.id,
        anchor: nearestAnchor(point, bounds),
      };
    }
    return { kind: 'point', x: point.x, y: point.y };
  };

  const shiftEndpoint = (
    endpoint: ConnectorEndpoint,
    dx: number,
    dy: number,
    sourceItems: SketchItem[],
  ): ConnectorEndpoint => {
    const point = resolveEndpoint(endpoint, sourceItems);
    return { kind: 'point', x: point.x + dx, y: point.y + dy };
  };

  const shiftItem = (item: SketchItem, dx: number, dy: number, sourceItems: SketchItem[]): SketchItem => {
    if (item.kind === 'path') {
      return { ...item, points: item.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
    }
    if (item.kind === 'connector') {
      return {
        ...item,
        from: shiftEndpoint(item.from, dx, dy, sourceItems),
        to: shiftEndpoint(item.to, dx, dy, sourceItems),
      };
    }
    return { ...item, x: item.x + dx, y: item.y + dy };
  };

  const resizeItem = (item: SketchItem, dx: number, dy: number, sourceItems: SketchItem[]): SketchItem => {
    if (isResizableItem(item)) {
      return {
        ...item,
        w: Math.max(48, item.w + dx),
        h: Math.max(36, item.h + dy),
      };
    }
    if (item.kind === 'connector') {
      const nextPoint = resolveEndpoint(item.to, sourceItems);
      return {
        ...item,
        to: { kind: 'point', x: nextPoint.x + dx, y: nextPoint.y + dy },
      };
    }
    return item;
  };

  const connectorPath = (item: SketchConnector, sourceItems: SketchItem[]) => {
    const from = resolveEndpoint(item.from, sourceItems);
    const to = resolveEndpoint(item.to, sourceItems);
    if (item.style === 'straight') {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    if (item.style === 'curve') {
      const deltaX = to.x - from.x;
      const control1X = from.x + deltaX * 0.35;
      const control2X = to.x - deltaX * 0.35;
      return `M ${from.x} ${from.y} C ${control1X} ${from.y}, ${control2X} ${to.y}, ${to.x} ${to.y}`;
    }
    const midX = from.x + (to.x - from.x) / 2;
    const radius = Math.min(
      34,
      Math.abs(midX - from.x) / 2,
      Math.abs(to.y - from.y) / 2,
      Math.abs(to.x - midX) / 2,
    );
    if (radius < 3) {
      return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
    }
    const firstX = Math.sign(midX - from.x) || 1;
    const verticalY = Math.sign(to.y - from.y) || 1;
    const secondX = Math.sign(to.x - midX) || 1;
    return [
      `M ${from.x} ${from.y}`,
      `L ${midX - radius * firstX} ${from.y}`,
      `Q ${midX} ${from.y} ${midX} ${from.y + radius * verticalY}`,
      `L ${midX} ${to.y - radius * verticalY}`,
      `Q ${midX} ${to.y} ${midX + radius * secondX} ${to.y}`,
      `L ${to.x} ${to.y}`,
    ].join(' ');
  };

  const createSketchThumbnail = (sourceItems: SketchItem[]) => {
    if (sourceItems.length === 0) return undefined;
    try {
      const previewItems = sourceItems.slice(-160);
      const bounds = previewItems
        .map((item) => itemBounds(item, sourceItems))
        .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y));
      const minX = Math.max(0, Math.min(...bounds.map((entry) => entry.x)) - 56);
      const minY = Math.max(0, Math.min(...bounds.map((entry) => entry.y)) - 56);
      const maxX = Math.min(BOARD_WIDTH, Math.max(...bounds.map((entry) => entry.x + entry.w)) + 56);
      const maxY = Math.min(BOARD_HEIGHT, Math.max(...bounds.map((entry) => entry.y + entry.h)) + 56);
      const viewWidth = Math.max(280, maxX - minX);
      const viewHeight = Math.max(180, maxY - minY);
      const nodes = previewItems.map((item) => {
        if (item.kind === 'path') {
          return `<path d="${pathData(item.points)}" fill="none" stroke="${escapeXml(item.color)}" stroke-width="${item.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${item.opacity}" />`;
        }
        if (item.kind === 'connector') {
          return `<path d="${connectorPath(item, sourceItems)}" fill="none" stroke="${escapeXml(item.color)}" stroke-width="${item.width}" stroke-linecap="round" />`;
        }
        if (item.kind === 'shape') {
          const shapeWidth = getShapeStrokeWidth(item);
          const label = item.label
            ? `<text x="${item.x + item.w / 2}" y="${item.y + item.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="24" font-weight="700" fill="#26231f">${escapeXml(item.label)}</text>`
            : '';
          if (item.shape === 'ellipse') {
            return `<ellipse cx="${item.x + item.w / 2}" cy="${item.y + item.h / 2}" rx="${item.w / 2}" ry="${item.h / 2}" fill="${escapeXml(item.fill)}" stroke="${escapeXml(item.color)}" stroke-width="${shapeWidth}" />${label}`;
          }
          if (item.shape === 'diamond') {
            const points = `${item.x + item.w / 2},${item.y} ${item.x + item.w},${item.y + item.h / 2} ${item.x + item.w / 2},${item.y + item.h} ${item.x},${item.y + item.h / 2}`;
            return `<polygon points="${points}" fill="${escapeXml(item.fill)}" stroke="${escapeXml(item.color)}" stroke-width="${shapeWidth}" />${label}`;
          }
          return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="22" fill="${escapeXml(item.fill)}" stroke="${escapeXml(item.color)}" stroke-width="${shapeWidth}" />${label}`;
        }
        if (item.kind === 'text') {
          return `<text x="${item.x}" y="${item.y + 30}" font-size="${item.fontSize ?? TOOL_SIZE_CONFIG.text.defaultSize}" font-weight="700" fill="${escapeXml(item.color)}">${escapeXml(item.text)}</text>`;
        }
        if (item.kind === 'image') {
          return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="22" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3" /><text x="${item.x + 22}" y="${item.y + 44}" font-size="24" font-weight="700" fill="#475569">${escapeXml(item.name)}</text>`;
        }
        return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="18" fill="#fff7ed" stroke="#fdba74" stroke-width="3" /><text x="${item.x + 22}" y="${item.y + 42}" font-size="22" font-weight="700" fill="#9a3412">${escapeXml(item.name)}</text>`;
      }).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="${minX} ${minY} ${viewWidth} ${viewHeight}"><rect x="${minX}" y="${minY}" width="${viewWidth}" height="${viewHeight}" fill="#f8fafc" />${nodes}</svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return undefined;
    }
  };

  const persistProjectInApp = (timestamp = Date.now()) => {
    const project = createStoredSketchProject(items, timestamp);
    autosaveWriterRef.current?.cancel();
    writeStoredProject(widget.id, project);
    skipDirtyRef.current = true;
    setLastSavedAt(timestamp);
    setDirty(false);
    return project;
  };

  const saveProject = () => {
    const timestamp = Date.now();
    const project = persistProjectInApp(timestamp);
    if (typeof window !== 'undefined') {
      const entry = saveStoredSketchLibraryEntry(window.localStorage, LIBRARY_STORAGE_KEY, {
        name: `Sketch ${new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
        project,
        thumbnail: createSketchThumbnail(project.items),
      }, timestamp);
      setSavedSketches((current) => [entry, ...current.filter((saved) => saved.id !== entry.id)].slice(0, 18));
      setLibraryOpen(true);
    }
  };

  const openSavedSketch = (entry: SketchLibraryEntry) => {
    replaceCurrentProject(entry.project.items, entry.savedAt);
    setLibraryOpen(false);
  };

  const deleteSavedSketch = (entryId: string) => {
    if (typeof window === 'undefined') return;
    deleteStoredSketchLibraryEntry(window.localStorage, LIBRARY_STORAGE_KEY, entryId);
    setSavedSketches(readSketchLibrary());
  };

  const exportProjectFile = () => {
    const timestamp = Date.now();
    const project = persistProjectInApp(timestamp);
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${widget.id}-${PROJECT_EXT}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createExportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`);
    clone.setAttribute('width', String(BOARD_WIDTH));
    clone.setAttribute('height', String(BOARD_HEIGHT));
    clone.querySelectorAll('[data-ui="true"]').forEach((node) => node.remove());
    clone.querySelectorAll('[data-board-layer="true"]').forEach((node) => {
      (node as SVGElement).removeAttribute('transform');
    });
    return clone;
  };

  const exportAsSvg = () => {
    const clone = createExportSvg();
    if (!clone) return;
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'curio-freeform.svg';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAsImage = async () => {
    const clone = createExportSvg();
    if (!clone) return;
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to render sketch image.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = BOARD_WIDTH;
      canvas.height = BOARD_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = 'curio-freeform.png';
        link.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    } catch (error) {
      console.warn('[Sketch] Failed to export image:', error);
      exportAsSvg();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const openProject = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as SketchProject | SketchItem[];
      const nextItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
      replaceCurrentProject(nextItems, Date.now());
    } catch (error) {
      console.warn('[Sketch] Failed to open project:', error);
    }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const nextItems: SketchItem[] = [];
    const current = itemsRef.current;
    const baseIndex = current.length;
    const accepted = Array.from(files).slice(0, 10);
    for (let index = 0; index < accepted.length; index += 1) {
      const file = accepted[index];
      const x = 160 + ((baseIndex + index) % 6) * 48;
      const y = 140 + ((baseIndex + index) % 6) * 42;
      const src = file.size <= MAX_FILE_BYTES ? await fileToDataUrl(file).catch(() => '') : '';
      if (file.type.startsWith('image/') && src) {
        nextItems.push({
          id: createId(),
          kind: 'image',
          x,
          y,
          w: 280,
          h: 190,
          src,
          name: file.name,
        });
      } else {
        nextItems.push({
          id: createId(),
          kind: 'file',
          x,
          y,
          w: 260,
          h: 96,
          name: file.name,
          mime: file.type || 'file',
          size: file.size,
          src,
        });
      }
    }
    setItems((currentItems) => [...currentItems, ...nextItems]);
  };

  const editTextItem = (item: SketchText) => {
    const next = window.prompt('Text', item.text);
    if (next === null) return;
    setItems((current) => current.map((entry) => (
      entry.id === item.id && entry.kind === 'text'
        ? { ...entry, text: next }
        : entry
    )));
  };

  const editShapeLabel = (item: SketchShape) => {
    const next = window.prompt('Shape text', item.label || '');
    if (next === null) return;
    setItems((current) => current.map((entry) => (
      entry.id === item.id && entry.kind === 'shape'
        ? { ...entry, label: next }
        : entry
    )));
  };

  const editConnectorLabel = (item: SketchConnector) => {
    const next = window.prompt('Connector label', item.label || '');
    if (next === null) return;
    setItems((current) => current.map((entry) => (
      entry.id === item.id && entry.kind === 'connector'
        ? { ...entry, label: next }
        : entry
    )));
  };

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  const selectedConnector = selectedItem?.kind === 'connector' ? selectedItem : null;
  const connectorControlsEditSelection = shouldEditSelectedConnectorFromControl(tool, selectedConnector?.id);
  const connectorControlStyle = connectorControlsEditSelection ? selectedConnector?.style ?? connectorStyle : connectorStyle;
  const connectorControlArrow = connectorControlsEditSelection ? selectedConnector?.arrow ?? connectorArrow : connectorArrow;
  const activateTool = (nextTool: SketchTool) => {
    setTool(nextTool);
    setToolOptionsTool(isDrawingTool(nextTool) ? nextTool : null);
    if (nextTool !== 'select') {
      setSelectedId(null);
    }
  };

  const duplicateSelected = () => {
    if (!selectedItem) return;
    const copy = shiftItem({ ...selectedItem, id: createId() } as SketchItem, 36, 36, itemsRef.current);
    setItems((current) => [...current, copy]);
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  };

  const bringSelectedToFront = () => {
    if (!selectedId) return;
    setItems((current) => moveSketchItemToFront(current, selectedId));
  };

  const sendSelectedToBack = () => {
    if (!selectedId) return;
    setItems((current) => moveSketchItemToBack(current, selectedId));
  };

  const resetSketch = () => {
    replaceCurrentProject([], Date.now());
    setTool('pen');
    setToolOptionsTool(null);
    toolColorTouchedRef.current = {};
    setToolColors(createDefaultToolColors(defaultPenColor));
    setToolSizes(createDefaultToolSizes());
    setLibraryOpen(false);
  };

  const chooseToolColor = (targetTool: DrawingTool, nextColor: string) => {
    toolColorTouchedRef.current[targetTool] = true;
    const normalized = toHex(nextColor);
    setToolColors((current) => (
      current[targetTool] === normalized ? current : { ...current, [targetTool]: normalized }
    ));
    if (!selectedId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== selectedId) return item;
      if (item.kind === 'shape') {
        return { ...item, color: normalized, fill: hexToAlpha(normalized, 0.12) };
      }
      if (item.kind === 'connector' || item.kind === 'path' || item.kind === 'text') {
        return { ...item, color: normalized };
      }
      return item;
    }));
  };

  const applyToolSize = (targetTool: DrawingTool, rawSize: number) => {
    const config = TOOL_SIZE_CONFIG[targetTool];
    const normalized = Math.round(clamp(rawSize, config.min, config.max) * 10) / 10;
    setToolSizes((current) => (
      current[targetTool] === normalized ? current : { ...current, [targetTool]: normalized }
    ));
    if (!selectedId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== selectedId) return item;
      if (item.kind === 'path' || item.kind === 'connector' || item.kind === 'shape') {
        return { ...item, width: normalized };
      }
      if (item.kind === 'text') {
        return { ...item, fontSize: normalized };
      }
      return item;
    }));
  };

  const applyConnectorStyle = (style: ConnectorStyle) => {
    if (!connectorControlsEditSelection || !selectedConnector) {
      setConnectorStyle(style);
      if (tool === 'connector') {
        setSelectedId(null);
      }
      return;
    }
    setItems((current) => current.map((item) => (
      item.id === selectedConnector.id && item.kind === 'connector'
        ? { ...item, style }
        : item
    )));
  };

  const applyConnectorArrow = (arrow: ConnectorArrow) => {
    if (!connectorControlsEditSelection || !selectedConnector) {
      setConnectorArrow(arrow);
      if (tool === 'connector') {
        setSelectedId(null);
      }
      return;
    }
    setItems((current) => current.map((item) => (
      item.id === selectedConnector.id && item.kind === 'connector'
        ? { ...item, arrow }
        : item
    )));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveProject();
      return;
    }

    if (!selectedId) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
      return;
    }

    const moveBy: Record<string, SketchPoint> = {
      ArrowLeft: { x: -4, y: 0 },
      ArrowRight: { x: 4, y: 0 },
      ArrowUp: { x: 0, y: -4 },
      ArrowDown: { x: 0, y: 4 },
    };
    const delta = moveBy[event.key];
    if (!delta) return;
    const step = event.shiftKey ? 12 : 4;
    event.preventDefault();
    setItems((current) => current.map((item) => (
      item.id === selectedId
        ? shiftItem(item, delta.x ? (delta.x > 0 ? step : -step) : 0, delta.y ? (delta.y > 0 ? step : -step) : 0, current)
        : item
    )));
  };

  const beginItemPointer = (event: React.PointerEvent, itemId: string) => {
    if (tool !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const point = boardPointFromClient(event.clientX, event.clientY);
    setSelectedId(itemId);
    activeGestureRef.current = {
      mode: 'move',
      id: itemId,
      start: point,
      snapshot: itemsRef.current,
    };
  };

  const beginResize = (event: React.PointerEvent, item: SketchItem) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setSelectedId(item.id);
    activeGestureRef.current = {
      mode: 'resize',
      id: item.id,
      start: boardPointFromClient(event.clientX, event.clientY),
      original: item,
    };
  };

  const beginConnectorEndpoint = (
    event: React.PointerEvent,
    item: SketchConnector,
    endpoint: 'from' | 'to',
  ) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setSelectedId(item.id);
    activeGestureRef.current = {
      mode: 'connector-endpoint',
      id: item.id,
      endpoint,
    };
  };

  const maybeDoubleTap = (id: string, event: React.PointerEvent, onDoubleTap: () => void) => {
    if (event.pointerType !== 'touch') return;
    const now = Date.now();
    const previous = lastTapRef.current;
    if (previous && previous.id === id && now - previous.time < 320) {
      onDoubleTap();
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = { id, time: now };
  };

  const processPointerMove = (pointerId: number, clientX: number, clientY: number) => {
    const active = activeGestureRef.current;

    if (pinchRef.current && pointerMapRef.current.size >= 2) {
      const [first, second] = Array.from(pointerMapRef.current.values());
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      setZoomSafe(pinchRef.current.zoom * (distance / Math.max(1, pinchRef.current.distance)));
      return;
    }

    if (!active) return;

    if (active.mode === 'pan') {
      setPanSafe({
        x: active.originX + (clientX - active.startClientX),
        y: active.originY + (clientY - active.startClientY),
      });
      return;
    }

    if (!pointerMapRef.current.has(pointerId)) return;
    const point = boardPointFromClient(clientX, clientY);

    if (active.mode === 'draw') {
      setItems((current) => current.map((item) => {
        if (item.id !== active.id || item.kind !== 'path') return item;
        const last = item.points[item.points.length - 1];
        const minDistance = Math.max(1.4, item.width * 0.18);
        if (last && Math.hypot(last.x - point.x, last.y - point.y) < minDistance) {
          return item;
        }
        return { ...item, points: appendSmoothedSketchPoint(item.points, point).slice(-1200) };
      }));
      return;
    }

    if (active.mode === 'shape') {
      setItems((current) => current.map((item) => {
        if (item.id !== active.id || item.kind !== 'shape') return item;
        return {
          ...item,
          x: Math.min(active.start.x, point.x),
          y: Math.min(active.start.y, point.y),
          w: Math.max(24, Math.abs(point.x - active.start.x)),
          h: Math.max(24, Math.abs(point.y - active.start.y)),
        };
      }));
      return;
    }

    if (active.mode === 'connector') {
      setItems((current) => current.map((item) => {
        if (item.id !== active.id || item.kind !== 'connector') return item;
        return { ...item, to: { kind: 'point', x: point.x, y: point.y } };
      }));
      return;
    }

    if (active.mode === 'connector-endpoint') {
      setItems((current) => current.map((item) => {
        if (item.id !== active.id || item.kind !== 'connector') return item;
        return { ...item, [active.endpoint]: { kind: 'point', x: point.x, y: point.y } };
      }));
      return;
    }

    if (active.mode === 'move') {
      const dx = point.x - active.start.x;
      const dy = point.y - active.start.y;
      setItems(active.snapshot.map((item) => (
        item.id === active.id
          ? shiftItem(item, dx, dy, active.snapshot)
          : item
      )));
      return;
    }

    if (active.mode === 'resize') {
      const dx = point.x - active.start.x;
      const dy = point.y - active.start.y;
      setItems((current) => current.map((item) => (
        item.id === active.id
          ? resizeItem(active.original, dx, dy, current)
          : item
      )));
    }
  };

  const beginBoardPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointerMapRef.current.size === 2) {
      const [first, second] = Array.from(pointerMapRef.current.values());
      const interruptedGesture = activeGestureRef.current;
      if (
        interruptedGesture?.mode === 'draw'
        || interruptedGesture?.mode === 'shape'
        || interruptedGesture?.mode === 'connector'
      ) {
        setItems((current) => current.filter((item) => item.id !== interruptedGesture.id));
        setSelectedId(null);
      }
      pinchRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: zoomRef.current,
      };
      activeGestureRef.current = null;
      return;
    }

    const point = boardPointFromClient(event.clientX, event.clientY);

    if (tool === 'select') {
      setSelectedId(null);
      activeGestureRef.current = {
        mode: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
      };
      return;
    }

    if (tool === 'eraser') {
      setItems((current) => current.filter((item) => {
        const bounds = itemBounds(item, current);
        return !(
          point.x >= bounds.x
          && point.x <= bounds.x + bounds.w
          && point.y >= bounds.y
          && point.y <= bounds.y + bounds.h
        );
      }));
      return;
    }

    setSelectedId(null);

    if (tool === 'text') {
      const id = createId();
      const fontSize = getToolSize('text');
      setItems((current) => [...current, {
        id,
        kind: 'text',
        x: point.x,
        y: point.y,
        w: 220,
        h: Math.max(84, fontSize * 3),
        text: 'Text',
        color: getToolColor('text'),
        fontSize,
      }]);
      setSelectedId(id);
      setTool('select');
      setToolOptionsTool(null);
      return;
    }

    if (tool === 'connector') {
      const id = createId();
      const from = attachEndpoint(point, itemsRef.current);
      setItems((current) => [...current, {
        id,
        kind: 'connector',
        from,
        to: { kind: 'point', x: point.x, y: point.y },
        color: getToolColor('connector'),
        width: getToolSize('connector'),
        style: connectorStyle,
        arrow: connectorArrow,
        label: '',
      }]);
      setSelectedId(id);
      activeGestureRef.current = {
        mode: 'connector',
        id,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      return;
    }

    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
      const id = createId();
      const stroke = getToolColor(tool);
      setItems((current) => [...current, {
        id,
        kind: 'shape',
        shape: tool,
        x: point.x,
        y: point.y,
        w: 1,
        h: 1,
        color: stroke,
        fill: hexToAlpha(stroke, 0.12),
        width: getToolSize(tool),
        label: '',
      }]);
      setSelectedId(id);
      activeGestureRef.current = { mode: 'shape', id, start: point };
      return;
    }

    const id = createId();
    const pathTool = tool === 'marker' ? 'marker' : 'pen';
    setItems((current) => [...current, {
      id,
      kind: 'path',
      points: [point],
      color: getToolColor(pathTool),
      width: getToolSize(pathTool),
      opacity: tool === 'marker' ? 0.26 : 0.98,
    }]);
    setSelectedId(null);
    activeGestureRef.current = { mode: 'draw', id };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointerMapRef.current.has(event.pointerId)) {
      pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    pendingMoveRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingMoveRef.current;
      if (!pending) return;
      processPointerMove(pending.pointerId, pending.clientX, pending.clientY);
    });
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Some browsers throw when capture was already released by a cancel event.
    }
    pointerMapRef.current.delete(event.pointerId);
    if (pointerMapRef.current.size < 2) {
      pinchRef.current = null;
    }

    const active = activeGestureRef.current;
    if (active?.mode === 'connector') {
      const point = boardPointFromClient(event.clientX, event.clientY);
      const length = Math.hypot(event.clientX - active.startClientX, event.clientY - active.startClientY);
      if (length < CONNECTOR_MIN_LENGTH) {
        setItems((current) => current.filter((item) => item.id !== active.id));
        setSelectedId(null);
      } else {
        setItems((current) => current.map((item) => (
          item.id === active.id && item.kind === 'connector'
            ? { ...item, to: attachEndpoint(point, current, item.id) }
            : item
        )));
        setSelectedId(active.id);
        setTool('select');
        setToolOptionsTool(null);
      }
    }
    if (active?.mode === 'connector-endpoint') {
      const point = boardPointFromClient(event.clientX, event.clientY);
      setItems((current) => current.map((item) => (
        item.id === active.id && item.kind === 'connector'
          ? { ...item, [active.endpoint]: attachEndpoint(point, current, item.id) }
          : item
      )));
    }
    activeGestureRef.current = null;
  };

  const selectionBounds = selectedItem && selectedItem.kind !== 'path' && selectedItem.kind !== 'connector'
    ? itemBounds(selectedItem, items)
    : null;

  const renderAnchorDots = (item: SketchItem) => {
    if (!isAttachableItem(item) || (tool !== 'connector' && item.id !== selectedId)) return null;
    const bounds = { x: item.x, y: item.y, w: item.w, h: item.h };
    const anchors: SketchPoint[] = [
      { x: bounds.x, y: bounds.y + bounds.h / 2 },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
      { x: bounds.x + bounds.w / 2, y: bounds.y },
      { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
    ];
    return (
      <g data-ui="true" pointerEvents="none">
        {anchors.map((anchor, index) => (
          <circle
            key={`${item.id}-anchor-${index}`}
            cx={anchor.x}
            cy={anchor.y}
            r={5 / zoom}
            fill="var(--ether-surface)"
            stroke="var(--ether-on-surface)"
            strokeWidth={1.6 / zoom}
            opacity={tool === 'connector' ? 0.9 : 0.72}
          />
        ))}
      </g>
    );
  };

  const renderItem = (item: SketchItem) => {
    const selected = item.id === selectedId;
    const pointerProps = {
      onPointerDown: (event: React.PointerEvent) => beginItemPointer(event, item.id),
      style: { cursor: tool === 'select' ? 'grab' : 'crosshair' },
    };

    if (item.kind === 'path') {
      return (
        <path
          key={item.id}
          {...pointerProps}
          d={pathData(item.points)}
          fill="none"
          stroke={item.color}
          strokeWidth={item.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={item.opacity}
        />
      );
    }

    if (item.kind === 'connector') {
      const from = resolveEndpoint(item.from, items);
      const to = resolveEndpoint(item.to, items);
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const markerId = connectorMarkerId(widget.id, item.id);
      const markerUrl = `url(#${markerId})`;
      return (
        <g key={item.id} {...pointerProps} onDoubleClick={() => editConnectorLabel(item)}>
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 16 16"
              markerWidth="16"
              markerHeight="16"
              refX="14"
              refY="8"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M3,3 L13,8 L3,13"
                fill="none"
                stroke={item.color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>
          <path
            d={connectorPath(item, items)}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(18, item.width + 12)}
            strokeLinecap="round"
            pointerEvents="stroke"
          />
          <path
            data-sketch-connector-line="true"
            d={connectorPath(item, items)}
            fill="none"
            stroke={item.color}
            strokeWidth={selected ? item.width + 1 : item.width}
            strokeLinecap="round"
            markerStart={item.arrow === 'both' ? markerUrl : undefined}
            markerEnd={item.arrow === 'end' || item.arrow === 'both' ? markerUrl : undefined}
          />
          {selected && (
            <g data-ui="true">
              <circle
                cx={from.x}
                cy={from.y}
                r={8 / zoom}
                fill="var(--ether-surface)"
                stroke={item.color}
                strokeWidth={2 / zoom}
                onPointerDown={(event) => beginConnectorEndpoint(event, item, 'from')}
                style={{ cursor: 'move' }}
              />
              <circle
                cx={to.x}
                cy={to.y}
                r={8 / zoom}
                fill={item.color}
                stroke="var(--ether-surface)"
                strokeWidth={2 / zoom}
                onPointerDown={(event) => beginConnectorEndpoint(event, item, 'to')}
                style={{ cursor: 'move' }}
              />
            </g>
          )}
          {item.label ? (
            <text
              x={mid.x}
              y={mid.y - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={15}
              fontWeight={700}
              fill="var(--ether-on-surface)"
              pointerEvents="none"
            >
              {item.label}
            </text>
          ) : null}
        </g>
      );
    }

    if (item.kind === 'shape') {
      const labelNode = item.label ? (
        <text
          x={item.x + item.w / 2}
          y={item.y + item.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.max(13, Math.min(21, item.h / 4))}
          fontWeight={650}
          fill="var(--ether-on-surface)"
          pointerEvents="none"
        >
          {item.label}
        </text>
      ) : null;

      if (item.shape === 'ellipse') {
        const strokeWidth = getShapeStrokeWidth(item);
        return (
          <g
            key={item.id}
            {...pointerProps}
            onDoubleClick={() => editShapeLabel(item)}
            onPointerUp={(event) => maybeDoubleTap(item.id, event, () => editShapeLabel(item))}
          >
            <ellipse cx={item.x + item.w / 2} cy={item.y + item.h / 2} rx={item.w / 2} ry={item.h / 2} fill={item.fill} stroke={item.color} strokeWidth={strokeWidth} />
            {labelNode}
            {renderAnchorDots(item)}
          </g>
        );
      }
      if (item.shape === 'diamond') {
        const strokeWidth = getShapeStrokeWidth(item);
        const points = `${item.x + item.w / 2},${item.y} ${item.x + item.w},${item.y + item.h / 2} ${item.x + item.w / 2},${item.y + item.h} ${item.x},${item.y + item.h / 2}`;
        return (
          <g
            key={item.id}
            {...pointerProps}
            onDoubleClick={() => editShapeLabel(item)}
            onPointerUp={(event) => maybeDoubleTap(item.id, event, () => editShapeLabel(item))}
          >
            <polygon points={points} fill={item.fill} stroke={item.color} strokeWidth={strokeWidth} />
            {labelNode}
            {renderAnchorDots(item)}
          </g>
        );
      }
      const strokeWidth = getShapeStrokeWidth(item);
      return (
        <g
          key={item.id}
          {...pointerProps}
          onDoubleClick={() => editShapeLabel(item)}
          onPointerUp={(event) => maybeDoubleTap(item.id, event, () => editShapeLabel(item))}
        >
          <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={20} fill={item.fill} stroke={item.color} strokeWidth={strokeWidth} />
          {labelNode}
          {renderAnchorDots(item)}
        </g>
      );
    }

    if (item.kind === 'text') {
      return (
        <g key={item.id}>
          <foreignObject
            {...pointerProps}
            x={item.x}
            y={item.y}
            width={item.w}
            height={item.h}
            onDoubleClick={() => editTextItem(item)}
            onPointerUp={(event) => maybeDoubleTap(item.id, event, () => editTextItem(item))}
          >
            <div
              className="h-full w-full p-1.5 text-lg font-semibold leading-tight"
              style={{ color: item.color, fontSize: item.fontSize ?? TOOL_SIZE_CONFIG.text.defaultSize }}
            >
              {item.text}
            </div>
          </foreignObject>
          {renderAnchorDots(item)}
        </g>
      );
    }

    if (item.kind === 'image') {
      return (
        <g key={item.id} {...pointerProps}>
          <clipPath id={`clip-${item.id}`}>
            <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={20} />
          </clipPath>
          <image href={item.src} x={item.x} y={item.y} width={item.w} height={item.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${item.id})`} />
          {selected ? <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={20} fill="none" stroke="var(--ether-on-surface)" strokeWidth={2.5} /> : null}
          {renderAnchorDots(item)}
        </g>
      );
    }

    return (
      <g key={item.id}>
        <foreignObject {...pointerProps} x={item.x} y={item.y} width={item.w} height={item.h}>
          <div
            className="flex h-full w-full items-center gap-3 rounded-2xl border border-black/10 bg-white/80 p-3 shadow-sm backdrop-blur"
            onDoubleClick={() => item.src && window.open(item.src, '_blank', 'noopener,noreferrer')}
            onPointerUp={(event) => maybeDoubleTap(item.id, event, () => {
              if (item.src) window.open(item.src, '_blank', 'noopener,noreferrer');
            })}
          >
            <Paperclip size={19} className="shrink-0 text-slate-500" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">{item.name}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {Math.ceil(item.size / 1024)} KB
              </div>
            </div>
          </div>
        </foreignObject>
        {renderAnchorDots(item)}
      </g>
    );
  };

  const renderToolOptions = () => {
    if (!activeToolOptionsTool) return null;
    const config = TOOL_SIZE_CONFIG[activeToolOptionsTool];
    const currentColor = getToolColor(activeToolOptionsTool);
    const currentSize = getToolSize(activeToolOptionsTool);

    return (
      <div
        data-testid="sketch-tool-options"
        role="group"
        aria-label={`${config.label} options`}
        className="pointer-events-auto absolute left-1.5 right-1.5 top-[calc(100%+0.5rem)] z-[80] rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-2 shadow-[0_16px_38px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:right-auto sm:w-80"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
            <Palette size={13} />
            <span>{config.label}</span>
          </div>
          <button
            type="button"
            aria-label="Close tool options"
            onClick={() => setToolOptionsTool(null)}
            className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
          >
            Close
          </button>
        </div>

        <div className={`grid gap-2 ${compactToolbar ? 'grid-cols-4' : 'grid-cols-6'}`}>
          {paletteColors.map((entry) => (
            <button
              key={`${activeToolOptionsTool}-${entry}`}
              type="button"
              aria-label={`Tool color ${entry}`}
              aria-pressed={currentColor === entry}
              onClick={() => chooseToolColor(activeToolOptionsTool, entry)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition hover:scale-105 ${entry === '#ffffff' ? 'sketch-color-swatch-white' : ''} ${currentColor === entry ? 'border-[var(--ether-on-surface)] ring-2 ring-[var(--ether-on-surface)]/30' : 'border-[var(--ether-glass-border)]'}`}
              style={{ backgroundColor: entry }}
            >
              {currentColor === entry ? <Check size={13} className={`${entry === '#ffffff' ? 'text-slate-950' : 'text-white'} drop-shadow`} /> : null}
            </button>
          ))}

          <div className={`${compactToolbar ? 'col-span-4' : 'col-span-6'} grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] gap-2`}>
            <div className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]">
              <span className="flex min-w-0 items-center gap-1.5">
                <Palette size={13} />
                Custom
              </span>
              <ColorWheelInput
                value={currentColor}
                onChange={(nextColor) => chooseToolColor(activeToolOptionsTool, nextColor)}
                ariaLabel={`${config.label} custom color`}
                title={`${config.label} custom color`}
                active
                size="sm"
              />
            </div>
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ether-on-surface-variant)]">
              <span className="shrink-0">Size</span>
              <input
                type="range"
                aria-label={`${config.label} size`}
                min={config.min}
                max={config.max}
                step={config.step}
                value={currentSize}
                onChange={(event) => applyToolSize(activeToolOptionsTool, Number(event.currentTarget.value))}
                className="min-w-0 flex-1 accent-[var(--ether-control-active-bg)]"
              />
              <output className="min-w-6 text-right tabular-nums text-[var(--ether-on-surface)]">
                {Number.isInteger(currentSize) ? currentSize : currentSize.toFixed(1)}
              </output>
            </label>
          </div>
        </div>
      </div>
    );
  };

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare widget={widget} accent="amber">
        <WidgetBody align="center" gap="xs" className="items-center">
          <IconEdit />
          <WidgetText as="span" variant="value" className="text-[11px]">
            {items.length}
          </WidgetText>
        </WidgetBody>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell widget={widget} title="Freeform" icon={<IconEdit />} accent="amber" bodyClassName="gap-3">
      <WidgetBody gap="lg" onKeyDown={handleKeyDown} tabIndex={0}>
        <div
          data-testid="sketch-toolbar"
          className="relative z-40 w-full shrink-0 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-1.5 shadow-sm backdrop-blur-md"
        >
          <div
            ref={mainToolbarRef}
            data-testid="sketch-toolbar-primary"
            className="no-scrollbar dashboard-widget-touch-scroll-x flex w-full cursor-grab items-center gap-2 overflow-x-auto overscroll-x-contain pr-2 active:cursor-grabbing [touch-action:pan-x]"
          >
            <ToolButton active={tool === 'select'} label="Select / pan" onClick={() => activateTool('select')}>
              <MousePointer2 size={16} />
            </ToolButton>
            <ToolButton active={tool === 'pen'} label="Pen" onClick={() => activateTool('pen')}>
              <Pencil size={16} />
            </ToolButton>
            <ToolButton active={tool === 'marker'} label="Marker" onClick={() => activateTool('marker')}>
              <Highlighter size={16} />
            </ToolButton>
            <ToolButton active={tool === 'eraser'} label="Erase" onClick={() => activateTool('eraser')}>
              <Eraser size={16} />
            </ToolButton>
            {showFullTools && (
              <>
                <ToolButton active={tool === 'text'} label="Text object" onClick={() => activateTool('text')}>
                  <Type size={16} />
                </ToolButton>
                <ToolButton active={tool === 'rect'} label="Rectangle" onClick={() => activateTool('rect')}>
                  <Square size={16} />
                </ToolButton>
                <ToolButton active={tool === 'ellipse'} label="Ellipse" onClick={() => activateTool('ellipse')}>
                  <Circle size={16} />
                </ToolButton>
                <ToolButton active={tool === 'diamond'} label="Diamond" onClick={() => activateTool('diamond')}>
                  <Diamond size={16} />
                </ToolButton>
                <ToolButton active={tool === 'connector'} label="Connector" onClick={() => activateTool('connector')}>
                  <ArrowLeftRight size={16} />
                </ToolButton>
                <ToolButton label="Add files" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={16} />
                </ToolButton>
                <ToolButton active={libraryOpen} label="Open saved sketches" onClick={() => setLibraryOpen((open) => !open)}>
                  <BookOpen size={16} />
                </ToolButton>
                <ToolButton label="Open sketch file" onClick={() => projectInputRef.current?.click()}>
                  <FolderOpen size={16} />
                </ToolButton>
                <ToolButton label="Save in app" onClick={saveProject}>
                  <Save size={16} />
                </ToolButton>
                <ToolButton label="Export sketch file" onClick={exportProjectFile}>
                  <FileDown size={16} />
                </ToolButton>
              </>
            )}

            <div className="mx-1 h-7 w-px shrink-0 bg-[var(--ether-glass-border)]" />
            <ToolButton label="Zoom out" onClick={() => setZoomSafe(zoom - 0.15)}>
              <ZoomOut size={16} />
            </ToolButton>
            <ToolButton label="Zoom in" onClick={() => setZoomSafe(zoom + 0.15)}>
              <ZoomIn size={16} />
            </ToolButton>

            {showFullTools && (
              <>
                <ToolButton active={showGrid} label="Toggle grid" onClick={() => setShowGrid(!showGrid)}>
                  <Grid3X3 size={16} />
                </ToolButton>
                <ToolButton label="Duplicate selected" onClick={duplicateSelected}>
                  <Copy size={16} />
                </ToolButton>
                {selectedItem && (
                  <>
                    <ToolButton label="Bring selected to front" onClick={bringSelectedToFront}>
                      <BringToFront size={16} />
                    </ToolButton>
                    <ToolButton label="Send selected to back" onClick={sendSelectedToBack}>
                      <SendToBack size={16} />
                    </ToolButton>
                  </>
                )}
                <ToolButton label="Delete selected" onClick={deleteSelected}>
                  <Trash2 size={16} />
                </ToolButton>
                <ToolButton label="Save as image" onClick={() => void exportAsImage()}>
                  <ImageDown size={16} />
                </ToolButton>
              </>
            )}
          </div>

          {renderToolOptions()}
        </div>

        {(tool === 'connector' || selectedConnector) && showFullTools && (
          <div ref={connectorToolbarRef} className="dashboard-widget-touch-scroll-x flex items-center gap-2 pb-1" style={{ scrollbarWidth: 'none' }}>
            <div className="rounded-full bg-[var(--ether-control-bg)] p-1">
              <SegmentButton label="Straight" active={connectorControlStyle === 'straight'} onClick={() => applyConnectorStyle('straight')} />
              <SegmentButton label="Elbow" active={connectorControlStyle === 'elbow'} onClick={() => applyConnectorStyle('elbow')} />
              <SegmentButton label="Curve" active={connectorControlStyle === 'curve'} onClick={() => applyConnectorStyle('curve')} />
            </div>
            <div className="rounded-full bg-[var(--ether-control-bg)] p-1">
              <SegmentButton label="No arrow" active={connectorControlArrow === 'none'} onClick={() => applyConnectorArrow('none')} />
              <SegmentButton label="Arrow" active={connectorControlArrow === 'end'} onClick={() => applyConnectorArrow('end')} />
              <SegmentButton label="Both" active={connectorControlArrow === 'both'} onClick={() => applyConnectorArrow('both')} />
            </div>
            {selectedConnector && (
              <button
                type="button"
                onClick={() => editConnectorLabel(selectedConnector)}
                className="rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
              >
                Label
              </button>
            )}
          </div>
        )}

        {libraryOpen && showFullTools && (
          <div
            className="shrink-0 rounded-[1rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] p-2 shadow-sm"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
                <BookOpen size={13} />
                <span>Saved sketches</span>
                <span className="rounded-full bg-[var(--ether-control-bg)] px-2 py-0.5">{savedSketches.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setLibraryOpen(false)}
                className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
              >
                Close
              </button>
            </div>
            {savedSketches.length === 0 ? (
              <WidgetEmptyState
                title="Save a sketch to keep it here."
                className="px-3 py-4"
              />
            ) : (
              <div ref={libraryToolbarRef} className="dashboard-widget-touch-scroll-x flex gap-2 pb-1" style={{ scrollbarWidth: 'none' }}>
                {savedSketches.map((entry) => (
                  <div
                    key={entry.id}
                    className="w-44 shrink-0 overflow-hidden rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]"
                  >
                    <button
                      type="button"
                      onClick={() => openSavedSketch(entry)}
                      className="block h-20 w-full overflow-hidden bg-white text-left"
                      aria-label={`Open ${entry.name}`}
                    >
                      {entry.thumbnail ? (
                        <img src={entry.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[var(--ether-surface-container-low)] text-[var(--ether-on-surface-variant)]">
                          <IconEdit />
                        </div>
                      )}
                    </button>
                    <div className="space-y-2 p-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-[var(--ether-on-surface)]">{entry.name}</div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                          {entry.project.items.length} objects - {new Date(entry.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openSavedSketch(entry)}
                          className="flex-1 rounded-full bg-[var(--ether-control-active-bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-control-active-text)]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedSketch(entry.id)}
                          className="rounded-full border border-[var(--ether-glass-border)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="relative z-0 min-h-0 flex-1 overflow-hidden rounded-[1.45rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]"
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              setZoomSafe(zoomRef.current + (event.deltaY < 0 ? 0.12 : -0.12));
              return;
            }
            if (tool === 'select') {
              event.preventDefault();
              setPanSafe({ x: panRef.current.x - event.deltaX * 0.8, y: panRef.current.y - event.deltaY * 0.8 });
            }
          }}
        >
          <svg
            ref={svgRef}
            className="h-full w-full touch-none"
            style={{ cursor: TOOL_CURSOR[tool] }}
            onPointerDown={beginBoardPointer}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onLostPointerCapture={endPointer}
            role="img"
            aria-label="Freeform sketch board"
          >
            <defs>
              <pattern id="sketch-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(127,118,104,0.16)" strokeWidth="1" />
              </pattern>
            </defs>
	            <g data-board-layer="true" transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={showGrid ? 'url(#sketch-grid)' : 'transparent'} />
              {items.map(renderItem)}

              {selectionBounds && (
                <g data-ui="true">
                  <rect
                    x={selectionBounds.x - 8}
                    y={selectionBounds.y - 8}
                    width={selectionBounds.w + 16}
                    height={selectionBounds.h + 16}
                    rx={16}
                    fill="none"
                    stroke="var(--ether-on-surface)"
                    strokeDasharray="8 6"
                    strokeWidth={2 / zoom}
                    pointerEvents="none"
                  />
                  <rect
                    x={selectionBounds.x + selectionBounds.w + 4}
                    y={selectionBounds.y + selectionBounds.h + 4}
                    width={18 / zoom}
                    height={18 / zoom}
                    rx={5 / zoom}
                    fill="var(--ether-on-surface)"
                    stroke="var(--ether-surface)"
                    strokeWidth={2 / zoom}
                    onPointerDown={(event) => selectedItem && beginResize(event, selectedItem)}
                    style={{ cursor: 'nwse-resize' }}
                  />
                </g>
              )}
            </g>
          </svg>

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
            {Math.round(zoom * 100)}% {dirty ? '• Unsaved' : ''}
          </div>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center overflow-hidden rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] shadow-sm backdrop-blur">
            <button
              type="button"
              aria-label="Zoom out sketch"
              title="Zoom out"
              onClick={() => setZoomSafe(zoomRef.current - 0.15)}
              className="flex h-8 w-8 items-center justify-center text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              aria-label="Reset sketch view"
              title="Reset view"
              onClick={resetView}
              className="h-8 min-w-12 border-x border-[var(--ether-glass-border)] px-2 text-[10px] font-bold tabular-nums text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in sketch"
              title="Zoom in"
              onClick={() => setZoomSafe(zoomRef.current + 0.15)}
              className="flex h-8 w-8 items-center justify-center text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={resetSketch}
              className="flex h-8 items-center gap-1 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)] transition hover:text-[var(--ether-on-surface)]"
            >
              <Trash2 size={12} /> Reset sketch
            </button>
          </div>
        </div>

        {showFullTools && (
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]">
            <WidgetText as="span" variant="label" tone="muted">
              {items.length} objects
            </WidgetText>
            <WidgetText as="span" variant="label" tone="muted" align="end">
              {lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}
            </WidgetText>
          </div>
        )}
      </WidgetBody>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.ppt,.pptx"
        className="hidden"
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <input
        ref={projectInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void openProject(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </WidgetShell>
  );
};

export default SketchWidget;
