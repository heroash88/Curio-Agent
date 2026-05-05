import type { DashboardTableCellStyle } from '../services/dashboardTypes';

const MAX_TABLE_ROWS = 24;
const MAX_TABLE_COLUMNS = 8;
const MAX_CELL_CHARS = 240;
const MAX_RICH_HTML_CHARS = 180_000;
const MAX_IMAGE_SRC_CHARS = 120_000;

const ALLOWED_RICH_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

const DROP_WITH_CHILDREN_TAGS = new Set([
  'iframe',
  'link',
  'meta',
  'object',
  'script',
  'style',
  'svg',
]);

const isSafeLinkHref = (href: string) =>
  /^(https?:|mailto:|tel:|#|\/(?!\/))/i.test(href.trim());

const isSafeImageSrc = (src: string) => {
  const value = src.trim();
  if (value.length > MAX_IMAGE_SRC_CHARS) return false;
  return /^(data:image\/(?:png|jpe?g|gif|webp);base64,|https?:|blob:)/i.test(value);
};

const isSafeDashboardImageId = (id: string) =>
  /^gallery_[a-z0-9_]+$/i.test(id.trim());

const normalizeColorValue = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    return trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed.slice(0, 7);
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgbMatch) {
    const values = rgbMatch.slice(1, 4).map((part) =>
      Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0'),
    );
    return `#${values.join('')}`;
  }
  return '';
};

const normalizeTextAlign = (value: string): DashboardTableCellStyle['textAlign'] | undefined => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'center' || normalized === 'right' || normalized === 'left'
    ? normalized
    : undefined;
};

const pickElementStyle = (element: HTMLElement): DashboardTableCellStyle => {
  const style: DashboardTableCellStyle = {};
  const color = normalizeColorValue(element.style.color || '');
  const backgroundColor = normalizeColorValue(element.style.backgroundColor || '');
  const textAlign = normalizeTextAlign(element.style.textAlign || '');
  const fontWeight = element.style.fontWeight || '';
  const textDecoration = element.style.textDecoration || '';
  const fontStyle = element.style.fontStyle || '';

  if (color) style.color = color;
  if (backgroundColor) style.backgroundColor = backgroundColor;
  if (textAlign) style.textAlign = textAlign;
  if (fontWeight && (Number(fontWeight) >= 600 || /bold/i.test(fontWeight))) {
    style.fontWeight = '700';
  }
  if (/underline/i.test(textDecoration)) {
    style.fontWeight = style.fontWeight || '600';
  }
  if (/italic/i.test(fontStyle)) {
    style.fontWeight = style.fontWeight || '600';
  }

  return style;
};

const applySafeStyle = (source: HTMLElement, target: HTMLElement) => {
  const style = pickElementStyle(source);
  const declarations: string[] = [];

  if (style.color) declarations.push(`color: ${style.color}`);
  if (style.backgroundColor) declarations.push(`background-color: ${style.backgroundColor}`);
  if (style.fontWeight) declarations.push(`font-weight: ${style.fontWeight}`);
  if (style.textAlign) declarations.push(`text-align: ${style.textAlign}`);
  if (/underline/i.test(source.style.textDecoration || '')) declarations.push('text-decoration: underline');
  if (/italic/i.test(source.style.fontStyle || '')) declarations.push('font-style: italic');

  if (declarations.length > 0) {
    target.setAttribute('style', declarations.join('; '));
  }
};

const cloneSanitizedChildren = (source: Node, target: Node) => {
  source.childNodes.forEach((child) => {
    const next = sanitizeNode(child);
    if (next) {
      target.appendChild(next);
    }
  });
};

const sanitizeNode = (node: Node): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (DROP_WITH_CHILDREN_TAGS.has(tag)) {
    return null;
  }

  if (!ALLOWED_RICH_TAGS.has(tag)) {
    const fragment = document.createDocumentFragment();
    cloneSanitizedChildren(element, fragment);
    return fragment;
  }

  const next = document.createElement(tag);
  cloneSanitizedChildren(element, next);

  if (tag === 'a') {
    const href = element.getAttribute('href') || '';
    if (href && isSafeLinkHref(href)) {
      next.setAttribute('href', href.trim());
      next.setAttribute('target', '_blank');
      next.setAttribute('rel', 'noreferrer');
    }
  }

  if (tag === 'img') {
    const src = element.getAttribute('src') || '';
    const imageId = element.getAttribute('data-dashboard-image-id') || '';
    if (!src || !isSafeImageSrc(src)) {
      return null;
    }
    next.setAttribute('src', src.trim());
    if (imageId && isSafeDashboardImageId(imageId)) {
      next.setAttribute('data-dashboard-image-id', imageId.trim());
    }
    const alt = element.getAttribute('alt');
    if (alt) {
      next.setAttribute('alt', alt.slice(0, 120));
    }
  }

  if (tag === 'span' || tag === 'td' || tag === 'th' || tag === 'p' || tag === 'li') {
    applySafeStyle(element, next as HTMLElement);
  }

  return next;
};

