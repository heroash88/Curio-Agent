import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StopwatchWidget from './StopwatchWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

const widgetSize = vi.hoisted(() => ({
  current: {
    w: 2,
    h: 3,
    area: 6,
    pixelWidth: 340,
    pixelHeight: 360,
    sizeClass: 'medium',
    isTall: true,
    isCompact: false,
  },
}));

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => widgetSize.current,
}));

const widget: DashboardWidget = {
  id: 'stopwatch-test',
  type: 'stopwatch',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

describe('StopwatchWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));
    widgetSize.current = {
      w: 2,
      h: 3,
      area: 6,
      pixelWidth: 340,
      pixelHeight: 360,
      sizeClass: 'medium',
      isTall: true,
      isCompact: false,
    };
  });

  it('starts, laps, pauses, and resets the stopwatch from the widget', async () => {
    const updateWidgetConfig = vi.fn();

    const { container } = render(
      <StopwatchWidget
        widget={widget}
        onUpdateWidgetConfig={updateWidgetConfig}
      />,
    );

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-primitive="footer"]')).toBeInTheDocument();
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    expect(screen.getByTestId('stopwatch-display')).toHaveClass('items-center', 'justify-center', 'text-center');

    fireEvent.click(screen.getByRole('button', { name: 'Start stopwatch' }));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(12_340);
    });

    expect(screen.getByText('00:12:34')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record lap' }));
    expect(screen.getByText('Lap 1')).toBeInTheDocument();
    expect(screen.getAllByText('00:12:34')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Pause stopwatch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset stopwatch' }));

    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    expect(screen.queryByText('Lap 1')).not.toBeInTheDocument();
    expect(updateWidgetConfig).toHaveBeenCalledWith(
      widget.id,
      expect.objectContaining({ stopwatchRunning: false }),
    );
  });

  it('updates the hundredths display smoothly without waiting for the shared dashboard tick', async () => {
    render(<StopwatchWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start stopwatch' }));

    await act(async () => {
      vi.advanceTimersByTime(40);
    });

    expect(screen.getByText('00:00:04')).toBeInTheDocument();
  });

  it('adds an hours field only after the elapsed time reaches an hour', () => {
    render(
      <StopwatchWidget
        widget={{
          ...widget,
          config: {
            stopwatchElapsedMs: 3_723_450,
          },
        }}
      />,
    );

    expect(screen.getByText('01:02:03:45')).toBeInTheDocument();
  });

  it('collapses a 1x1 stopwatch to the elapsed time without header chrome', () => {
    widgetSize.current = {
      w: 1,
      h: 1,
      area: 1,
      pixelWidth: 150,
      pixelHeight: 132,
      sizeClass: 'tiny',
      isTall: false,
      isCompact: true,
    };

    render(
      <StopwatchWidget
        widget={{
          ...widget,
          config: {
            stopwatchElapsedMs: 37_590,
          },
        }}
      />,
    );

    expect(screen.getByTestId('stopwatch-tiny-time')).toHaveTextContent('00:37:59');
    expect(screen.getByTestId('stopwatch-tiny-time').querySelector('[data-widget-primitive="fit-text"]')).toBeInTheDocument();
    expect(screen.queryByText('Stopwatch')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start stopwatch/i })).toBeInTheDocument();
  });

  it('lets tiny running stopwatch cards pause by tapping the time', () => {
    widgetSize.current = {
      w: 1,
      h: 1,
      area: 1,
      pixelWidth: 150,
      pixelHeight: 132,
      sizeClass: 'tiny',
      isTall: false,
      isCompact: true,
    };
    const updateWidgetConfig = vi.fn();

    render(
      <StopwatchWidget
        widget={{
          ...widget,
          config: {
            stopwatchElapsedMs: 0,
            stopwatchRunning: true,
            stopwatchStartedAt: Date.now(),
          },
        }}
        onUpdateWidgetConfig={updateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pause stopwatch' }));

    expect(updateWidgetConfig).toHaveBeenCalledWith(
      widget.id,
      expect.objectContaining({ stopwatchRunning: false }),
    );
  });

  it('uses direct time and icon-only actions in compact cards to avoid clipping', () => {
    widgetSize.current = {
      w: 2,
      h: 2,
      area: 4,
      pixelWidth: 290,
      pixelHeight: 218,
      sizeClass: 'small',
      isTall: false,
      isCompact: true,
    };

    render(
      <StopwatchWidget
        widget={{
          ...widget,
          config: {
            stopwatchElapsedMs: 37_590,
            stopwatchRunning: true,
            stopwatchStartedAt: Date.now(),
          },
        }}
      />,
    );

    expect(screen.getByTestId('stopwatch-compact-time')).toHaveTextContent('00:37:59');
    expect(screen.getByTestId('stopwatch-progress-ring')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();

    const pauseButton = screen.getByRole('button', { name: 'Pause stopwatch' });
    const lapButton = screen.getByRole('button', { name: 'Record lap' });
    const resetButton = screen.getByRole('button', { name: 'Reset stopwatch' });
    expect(pauseButton).toHaveClass('aspect-square');
    expect(lapButton).toHaveClass('aspect-square');
    expect(resetButton).toHaveClass('aspect-square');
    expect(pauseButton).not.toHaveTextContent(/pause/i);
    expect(lapButton).not.toHaveTextContent(/lap/i);
    expect(resetButton).not.toHaveTextContent(/reset/i);
  });
});
