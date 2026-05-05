import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnalogClockWidget from './AnalogClockWidget';
import { DashboardWidgetActionSlotContext } from './WidgetShell';
import {
  DASHBOARD_CLOCK_DESIGN_OPTIONS,
  type DashboardClockDesign,
  type DashboardWidget,
} from '../../../services/dashboardTypes';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    headline: 'font-headline',
    onSurface: 'text-slate-900',
    onSurfaceVariant: 'text-slate-600',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    sizeClass: 'medium',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 420,
    pixelHeight: 420,
  }),
}));

vi.mock('../../../hooks/useSyncedDashboardTime', () => ({
  useSyncedDashboardTime: () => new Date('2026-04-24T10:10:30'),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useClockShowSeconds: () => false,
}));

const buildWidget = (clockDesign: DashboardClockDesign): DashboardWidget => ({
  id: `analog_${clockDesign}`,
  type: 'analog_clock',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 3, h: 3, clockDesign },
});

const getRenderedTickMarks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('div')).filter((element) => {
    const className = element.getAttribute('class') || '';
    const style = element.getAttribute('style') || '';
    return className.includes('origin-bottom')
      && className.includes('top-0')
      && style.includes('rotate(');
  });

const getAuraElement = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('div')).find((element) => (
    element.getAttribute('style') || ''
  ).includes('transparent 72%'));

const classicalBlackWhiteDesign: DashboardClockDesign = 'classical_black_white';
const allHourNumerals = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

describe('AnalogClockWidget', () => {
  it('wraps the custom analog dial in the shared widget body primitive', () => {
    const { container } = render(<AnalogClockWidget widget={buildWidget('modern')} />);

    const body = container.querySelector('[data-widget-primitive="body"]');

    expect(body).toBeInTheDocument();
    expect(body).toContainElement(screen.getByRole('img', { name: /Analog clock showing/i }));
  });

  it.each<DashboardClockDesign>(['classical', 'regulator', 'marine', 'modern', 'instrument'])(
    'does not render dial tick marks on the numbered %s face',
    (clockDesign) => {
      const { container } = render(<AnalogClockWidget widget={buildWidget(clockDesign)} />);

      expect(screen.getByText(['classical', 'regulator'].includes(clockDesign) ? 'XII' : '12')).toBeInTheDocument();
      expect(getRenderedTickMarks(container)).toHaveLength(0);
    },
  );

  it('offers a black-and-white classical clock face with visible hour numbers', () => {
    expect(DASHBOARD_CLOCK_DESIGN_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'classical_black_white',
          label: 'Classical B/W',
        }),
      ]),
    );

    const { container } = render(<AnalogClockWidget widget={buildWidget(classicalBlackWhiteDesign)} />);

    allHourNumerals.forEach((numeral) => {
      expect(screen.getByText(numeral)).toBeInTheDocument();
    });
    expect(getRenderedTickMarks(container)).toHaveLength(0);
  });

  it('keeps the clock face free of the selected design label at rest', () => {
    render(<AnalogClockWidget widget={buildWidget('instrument')} />);

    expect(screen.queryByText('Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Instrument')).not.toBeInTheDocument();
  });

  it('does not show the analog aura behind the clock in light mode at rest', () => {
    const { container } = render(<AnalogClockWidget widget={buildWidget('modern')} />);

    expect(getAuraElement(container)).toHaveStyle({ opacity: '0' });
  });

  it('offers additional classical clock designs', () => {
    expect(DASHBOARD_CLOCK_DESIGN_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining(['railway', 'regulator', 'marine']),
    );
  });

  it('reveals the clock name and action slot on touch', () => {
    render(
      <DashboardWidgetActionSlotContext.Provider value={<button type="button">Clock menu</button>}>
        <AnalogClockWidget widget={buildWidget('regulator')} />
      </DashboardWidgetActionSlotContext.Provider>,
    );

    const clock = screen.getByRole('img', { name: /Analog clock showing/i });

    expect(screen.queryByText('Regulator')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock menu' }).parentElement).toHaveClass('opacity-0');

    fireEvent.pointerDown(clock);

    expect(screen.getByText('Regulator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock menu' }).parentElement).toHaveClass('opacity-100');
  });
});