export const sanitizeDashboardRichHtml = (html: string): string => {
  if (!html.trim() || typeof document === 'undefined') {
    return '';
  }

  const template = document.createElement('template');
  template.innerHTML = html.slice(0, MAX_RICH_HTML_CHARS);
  const output = document.createElement('div');
  cloneSanitizedChildren(template.content, output);
  return output.innerHTML.trim();
};

const trimCell = (value: string) =>
  value.replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_CHARS);

export const normalizeDashboardTableCells = (cells: string[][]): string[][] => {
  const rows = cells.slice(0, MAX_TABLE_ROWS).map((row) =>
    row.slice(0, MAX_TABLE_COLUMNS).map((cell) => trimCell(String(cell || ''))),
  );
  const columnCount = Math.min(
    MAX_TABLE_COLUMNS,
    Math.max(2, ...rows.map((row) => row.length), 2),
  );
  const normalized = rows.map((row) => [
    ...row,
    ...Array(Math.max(0, columnCount - row.length)).fill(''),
  ]);
  return normalized.length > 0
    ? normalized
    : [
        ['Item', 'Status'],
        ['', ''],
      ];
};

export const normalizeDashboardTableColumnWidths = (
  widths: number[] | undefined,
  columnCount: number,
): number[] =>
  Array.from({ length: columnCount }, (_item, index) => {
    const value = Number(widths?.[index]);
    return Number.isFinite(value) ? Math.max(80, Math.min(420, Math.round(value))) : 120;
  });

export const normalizeDashboardTableCellStyles = (
  styles: Record<string, DashboardTableCellStyle> | undefined,
  cells: string[][],
): Record<string, DashboardTableCellStyle> => {
  const normalized: Record<string, DashboardTableCellStyle> = {};
  const rowCount = cells.length;
  const columnCount = cells[0]?.length || 0;

  Object.entries(styles || {}).forEach(([key, style]) => {
    const [rowRaw, columnRaw] = key.split(':');
    const rowIndex = Number(rowRaw);
    const columnIndex = Number(columnRaw);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
    if (rowIndex < 0 || columnIndex < 0 || rowIndex >= rowCount || columnIndex >= columnCount) return;

    const next: DashboardTableCellStyle = {};
    const backgroundColor = normalizeColorValue(String(style?.backgroundColor || ''));
    const color = normalizeColorValue(String(style?.color || ''));
    const textAlign = normalizeTextAlign(String(style?.textAlign || ''));
    const fontWeight = String(style?.fontWeight || '');

    if (backgroundColor) next.backgroundColor = backgroundColor;
    if (color) next.color = color;
    if (textAlign) next.textAlign = textAlign;
    if (fontWeight && (Number(fontWeight) >= 600 || /bold/i.test(fontWeight))) {
      next.fontWeight = '700';
    }

    if (Object.keys(next).length > 0) {
      normalized[`${rowIndex}:${columnIndex}`] = next;
    }
  });

  return normalized;
};

export interface DashboardTableClipboardParseResult {
  cells: string[][];
  cellStyles: Record<string, DashboardTableCellStyle>;
  columnWidths: number[];
}

const parseHtmlTableRich = (html: string): DashboardTableClipboardParseResult | null => {
  if (!html.trim() || typeof document === 'undefined') return null;
  const template = document.createElement('template');
  template.innerHTML = html.slice(0, MAX_RICH_HTML_CHARS);
  const table = template.content.querySelector('table');
  if (!table) return null;
  const cellStyles: Record<string, DashboardTableCellStyle> = {};
  const rows = Array.from(table.querySelectorAll('tr')).map((row, rowIndex) =>
    Array.from(row.querySelectorAll('th,td')).map((cell, columnIndex) => {
      const style = pickElementStyle(cell as HTMLElement);
      if (cell.tagName.toLowerCase() === 'th' && !style.fontWeight) {
        style.fontWeight = '700';
      }
      if (Object.keys(style).length > 0) {
        cellStyles[`${rowIndex}:${columnIndex}`] = style;
      }
      return trimCell(cell.textContent || '');
    }),
  );
  const cells = normalizeDashboardTableCells(rows);
  return {
    cells,
    cellStyles: normalizeDashboardTableCellStyles(cellStyles, cells),
    columnWidths: normalizeDashboardTableColumnWidths(undefined, cells[0]?.length || 0),
  };
};

const parseDelimitedTable = (text: string): string[][] => {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!clean) return [];
  const delimiter = clean.includes('\t') ? '\t' : ',';
  return clean
    .split('\n')
    .map((row) => row.split(delimiter).map(trimCell))
    .filter((row) => row.some(Boolean));
};

export const parseDashboardTableClipboardRich = (
  text: string,
  html = '',
): DashboardTableClipboardParseResult => {
  const htmlRows = parseHtmlTableRich(html);
  if (htmlRows) {
    return htmlRows;
  }
  const cells = normalizeDashboardTableCells(parseDelimitedTable(text));
  return {
    cells,
    cellStyles: {},
    columnWidths: normalizeDashboardTableColumnWidths(undefined, cells[0]?.length || 0),
  };
};

export const parseDashboardTableClipboard = (
  text: string,
  html = '',
): string[][] => {
  return parseDashboardTableClipboardRich(text, html).cells;
};
