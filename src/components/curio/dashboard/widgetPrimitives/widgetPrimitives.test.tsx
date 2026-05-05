import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WidgetSizeInfo } from '../../../../hooks/useWidgetSize';
import WidgetBody from './WidgetBody';
import WidgetContent from './WidgetContent';
import WidgetEmptyState from './WidgetEmptyState';
import WidgetHero from './WidgetHero';
import WidgetList from './WidgetList';
import WidgetStatGrid from './WidgetStatGrid';
import WidgetText from './WidgetText';

// The primitives use `useCardTheme` for dark-mode aware class strings.
// Mock the hook to avoid pulling in the full settings storage stack.
vi.mock('../../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-[var(--ether-on-surface)]',
    onSurfaceVariant: 'text-[var(--ether-on-surface-variant)]',
    muted: 'text-[var(--ether-on-surface-variant)]',
    faint: 'text-[#b8b0a2]',
    surfaceContainerLow: 'bg-[var(--ether-surface-container-low)]',
  }),
}));

const makeSize = (overrides: Partial<WidgetSizeInfo> = {}): WidgetSizeInfo => ({
  w: 4,
  h: 3,
  area: 12,
  sizeClass: 'medium',
  isWide: true,
  isTall: true,
  isCompact: false,
  pixelWidth: 480,
  pixelHeight: 320,
  ...overrides,
});

describe('WidgetBody', () => {
  it('enforces overflow-hidden when scroll is not opted-in', () => {
    render(
      <WidgetBody data-testid="body">
        <p>content</p>
      </WidgetBody>,
    );
    const node = screen.getByTestId('body');
    expect(node.className).toContain('overflow-hidden');
    expect(node.className).toContain('min-h-0');
    expect(node.className).toContain('min-w-0');
    expect(node.dataset.scroll).toBe('none');
  });

  it('enables scroll with the shared touch-scroll pattern when scroll="y"', () => {
    render(
      <WidgetBody data-testid="body" scroll="y">
        <p>content</p>
      </WidgetBody>,
    );
    const node = screen.getByTestId('body');
    expect(node.dataset.scroll).toBe('y');
    expect(node.className).toContain('overflow-y-auto');
    expect(node.className).toContain('dashboard-widget-touch-scroll');
    expect(node.className).toContain('overscroll-contain');
  });
});

describe('WidgetText', () => {
  it('applies truncate to title and adds a native tooltip for string children', () => {
    render(
      <div className="w-20">
        <WidgetText variant="title">Very long widget title that would clip</WidgetText>
      </div>,
    );
    const node = screen.getByText(/Very long widget title/);
    expect(node.className).toContain('truncate');
    expect(node.getAttribute('title')).toBe('Very long widget title that would clip');
  });

  it('uses whitespace-nowrap and tabular-nums for numeric value variant', () => {
    render(<WidgetText variant="value">$12,480.05</WidgetText>);
    const node = screen.getByText('$12,480.05');
    expect(node.className).toContain('whitespace-nowrap');
    expect(node.className).toContain('tabular-nums');
  });

  it('clamps body text to the given number of lines', () => {
    render(
      <WidgetText variant="body" lines={3}>
        Long body text
      </WidgetText>,
    );
    const node = screen.getByText('Long body text');
    expect(node.className).toContain('line-clamp-3');
  });
});

describe('WidgetStatGrid', () => {
  it('collapses to a single column on narrow widgets', () => {
    render(
      <WidgetStatGrid size={makeSize({ pixelWidth: 240, sizeClass: 'small' })}>
        <div>stat</div>
      </WidgetStatGrid>,
    );
    const grid = screen.getByText('stat').parentElement!;
    expect(grid.dataset.columns).toBe('1');
    expect(grid.className).toContain('grid-cols-1');
  });

  it('expands to three columns on wide widgets', () => {
    render(
      <WidgetStatGrid size={makeSize({ pixelWidth: 680, sizeClass: 'large' })}>
        <div>stat</div>
      </WidgetStatGrid>,
    );
    const grid = screen.getByText('stat').parentElement!;
    expect(grid.dataset.columns).toBe('3');
    expect(grid.className).toContain('grid-cols-3');
  });

  it('respects maxColumns when set', () => {
    render(
      <WidgetStatGrid
        size={makeSize({ pixelWidth: 900, sizeClass: 'xlarge' })}
        maxColumns={2}
      >
        <div>stat</div>
      </WidgetStatGrid>,
    );
    const grid = screen.getByText('stat').parentElement!;
    expect(grid.dataset.columns).toBe('2');
  });
});

