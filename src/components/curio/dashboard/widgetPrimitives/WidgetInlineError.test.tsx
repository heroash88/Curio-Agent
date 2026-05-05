import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WidgetInlineError from './WidgetInlineError';
import { getDashboardRefreshEventName } from '../../../../services/dashboardRefresh';

describe('WidgetInlineError', () => {
  it('renders the message and a Retry button when widgetId is provided', () => {
    render(
      <WidgetInlineError message="Something broke" widgetId="w-1" />,
    );
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it('invokes onRetry when provided and does not dispatch the refresh event', () => {
    const onRetry = vi.fn();
    const spy = vi.spyOn(window, 'dispatchEvent');
    render(
      <WidgetInlineError
        message="oops"
        widgetId="w-1"
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    // The refresh event specifically should not have been dispatched.
    const dispatchedRefresh = spy.mock.calls.some(([event]) => {
      return (
        event instanceof Event &&
        event.type === getDashboardRefreshEventName('w-1')
      );
    });
    expect(dispatchedRefresh).toBe(false);
    spy.mockRestore();
  });

  it('dispatches the widget refresh event when only widgetId is provided', () => {
    const widgetId = 'widget-42';
    const handler = vi.fn();
    const eventName = getDashboardRefreshEventName(widgetId);
    window.addEventListener(eventName, handler);

    render(<WidgetInlineError message="boom" widgetId={widgetId} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<{ widgetId: string }>;
    expect(event.type).toBe(eventName);
    expect(event.detail).toEqual({ widgetId });

    window.removeEventListener(eventName, handler);
  });

  it('hides the Retry button when neither onRetry nor widgetId is provided', () => {
    render(<WidgetInlineError message="no retry available" />);
    expect(
      screen.queryByRole('button', { name: /retry/i }),
    ).not.toBeInTheDocument();
  });

  it('only renders the Settings button when onOpenSettings is provided', () => {
    const { rerender } = render(
      <WidgetInlineError message="hi" widgetId="w-1" />,
    );
    expect(
      screen.queryByRole('button', { name: /settings/i }),
    ).not.toBeInTheDocument();

    const onOpenSettings = vi.fn();
    rerender(
      <WidgetInlineError
        message="hi"
        widgetId="w-1"
        onOpenSettings={onOpenSettings}
      />,
    );
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('surfaces the message as an alert for assistive tech', () => {
    render(<WidgetInlineError message="failed to load" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('failed to load');
  });
});
