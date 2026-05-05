import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WidgetCounter from './WidgetCounter';
import type { MotionProfile } from '../../../../hooks/useMotionProfile';

const motionProfileRef: { current: MotionProfile } = {
  current: {
    mode: 'full',
    shouldAnimate: true,
    durationMs: (base: number) => base,
    scale: (base: number) => base,
  },
};

vi.mock('../../../../hooks/useMotionProfile', () => ({
  useMotionProfile: () => motionProfileRef.current,
}));

const fullProfile: MotionProfile = {
  mode: 'full',
  shouldAnimate: true,
  durationMs: (base) => base,
  scale: (base) => base,
};

const offProfile: MotionProfile = {
  mode: 'off',
  shouldAnimate: false,
  durationMs: () => 0,
  scale: () => 1,
};

beforeEach(() => {
  motionProfileRef.current = fullProfile;
});

describe('WidgetCounter', () => {
  it('renders a finite value formatted with toLocaleString by default', () => {
    motionProfileRef.current = offProfile;
    render(<WidgetCounter value={12480} />);
    expect(screen.getByText((t) => t.replace(/\s/g, '') === '12,480'))
      .toBeInTheDocument();
  });

  it('honors a custom format function', () => {
    motionProfileRef.current = offProfile;
    render(
      <WidgetCounter value={0.75} format={(n) => `${(n * 100).toFixed(0)}%`} />,
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders the fallback for non-finite values without throwing', () => {
    motionProfileRef.current = offProfile;
    const { rerender } = render(<WidgetCounter value={Number.NaN} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<WidgetCounter value={Number.POSITIVE_INFINITY} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<WidgetCounter value={Number.NEGATIVE_INFINITY} fallback="n/a" />);
    expect(screen.getByText('n/a')).toBeInTheDocument();
  });

  it('updates synchronously to the formatted value when motion is off', () => {
    motionProfileRef.current = offProfile;
    const { rerender } = render(<WidgetCounter value={1} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    act(() => {
      rerender(<WidgetCounter value={9999} />);
    });
    expect(screen.getByText('9,999')).toBeInTheDocument();
  });

  it('updates synchronously when prefersReducedMotion prop is true', () => {
    motionProfileRef.current = fullProfile;
    const { rerender } = render(
      <WidgetCounter value={1} prefersReducedMotion />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    act(() => {
      rerender(<WidgetCounter value={42} prefersReducedMotion />);
    });
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('forwards ariaLabel onto the rendered element', () => {
    motionProfileRef.current = offProfile;
    render(<WidgetCounter value={5} ariaLabel="Five tasks" />);
    const node = screen.getByLabelText('Five tasks');
    expect(node).toBeInTheDocument();
    expect(node.dataset.widgetPrimitive).toBe('counter');
  });

  it('renders a slotRoll column without throwing', () => {
    motionProfileRef.current = offProfile;
    render(<WidgetCounter value={100} mode="slotRoll" />);
    const node = screen.getByText('100');
    expect(node.closest('[data-mode="slotRoll"]')).not.toBeNull();
  });

  it('renders an odometer column without throwing', () => {
    motionProfileRef.current = offProfile;
    render(<WidgetCounter value={42} mode="odometer" />);
    const node = screen.getByText((_content, element) => {
      if (!element) return false;
      return (
        element.getAttribute('data-mode') === 'odometer' &&
        element.textContent === '42'
      );
    });
    expect(node).toBeInTheDocument();
  });

  it('respects the precision prop', () => {
    motionProfileRef.current = offProfile;
    render(<WidgetCounter value={3.14159} precision={2} />);
    expect(screen.getByText('3.14')).toBeInTheDocument();
  });
});
