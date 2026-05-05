import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import DashboardInteractivitySettings from './DashboardInteractivitySettings';
import {
  getDashboardInteractivitySettings,
  setDashboardInteractivitySettings,
} from '../../../utils/settingsStorage';
import { DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS } from '../../../services/dashboardTypes';

describe('DashboardInteractivitySettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('renders the animation intensity segmented control and every toggle', () => {
    render(<DashboardInteractivitySettings />);

    expect(screen.getByRole('radiogroup', { name: /animation intensity/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /off/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /subtle/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /full/i })).toBeInTheDocument();

    // Spot check a representative subset — one toggle per grouping.
    expect(screen.getByRole('switch', { name: /ambient pulse/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /swipe gestures/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /undo toasts/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /rolling numbers/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /sparkline history/i })).toBeInTheDocument();
  });

  it('clicking a toggle flips the interactivity setting in storage', () => {
    setDashboardInteractivitySettings({
      ...DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
      ambientPulseEnabled: true,
    });

    render(<DashboardInteractivitySettings />);

    const toggle = screen.getByRole('switch', { name: /ambient pulse/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    act(() => {
      fireEvent.click(toggle);
    });

    expect(getDashboardInteractivitySettings().ambientPulseEnabled).toBe(false);
  });

  it('segmented control updates animationIntensity in storage', () => {
    render(<DashboardInteractivitySettings />);

    const subtle = screen.getByRole('radio', { name: /subtle/i });

    act(() => {
      fireEvent.click(subtle);
    });

    expect(getDashboardInteractivitySettings().animationIntensity).toBe('subtle');

    const off = screen.getByRole('radio', { name: /off/i });
    act(() => {
      fireEvent.click(off);
    });
    expect(getDashboardInteractivitySettings().animationIntensity).toBe('off');
  });
});
