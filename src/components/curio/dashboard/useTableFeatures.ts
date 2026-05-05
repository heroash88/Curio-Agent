import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeDashboardTableCells,
  normalizeDashboardTableCellStyles,
  normalizeDashboardTableColumnWidths,
} from '../../../lib/dashboardContentWidgets';
import type {
  DashboardTableCellStyle,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';

/* ── Types ── */
export interface CellCoord { row: number; column: number }
export interface CellRange { r1: number; c1: number; r2: number; c2: number }

export interface TableSnapshot {
  cells: string[][];
  cellStyles: Record<string, DashboardTableCellStyle>;
  columnWidths: number[];
}

const MAX_HISTORY = 30;
const keyFor = (r: number, c: number) => `${r}:${c}`;

const snapshotsEqual = (left: TableSnapshot, right: TableSnapshot) =>
  JSON.stringify(left.cells) === JSON.stringify(right.cells) &&
  JSON.stringify(left.cellStyles) === JSON.stringify(right.cellStyles) &&
  JSON.stringify(left.columnWidths) === JSON.stringify(right.columnWidths);

/* ── Selection helpers ── */
export const normalizeRange = (a: CellCoord, b: CellCoord): CellRange => ({
  r1: Math.min(a.row, b.row),
  c1: Math.min(a.column, b.column),
  r2: Math.max(a.row, b.row),
  c2: Math.max(a.column, b.column),
});

export const isCellInRange = (r: number, c: number, range: CellRange | null) =>
  range != null && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

export const rangeSize = (range: CellRange | null) =>
  range ? (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) : 0;

/* ── Rich clipboard builder ── */
export const buildRichClipboard = (
  cells: string[][],
  styles: Record<string, DashboardTableCellStyle>,
  range: CellRange,
) => {
  const rows: string[][] = [];
  const htmlRows: string[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const row: string[] = [];
    const htmlCells: string[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const v = cells[r]?.[c] || '';
      row.push(v);
      const s = styles[keyFor(r, c)];
      let style = '';
      if (s?.backgroundColor) style += `background-color:${s.backgroundColor};`;
      if (s?.color) style += `color:${s.color};`;
      if (s?.fontWeight) style += `font-weight:${s.fontWeight};`;
      if (s?.textAlign) style += `text-align:${s.textAlign};`;
      const tag = r === range.r1 ? 'th' : 'td';
      htmlCells.push(style ? `<${tag} style="${style}">${escapeHtml(v)}</${tag}>` : `<${tag}>${escapeHtml(v)}</${tag}>`);
    }
    rows.push(row);
    htmlRows.push(`<tr>${htmlCells.join('')}</tr>`);
  }
  return {
    text: rows.map(r => r.join('\t')).join('\n'),
    html: `<table>${htmlRows.join('')}</table>`,
  };
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Sort ── */
export type SortDir = 'asc' | 'desc' | null;

export const sortRows = (
  cells: string[][],
  headerRow: boolean,
  sortCol: number | undefined,
  sortDir: SortDir,
): string[][] => {
  if (sortCol == null || !sortDir || cells.length < 2) return cells;
  const header = headerRow ? [cells[0]] : [];
  const data = headerRow ? cells.slice(1) : [...cells];
  data.sort((a, b) => {
    const va = (a[sortCol] || '').toLowerCase();
    const vb = (b[sortCol] || '').toLowerCase();
    const na = Number(va), nb = Number(vb);
    const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb);
    return sortDir === 'desc' ? -cmp : cmp;
  });
  return [...header, ...data];
};

/* ── Search ── */
export interface SearchMatch { row: number; column: number }

export const findMatches = (cells: string[][], query: string): SearchMatch[] => {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const matches: SearchMatch[] = [];
  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.toLowerCase().includes(q)) matches.push({ row: r, column: c });
    }),
  );
  return matches;
};

/* ── Selection stats ── */
export const computeSelectionStats = (
  cells: string[][],
  range: CellRange | null,
) => {
  if (!range) return null;
  const values: number[] = [];
  let count = 0;
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      count++;
      const v = Number(cells[r]?.[c]);
      if (!isNaN(v) && cells[r]?.[c]?.trim()) values.push(v);
    }
  }
  if (count <= 1) return null;
  return {
    count,
    sum: values.length > 0 ? values.reduce((a, b) => a + b, 0) : null,
    avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
    numericCount: values.length,
  };
};

