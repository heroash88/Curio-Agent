import { describe, expect, it } from 'vitest';

import { parseStockSymbolQuickAdd } from './stockSymbolParser';

describe('parseStockSymbolQuickAdd', () => {
  it('uppercases a lowercase input', () => {
    const result = parseStockSymbolQuickAdd('aapl');
    expect(result).toEqual({ symbol: 'AAPL' });
  });

  it('accepts dot-separated classes like BRK.B', () => {
    const result = parseStockSymbolQuickAdd('BRK.B');
    expect(result).toEqual({ symbol: 'BRK.B' });
  });

  it('accepts an 8-character symbol', () => {
    const result = parseStockSymbolQuickAdd('ABCDEFGH');
    expect(result).toEqual({ symbol: 'ABCDEFGH' });
  });

  it('rejects a 9-character symbol', () => {
    const result = parseStockSymbolQuickAdd('ABCDEFGHI');
    expect('parseError' in result).toBe(true);
  });

  it('rejects non-alphanumeric input', () => {
    const result = parseStockSymbolQuickAdd('AA$PL');
    expect('parseError' in result).toBe(true);
  });

  it('rejects empty input', () => {
    const result = parseStockSymbolQuickAdd('   ');
    expect('parseError' in result).toBe(true);
  });

  it('rejects symbols that start or end with a dot', () => {
    expect('parseError' in parseStockSymbolQuickAdd('.A')).toBe(true);
    expect('parseError' in parseStockSymbolQuickAdd('A.')).toBe(true);
  });
});