describe('WidgetList', () => {
  const items = Array.from({ length: 12 }).map((_, index) => ({
    id: index,
    label: `Item ${index}`,
  }));

  it('drops overflow items and renders a "+N more" chip by default', () => {
    render(
      <WidgetList
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div data-testid="row">{item.label}</div>}
        size={makeSize({ pixelHeight: 200 })}
        approxRowHeight={44}
        reservedHeight={40}
        data-testid="list"
      />,
    );
    const rows = screen.getAllByTestId('row');
    expect(rows.length).toBeLessThan(items.length);
    // (200 - 40) / 44 = 3 rows, so 9 are dropped.
    expect(rows).toHaveLength(3);
    expect(screen.getByText(/\+\d+ more/)).toBeInTheDocument();
  });

  it('renders an empty state when items is empty', () => {
    render(
      <WidgetList
        items={[]}
        getKey={(_, index) => index}
        renderItem={() => null}
        size={makeSize()}
        emptyLabel="Nothing here"
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('enables touch scrolling when scroll="y" and does not drop items', () => {
    render(
      <WidgetList
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div data-testid="row">{item.label}</div>}
        size={makeSize({ pixelHeight: 200 })}
        approxRowHeight={44}
        scroll="y"
        data-testid="list"
      />,
    );
    expect(screen.getAllByTestId('row')).toHaveLength(items.length);
    const body = screen.getByTestId('list');
    expect(body.dataset.scroll).toBe('y');
    expect(body.className).toContain('overflow-y-auto');
  });
});

describe('WidgetEmptyState', () => {
  it('renders a centered panel with accessible title and description', () => {
    render(
      <WidgetEmptyState
        title="Nothing yet"
        description="Connect an account to see data"
        data-testid="empty"
      />,
    );
    const panel = screen.getByTestId('empty');
    expect(panel.dataset.variant).toBe('empty');
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText('Connect an account to see data')).toBeInTheDocument();
  });

  it('flags error variant for styling', () => {
    render(<WidgetEmptyState title="Oops" variant="error" data-testid="empty" />);
    expect(screen.getByTestId('empty').dataset.variant).toBe('error');
  });
});

describe('WidgetHero', () => {
  it('renders value, optional unit, label, and caption', () => {
    render(
      <WidgetHero
        size={makeSize({ sizeClass: 'medium', pixelWidth: 400, pixelHeight: 240 })}
        value="72"
        unit="°F"
        label="Live"
        caption="Feels like 68"
        data-testid="hero"
      />,
    );
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('°F')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Feels like 68')).toBeInTheDocument();
  });
});

describe('WidgetContent spec layout', () => {
  it('renders only the hero at tiny size', () => {
    render(
      <WidgetContent
        size={makeSize({
          sizeClass: 'tiny',
          pixelWidth: 160,
          pixelHeight: 160,
          isCompact: true,
          isWide: false,
          isTall: false,
          w: 1,
          h: 1,
          area: 1,
        })}
        spec={{
          hero: { value: '42', testId: 'hero' },
          stats: [{ label: 'Hidden stat', value: '99' }],
          list: {
            items: [{ id: 1 }],
            getKey: (item) => item.id,
            renderItem: () => <div>list-row</div>,
          },
        }}
      />,
    );
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.queryByText('Hidden stat')).not.toBeInTheDocument();
    expect(screen.queryByText('list-row')).not.toBeInTheDocument();
  });

  it('adds stats at medium size', () => {
    render(
      <WidgetContent
        size={makeSize({ sizeClass: 'medium' })}
        spec={{
          hero: { value: '42' },
          stats: [{ label: 'Visible stat', value: '7' }],
        }}
      />,
    );
    expect(screen.getByText('Visible stat')).toBeInTheDocument();
  });

  it('respects explicit show overrides', () => {
    render(
      <WidgetContent
        size={makeSize({
          sizeClass: 'tiny',
          pixelWidth: 160,
          pixelHeight: 160,
          isCompact: true,
        })}
        spec={{
          hero: { value: '42' },
          stats: [{ label: 'Forced stat', value: '7' }],
          show: { stats: true },
        }}
      />,
    );
    expect(screen.getByText('Forced stat')).toBeInTheDocument();
  });

  it('renders an empty-state shortcut when only empty is provided', () => {
    render(
      <WidgetContent
        size={makeSize()}
        spec={{ empty: { title: 'Not connected', variant: 'error' } }}
      />,
    );
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });
});

describe('WidgetBody action safe area', () => {
  it('reserves top-right padding when actionSafeArea is on', () => {
    render(
      <WidgetBody actionSafeArea data-testid="body">
        <p>content</p>
      </WidgetBody>,
    );
    const node = screen.getByTestId('body');
    expect(node.dataset.actionSafeArea).toBe('true');
    expect(node.className).toContain('pr-10');
  });

  it('omits the reservation by default', () => {
    render(
      <WidgetBody data-testid="body">
        <p>content</p>
      </WidgetBody>,
    );
    const node = screen.getByTestId('body');
    expect(node.dataset.actionSafeArea).toBeUndefined();
    expect(node.className).not.toContain('pr-10');
  });
});


import WidgetFooter from './WidgetFooter';

describe('WidgetFooter', () => {
  it('pins its content to the bottom with mt-auto and shrink-0', () => {
    render(
      <WidgetFooter data-testid="footer">
        <button type="button">Browse</button>
      </WidgetFooter>,
    );
    const node = screen.getByTestId('footer');
    expect(node.className).toContain('mt-auto');
    expect(node.className).toContain('shrink-0');
    expect(node.dataset.widgetPrimitive).toBe('footer');
  });

  it('renders an optional top border when bordered is true', () => {
    render(
      <WidgetFooter bordered data-testid="footer">
        <span>row</span>
      </WidgetFooter>,
    );
    expect(screen.getByTestId('footer').className).toContain('border-t');
  });

  it('defaults to gap-2 stacking so multiple rows never collapse', () => {
    render(
      <WidgetFooter data-testid="footer">
        <button type="button">One</button>
        <button type="button">Two</button>
      </WidgetFooter>,
    );
    expect(screen.getByTestId('footer').className).toContain('gap-2');
  });
});
