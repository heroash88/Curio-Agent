/**
 * Simple spreadsheet formula engine for the TableWidget.
 * Supports cell references (A1, B2, AA1), ranges (A1:C3), and functions.
 *
 * Supported formulas:
 *   =SUM(A1:B3)  =AVERAGE(A1:B3)  =MIN(A1:B3)  =MAX(A1:B3)
 *   =COUNT(A1:B3) =COUNTA(A1:B3)  =CONCAT(A1,B1," ")
 *   =IF(A1>0, "yes", "no")  =ROUND(A1,2)  =ABS(A1)
 *   =A1+B2*3  =A1&amp;" "&amp;B1  (arithmetic & concatenation)
 */

/* ── Column letter helpers ── */
const colLetterToIndex = (letters: string): number => {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1; // 0-indexed
};

const colIndexToLetter = (index: number): string => {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

/** Parse a cell reference like "A1" or "$A$1" */
const parseCellRef = (ref: string): { row: number; col: number; absCol: boolean; absRow: boolean } | null => {
  const m = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
  if (!m) return null;
  return {
    col: colLetterToIndex(m[2]),
    row: parseInt(m[4], 10) - 1,
    absCol: m[1] === '$',
    absRow: m[3] === '$'
  };
};

/** Shift formula references by a delta, respecting absolute locks */
export const shiftFormulaReferences = (formula: string, deltaRow: number, deltaCol: number): string => {
  if (!formula.startsWith('=')) return formula;
  return formula.replace(/\$?[A-Z]+\$?\d+/gi, match => {
    const ref = parseCellRef(match.toUpperCase());
    if (!ref) return match;
    const newRow = ref.absRow ? ref.row : Math.max(0, ref.row + deltaRow);
    const newCol = ref.absCol ? ref.col : Math.max(0, ref.col + deltaCol);
    return `${ref.absCol ? '$' : ''}${colIndexToLetter(newCol)}${ref.absRow ? '$' : ''}${newRow + 1}`;
  });
};

/** Parse a range like "A1:C3" -> array of { row, col } */
const parseRange = (range: string): Array<{ row: number; col: number }> => {
  const [startRef, endRef] = range.split(':');
  const start = parseCellRef(startRef);
  const end = endRef ? parseCellRef(endRef) : start;
  if (!start) return [];
  if (!end) return start ? [start] : [];
  const coords: Array<{ row: number; col: number }> = [];
  for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
    for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
      coords.push({ row: r, col: c });
    }
  }
  return coords;
};

/** Get numeric values from a range of cells */
const getNumericValues = (cells: string[][], range: string): number[] => {
  const coords = parseRange(range);
  const values: number[] = [];
  for (const { row, col } of coords) {
    const raw = cells[row]?.[col];
    if (raw == null) continue;
    // Recursively evaluate if it's a formula
    const val = raw.startsWith('=') ? evaluateFormula(raw, cells) : raw;
    const n = Number(val);
    if (!isNaN(n) && String(val).trim() !== '') values.push(n);
  }
  return values;
};

/** Get all values (as strings) from a range */
const getStringValues = (cells: string[][], range: string): string[] => {
  const coords = parseRange(range);
  return coords.map(({ row, col }) => {
    const raw = cells[row]?.[col] || '';
    return raw.startsWith('=') ? evaluateFormula(raw, cells) : raw;
  });
};

/** Resolve a single cell reference or literal to a value */
const resolveValue = (token: string, cells: string[][]): string => {
  const trimmed = token.trim();
  // String literal
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  // Cell reference
  const ref = parseCellRef(trimmed.toUpperCase());
  if (ref) {
    const raw = cells[ref.row]?.[ref.col] || '';
    return raw.startsWith('=') ? evaluateFormula(raw, cells) : raw;
  }
  return trimmed;
};

