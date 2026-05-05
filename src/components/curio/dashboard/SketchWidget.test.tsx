import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import SketchWidget from './SketchWidget';

const themeMock = vi.hoisted(() => ({
  mode: 'dark' as 'dark' | 'light',
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 4,
    h: 4,
    area: 16,
    sizeClass: 'large',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 720,
    pixelHeight: 520,
  }),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useThemeMode: () => themeMock.mode,
}));

const widget: DashboardWidget = {
  id: 'sketch_connector_test',
  type: 'sketch',
  position: 0,
  size: 'large',
  enabled: true,
  config: { w: 4, h: 4 },
};

const boardRect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 720,
  bottom: 420,
  width: 720,
  height: 420,
  toJSON: () => ({}),
} as DOMRect;

const connectorPaths = (container: HTMLElement) => (
  Array.from(container.querySelectorAll('g[data-board-layer="true"] path[marker-end]')) as SVGPathElement[]
);

const visibleConnectorPaths = (container: HTMLElement) => (
  Array.from(container.querySelectorAll('g[data-board-layer="true"] path[data-sketch-connector-line="true"]')) as SVGPathElement[]
);

describe('SketchWidget connector controls', () => {
  beforeEach(() => {
    themeMock.mode = 'dark';
    window.localStorage.removeItem('curio_sketch_widget_v2_sketch_connector_test');
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    });
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps finished connectors unchanged when choosing a new connector style for the next draw', async () => {
    const { container } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(boardRect);

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connector' }));
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 120 });
    fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse', clientX: 280, clientY: 220 });

    await waitFor(() => expect(connectorPaths(container)).toHaveLength(1));
    const firstConnectorPathBefore = connectorPaths(container)[0].getAttribute('d') || '';

    fireEvent.click(screen.getByRole('button', { name: 'Connector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Curve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Both' }));
    fireEvent.pointerDown(board, { button: 0, pointerId: 2, pointerType: 'mouse', clientX: 320, clientY: 140 });
    fireEvent.pointerUp(board, { pointerId: 2, pointerType: 'mouse', clientX: 500, clientY: 260 });

    await waitFor(() => expect(connectorPaths(container)).toHaveLength(2));
    const [firstConnector, secondConnector] = connectorPaths(container);

    expect(firstConnector.getAttribute('d')).toBe(firstConnectorPathBefore);
    expect(firstConnector.getAttribute('d')).not.toContain(' C ');
    expect(firstConnector.getAttribute('marker-start')).toBeNull();
    expect(firstConnector.getAttribute('marker-end')).toContain('sketch-arrow');

    expect(secondConnector.getAttribute('d')).toContain(' C ');
    expect(secondConnector.getAttribute('marker-start')).toContain('sketch-arrow');
    expect(secondConnector.getAttribute('marker-end')).toContain('sketch-arrow');
  });

  it('does not keep a connector when the connector tool is only clicked', async () => {
    const { container } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    vi.spyOn(board, 'getBoundingClientRect')
      .mockReturnValueOnce(boardRect)
      .mockReturnValue({
        ...boardRect,
        y: 26,
        top: 26,
        bottom: boardRect.bottom + 26,
      });

    fireEvent.click(screen.getByRole('button', { name: 'Connector' }));
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 160 });
    fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 160 });

    await waitFor(() => expect(visibleConnectorPaths(container)).toHaveLength(0));
  });

  it('edits the connector drawn most recently from connector controls', async () => {
    const { container } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(boardRect);

    fireEvent.click(screen.getByRole('button', { name: 'Connector' }));
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 120 });
    fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse', clientX: 280, clientY: 220 });

    await waitFor(() => expect(visibleConnectorPaths(container)).toHaveLength(1));
    expect(visibleConnectorPaths(container)[0].getAttribute('marker-end')).toContain('sketch-arrow');

    fireEvent.click(screen.getByRole('button', { name: 'No arrow' }));

    await waitFor(() => {
      expect(visibleConnectorPaths(container)[0].getAttribute('marker-start')).toBeNull();
      expect(visibleConnectorPaths(container)[0].getAttribute('marker-end')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Both' }));

    await waitFor(() => {
      expect(visibleConnectorPaths(container)[0].getAttribute('marker-start')).toContain('sketch-arrow');
      expect(visibleConnectorPaths(container)[0].getAttribute('marker-end')).toContain('sketch-arrow');
    });
  });

  it('zooms the sketch board from the compact viewport controls', async () => {
    const { container } = render(<SketchWidget widget={widget} />);
    const boardLayer = container.querySelector('g[data-board-layer="true"]') as SVGGElement;

    expect(boardLayer.getAttribute('transform')).toContain('scale(1)');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in sketch' }));

    await waitFor(() => {
      expect(boardLayer.getAttribute('transform')).toContain('scale(1.15)');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out sketch' }));

    await waitFor(() => {
      expect(boardLayer.getAttribute('transform')).toContain('scale(1)');
    });
  });

  it('pinch zooms the sketch board with two touch pointers', async () => {
    const { container } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    const boardLayer = container.querySelector('g[data-board-layer="true"]') as SVGGElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(boardRect);

    fireEvent.pointerDown(board, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerDown(board, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    fireEvent.pointerMove(board, { pointerId: 2, pointerType: 'touch', clientX: 260, clientY: 100 });

    await waitFor(() => {
      expect(boardLayer.getAttribute('transform')).toContain('scale(1.6)');
    });
    expect(screen.getByText('0 objects')).toBeInTheDocument();
  });

  it('uses black as the default drawing color in light mode', async () => {
    themeMock.mode = 'light';
    const { container } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(boardRect);

    fireEvent.pointerDown(board, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 120 });
    fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 150 });

    await waitFor(() => {
      expect(container.querySelector('g[data-board-layer="true"] path[stroke="#000000"]')).toBeInTheDocument();
    });
  });

  it('switches the untouched default drawing color when the theme changes', async () => {
    const { container, rerender } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(boardRect);

    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));
    expect(screen.getByRole('button', { name: 'Tool color #ffffff' })).toHaveAttribute('aria-pressed', 'true');

    themeMock.mode = 'light';
    rerender(<SketchWidget widget={widget} />);

    fireEvent.pointerDown(board, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 120 });
    fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 150 });

    await waitFor(() => {
      expect(container.querySelector('g[data-board-layer="true"] path[stroke="#000000"]')).toBeInTheDocument();
    });
  });

  it('opens per-tool drawing options without the global size strip', () => {
    render(<SketchWidget widget={widget} />);

    expect(screen.getByTestId('sketch-toolbar')).toHaveClass('w-full');
    expect(screen.getByTestId('sketch-toolbar-primary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regular' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));

    expect(screen.getByTestId('sketch-tool-options')).toHaveTextContent('Pen');
    expect(screen.getByRole('button', { name: 'Tool color #ffffff' })).toHaveClass('sketch-color-swatch-white');
    expect(screen.getByRole('slider', { name: 'Pen size' })).toHaveValue('4');
  });

  it('keeps color and size settings separate for each drawing tool', async () => {
    const { container } = render(<SketchWidget widget={widget} />);
    const board = screen.getByRole('img', { name: 'Freeform sketch board' }) as SVGSVGElement;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(boardRect);

    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tool color #f43f5e' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Pen size' }), { target: { value: '9' } });

    fireEvent.pointerDown(board, { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 120 });
    fireEvent.pointerUp(board, { pointerId: 1, pointerType: 'mouse', clientX: 180, clientY: 150 });

    await waitFor(() => {
      const penPath = container.querySelector('g[data-board-layer="true"] path[stroke="#f43f5e"]');
      expect(penPath).toBeInTheDocument();
      expect(penPath?.getAttribute('stroke-width')).toBe('9');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Marker' }));

    expect(screen.getByRole('slider', { name: 'Marker size' })).toHaveValue('13');

    fireEvent.pointerDown(board, { button: 0, pointerId: 2, pointerType: 'mouse', clientX: 240, clientY: 120 });
    fireEvent.pointerUp(board, { pointerId: 2, pointerType: 'mouse', clientX: 300, clientY: 150 });

    await waitFor(() => {
      const markerPath = container.querySelector('g[data-board-layer="true"] path[stroke="#ffffff"][opacity="0.26"]');
      expect(markerPath).toBeInTheDocument();
      expect(markerPath?.getAttribute('stroke-width')).toBe('13');
    });
  });
});
