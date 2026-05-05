import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import TableWidget from './TableWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 4,
    h: 3,
    pixelWidth: 680,
    pixelHeight: 420,
    sizeClass: 'large',
    isCompact: false,
  }),
}));

const buildWidget = (config: DashboardWidget['config'] = {}): DashboardWidget => ({
  id: 'table-test',
  type: 'table',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    tableTitle: 'Project table',
    tableCells: [
      ['Name', 'Status'],
      ['Weather', 'Ready'],
    ],
    ...config,
  },
});

const clipboardData = (html: string, text: string) => ({
  getData: (type: string) => {
    if (type === 'text/html') return html;
    if (type === 'text/plain') return text;
    return '';
  },
});

describe('TableWidget', () => {
  it('clears pending touch long-press timers on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const originalPointerEvent = window.PointerEvent;
    class TestPointerEvent extends Event {
      button: number;
      clientX: number;
      clientY: number;
      pointerType: string;

      constructor(type: string, init: EventInit & { button?: number; clientX?: number; clientY?: number; pointerType?: string } = {}) {
        super(type, init);
        this.button = init.button || 0;
        this.clientX = init.clientX || 0;
        this.clientY = init.clientY || 0;
        this.pointerType = init.pointerType || '';
      }
    }
    window.PointerEvent = TestPointerEvent as typeof PointerEvent;

    try {
      const { container, unmount } = render(<TableWidget widget={buildWidget()} />);

      const touchCell = container.querySelector('td[data-row="1"][data-col="0"]') as HTMLElement;
      const pointerDown = createEvent.pointerDown(touchCell, {
        button: 0,
        clientX: 20,
        clientY: 20,
      });
      Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
      fireEvent(touchCell, pointerDown);
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      window.PointerEvent = originalPointerEvent;
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('pastes spreadsheet tables with cell formatting from rich clipboard HTML', () => {
    const onUpdateWidgetConfig = vi.fn();
    render(<TableWidget widget={buildWidget()} onUpdateWidgetConfig={onUpdateWidgetConfig} />);

    fireEvent.paste(screen.getByRole('textbox', { name: 'Name cell' }), {
      clipboardData: clipboardData(
        '<table><tr><th style="background-color:#0f766e;color:#ffffff">Task</th><th>Owner</th></tr><tr><td style="background-color:#fef3c7">Design</td><td style="color:#be123c">Maya</td></tr></table>',
        'Task\tOwner\nDesign\tMaya',
      ),
    });

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      'table-test',
      expect.objectContaining({
        tableCells: [
          ['Task', 'Owner'],
          ['Design', 'Maya'],
        ],
        tableCellStyles: expect.objectContaining({
          '0:0': expect.objectContaining({ backgroundColor: '#0f766e', color: '#ffffff' }),
          '1:0': expect.objectContaining({ backgroundColor: '#fef3c7' }),
          '1:1': expect.objectContaining({ color: '#be123c' }),
        }),
      }),
    );
  });

  it('supports header color, cell highlight, text color, and column resizing', () => {
    const onUpdateWidgetConfig = vi.fn();
    render(<TableWidget widget={buildWidget()} onUpdateWidgetConfig={onUpdateWidgetConfig} />);

    fireEvent.focus(screen.getByLabelText('Weather cell'));
    expect(screen.queryByRole('button', { name: 'Highlight selected cell amber' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Style selected cell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Highlight selected cell amber' }));
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('table-test', {
      tableCellStyles: { '1:0': { backgroundColor: '#fef3c7' } },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set selected cell text rose' }));
    expect(screen.getByRole('button', { name: 'Set selected cell text rose' })).not.toHaveTextContent('rose');
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('table-test', {
      tableCellStyles: { '1:0': { backgroundColor: '#fef3c7', color: '#be123c' } },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set header color teal' }));
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('table-test', {
      tableHeaderColor: '#ccfbf1',
    });

    const handle = screen.getByLabelText('Resize column 1');
    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 155 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 155 });

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      'table-test',
      expect.objectContaining({
        tableColumnWidths: [175, 120],
      }),
    );
  });

  it('resizes columns from body cell edges inside the scrollable table view', () => {
    const onUpdateWidgetConfig = vi.fn();
    render(<TableWidget widget={buildWidget()} onUpdateWidgetConfig={onUpdateWidgetConfig} />);

    const bodyEdgeHandle = screen.getByLabelText('Resize column 1 edge from row 2');
    fireEvent.pointerDown(bodyEdgeHandle, { pointerId: 11, button: 0, clientX: 120 });
    fireEvent.pointerMove(window, { pointerId: 11, clientX: 170 });
    fireEvent.pointerUp(window, { pointerId: 11, clientX: 170 });

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      'table-test',
      expect.objectContaining({
        tableColumnWidths: [170, 120],
      }),
    );
  });

  it('applies fill and text styling to every selected cell', () => {
    const onUpdateWidgetConfig = vi.fn();
    render(<TableWidget widget={buildWidget()} onUpdateWidgetConfig={onUpdateWidgetConfig} />);

    const weatherCell = screen.getByRole('textbox', { name: 'Weather cell' }).closest('td');
    expect(weatherCell).not.toBeNull();
    fireEvent.pointerDown(weatherCell!);
    fireEvent.pointerUp(window);
    fireEvent.keyDown(screen.getByRole('table'), { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true });

    fireEvent.click(screen.getByRole('button', { name: 'Style selected cell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Highlight selected cell amber' }));
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('table-test', {
      tableCellStyles: {
        '1:0': { backgroundColor: '#fef3c7' },
        '1:1': { backgroundColor: '#fef3c7' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set selected cell text rose' }));
    expect(onUpdateWidgetConfig).toHaveBeenLastCalledWith('table-test', {
      tableCellStyles: {
        '1:0': { backgroundColor: '#fef3c7', color: '#be123c' },
        '1:1': { backgroundColor: '#fef3c7', color: '#be123c' },
      },
    });
  });

  it('offers an editable formula bar for the selected cell', () => {
    const onUpdateWidgetConfig = vi.fn();
    render(
      <TableWidget
        widget={buildWidget({
          tableCells: [
            ['Q1', 'Q2', 'Total'],
            ['2', '3', ''],
          ],
        })}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    const totalCell = screen.getByRole('textbox', { name: 'Empty cell' }).closest('td');
    expect(totalCell).not.toBeNull();
    fireEvent.pointerDown(totalCell!);
    fireEvent.pointerUp(window);

    const formulaBar = screen.getByRole('textbox', { name: 'Formula bar' });
    expect(formulaBar).toHaveAttribute('placeholder', 'Type text or =SUM(A2:B2)');
    fireEvent.change(formulaBar, { target: { value: '=SUM(A2:B2)' } });
    fireEvent.blur(formulaBar);

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      'table-test',
      expect.objectContaining({
        tableCells: [
          ['Q1', 'Q2', 'Total'],
          ['2', '3', '=SUM(A2:B2)'],
        ],
      }),
    );
  });

  it('uses normal table selection affordances instead of select and copy buttons', async () => {
    const onUpdateWidgetConfig = vi.fn();
    render(<TableWidget widget={buildWidget()} onUpdateWidgetConfig={onUpdateWidgetConfig} />);

    expect(screen.queryByRole('button', { name: 'Select entire table' })).toBeNull();

    fireEvent.keyDown(screen.getByRole('table'), { key: 'a', code: 'KeyA', ctrlKey: true });
    const selectedText = screen.getByRole('textbox', { name: 'Selected table data' }) as HTMLTextAreaElement;
    expect(selectedText).toHaveValue('Name\tStatus\nWeather\tReady');
    expect(document.activeElement).toBe(selectedText);
    expect(selectedText.selectionStart).toBe(0);
    expect(selectedText.selectionEnd).toBe(selectedText.value.length);

    const exportLink = screen.getByRole('link', { name: 'Export table as CSV' });
    expect(exportLink).toHaveAttribute('download', 'Project-table.csv');
    expect(decodeURIComponent(exportLink.getAttribute('href') || '')).toContain('Name,Status\nWeather,Ready');
  });

  it('shows undo/redo and search buttons', () => {
    render(<TableWidget widget={buildWidget()} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy selection' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Row numbers' })).toBeTruthy();
  });

  it('opens search bar and finds matches', () => {
    render(<TableWidget widget={buildWidget()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const searchInput = screen.getByPlaceholderText('Search cells…');
    expect(searchInput).toBeTruthy();
    fireEvent.change(searchInput, { target: { value: 'Weather' } });
    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('renders sort buttons on header cells', () => {
    render(<TableWidget widget={buildWidget()} />);
    expect(screen.getByRole('button', { name: 'Sort column 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sort column 2' })).toBeTruthy();
  });

  it('edits the correct source row after sorting the table view', () => {
    const onUpdateWidgetConfig = vi.fn();
    render(
      <TableWidget
        widget={buildWidget({
          tableCells: [
            ['Name', 'Score'],
            ['Beta', '2'],
            ['Alpha', '1'],
          ],
        })}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort column 1' }));

    const alphaCell = screen.getByRole('textbox', { name: 'Alpha cell' });
    fireEvent.doubleClick(alphaCell);
    const editor = screen.getByDisplayValue('Alpha');
    fireEvent.change(editor, { target: { value: 'Alpine' } });
    fireEvent.blur(editor);

    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      'table-test',
      expect.objectContaining({
        tableCells: [
          ['Name', 'Score'],
          ['Beta', '2'],
          ['Alpine', '1'],
        ],
      }),
    );
  });

  it('keeps all rows scrollable instead of hiding table rows behind widget height', () => {
    render(
      <TableWidget
        widget={buildWidget({
          tableCells: [
            ['Name', 'Status'],
            ['One', 'Ready'],
            ['Two', 'Ready'],
            ['Three', 'Ready'],
            ['Four', 'Ready'],
            ['Five', 'Ready'],
            ['Six', 'Ready'],
          ],
        })}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Six cell' })).toBeInTheDocument();
    expect(screen.queryByText(/rows hidden until the card is taller/i)).not.toBeInTheDocument();
  });
});