/* ── Main hook ── */
export function useTableFeatures(
  initialCells: string[][],
  initialStyles: Record<string, DashboardTableCellStyle>,
  initialWidths: number[],
  widgetId: string,
  onUpdateWidgetConfig?: (id: string, patch: Partial<DashboardWidgetConfig>) => void,
) {
  const [cells, setCells] = useState(initialCells);
  const [cellStyles, setCellStyles] = useState(initialStyles);
  const [columnWidths, setColumnWidths] = useState(initialWidths);
  const cellsRef = useRef(cells);
  const stylesRef = useRef(cellStyles);
  const widthsRef = useRef(columnWidths);
  const saveTimerRef = useRef<number | null>(null);

  // History
  const historyRef = useRef<TableSnapshot[]>([{ cells: initialCells, cellStyles: initialStyles, columnWidths: initialWidths }]);
  const historyIndexRef = useRef(0);

  // Selection
  const [selStart, setSelStart] = useState<CellCoord | null>(null);
  const [selEnd, setSelEnd] = useState<CellCoord | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const searchMatches = useMemo(() => findMatches(cells, searchQuery), [cells, searchQuery]);

  const selectedRange = useMemo(
    () => (selStart && selEnd ? normalizeRange(selStart, selEnd) : selStart ? { r1: selStart.row, c1: selStart.column, r2: selStart.row, c2: selStart.column } : null),
    [selStart, selEnd],
  );

  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { stylesRef.current = cellStyles; }, [cellStyles]);
  useEffect(() => { widthsRef.current = columnWidths; }, [columnWidths]);

  const setCellsSynced = useCallback((next: string[][]) => {
    cellsRef.current = next;
    setCells(next);
  }, []);

  const setCellStylesSynced = useCallback((next: Record<string, DashboardTableCellStyle>) => {
    stylesRef.current = next;
    setCellStyles(next);
  }, []);

  const setColumnWidthsSynced = useCallback((next: number[]) => {
    widthsRef.current = next;
    setColumnWidths(next);
  }, []);

  const commitSave = useCallback(
    (next: string[][], immediate = false, extra: Partial<DashboardWidgetConfig> = {}) => {
      const normalized = normalizeDashboardTableCells(next);
      const save = () => onUpdateWidgetConfig?.(widgetId, { tableCells: normalized, ...extra });
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (immediate) { save(); return; }
      saveTimerRef.current = window.setTimeout(save, 350);
    },
    [onUpdateWidgetConfig, widgetId],
  );

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    commitSave(cellsRef.current, true, {
      tableCellStyles: stylesRef.current,
      tableColumnWidths: widthsRef.current,
    });
  }, [commitSave]);

  const pushHistory = useCallback((snap: TableSnapshot) => {
    const h = historyRef.current;
    const idx = historyIndexRef.current;
    const current = h[idx];
    if (current && snapshotsEqual(current, snap)) return;
    historyRef.current = [...h.slice(0, idx + 1), snap].slice(-MAX_HISTORY);
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const applySnapshot = useCallback((snap: TableSnapshot, immediate = true) => {
    setCellsSynced(snap.cells);
    setCellStylesSynced(snap.cellStyles);
    setColumnWidthsSynced(snap.columnWidths);
    commitSave(snap.cells, immediate, { tableCellStyles: snap.cellStyles, tableColumnWidths: snap.columnWidths });
  }, [commitSave, setCellStylesSynced, setCellsSynced, setColumnWidthsSynced]);

  const snapshot = useCallback((): TableSnapshot => ({
    cells: cellsRef.current.map(r => [...r]),
    cellStyles: { ...stylesRef.current },
    columnWidths: [...widthsRef.current],
  }), []);

  const replaceCells = useCallback((
    nextCells: string[][],
    nextStyles = cellStyles,
    nextWidths = columnWidths,
  ) => {
    const normalized = normalizeDashboardTableCells(nextCells);
    const styles = normalizeDashboardTableCellStyles(nextStyles, normalized);
    const widths = normalizeDashboardTableColumnWidths(nextWidths, normalized[0]?.length || 0);
    setCellsSynced(normalized);
    setCellStylesSynced(styles);
    setColumnWidthsSynced(widths);
    commitSave(normalized, true, { tableCellStyles: styles, tableColumnWidths: widths });
    pushHistory({ cells: normalized, cellStyles: styles, columnWidths: widths });
  }, [cellStyles, columnWidths, commitSave, pushHistory, setCellStylesSynced, setCellsSynced, setColumnWidthsSynced]);

  const updateCell = useCallback((r: number, c: number, value: string) => {
    setCells(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = value;
      cellsRef.current = next;
      commitSave(next);
      return next;
    });
  }, [commitSave]);

  const commitCurrentState = useCallback((immediate = true) => {
    const snap = snapshot();
    const normalized = normalizeDashboardTableCells(snap.cells);
    const styles = normalizeDashboardTableCellStyles(snap.cellStyles, normalized);
    const widths = normalizeDashboardTableColumnWidths(snap.columnWidths, normalized[0]?.length || 0);
    const normalizedSnap = { cells: normalized, cellStyles: styles, columnWidths: widths };
    setCellsSynced(normalized);
    setCellStylesSynced(styles);
    setColumnWidthsSynced(widths);
    commitSave(normalized, immediate, { tableCellStyles: styles, tableColumnWidths: widths });
    pushHistory(normalizedSnap);
  }, [commitSave, pushHistory, setCellStylesSynced, setCellsSynced, setColumnWidthsSynced, snapshot]);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    historyIndexRef.current = idx - 1;
    applySnapshot(historyRef.current[idx - 1]);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const h = historyRef.current;
    if (idx >= h.length - 1) return;
    historyIndexRef.current = idx + 1;
    applySnapshot(h[idx + 1]);
  }, [applySnapshot]);

  const deleteRows = useCallback((range: CellRange) => {
    if (cells.length - (range.r2 - range.r1 + 1) < 2) return;
    const next = cells.filter((_, i) => i < range.r1 || i > range.r2);
    const nextStyles: Record<string, DashboardTableCellStyle> = {};
    Object.entries(cellStyles).forEach(([k, v]) => {
      const [rr, cc] = k.split(':').map(Number);
      if (rr < range.r1) nextStyles[k] = v;
      else if (rr > range.r2) nextStyles[keyFor(rr - (range.r2 - range.r1 + 1), cc)] = v;
    });
    replaceCells(next, nextStyles);
    setSelStart(null); setSelEnd(null);
  }, [cells, cellStyles, replaceCells]);

  const deleteColumns = useCallback((range: CellRange) => {
    const colCount = cells[0]?.length || 0;
    if (colCount - (range.c2 - range.c1 + 1) < 2) return;
    const next = cells.map(row => row.filter((_, i) => i < range.c1 || i > range.c2));
    const nextStyles: Record<string, DashboardTableCellStyle> = {};
    Object.entries(cellStyles).forEach(([k, v]) => {
      const [rr, cc] = k.split(':').map(Number);
      if (cc < range.c1) nextStyles[k] = v;
      else if (cc > range.c2) nextStyles[keyFor(rr, cc - (range.c2 - range.c1 + 1))] = v;
    });
    const nextWidths = columnWidths.filter((_, i) => i < range.c1 || i > range.c2);
    replaceCells(next, nextStyles, nextWidths);
    setSelStart(null); setSelEnd(null);
  }, [cells, cellStyles, columnWidths, replaceCells]);

  const nextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const next = (searchIndex + 1) % searchMatches.length;
    setSearchIndex(next);
    const m = searchMatches[next];
    setSelStart({ row: m.row, column: m.column });
    setSelEnd(null);
  }, [searchMatches, searchIndex]);

  const prevSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const next = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
    setSearchIndex(next);
    const m = searchMatches[next];
    setSelStart({ row: m.row, column: m.column });
    setSelEnd(null);
  }, [searchMatches, searchIndex]);

  const duplicateRow = useCallback((rowIndex: number) => {
    const next = [...cells];
    next.splice(rowIndex + 1, 0, [...cells[rowIndex]]);
    const nextStyles: Record<string, DashboardTableCellStyle> = {};
    Object.entries(cellStyles).forEach(([k, v]) => {
      const [rr, cc] = k.split(':').map(Number);
      if (rr <= rowIndex) nextStyles[k] = v;
      else nextStyles[keyFor(rr + 1, cc)] = v;
    });
    // Copy styles for duplicated row
    cells[rowIndex].forEach((_, cc) => {
      const srcStyle = cellStyles[keyFor(rowIndex, cc)];
      if (srcStyle) nextStyles[keyFor(rowIndex + 1, cc)] = { ...srcStyle };
    });
    replaceCells(next, nextStyles);
  }, [cells, cellStyles, replaceCells]);

  const moveRowUp = useCallback((rowIndex: number) => {
    if (rowIndex <= 0) return;
    const next = cells.map(r => [...r]);
    [next[rowIndex - 1], next[rowIndex]] = [next[rowIndex], next[rowIndex - 1]];
    const nextStyles: Record<string, DashboardTableCellStyle> = {};
    Object.entries(cellStyles).forEach(([k, v]) => {
      const [rr, cc] = k.split(':').map(Number);
      if (rr === rowIndex) nextStyles[keyFor(rr - 1, cc)] = v;
      else if (rr === rowIndex - 1) nextStyles[keyFor(rr + 1, cc)] = v;
      else nextStyles[k] = v;
    });
    replaceCells(next, nextStyles);
    setSelStart({ row: rowIndex - 1, column: selStart?.column || 0 });
    setSelEnd(null);
  }, [cells, cellStyles, replaceCells, selStart]);

  const moveRowDown = useCallback((rowIndex: number) => {
    if (rowIndex >= cells.length - 1) return;
    const next = cells.map(r => [...r]);
    [next[rowIndex], next[rowIndex + 1]] = [next[rowIndex + 1], next[rowIndex]];
    const nextStyles: Record<string, DashboardTableCellStyle> = {};
    Object.entries(cellStyles).forEach(([k, v]) => {
      const [rr, cc] = k.split(':').map(Number);
      if (rr === rowIndex) nextStyles[keyFor(rr + 1, cc)] = v;
      else if (rr === rowIndex + 1) nextStyles[keyFor(rr - 1, cc)] = v;
      else nextStyles[k] = v;
    });
    replaceCells(next, nextStyles);
    setSelStart({ row: rowIndex + 1, column: selStart?.column || 0 });
    setSelEnd(null);
  }, [cells, cellStyles, replaceCells, selStart]);

  const insertRowAt = useCallback((afterIndex: number) => {
    const colCount = cells[0]?.length || 2;
    const next = [...cells];
    next.splice(afterIndex + 1, 0, Array(colCount).fill(''));
    const nextStyles: Record<string, DashboardTableCellStyle> = {};
    Object.entries(cellStyles).forEach(([k, v]) => {
      const [rr, cc] = k.split(':').map(Number);
      if (rr <= afterIndex) nextStyles[k] = v;
      else nextStyles[keyFor(rr + 1, cc)] = v;
    });
    replaceCells(next, nextStyles);
    setSelStart({ row: afterIndex + 1, column: 0 });
    setSelEnd(null);
  }, [cells, cellStyles, replaceCells]);

  const clearSelectedCells = useCallback((range: CellRange) => {
    const next = cells.map(r => [...r]);
    for (let r = range.r1; r <= range.r2; r++) {
      for (let c = range.c1; c <= range.c2; c++) {
        next[r][c] = '';
      }
    }
    replaceCells(next);
  }, [cells, replaceCells]);

  return {
    cells, setCells: setCellsSynced, cellStyles, setCellStyles: setCellStylesSynced, columnWidths, setColumnWidths: setColumnWidthsSynced,
    cellsRef, stylesRef, widthsRef,
    commitSave, replaceCells, updateCell, snapshot, pushHistory, commitCurrentState,
    selStart, setSelStart, selEnd, setSelEnd, selectedRange,
    isDragging, setIsDragging,
    searchQuery, setSearchQuery, searchIndex, setSearchIndex, searchMatches,
    nextSearchMatch, prevSearchMatch,
    undo, redo,
    deleteRows, deleteColumns,
    duplicateRow, moveRowUp, moveRowDown, insertRowAt, clearSelectedCells,
  };
}