/** Split function arguments respecting nested parentheses */
const splitArgs = (argsStr: string): string[] => {
  const args: string[] = [];
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let current = '';
  for (let index = 0; index < argsStr.length; index++) {
    const ch = argsStr[index];
    const prev = argsStr[index - 1];
    if ((ch === '"' || ch === "'") && prev !== '\\') {
      quote = quote === ch ? null : quote || ch;
    } else if (!quote && ch === '(') {
      depth++;
    } else if (!quote && ch === ')') {
      depth--;
    }
    if (ch === ',' && depth === 0 && !quote) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
};

// Depth guard to prevent infinite recursion
let evalDepth = 0;
const MAX_EVAL_DEPTH = 20;

/**
 * Evaluate a formula string. Returns the computed value as a string.
 * If evaluation fails, returns an error string prefixed with #.
 */
export const evaluateFormula = (formula: string, cells: string[][]): string => {
  if (!formula.startsWith('=')) return formula;
  if (evalDepth > MAX_EVAL_DEPTH) return '#CIRCULAR';
  evalDepth++;
  try {
    return evalInner(formula.slice(1).trim(), cells);
  } catch {
    return '#ERROR';
  } finally {
    evalDepth--;
  }
};

const evalInner = (expr: string, cells: string[][]): string => {
  // Check for function calls: FUNCNAME(args)
  const fnMatch = expr.match(/^([A-Z]+)\((.+)\)$/i);
  if (fnMatch) {
    const fn = fnMatch[1].toUpperCase();
    const argsStr = fnMatch[2];
    const args = splitArgs(argsStr);

    switch (fn) {
      case 'SUM': {
        const vals = args.flatMap(a => getNumericValues(cells, a.trim()));
        return String(vals.reduce((s, v) => s + v, 0));
      }
      case 'AVERAGE':
      case 'AVG': {
        const vals = args.flatMap(a => getNumericValues(cells, a.trim()));
        if (vals.length === 0) return '#DIV/0';
        return String(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
      case 'MIN': {
        const vals = args.flatMap(a => getNumericValues(cells, a.trim()));
        return vals.length > 0 ? String(Math.min(...vals)) : '#N/A';
      }
      case 'MAX': {
        const vals = args.flatMap(a => getNumericValues(cells, a.trim()));
        return vals.length > 0 ? String(Math.max(...vals)) : '#N/A';
      }
      case 'COUNT': {
        const vals = args.flatMap(a => getNumericValues(cells, a.trim()));
        return String(vals.length);
      }
      case 'COUNTA': {
        const vals = args.flatMap(a => getStringValues(cells, a.trim()));
        return String(vals.filter(v => v.trim() !== '').length);
      }
      case 'COUNTIF': {
        if (args.length < 2) return '#VALUE';
        const condition = resolveValue(args[1], cells).replace(/^"|"$/g, '');
        const rangeVals = getStringValues(cells, args[0]);
        let count = 0;
        for (let i = 0; i < rangeVals.length; i++) {
          const val = rangeVals[i];
          let match = false;
          if (condition.startsWith('>') || condition.startsWith('<') || condition.startsWith('=')) {
            match = evalArithmetic(`"${val}"${condition}`, cells) === 'true';
          } else {
            match = val === condition;
          }
          if (match) count++;
        }
        return String(count);
      }
      case 'SUMIF': {
        if (args.length < 2) return '#VALUE';
        const condition = resolveValue(args[1], cells).replace(/^"|"$/g, '');
        const rangeVals = getStringValues(cells, args[0]);
        const sumRangeVals = args[2] ? getStringValues(cells, args[2]) : rangeVals;
        let sum = 0;
        for (let i = 0; i < rangeVals.length; i++) {
          const val = rangeVals[i];
          let match = false;
          if (condition.startsWith('>') || condition.startsWith('<') || condition.startsWith('=')) {
            match = evalArithmetic(`"${val}"${condition}`, cells) === 'true';
          } else {
            match = val === condition;
          }
          if (match) {
            const num = Number(sumRangeVals[i]);
            if (!isNaN(num)) sum += num;
          }
        }
        return String(sum);
      }
      case 'VLOOKUP': {
        if (args.length < 3) return '#N/A';
        const searchKey = resolveValue(args[0], cells);
        const coords = parseRange(args[1]);
        const index = Number(resolveValue(args[2], cells));
        if (isNaN(index) || index < 1 || coords.length === 0) return '#VALUE';

        let minR = coords[0].row, maxR = coords[0].row;
        let minC = coords[0].col, maxC = coords[0].col;
        for (const c of coords) {
          if (c.row < minR) minR = c.row;
          if (c.row > maxR) maxR = c.row;
          if (c.col < minC) minC = c.col;
          if (c.col > maxC) maxC = c.col;
        }
        const cols = maxC - minC + 1;
        if (index > cols) return '#REF';

        for (let r = minR; r <= maxR; r++) {
          const firstColRaw = cells[r]?.[minC] || '';
          const firstColVal = firstColRaw.startsWith('=') ? evaluateFormula(firstColRaw, cells) : firstColRaw;
          if (firstColVal === searchKey || Number(firstColVal) === Number(searchKey)) {
            const targetRaw = cells[r]?.[minC + index - 1] || '';
            return targetRaw.startsWith('=') ? evaluateFormula(targetRaw, cells) : targetRaw;
          }
        }
        return '#N/A';
      }
      case 'CONCAT':
      case 'CONCATENATE': {
        return args.map(a => resolveValue(a, cells)).join('');
      }
      case 'IF': {
        if (args.length < 2) return '#VALUE';
        const condition = evalArithmetic(args[0], cells);
        const isTruthy = condition !== '0' && condition !== '' && condition !== 'false' && condition !== 'FALSE';
        return isTruthy
          ? resolveValue(args[1], cells)
          : (args[2] ? resolveValue(args[2], cells) : '');
      }
      case 'ROUND': {
        const val = Number(resolveValue(args[0], cells));
        const decimals = args[1] ? Number(resolveValue(args[1], cells)) : 0;
        if (isNaN(val)) return '#VALUE';
        return String(Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals));
      }
      case 'ABS': {
        const val = Number(resolveValue(args[0], cells));
        return isNaN(val) ? '#VALUE' : String(Math.abs(val));
      }
      case 'UPPER': return resolveValue(args[0], cells).toUpperCase();
      case 'LOWER': return resolveValue(args[0], cells).toLowerCase();
      case 'LEN': return String(resolveValue(args[0], cells).length);
      case 'TRIM': return resolveValue(args[0], cells).trim();
      case 'LEFT': {
        const s = resolveValue(args[0], cells);
        const n = args[1] ? Number(resolveValue(args[1], cells)) : 1;
        return s.slice(0, n);
      }
      case 'RIGHT': {
        const s = resolveValue(args[0], cells);
        const n = args[1] ? Number(resolveValue(args[1], cells)) : 1;
        return s.slice(-n);
      }
      case 'NOW': return new Date().toLocaleString();
      case 'TODAY': return new Date().toLocaleDateString();
      default: return `#UNKNOWN(${fn})`;
    }
  }

  // Not a function call — try arithmetic evaluation
  return evalArithmetic(expr, cells);
};

/** Evaluate simple arithmetic expressions with cell references */
const evalArithmetic = (expr: string, cells: string[][]): string => {
  // Replace cell references with their values
  let resolved = expr.replace(/\b([A-Z]+)(\d+)\b/gi, (match) => {
    const ref = parseCellRef(match.toUpperCase());
    if (!ref) return match;
    const raw = cells[ref.row]?.[ref.col] || '';
    const val = raw.startsWith('=') ? evaluateFormula(raw, cells) : raw;
    const n = Number(val);
    return isNaN(n) ? `"${val}"` : String(n);
  });

  // Handle string concatenation with &
  if (resolved.includes('&')) {
    const parts = resolved.split('&').map(p => {
      const t = p.trim();
      if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
      return t;
    });
    return parts.join('');
  }

  // Handle comparisons for IF conditions
  for (const op of ['>=', '<=', '!=', '<>', '>', '<', '==', '=']) {
    if (resolved.includes(op)) {
      const [left, right] = resolved.split(op).map(s => s.trim());
      const lNum = Number(left), rNum = Number(right);
      const lVal = isNaN(lNum) ? left : lNum;
      const rVal = isNaN(rNum) ? right : rNum;
      let result = false;
      switch (op) {
        case '>': result = lVal > rVal; break;
        case '<': result = lVal < rVal; break;
        case '>=': result = lVal >= rVal; break;
        case '<=': result = lVal <= rVal; break;
        case '!=': case '<>': result = lVal !== rVal; break;
        case '==': case '=': result = lVal === rVal; break;
      }
      return result ? 'true' : 'false';
    }
  }

  // Try numeric evaluation (basic arithmetic: +, -, *, /, %)
  try {
    // Only evaluate if it looks like a math expression
    if (/^[\d\s+\-*/().%]+$/.test(resolved)) {
      // Safe eval using Function constructor (no access to global scope)
      const result = new Function(`"use strict"; return (${resolved});`)();
      if (typeof result === 'number' && isFinite(result)) {
        return String(Math.round(result * 1e10) / 1e10); // Avoid floating point noise
      }
    }
  } catch {
    // Fall through
  }

  return resolved;
};

/**
 * Check if a cell value is a formula (starts with =).
 */
export const isFormula = (value: string): boolean =>
  typeof value === 'string' && value.startsWith('=');

/**
 * Get the display value for a cell — evaluates formulas, returns raw value otherwise.
 */
export const getCellDisplayValue = (value: string, cells: string[][]): string => {
  if (!isFormula(value)) return value;
  return evaluateFormula(value, cells);
};

/**
 * Convert column index to letter for display (0 -> A, 25 -> Z, 26 -> AA).
 */
export { colIndexToLetter };

/* ── Formula catalog for autocomplete ── */
export interface FormulaCatalogEntry {
  name: string;
  signature: string;
  description: string;
  category: 'math' | 'text' | 'logic' | 'date' | 'lookup';
}

export const FORMULA_CATALOG: FormulaCatalogEntry[] = [
  { name: 'SUM', signature: 'SUM(range)', description: 'Adds all numbers in a range', category: 'math' },
  { name: 'AVERAGE', signature: 'AVERAGE(range)', description: 'Returns the mean of numeric values', category: 'math' },
  { name: 'AVG', signature: 'AVG(range)', description: 'Alias for AVERAGE', category: 'math' },
  { name: 'MIN', signature: 'MIN(range)', description: 'Returns the smallest number', category: 'math' },
  { name: 'MAX', signature: 'MAX(range)', description: 'Returns the largest number', category: 'math' },
  { name: 'COUNT', signature: 'COUNT(range)', description: 'Counts cells with numbers', category: 'math' },
  { name: 'COUNTA', signature: 'COUNTA(range)', description: 'Counts non-empty cells', category: 'math' },
  { name: 'ROUND', signature: 'ROUND(value, decimals)', description: 'Rounds to specified decimals', category: 'math' },
  { name: 'ABS', signature: 'ABS(value)', description: 'Returns the absolute value', category: 'math' },
  { name: 'COUNTIF', signature: 'COUNTIF(range, condition)', description: 'Counts cells meeting condition', category: 'math' },
  { name: 'SUMIF', signature: 'SUMIF(range, condition, [sum_range])', description: 'Sums cells meeting condition', category: 'math' },
  { name: 'IF', signature: 'IF(condition, true_val, false_val)', description: 'Returns value based on condition', category: 'logic' },
  { name: 'VLOOKUP', signature: 'VLOOKUP(key, range, index)', description: 'Looks for a value in the first column of a range', category: 'lookup' },
  { name: 'CONCAT', signature: 'CONCAT(val1, val2, ...)', description: 'Joins text values together', category: 'text' },
  { name: 'CONCATENATE', signature: 'CONCATENATE(val1, val2, ...)', description: 'Joins text values together', category: 'text' },
  { name: 'UPPER', signature: 'UPPER(text)', description: 'Converts text to uppercase', category: 'text' },
  { name: 'LOWER', signature: 'LOWER(text)', description: 'Converts text to lowercase', category: 'text' },
  { name: 'TRIM', signature: 'TRIM(text)', description: 'Removes leading/trailing spaces', category: 'text' },
  { name: 'LEN', signature: 'LEN(text)', description: 'Returns the length of text', category: 'text' },
  { name: 'LEFT', signature: 'LEFT(text, count)', description: 'Returns leftmost characters', category: 'text' },
  { name: 'RIGHT', signature: 'RIGHT(text, count)', description: 'Returns rightmost characters', category: 'text' },
  { name: 'NOW', signature: 'NOW()', description: 'Current date and time', category: 'date' },
  { name: 'TODAY', signature: 'TODAY()', description: 'Current date', category: 'date' },
];

/**
 * Given partial formula text, return matching function suggestions.
 * Extracts the token currently being typed (after the last operator/paren/comma).
 */
export const getFormulaSuggestions = (formulaText: string): { suggestions: FormulaCatalogEntry[]; partialToken: string } => {
  if (!formulaText.startsWith('=')) return { suggestions: [], partialToken: '' };
  const body = formulaText.slice(1);
  // Find the last token being typed (after last (, ,, +, -, *, /)
  const lastTokenMatch = body.match(/([A-Z]+)$/i);
  const partialToken = lastTokenMatch?.[1]?.toUpperCase() || '';
  if (!partialToken) return { suggestions: [], partialToken: '' };
  const matches = FORMULA_CATALOG.filter(f => f.name.startsWith(partialToken));
  return { suggestions: matches.slice(0, 8), partialToken };
};

/**
 * Convert a row/column coordinate to a cell reference string like "A1".
 */
export const cellRefFromCoord = (row: number, col: number): string =>
  `${colIndexToLetter(col)}${row + 1}`;
