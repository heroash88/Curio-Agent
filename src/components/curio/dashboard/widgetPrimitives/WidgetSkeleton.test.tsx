import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WidgetSkeleton from './WidgetSkeleton';
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

describe('WidgetSkeleton', () => {
  it('renders each non-custom variant without throwing', () => {
    const variants = ['stat', 'list', 'chart', 'grid', 'hero'] as const;
    for (const variant of variants) {
      const { unmount } = render(
        <WidgetSkeleton variant={variant} data-testid={`skel-${variant}`} />,
      );
      const node = screen.getByTestId(`skel-${variant}`);
      expect(node).toBeInTheDocument();
      expect(node.dataset.variant).toBe(variant);
      unmount();
    }
  });

  it('defaults to the stat variant', () => {
    render(<WidgetSkeleton data-testid="skel-default" />);
    const node = screen.getByTestId('skel-default');
    expect(node.dataset.variant).toBe('stat');
  });

  it('omits the shimmer animation class when motion is off', () => {
    motionProfileRef.current = offProfile;
    render(<WidgetSkeleton variant="list" data-testid="skel-static" />);
    const node = screen.getByTestId('skel-static');
    expect(node.dataset.animate).toBe('false');
    expect(node.className).not.toMatch(/animate-\[shimmer/);
  });

  it('includes the shimmer animation class when motion is on', () => {
    motionProfileRef.current = fullProfile;
    render(<WidgetSkeleton variant="list" data-testid="skel-anim" />);
    const node = screen.getByTestId('skel-anim');
    expect(node.dataset.animate).toBe('true');
    expect(node.className).toMatch(/animate-\[shimmer/);
  });

  it('renders children for the custom variant', () => {
    render(
      <WidgetSkeleton variant="custom" data-testid="skel-custom">
        <div data-testid="custom-child">custom body</div>
      </WidgetSkeleton>,
    );
    expect(screen.getByTestId('skel-custom')).toBeInTheDocument();
    expect(screen.getByTestId('custom-child')).toHaveTextContent('custom body');
  });

  it('renders the requested number of list rows', () => {
    const { container } = render(
      <WidgetSkeleton variant="list" rows={6} data-testid="skel-rows" />,
    );
    const node = container.querySelector('[data-testid="skel-rows"]');
    expect(node).not.toBeNull();
    // Inner list stacks one block per row.
    const rowBlocks = node!.querySelectorAll(':scope > div > div');
    expect(rowBlocks.length).toBe(6);
  });

  it('uses w-full h-full so it matches the WidgetBody bounding box', () => {
    render(<WidgetSkeleton data-testid="skel-box" />);
    const node = screen.getByTestId('skel-box');
    expect(node.className).toMatch(/\bh-full\b/);
    expect(node.className).toMatch(/\bw-full\b/);
  });
});
