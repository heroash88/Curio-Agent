import { describe, expect, it } from 'vitest';

import {
  normalizeDashboardTableCells,
  parseDashboardTableClipboard,
  parseDashboardTableClipboardRich,
  sanitizeDashboardRichHtml,
} from './dashboardContentWidgets';

describe('dashboard content widget helpers', () => {
  it('sanitizes rich note html while preserving useful formatting and safe images', () => {
    const input = `
      <section onclick="steal()">
        <h1 style="color:red">Roadmap</h1>
        <p><strong>Ship</strong> <em>dashboard</em> <span>content</span></p>
        <img src="data:image/png;base64,abc123" onerror="steal()" width="640" />
        <script>alert('nope')</script>
        <a href="javascript:alert(1)">bad link</a>
      </section>
    `;

    const result = sanitizeDashboardRichHtml(input);

    expect(result).toContain('<h1>Roadmap</h1>');
    expect(result).toContain('<strong>Ship</strong>');
    expect(result).toContain('<em>dashboard</em>');
    expect(result).toContain('<img src="data:image/png;base64,abc123">');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('style=');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('javascript:');
  });

  it('parses copied table text and clamps the board table size', () => {
    const parsed = parseDashboardTableClipboard('Name\tStatus\tOwner\nWeather\tLive\tCurio');

    expect(parsed).toEqual([
      ['Name', 'Status', 'Owner'],
      ['Weather', 'Live', 'Curio'],
    ]);

    const normalized = normalizeDashboardTableCells([
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
      ['1'],
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toHaveLength(8);
    expect(normalized[1]).toEqual(['1', '', '', '', '', '', '', '']);
  });

  it('caps rich table html before parsing to avoid oversized paste work', () => {
    const oversizedHtml = `<div>${'x'.repeat(181_000)}</div><table><tr><td>HTML value</td></tr></table>`;

    const parsed = parseDashboardTableClipboardRich('Text value\tFallback', oversizedHtml);

    expect(parsed.cells[0]).toEqual(['Text value', 'Fallback']);
  });
});
