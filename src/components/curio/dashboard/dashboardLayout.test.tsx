import { describe, expect, it } from 'vitest';
import { createDashboardWidget } from '../../../services/dashboardTypes';
import { getWidgetGridDimensions } from './dashboardLayout';

describe('dashboard grid layout sizing', () => {
  it('allows the profile widget to shrink into a compact mobile tile', () => {
    const profile = createDashboardWidget('profile', 0, {
      config: { w: 1, h: 1 },
    });

    expect(getWidgetGridDimensions(profile, 1)).toMatchObject({ w: 1, h: 1 });
  });
});
