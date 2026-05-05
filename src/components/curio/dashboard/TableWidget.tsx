import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Columns3,
  Copy,
  Download,
  Eraser,
  Hash,
  Highlighter,
  MoreHorizontal,
  Palette,
  Paintbrush,
  Plus,
  PlusCircle,
  Redo2,
  Rows3,
  Search,
  StretchHorizontal,
  Table2,
  Trash2,
  Undo2,
  X,
  Check,
  Columns,
  WrapText,
} from 'lucide-react';

import { useCardTheme } from '../../../hooks/useCardTheme';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import {
  normalizeDashboardTableCells,
  normalizeDashboardTableCellStyles,
  normalizeDashboardTableColumnWidths,
  parseDashboardTableClipboardRich,
} from '../../../lib/dashboardContentWidgets';
import type {
  DashboardTableCellStyle,
  DashboardWidget,
  DashboardWidgetConfig,
} from '../../../services/dashboardTypes';
import WidgetShell from './WidgetShell';
import { WidgetText } from './widgetPrimitives';
import {
  type CellCoord,
  type SortDir,
  buildRichClipboard,
  computeSelectionStats,
  isCellInRange,
  useTableFeatures,
} from './useTableFeatures';
import { getCellDisplayValue, isFormula, getFormulaSuggestions, cellRefFromCoord, colIndexToLetter, shiftFormulaReferences, type FormulaCatalogEntry } from './tableFormulas';

const ALIGNMENT_CYCLE: Array<DashboardTableCellStyle['textAlign']> = [undefined, 'center', 'right', 'left'];

const DEFAULT_TABLE_CELLS = [
  ['Name', 'Status', 'Notes'],
  ['Weather', 'Ready', 'Paste a table to replace this grid'],
  ['Tasks', 'Open', 'Edit cells directly'],
];

const cellKey = (rowIndex: number, columnIndex: number) =>
  `${rowIndex}:${columnIndex}`;

const HEADER_COLORS = [
  { label: 'clear', value: '' },
  { label: 'teal', value: '#ccfbf1' },
  { label: 'blue', value: '#dbeafe' },
  { label: 'amber', value: '#fef3c7' },
  { label: 'rose', value: '#ffe4e6' },
];

const CELL_HIGHLIGHTS = [
  { label: 'clear', value: '' },
  { label: 'amber', value: '#fef3c7' },
  { label: 'mint', value: '#dcfce7' },
  { label: 'sky', value: '#dbeafe' },
  { label: 'rose', value: '#ffe4e6' },
];

const TEXT_COLORS = [
  { label: 'default', value: '' },
  { label: 'slate', value: '#334155' },
  { label: 'teal', value: '#0f766e' },
  { label: 'rose', value: '#be123c' },
  { label: 'violet', value: '#6d28d9' },
];

const DEFAULT_COLUMN_WIDTH = 120;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 420;

const clampColumnWidth = (value: number) =>
  Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(value)));

const keyFor = (rowIndex: number, columnIndex: number) => `${rowIndex}:${columnIndex}`;

const slugifyFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'table';

const tableToTsv = (cells: string[][]) =>
  cells.map((row) => row.join('\t')).join('\n');

