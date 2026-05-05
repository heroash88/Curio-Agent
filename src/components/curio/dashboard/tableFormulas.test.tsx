import { describe, expect, it } from 'vitest';

import { getCellDisplayValue } from './tableFormulas';

describe('table formulas', () => {
  it('evaluates range math, text, and conditional formulas', () => {
    const cells = [
      ['Name', 'Q1', 'Q2', 'Total'],
      ['Alpha', '4', '6', '=SUM(B2:C2)'],
      ['Beta', '-3', '7', '=IF(B3<0,"needs review","ok")'],
    ];

    expect(getCellDisplayValue(cells[1][3], cells)).toBe('10');
    expect(getCellDisplayValue(cells[2][3], cells)).toBe('needs review');
  });

  it('keeps quoted commas inside one formula argument', () => {
    const cells = [
      ['First', 'Last', 'Display'],
      ['Ada', 'Lovelace', '=CONCAT(A2,", ",B2)'],
    ];

    expect(getCellDisplayValue(cells[1][2], cells)).toBe('Ada, Lovelace');
  });
});
