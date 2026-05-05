import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DashboardFocusedWidgetOverlay from './DashboardFocusedWidgetOverlay';
import type { DashboardWidget } from '../../../services/dashboardTypes';

vi.mock('./dashboardRegistry', () => ({
  WIDGET_COMPONENTS: {
    notes: () => <div>Focused notes widget</div>,
  },
}));

const widget: DashboardWidget = {
  id: 'notes_1',
  type: 'notes',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 2, h: 2 },
};

describe('DashboardFocusedWidgetOverlay', () => {
  it('renders focused widget overlay animation hooks', () => {
    const { container } = render(
      <DashboardFocusedWidgetOverlay
        focusedWidget={widget}
        boardWidth={1024}
        weather={null}
        aqi={null}
        activeProfileName={null}
        activeProfileId={null}
        recognizedBy={null}
        speakerUpdatedAt={0}
        onClose={vi.fn()}
        onUpdateWidgetConfig={vi.fn()}
        onOpenWidgetSettings={vi.fn()}
      />,
    );

    expect(container.querySelector('.dashboard-focused-widget-backdrop')).toBeTruthy();
    expect(container.querySelector('.dashboard-focused-widget-shell')).toBeTruthy();
  });
});