const escapeCsvCell = (value: string) => {
  const text = String(value || '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const tableToCsv = (cells: string[][]) =>
  cells.map((row) => row.map(escapeCsvCell).join(',')).join('\n');

interface DisplayTableRow {
  row: string[];
  sourceIndex: number;
}

const compareTableValues = (left: string[], right: string[], columnIndex: number) => {
  const leftValue = (left[columnIndex] || '').toLowerCase();
  const rightValue = (right[columnIndex] || '').toLowerCase();
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return leftValue.localeCompare(rightValue);
};

const buildDisplayRows = (
  cells: string[][],
  headerRow: boolean,
  sortColumn: number | undefined,
  sortDirection: SortDir,
): DisplayTableRow[] => {
  const rows = cells.map((row, sourceIndex) => ({ row, sourceIndex }));
  if (sortColumn == null || !sortDirection || rows.length < 2) return rows;

  const header = headerRow ? rows.slice(0, 1) : [];
  const body = headerRow ? rows.slice(1) : rows.slice();
  body.sort((left, right) => {
    const comparison = compareTableValues(left.row, right.row, sortColumn);
    return sortDirection === 'desc' ? -comparison : comparison;
  });
  return [...header, ...body];
};

const TableWidget: React.FC<{
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (
    widgetId: string,
    patch: Partial<DashboardWidgetConfig>,
  ) => void;
}> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const initCells = useMemo(() => normalizeDashboardTableCells(widget.config.tableCells || DEFAULT_TABLE_CELLS), [widget.config.tableCells]);
  const initStyles = useMemo(() => normalizeDashboardTableCellStyles(widget.config.tableCellStyles, initCells), [widget.config.tableCellStyles, initCells]);
  const initWidths = useMemo(() => normalizeDashboardTableColumnWidths(widget.config.tableColumnWidths, initCells[0]?.length || 0), [widget.config.tableColumnWidths, initCells]);

  const tf = useTableFeatures(initCells, initStyles, initWidths, widget.id, onUpdateWidgetConfig);
  const { cells, cellStyles, columnWidths, commitCurrentState, replaceCells, updateCell, selectedRange, selStart, setSelStart, selEnd, setSelEnd, isDragging, setIsDragging, searchQuery, setSearchQuery, searchIndex, setSearchIndex, searchMatches, nextSearchMatch, prevSearchMatch, undo, redo, deleteRows, deleteColumns, setCells: setTableCells, setCellStyles, setColumnWidths, duplicateRow, moveRowUp, moveRowDown, insertRowAt, clearSelectedCells } = tf;

  const selectedTableTextRef = useRef<HTMLTextAreaElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const [headerColor, setHeaderColor] = useState(String(widget.config.tableHeaderColor || ''));
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [sortCol, setSortCol] = useState<number | undefined>(widget.config.tableSortColumn);
  const [sortDir, setSortDir] = useState<SortDir>(widget.config.tableSortDirection || null);
  const [showRowNumbers, setShowRowNumbers] = useState(widget.config.tableShowRowNumbers ?? false);
  const [editingCell, setEditingCell] = useState<CellCoord | null>(null);
  const [showStripes, setShowStripes] = useState(false);
  const resizeRef = useRef<{ columnIndex: number; startX: number; startWidth: number; widths: number[] } | null>(null);

  // Formula autocomplete state
  const [formulaEditText, setFormulaEditText] = useState('');
  const [acIndex, setAcIndex] = useState(0);
  const formulaEditingRef = useRef<boolean>(false); // true when user is typing a formula
  const formulaCellRef = useRef<HTMLInputElement | null>(null);
  const ignoreBlurRef = useRef<boolean>(false); // prevent blur when clicking to reference
  const formulaDragRef = useRef<{
    startR: number;
    startC: number;
    startSel: number;
    startVal: string;
    targetR: number;
    targetC: number;
  } | null>(null);
  const fillDragRef = useRef<{ startR: number, startC: number, currentR: number, currentC: number } | null>(null);
  const [fillEnd, setFillEnd] = useState<CellCoord | null>(null);
  const [textWrap, setTextWrap] = useState(false);
  const [freezeFirstColumn, setFreezeFirstColumn] = useState(false);
  const [referencedCells, setReferencedCells] = useState<Array<{row: number; col: number}>>([]);

  const formulaSuggestions = useMemo(() => {
    if (!formulaEditText.startsWith('=')) return { suggestions: [] as FormulaCatalogEntry[], partialToken: '' };
    return getFormulaSuggestions(formulaEditText);
  }, [formulaEditText]);

  const showAutocomplete = formulaEditingRef.current && formulaSuggestions.suggestions.length > 0;
  const activeFormulaTarget = editingCell || selStart;
  const formulaBarValue = activeFormulaTarget
    ? formulaEditingRef.current
      ? formulaEditText
      : cells[activeFormulaTarget.row]?.[activeFormulaTarget.column] || ''
    : '';

  const clearLongPressTimer = useCallback(() => {
    if (!longPressTimer.current) return;
    window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, []);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  // Sync from external config changes
  useEffect(() => {
    const nextCells = normalizeDashboardTableCells(widget.config.tableCells || DEFAULT_TABLE_CELLS);
    setTableCells(nextCells);
    setCellStyles(normalizeDashboardTableCellStyles(widget.config.tableCellStyles, nextCells));
    setColumnWidths(normalizeDashboardTableColumnWidths(widget.config.tableColumnWidths, nextCells[0]?.length || 0));
    setHeaderColor(String(widget.config.tableHeaderColor || ''));
  }, [setCellStyles, setColumnWidths, setTableCells, widget.config.tableCellStyles, widget.config.tableCells, widget.config.tableColumnWidths, widget.config.tableHeaderColor]);

  // Selected cell for style panel (first cell of selection)
  const selectedCell = selStart || { row: 1, column: 0 };
  const selectedKey = keyFor(selectedCell.row, selectedCell.column);

  const handlePaste = (
    event: React.ClipboardEvent<HTMLElement>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    const parsed = parseDashboardTableClipboardRich(text, html);
    const parsedCells = parsed.cells;
    const isMultiCell =
      parsedCells.length > 1 || parsedCells.some((row) => row.filter(Boolean).length > 1);

    if (!isMultiCell) return;

    event.preventDefault();
    const rowCount = Math.max(cells.length, rowIndex + parsedCells.length);
    const columnCount = Math.max(cells[0]?.length || 0, columnIndex + (parsedCells[0]?.length || 0));
    const next = Array.from({ length: rowCount }, (_row, index) => [
      ...(cells[index] || []),
      ...Array(Math.max(0, columnCount - (cells[index]?.length || 0))).fill(''),
    ]).map((row) => row.slice(0, columnCount));
    const nextStyles = { ...cellStyles };
    parsedCells.forEach((row, parsedRowIndex) => {
      row.forEach((value, parsedColumnIndex) => {
        const targetRow = rowIndex + parsedRowIndex;
        const targetColumn = columnIndex + parsedColumnIndex;
        next[targetRow][targetColumn] = value;
        const parsedStyle = parsed.cellStyles[keyFor(parsedRowIndex, parsedColumnIndex)];
        if (parsedStyle) {
          nextStyles[keyFor(targetRow, targetColumn)] = parsedStyle;
        }
      });
    });
    replaceCells(next, nextStyles, normalizeDashboardTableColumnWidths(columnWidths, columnCount));
  };

  const addRow = () => {
    const next = [...cells, Array(cells[0]?.length || 2).fill('')];
    replaceCells(next);
  };

  const addColumn = () => {
    const next = cells.map((row) => [...row, '']);
    replaceCells(next, cellStyles, [...columnWidths, DEFAULT_COLUMN_WIDTH]);
  };

  const headerRow = widget.config.tableHeaderRow !== false;
  const title = String(widget.config.tableTitle || 'Table');

  // Sort while preserving source row indices so edits still hit the right row.
  const displayRows = useMemo(() => buildDisplayRows(cells, headerRow, sortCol, sortDir), [cells, headerRow, sortCol, sortDir]);
  const visibleRows = displayRows;

  const tableText = useMemo(() => tableToTsv(cells), [cells]);
  const csvText = useMemo(() => tableToCsv(cells), [cells]);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvText)}`;
  const csvFileName = `${slugifyFileName(title)}.csv`;
  const stats = useMemo(() => computeSelectionStats(cells, selectedRange), [cells, selectedRange]);
  const isCompact = size.pixelWidth < 360;

  const updateSelectedCellStyle = (patch: DashboardTableCellStyle) => {
    const next = { ...cellStyles };
    const targetRange = selectedRange || {
      r1: selectedCell.row,
      c1: selectedCell.column,
      r2: selectedCell.row,
      c2: selectedCell.column,
    };
    for (let rowIndex = targetRange.r1; rowIndex <= targetRange.r2; rowIndex++) {
      for (let columnIndex = targetRange.c1; columnIndex <= targetRange.c2; columnIndex++) {
        if (!cells[rowIndex]?.[columnIndex] && cells[rowIndex]?.[columnIndex] !== '') continue;
        const key = keyFor(rowIndex, columnIndex);
        const current = { ...(next[key] || {}) };
        const merged = { ...current, ...patch };
        Object.keys(merged).forEach((styleKey) => {
          const typedKey = styleKey as keyof DashboardTableCellStyle;
          if (!merged[typedKey]) delete merged[typedKey];
        });
        if (Object.keys(merged).length > 0) next[key] = merged;
        else delete next[key];
      }
    }
    setCellStyles(next);
    onUpdateWidgetConfig?.(widget.id, { tableCellStyles: next });
  };

  const updateHeaderColor = (value: string) => {
    setHeaderColor(value);
    onUpdateWidgetConfig?.(widget.id, { tableHeaderColor: value });
  };

  const selectTableData = () => {
    setSelStart({ row: 0, column: 0 });
    setSelEnd({ row: cells.length - 1, column: (cells[0]?.length || 1) - 1 });
    selectedTableTextRef.current?.focus();
    selectedTableTextRef.current?.select();
  };

  const toggleSort = (col: number) => {
    let nextDir: SortDir = 'asc';
    if (sortCol === col) {
      if (sortDir === 'asc') nextDir = 'desc';
      else if (sortDir === 'desc') nextDir = null;
    }
    setSortCol(nextDir ? col : undefined);
    setSortDir(nextDir);
    onUpdateWidgetConfig?.(widget.id, { tableSortColumn: nextDir ? col : undefined, tableSortDirection: nextDir || undefined });
  };

  const cycleAlignment = () => {
    const current = cellStyles[selectedKey]?.textAlign;
    const idx = ALIGNMENT_CYCLE.indexOf(current as typeof ALIGNMENT_CYCLE[number]);
    const next = ALIGNMENT_CYCLE[(idx + 1) % ALIGNMENT_CYCLE.length];
    updateSelectedCellStyle({ textAlign: next || '' } as DashboardTableCellStyle);
  };

  const toggleBold = () => {
    const current = cellStyles[selectedKey]?.fontWeight;
    updateSelectedCellStyle({ fontWeight: current === 'bold' ? '' : 'bold' });
  };

  const copySelection = () => {
    if (!selectedRange) return;
    const rich = buildRichClipboard(cells, cellStyles, selectedRange);
    navigator.clipboard?.write?.([
      new ClipboardItem({
        'text/plain': new Blob([rich.text], { type: 'text/plain' }),
        'text/html': new Blob([rich.html], { type: 'text/html' }),
      }),
    ]).catch(() => navigator.clipboard?.writeText?.(rich.text));
  };

  const commitFormulaBarValue = useCallback((value: string) => {
    if (!activeFormulaTarget) return;
    const next = cells.map((row) => [...row]);
    next[activeFormulaTarget.row][activeFormulaTarget.column] = value;
    replaceCells(next, cellStyles, columnWidths);
  }, [activeFormulaTarget, cells, cellStyles, columnWidths, replaceCells]);

  const insertFormulaSuggestion = useCallback((entry: FormulaCatalogEntry) => {
    const target = editingCell || selStart;
    const el = formulaCellRef.current;
    if (!el || !target) return;
    const current = el.value || '';
    const partial = formulaSuggestions.partialToken;
    const selectionStart = el.selectionStart ?? current.length;
    const selectionEnd = el.selectionEnd ?? current.length;
    const tokenStart = Math.max(0, selectionStart - partial.length);
    const insertText = `${entry.name}(`;
    const newText = `${current.slice(0, tokenStart)}${insertText}${current.slice(selectionEnd)}`;
    el.value = newText;
    updateCell(target.row, target.column, newText);
    setFormulaEditText(newText);
    setAcIndex(0);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = tokenStart + insertText.length;
      el.setSelectionRange(cursor, cursor);
    });
  }, [editingCell, formulaSuggestions.partialToken, selStart, updateCell]);

  const handleTableKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'a') {
      if (editingCell) return; // let native input handle select all
      event.preventDefault(); selectTableData(); return;
    }
    if (mod && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); redo(); return; }
    if (mod && key === 'c' && selectedRange) { event.preventDefault(); copySelection(); return; }
    if (mod && key === 'b') { event.preventDefault(); toggleBold(); return; }

    // Autocomplete keyboard navigation
    if (showAutocomplete && formulaEditingRef.current) {
      if (key === 'arrowdown') {
        event.preventDefault();
        setAcIndex(prev => Math.min(prev + 1, formulaSuggestions.suggestions.length - 1));
        return;
      }
      if (key === 'arrowup') {
        event.preventDefault();
        setAcIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (key === 'tab' || key === 'enter') {
        event.preventDefault();
        const entry = formulaSuggestions.suggestions[acIndex];
        if (entry) {
          insertFormulaSuggestion(entry);
        }
        return;
      }
      if (key === 'escape') {
        formulaEditingRef.current = false;
        setFormulaEditText('');
        setEditingCell(null);
        setReferencedCells([]);
        return;
      }
    }

    if (key === 'escape') { setSelStart(null); setSelEnd(null); setEditingCell(null); formulaEditingRef.current = false; setFormulaEditText(''); setReferencedCells([]); return; }
    // Delete/Backspace clears selected cells
    if ((key === 'delete' || key === 'backspace') && selectedRange && !editingCell) {
      event.preventDefault(); clearSelectedCells(selectedRange); return;
    }
    // Arrow navigation
    if (!editingCell && selStart && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab', 'enter'].includes(key)) {
      event.preventDefault();
      const currentCell = event.shiftKey && selEnd ? selEnd : selStart;
      const r = currentCell.row, c = currentCell.column;
      const maxR = cells.length - 1, maxC = (cells[0]?.length || 1) - 1;
      let nr = r, nc = c;
      if (key === 'arrowup' || (key === 'enter' && event.shiftKey)) nr = Math.max(0, r - 1);
      else if (key === 'arrowdown' || (key === 'enter' && !event.shiftKey)) nr = Math.min(maxR, r + 1);
      else if (key === 'arrowleft' || (key === 'tab' && event.shiftKey)) nc = Math.max(0, c - 1);
      else if (key === 'arrowright' || (key === 'tab' && !event.shiftKey)) nc = Math.min(maxC, c + 1);
      if (event.shiftKey) setSelEnd({ row: nr, column: nc });
      else {
        setSelStart({ row: nr, column: nc });
        setSelEnd(null);
      }
    }
    // F2 to edit
    if (key === 'f2' && selStart) { setEditingCell(selStart); return; }

    // Start typing to edit (printable characters)
    if (!editingCell && selStart && !event.ctrlKey && !event.metaKey && !event.altKey && key.length === 1) {
      event.preventDefault(); // Prevent native typing to avoid duplicate characters
      setEditingCell(selStart);
      updateCell(selStart.row, selStart.column, event.key);
      if (event.key === '=') {
        formulaEditingRef.current = true;
        setFormulaEditText('=');
        setAcIndex(0);
      }
      return;
    }
  };

  const handleTableCopy = (event: React.ClipboardEvent<HTMLElement>) => {
    if (selectedRange) {
      const rich = buildRichClipboard(cells, cellStyles, selectedRange);
      event.clipboardData.setData('text/plain', rich.text);
      event.clipboardData.setData('text/html', rich.html);
      event.preventDefault();
      return;
    }
    const selectionText = typeof window === 'undefined' ? '' : window.getSelection()?.toString().trim() || '';
    if (selectionText) return;
    event.clipboardData.setData('text/plain', tableText);
    event.preventDefault();
  };

  // Pointer selection handlers
  const cellFromPoint = useCallback((x: number, y: number): CellCoord | null => {
    if (typeof document === 'undefined') return null;
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const td = el.closest('td[data-row][data-col]') as HTMLElement;
    if (!td) return null;
    return { row: Number(td.dataset.row), column: Number(td.dataset.col) };
  }, []);

  const handleFillPointerDown = useCallback((e: React.PointerEvent, r: number, c: number) => {
    e.preventDefault();
    e.stopPropagation();
    fillDragRef.current = { startR: r, startC: c, currentR: r, currentC: c };
    setFillEnd({ row: r, column: c });
    setIsDragging(true);
    setEditingCell(null);
    setFormulaEditText('');
    formulaEditingRef.current = false;
    setReferencedCells([]);
  }, [setIsDragging]);

  const handleCellPointerDown = useCallback((e: React.PointerEvent, r: number, c: number) => {
    if (resizeRef.current) return;

    // Click-to-reference: if editing a formula cell, clicking another cell inserts the reference
    const formulaTarget = editingCell || selStart;
    if (formulaEditingRef.current && formulaTarget && !(formulaTarget.row === r && formulaTarget.column === c)) {
      e.preventDefault();
      e.stopPropagation();
      ignoreBlurRef.current = true;
      const ref = cellRefFromCoord(r, c);
      const el = formulaCellRef.current;
      if (el) {
        // Insert reference at cursor position
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const current = el.value || '';
        const newText = current.slice(0, start) + ref + current.slice(end);
        el.value = newText;
        updateCell(formulaTarget.row, formulaTarget.column, newText);
        setFormulaEditText(newText);
        setReferencedCells(prev => [...prev, { row: r, col: c }]);

        formulaDragRef.current = {
          startR: r,
          startC: c,
          startSel: start,
          startVal: current,
          targetR: formulaTarget.row,
          targetC: formulaTarget.column,
        };
        setIsDragging(true);

        // Restore focus and place cursor
        requestAnimationFrame(() => {
          el.focus();
          const newCursor = start + ref.length;
          el.setSelectionRange(newCursor, newCursor);
          setTimeout(() => { ignoreBlurRef.current = false; }, 100);
        });
      }
      return;
    }

    // Start selection
    setSelStart({ row: r, column: c });
    if (e.shiftKey) { setSelEnd({ row: r, column: c }); return; }
    setSelEnd(null);
    setIsDragging(true);
    setEditingCell(null);
    setFormulaEditText('');
    formulaEditingRef.current = false;
    setReferencedCells([]);
    // Long press for touch
    if (e.pointerType === 'touch') {
      clearLongPressTimer();
      longPressTimer.current = window.setTimeout(() => setIsDragging(true), 300);
    }
  }, [clearLongPressTimer, setSelStart, setSelEnd, setIsDragging, editingCell, selStart, updateCell]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      const coord = cellFromPoint(e.clientX, e.clientY);
      if (coord) {
        if (fillDragRef.current) {
          fillDragRef.current.currentR = coord.row;
          fillDragRef.current.currentC = coord.column;
          setFillEnd(coord);
          setSelEnd(coord);
        } else if (formulaDragRef.current) {
          const el = formulaCellRef.current as HTMLInputElement | null;
          if (el) {
            const rStart = formulaDragRef.current.startR;
            const cStart = formulaDragRef.current.startC;
            const rEnd = coord.row;
            const cEnd = coord.column;
            const targetR = formulaDragRef.current.targetR;
            const targetC = formulaDragRef.current.targetC;

            const minR = Math.min(rStart, rEnd), maxR = Math.max(rStart, rEnd);
            const minC = Math.min(cStart, cEnd), maxC = Math.max(cStart, cEnd);
            let refStr = '';
            if (minR === maxR && minC === maxC) refStr = cellRefFromCoord(minR, minC);
            else refStr = `${cellRefFromCoord(minR, minC)}:${cellRefFromCoord(maxR, maxC)}`;

            const start = formulaDragRef.current.startSel;
            const current = formulaDragRef.current.startVal;
            const newText = current.slice(0, start) + refStr + current.slice(start);
            if (el.value !== newText) {
              el.value = newText;
              updateCell(targetR, targetC, newText);
              setFormulaEditText(newText);

              const refs = [];
              for(let rr=minR; rr<=maxR; rr++) for(let cc=minC; cc<=maxC; cc++) refs.push({row: rr, col: cc});
              setReferencedCells(refs);

              el.focus();
              const newCursor = start + refStr.length;
              el.setSelectionRange(newCursor, newCursor);
            }
          }
        } else {
          setSelEnd(coord);
        }
      }
    };
    const onUp = () => {
      if (fillDragRef.current && fillEnd) {
        const startR = fillDragRef.current.startR;
        const startC = fillDragRef.current.startC;
        const endR = fillEnd.row;
        const endC = fillEnd.column;

        const minR = Math.min(startR, endR), maxR = Math.max(startR, endR);
        const minC = Math.min(startC, endC), maxC = Math.max(startC, endC);

        const sourceVal = cells[startR]?.[startC] || '';
        const sourceStyle = cellStyles[keyFor(startR, startC)];

        const newCells = cells.map(r => [...r]);
        const newStyles = { ...cellStyles };

        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            if (r === startR && c === startC) continue;
            let val = sourceVal;
            if (val.startsWith('=')) {
              val = shiftFormulaReferences(val, r - startR, c - startC);
            }
            newCells[r][c] = val;
            if (sourceStyle) newStyles[keyFor(r, c)] = { ...sourceStyle };
          }
        }
        replaceCells(newCells, newStyles);
        setSelStart({ row: minR, column: minC });
        setSelEnd({ row: maxR, column: maxC });
      }
      setIsDragging(false);
      formulaDragRef.current = null;
      fillDragRef.current = null;
      setFillEnd(null);
      clearLongPressTimer();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [isDragging, cellFromPoint, setSelEnd, setIsDragging, editingCell, updateCell, fillEnd, cells, cellStyles, replaceCells, clearLongPressTimer]);

  const autoFitColumn = (e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    let maxLen = 4; // minimum sensible width
    for (let r = 0; r < cells.length; r++) {
      const val = cells[r]?.[columnIndex] || '';
      const displayVal = getCellDisplayValue(val, cells);
      if (displayVal.length > maxLen) maxLen = displayVal.length;
    }
    const newWidth = Math.min(Math.max(maxLen * 8 + 24, 60), 400);
    const newWidths = [...columnWidths];
    newWidths[columnIndex] = newWidth;
    setColumnWidths(newWidths);
    onUpdateWidgetConfig?.(widget.id, { tableColumnWidths: newWidths });
  };

  const beginColumnResize = (event: React.PointerEvent<HTMLButtonElement>, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { columnIndex, startX: event.clientX, startWidth: columnWidths[columnIndex] || DEFAULT_COLUMN_WIDTH, widths: [...columnWidths] };
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const newWidth = clampColumnWidth(state.startWidth + event.clientX - state.startX);
      const colEl = document.getElementById(`col-${widget.id}-${state.columnIndex}`);
      if (colEl) {
        colEl.style.width = `${newWidth}px`;
      }
    };
    const handlePointerUp = () => {
      if (!resizeRef.current) return;
      const state = resizeRef.current;
      const colEl = document.getElementById(`col-${widget.id}-${state.columnIndex}`);
      if (colEl) {
        const nextWidths = [...state.widths];
        nextWidths[state.columnIndex] = parseInt(colEl.style.width, 10) || state.startWidth;
        setColumnWidths(nextWidths);
        onUpdateWidgetConfig?.(widget.id, { tableColumnWidths: nextWidths });
      }
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [onUpdateWidgetConfig, widget.id, setColumnWidths]);

  const btnClass = 'inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-2.5 text-xs font-semibold text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]';
  const btnActiveClass = 'inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/12 px-2.5 text-xs font-semibold text-[var(--ether-on-surface)] transition';

  return (
    <WidgetShell widget={widget} title={title} icon={<Table2 size={16} />} accent="teal"
      rightSlot={<WidgetText variant="label" tone="muted">{cells.length} × {cells[0]?.length || 0}</WidgetText>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {size.pixelHeight >= 240 && (
          <div className="grid gap-2">
            {/* Primary toolbar */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" data-tip="Add row" onClick={addRow} className={btnClass}><Rows3 size={13} />Row</button>
              <button type="button" data-tip="Add column" onClick={addColumn} className={btnClass}><Columns3 size={13} />Col</button>
              {!isCompact && (
                <>
                  <button type="button" data-tip="Toggle header row" onClick={() => onUpdateWidgetConfig?.(widget.id, { tableHeaderRow: widget.config.tableHeaderRow === false })} className={btnClass}>
                    <Plus size={13} />Header {headerRow ? 'on' : 'off'}
                  </button>
                  <button type="button" data-tip="Cell styles" aria-label="Style selected cell" onClick={() => setStylePanelOpen(o => !o)} className={stylePanelOpen ? btnActiveClass : btnClass}>
                    <Paintbrush size={13} />Style
                  </button>
                  <button type="button" data-tip="Bold · ⌘B" aria-label="Bold" onClick={toggleBold} className={cellStyles[selectedKey]?.fontWeight === 'bold' ? btnActiveClass : btnClass}><Bold size={13} /></button>
                  <button type="button" data-tip="Cycle alignment" aria-label="Align" onClick={cycleAlignment} className={btnClass}>
                    {cellStyles[selectedKey]?.textAlign === 'center' ? <AlignCenter size={13} /> : cellStyles[selectedKey]?.textAlign === 'right' ? <AlignRight size={13} /> : <AlignLeft size={13} />}
                  </button>
                  <button type="button" data-tip="Copy · ⌘C" aria-label="Copy selection" onClick={copySelection} className={btnClass}><Clipboard size={13} />Copy</button>
                  {selectedRange && <button type="button" data-tip="Clear cells · Del" aria-label="Clear cells" onClick={() => clearSelectedCells(selectedRange)} className={btnClass}><Eraser size={13} /></button>}
                  <button type="button" data-tip="Undo · ⌘Z" aria-label="Undo" onClick={undo} className={btnClass}><Undo2 size={13} /></button>
                  <button type="button" data-tip="Redo · ⌘⇧Z" aria-label="Redo" onClick={redo} className={btnClass}><Redo2 size={13} /></button>
                  <button type="button" data-tip="Find in table" aria-label="Search" onClick={() => setSearchOpen(o => !o)} className={`dashboard-widget-control-button ${searchOpen ? 'dashboard-widget-control-button-active' : ''}`}><Search size={13} /></button>
                  <button type="button" data-tip="Row numbers" aria-label="Row numbers" onClick={() => { const v = !showRowNumbers; setShowRowNumbers(v); onUpdateWidgetConfig?.(widget.id, { tableShowRowNumbers: v }); }} className={showRowNumbers ? btnActiveClass : btnClass}><Hash size={13} /></button>
                  <button type="button" data-tip="Zebra stripes" aria-label="Striped rows" onClick={() => setShowStripes(s => !s)} className={showStripes ? btnActiveClass : btnClass}><StretchHorizontal size={13} /></button>
                  <button type="button" data-tip="Freeze 1st column" aria-label="Freeze 1st column" onClick={() => setFreezeFirstColumn(s => !s)} className={freezeFirstColumn ? btnActiveClass : btnClass}><Columns size={13} /></button>
                  <button type="button" data-tip="Wrap text" aria-label="Wrap text" onClick={() => setTextWrap(w => !w)} className={textWrap ? btnActiveClass : btnClass}><WrapText size={13} /></button>
                  {selectedRange && selStart && selStart.row > 0 && (
                    <>
                      {cells.length > 2 && <button type="button" data-tip="Delete row" aria-label="Delete row" onClick={() => deleteRows(selectedRange)} className={btnClass}><Trash2 size={13} /></button>}
                      <button type="button" data-tip="Duplicate row" aria-label="Duplicate row" onClick={() => duplicateRow(selStart.row)} className={btnClass}><Copy size={13} /></button>
                      <button type="button" data-tip="Insert row below" aria-label="Insert row below" onClick={() => insertRowAt(selStart.row)} className={btnClass}><PlusCircle size={13} /></button>
                      <button type="button" data-tip="Move up" aria-label="Move row up" onClick={() => moveRowUp(selStart.row)} className={btnClass}><ArrowUp size={13} /></button>
                      <button type="button" data-tip="Move down" aria-label="Move row down" onClick={() => moveRowDown(selStart.row)} className={btnClass}><ArrowDown size={13} /></button>
                    </>
                  )}
                  {selectedRange && selectedRange.c1 === selectedRange.c2 && (cells[0]?.length || 0) > 2 && (
                    <button type="button" data-tip="Delete column" aria-label="Delete column" onClick={() => deleteColumns(selectedRange)} className={btnClass}><Trash2 size={13} />Col</button>
                  )}
                  <a data-tip="Export as CSV" aria-label="Export table as CSV" href={csvHref} download={csvFileName} className={btnClass}><Download size={13} />CSV</a>
                </>
              )}
              {isCompact && (
                <div className="relative">
                  <button type="button" aria-label="More actions" onClick={() => setOverflowOpen(o => !o)} className={`dashboard-widget-control-button ${overflowOpen ? 'dashboard-widget-control-button-active' : ''}`}><MoreHorizontal size={13} /></button>
                  {overflowOpen && (
                    <div className="table-widget-overflow-menu">
                      <button type="button" onClick={() => { setStylePanelOpen(o => !o); setOverflowOpen(false); }}><Paintbrush size={13} />Style</button>
                      <button type="button" onClick={() => { copySelection(); setOverflowOpen(false); }}><Clipboard size={13} />Copy</button>
                      <button type="button" onClick={() => { undo(); setOverflowOpen(false); }}><Undo2 size={13} />Undo</button>
                      <button type="button" onClick={() => { redo(); setOverflowOpen(false); }}><Redo2 size={13} />Redo</button>
                      <button type="button" onClick={() => { setSearchOpen(o => !o); setOverflowOpen(false); }}><Search size={13} />Search</button>
                      <button type="button" onClick={() => { const v = !showRowNumbers; setShowRowNumbers(v); onUpdateWidgetConfig?.(widget.id, { tableShowRowNumbers: v }); setOverflowOpen(false); }}><Hash size={13} />Row #</button>
                      <button type="button" onClick={() => { onUpdateWidgetConfig?.(widget.id, { tableHeaderRow: widget.config.tableHeaderRow === false }); setOverflowOpen(false); }}><Plus size={13} />Header {headerRow ? 'on' : 'off'}</button>
                      <a href={csvHref} download={csvFileName} onClick={() => setOverflowOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', fontSize: '0.75rem', fontWeight: 600, minHeight: '2.5rem', color: 'inherit', textDecoration: 'none' }}><Download size={13} />Export CSV</a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Search bar */}
            {searchOpen && (
              <div className="flex items-center gap-1.5 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/55 px-2.5 py-1.5">
                <Search size={13} className="shrink-0 text-[var(--ether-on-surface-variant)]" />
                <input
                  type="text" placeholder="Search cells…" value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchIndex(0); }}
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]"
                />
                {searchMatches.length > 0 && (
                  <span className={`text-[10px] font-bold ${theme.onSurfaceVariant}`}>{searchIndex + 1}/{searchMatches.length}</span>
                )}
                <button type="button" onClick={prevSearchMatch} className="p-1 text-[var(--ether-on-surface-variant)] hover:text-[var(--ether-on-surface)]"><ChevronUp size={13} /></button>
                <button type="button" onClick={nextSearchMatch} className="p-1 text-[var(--ether-on-surface-variant)] hover:text-[var(--ether-on-surface)]"><ChevronDown size={13} /></button>
                <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="p-1 text-[var(--ether-on-surface-variant)] hover:text-[var(--ether-on-surface)]"><X size={13} /></button>
              </div>
            )}

            {/* Style panel */}
            {stylePanelOpen && (
              <div className="grid gap-2 rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/55 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-20 items-center gap-1.5"><Palette size={13} /><WidgetText variant="label" tone="muted">Header</WidgetText></span>
                  {HEADER_COLORS.map(o => (
                    <button key={o.label} type="button" aria-label={`Set header color ${o.label}`} title={`Set header color ${o.label}`}
                      onClick={() => updateHeaderColor(o.value)}
                      className={`h-7 w-7 rounded-full border transition hover:scale-105 ${headerColor === o.value ? 'border-[var(--ether-on-surface)]' : 'border-[var(--ether-glass-border)]'}`}
                      style={{ background: o.value || 'transparent' }} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-20 items-center gap-1.5"><Highlighter size={13} /><WidgetText variant="label" tone="muted">Cell fill</WidgetText></span>
                  {CELL_HIGHLIGHTS.map(o => (
                    <button key={o.label} type="button" aria-label={`Highlight selected cell ${o.label}`} title={`Highlight selected cell ${o.label}`}
                      onClick={() => updateSelectedCellStyle({ backgroundColor: o.value })}
                      className="h-7 w-7 rounded-full border border-[var(--ether-glass-border)] transition hover:scale-105"
                      style={{ background: o.value || 'transparent' }} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-20 items-center gap-1.5"><WidgetText variant="label" tone="muted">Text</WidgetText></span>
                  {TEXT_COLORS.map(o => (
                    <button key={o.label} type="button" aria-label={`Set selected cell text ${o.label}`} title={`Set selected cell text ${o.label}`}
                      onClick={() => updateSelectedCellStyle({ color: o.value })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[10px] font-black transition hover:bg-[var(--ether-control-hover)]"
                      style={{ color: o.value || 'var(--ether-on-surface)' }}>A</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <textarea ref={selectedTableTextRef} aria-label="Selected table data" readOnly value={tableText} className="sr-only" />

        {/* Formula bar with autocomplete */}
        {selStart && (
          <div className="relative">
            <div className="table-widget-formula-bar rounded-t-[1.15rem]">
              <span className="formula-label">ƒx</span>
              <input
                ref={formulaCellRef}
                aria-label="Formula bar"
                value={formulaBarValue}
                placeholder="Type text or =SUM(A2:B2)"
                onFocus={() => {
                  const current = cells[selStart.row]?.[selStart.column] || '';
                  formulaEditingRef.current = true;
                  setFormulaEditText(current);
                  setAcIndex(0);
                }}
                onChange={(event) => {
                  const text = event.target.value;
                  formulaEditingRef.current = true;
                  setFormulaEditText(text);
                  setAcIndex(0);
                  updateCell(selStart.row, selStart.column, text);
                }}
                onBlur={(event) => {
                  if (ignoreBlurRef.current) return;
                  commitFormulaBarValue(event.currentTarget.value);
                  formulaEditingRef.current = false;
                  setFormulaEditText('');
                  setReferencedCells([]);
                }}
                onKeyDown={(event) => {
                  const key = event.key.toLowerCase();
                  if (showAutocomplete && (key === 'arrowdown' || key === 'arrowup' || key === 'tab' || key === 'enter')) {
                    event.preventDefault();
                    if (key === 'arrowdown') setAcIndex((prev) => Math.min(prev + 1, formulaSuggestions.suggestions.length - 1));
                    else if (key === 'arrowup') setAcIndex((prev) => Math.max(prev - 1, 0));
                    else {
                      const entry = formulaSuggestions.suggestions[acIndex];
                      if (entry) insertFormulaSuggestion(entry);
                    }
                    return;
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    const current = cells[selStart.row]?.[selStart.column] || '';
                    setFormulaEditText(current);
                    formulaEditingRef.current = false;
                    event.currentTarget.blur();
                    return;
                  }
                  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.stopPropagation();
                  }
                }}
                className="min-w-0 flex-1 bg-transparent font-mono text-[0.72rem] font-semibold text-[var(--ether-on-surface)] outline-none placeholder:text-[var(--ether-on-surface-variant)]/45"
              />
              {formulaEditingRef.current && (
                <div className="flex items-center gap-2">
                  {formulaEditText.startsWith('=') && <span className="text-[0.5625rem] font-semibold opacity-40">Click a cell to insert reference</span>}
                  <button type="button" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => formulaCellRef.current?.blur()} className="dashboard-widget-control-button dashboard-widget-control-button-primary shrink-0" aria-label="Confirm formula" title="Confirm formula">
                    <Check size={12} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
            {showAutocomplete && (
              <div className="table-widget-autocomplete">
                {formulaSuggestions.suggestions.map((entry, i) => (
                  <button
                    key={entry.name}
                    type="button"
                    className={`table-widget-autocomplete-item ${i === acIndex ? 'active' : ''}`}
                    onPointerDown={e => {
                      e.preventDefault();
                      ignoreBlurRef.current = true;
                      insertFormulaSuggestion(entry);
                      setTimeout(() => { ignoreBlurRef.current = false; }, 100);
                    }}
                  >
                    <span className="ac-badge">{entry.category}</span>
                    <span className="ac-name">{entry.name}</span>
                    <span className="ac-sig">{entry.signature}</span>
                    <span className="ac-desc">{entry.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className={`dashboard-widget-touch-scroll-x min-h-0 flex-1 select-text rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/45 ${isDragging ? 'table-widget-dragging' : ''}`}>
          <table
            ref={tableRef}
            className="min-w-full table-fixed select-text border-separate border-spacing-0 text-left text-sm"
            onKeyDownCapture={handleTableKeyDown}
            onCopyCapture={handleTableCopy}
            tabIndex={0}
          >
            <colgroup>
              {showRowNumbers && <col style={{ width: 40 }} />}
              {(cells[0] || []).map((_, ci) => (
                <col key={ci} id={`col-${widget.id}-${ci}`} style={{ width: columnWidths[ci] || DEFAULT_COLUMN_WIDTH }} />
              ))}
            </colgroup>
            <tbody>
              {/* Column letter header */}
              {headerRow && (
                <tr>
                  {showRowNumbers && <td className="table-widget-col-letter border-r border-[var(--ether-glass-border)]"></td>}
                  {(cells[0] || []).map((_, ci) => (
                    <td key={`col-letter-${ci}`} className="table-widget-col-letter border-r border-[var(--ether-glass-border)]">
                      {colIndexToLetter(ci)}
                    </td>
                  ))}
                </tr>
              )}
              {visibleRows.map(({ row, sourceIndex }, visibleIndex) => {
                const rowIndex = sourceIndex;
                const isHeaderRow = headerRow && rowIndex === 0;
                return (
                  <tr key={rowIndex} className={`${isHeaderRow ? 'table-widget-frozen-header' : ''} ${!isHeaderRow && showStripes && visibleIndex % 2 === 0 ? 'bg-[var(--ether-surface-container-low)]/30' : ''}`}>
                    {showRowNumbers && (
                      <td className="table-widget-row-number border-b border-[var(--ether-glass-border)] p-0"
                        onClick={() => { setSelStart({ row: rowIndex, column: 0 }); setSelEnd({ row: rowIndex, column: (cells[0]?.length || 1) - 1 }); }}>
                        {isHeaderRow ? '#' : headerRow ? rowIndex : rowIndex + 1}
                      </td>
                    )}
                    {row.map((cell, columnIndex) => {
                      const style = cellStyles[keyFor(rowIndex, columnIndex)] || {};
                      const inSelection = isCellInRange(rowIndex, columnIndex, selectedRange);
                      const isFocused = selStart?.row === rowIndex && selStart?.column === columnIndex && !selEnd;
                      const isSearchMatch = searchMatches.some(m => m.row === rowIndex && m.column === columnIndex);
                      const isActiveMatch = searchMatches[searchIndex]?.row === rowIndex && searchMatches[searchIndex]?.column === columnIndex;
                      const isEditing = editingCell?.row === rowIndex && editingCell?.column === columnIndex;
                      const isReferenced = referencedCells.some(rc => rc.row === rowIndex && rc.col === columnIndex);
                      return (
                        <td key={cellKey(rowIndex, columnIndex)}
                          data-row={rowIndex} data-col={columnIndex}
                          className={`relative border-b border-r border-[var(--ether-glass-border)] p-0 ${
                            inSelection ? 'table-widget-selection-cell' : ''
                          } ${isFocused ? 'table-widget-active-cell' : ''} ${
                            isActiveMatch ? 'table-widget-search-match-active' : isSearchMatch ? 'table-widget-search-match' : ''
                          } ${isFormula(cell) ? 'table-widget-formula-cell' : ''} ${isReferenced ? 'table-widget-ref-highlight' : ''} ${
                            freezeFirstColumn && columnIndex === 0 ? 'sticky left-0 z-20' : ''
                          }`}
                          style={{
                            backgroundColor: style.backgroundColor || (isHeaderRow ? headerColor || undefined : undefined) || (freezeFirstColumn && columnIndex === 0 ? 'var(--ether-surface-container-low)' : undefined)
                          }}
                          onPointerDown={e => handleCellPointerDown(e, rowIndex, columnIndex)}
                        >
                          {isEditing ? (
                            <input
                              ref={formulaCellRef}
                              type="text"
                              autoFocus
                              defaultValue={cell}
                              onChange={e => {
                                const text = e.target.value;
                                updateCell(rowIndex, columnIndex, text);
                                if (text.startsWith('=')) {
                                  formulaEditingRef.current = true;
                                  setFormulaEditText(text);
                                  setAcIndex(0);
                                } else {
                                  formulaEditingRef.current = false;
                                  setFormulaEditText(text);
                                }
                              }}
                              onBlur={() => {
                                if (ignoreBlurRef.current) return;
                                if (formulaCellRef.current) {
                                  updateCell(rowIndex, columnIndex, formulaCellRef.current.value);
                                }
                                commitCurrentState(true);
                                setEditingCell(null);
                                formulaEditingRef.current = false;
                                setFormulaEditText('');
                                setReferencedCells([]);
                              }}
                              onKeyDown={e => {
                                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                                  e.stopPropagation();
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              onPaste={e => { handlePaste(e, rowIndex, columnIndex); e.stopPropagation(); }}
                              className={`min-h-10 min-w-24 w-full bg-transparent px-3 py-2.5 text-sm outline-none ${
                                isHeaderRow ? `font-bold uppercase tracking-[0.12em] ${theme.onSurface}` : theme.onSurface
                              } placeholder:text-[var(--ether-on-surface-variant)]`}
                              style={{ color: style.color, fontWeight: style.fontWeight, textAlign: style.textAlign }}
                            />
                          ) : (
                            <div
                              aria-label={`${cell || (isHeaderRow ? 'Header' : 'Empty')} cell`}
                              role="textbox"
                              tabIndex={isFocused ? 0 : -1}
                              onDoubleClick={() => {
                                setEditingCell({ row: rowIndex, column: columnIndex });
                                const currentVal = cells[rowIndex]?.[columnIndex] || '';
                                if (isFormula(currentVal)) {
                                  formulaEditingRef.current = true;
                                  setFormulaEditText(currentVal);
                                }
                              }}
                              onPaste={e => handlePaste(e, rowIndex, columnIndex)}
                              className={`min-h-10 min-w-24 w-full select-text bg-transparent px-3 py-2.5 text-sm outline-none ${isHeaderRow ? 'pr-14' : ''} ${
                                isHeaderRow ? `font-bold uppercase tracking-[0.12em] ${theme.onSurface}` : theme.onSurface
                              }`}
                              style={{
                                color: style.color,
                                fontWeight: style.fontWeight,
                                textAlign: style.textAlign,
                                whiteSpace: textWrap ? 'pre-wrap' : 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {getCellDisplayValue(cell, cells)}
                            </div>
                          )}
                          {isFocused && !isEditing && (
                            <div className="table-widget-fill-handle" onPointerDown={e => handleFillPointerDown(e, rowIndex, columnIndex)} />
                          )}
                          {isHeaderRow && (
                            <>
                              <button
                                type="button"
                                aria-label={`Sort column ${columnIndex + 1}`}
                                title={`Sort column ${columnIndex + 1}`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => { event.stopPropagation(); toggleSort(columnIndex); }}
                                className={`table-widget-sort-button ${sortCol === columnIndex ? 'active' : ''}`}
                              >
                                {sortCol === columnIndex && sortDir === 'asc' ? <ArrowUp size={11} /> : sortCol === columnIndex && sortDir === 'desc' ? <ArrowDown size={11} /> : <ChevronDown size={11} />}
                              </button>
                              <button type="button" aria-label={`Resize column ${columnIndex + 1}`} title={`Resize column ${columnIndex + 1}`}
                                onPointerDown={e => beginColumnResize(e, columnIndex)}
                                onDoubleClick={e => autoFitColumn(e, columnIndex)}
                                className="table-widget-resize-handle" />
                            </>
                          )}
                          {!isHeaderRow && (
                            <button
                              type="button"
                              aria-label={`Resize column ${columnIndex + 1} edge from row ${rowIndex + 1}`}
                              title={`Resize column ${columnIndex + 1}`}
                              onPointerDown={(event) => beginColumnResize(event, columnIndex)}
                              onDoubleClick={(event) => autoFitColumn(event, columnIndex)}
                              className="table-widget-resize-handle table-widget-body-resize-handle"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Status bar */}
        {stats && (
          <div className="table-widget-status-bar rounded-b-[1.15rem]">
            <span>{stats.count} cells</span>
            {stats.sum !== null && <span>Σ {stats.sum}</span>}
            {stats.avg !== null && <span>μ {Math.round(stats.avg * 100) / 100}</span>}
            {stats.min !== null && <span>Min {stats.min}</span>}
            {stats.max !== null && <span>Max {stats.max}</span>}
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default React.memo(TableWidget);
