/**
 * Stock symbol quick-add parser.
 *
 * Accepts alphanumeric tokens (optionally dot-separated) of 1-8
 * characters, uppercased before validation so users can type
 * lowercase. Examples: `AAPL`, `BRK.B`, `MSFT`.
 *
 * Pure; no side effects.
 */

export interface StockSymbolQuickAddResult {
  /** Uppercased symbol (e.g. `AAPL`, `BRK.B`). */
  symbol: string;
}

export interface ParseError {
  parseError: string;
}

// 1-8 uppercase alphanumerics, optional dot-separated tokens. First and
// last characters must be alphanumeric so `A.` / `.A` are rejected.
const SYMBOL_RE = /^[A-Z0-9](?:[A-Z0-9.]{0,6}[A-Z0-9])?$/;

export const parseStockSymbolQuickAdd = (
  input: string,
): StockSymbolQuickAddResult | ParseError => {
  if (typeof input !== 'string') {
    return { parseError: 'Symbol required' };
  }
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length === 0) {
    return { parseError: 'Symbol required' };
  }
  if (trimmed.length > 8) {
    return { parseError: 'Symbol too long' };
  }
  if (!SYMBOL_RE.test(trimmed)) {
    return { parseError: 'Invalid symbol' };
  }
  return { symbol: trimmed };
};
