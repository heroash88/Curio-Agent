import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WidgetIconButton from './WidgetIconButton';

const DummyIcon = () => <span data-testid="icon">*</span>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WidgetIconButton', () => {
  it('renders with the supplied accessible name and icon', () => {
    render(<WidgetIconButton icon={<DummyIcon />} ariaLabel="Refresh stocks" />);
    const btn = screen.getByRole('button', { name: 'Refresh stocks' });
    expect(btn).toBeInTheDocument();
    expect(btn.dataset.widgetPrimitive).toBe('icon-button');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies the 44px minimum target classes by default', () => {
    render(<WidgetIconButton icon={<DummyIcon />} ariaLabel="Add task" />);
    const btn = screen.getByRole('button', { name: 'Add task' });
    expect(btn.className).toMatch(/min-w-\[44px\]/);
    expect(btn.className).toMatch(/min-h-\[44px\]/);
  });

  it('uses the relaxed 36px target when compact is set', () => {
    render(
      <WidgetIconButton icon={<DummyIcon />} ariaLabel="Add task" compact />,
    );
    const btn = screen.getByRole('button', { name: 'Add task' });
    expect(btn.className).toMatch(/min-w-\[36px\]/);
    expect(btn.className).not.toMatch(/min-w-\[44px\]/);
    expect(btn.dataset.compact).toBe('true');
  });

  it('includes the container-query relaxation variant class', () => {
    render(<WidgetIconButton icon={<DummyIcon />} ariaLabel="Zoom" />);
    const btn = screen.getByRole('button', { name: 'Zoom' });
    expect(btn.className).toMatch(/@container\(width<200px\)/);
  });

  it('forwards onClick handlers', () => {
    const onClick = vi.fn();
    render(
      <WidgetIconButton
        icon={<DummyIcon />}
        ariaLabel="Do thing"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Do thing' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('respects the disabled prop and blocks clicks', () => {
    const onClick = vi.fn();
    render(
      <WidgetIconButton
        icon={<DummyIcon />}
        ariaLabel="Disabled"
        disabled
        onClick={onClick}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the requested tone via the data-tone attribute', () => {
    render(
      <WidgetIconButton
        icon={<DummyIcon />}
        ariaLabel="Delete"
        tone="danger"
      />,
    );
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.dataset.tone).toBe('danger');
  });

  it('warns in development when ariaLabel is empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<WidgetIconButton icon={<DummyIcon />} ariaLabel="" />);
    expect(warn).toHaveBeenCalled();
    const calledWithLabelWarning = warn.mock.calls.some((call) =>
      String(call[0]).includes('WidgetIconButton'),
    );
    expect(calledWithLabelWarning).toBe(true);
  });

  it('does not warn when ariaLabel is provided', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<WidgetIconButton icon={<DummyIcon />} ariaLabel="Save" />);
    const called = warn.mock.calls.some((call) =>
      String(call[0]).includes('WidgetIconButton'),
    );
    expect(called).toBe(false);
  });
});
