import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import DashboardToastHost from './DashboardToastHost';
import {
  dashboardToastBus,
  resetDashboardToastBus,
} from '../../../services/dashboardToastBus';

describe('DashboardToastHost', () => {
  beforeEach(() => {
    resetDashboardToastBus();
  });

  afterEach(() => {
    cleanup();
    resetDashboardToastBus();
  });

  it('renders a toast label after dashboardToastBus.show()', () => {
    render(<DashboardToastHost />);

    act(() => {
      dashboardToastBus.show({ id: 't1', label: 'Task removed' });
    });

    expect(screen.getByText('Task removed')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-toast-host')).toBeInTheDocument();
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<DashboardToastHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it('invokes onUndo exactly once on click and removes the toast', () => {
    const onUndo = vi.fn();
    render(<DashboardToastHost />);

    act(() => {
      dashboardToastBus.show({ id: 'undo-me', label: 'Deleted item', onUndo });
    });

    const undoButton = screen.getByRole('button', { name: /undo deleted item/i });
    fireEvent.click(undoButton);
    // Second click on an already-triggered toast should be a no-op.
    // Queue a second trigger through the bus directly in case the
    // first click removed the button (which it does by design).
    act(() => {
      dashboardToastBus.triggerUndo('undo-me');
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Deleted item')).toBeNull();
  });

  it('renders up to three toasts at once', () => {
    render(<DashboardToastHost />);

    act(() => {
      dashboardToastBus.show({ id: 'a', label: 'Alpha' });
      dashboardToastBus.show({ id: 'b', label: 'Bravo' });
      dashboardToastBus.show({ id: 'c', label: 'Charlie' });
    });

    const toasts = screen.getAllByTestId('dashboard-toast');
    expect(toasts).toHaveLength(3);
    expect(toasts.map((node) => node.getAttribute('data-toast-id'))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('danger-toned toasts expose role="alert" for screen readers', () => {
    render(<DashboardToastHost />);

    act(() => {
      dashboardToastBus.show({
        id: 'danger',
        label: 'Sync failed',
        tone: 'danger',
      });
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Sync failed');
  });

  it('dismiss button removes the toast without firing onUndo', () => {
    const onUndo = vi.fn();
    render(<DashboardToastHost />);

    act(() => {
      dashboardToastBus.show({ id: 'dis', label: 'Dismissible', onUndo });
    });

    const dismissButton = screen.getByRole('button', { name: /dismiss dismissible/i });
    fireEvent.click(dismissButton);

    expect(onUndo).not.toHaveBeenCalled();
    expect(screen.queryByText('Dismissible')).toBeNull();
  });
});
