import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FaceModeDashboardButton } from './FaceModeDashboardButton';

describe('FaceModeDashboardButton', () => {
  it('offers a quick jump from face mode to dashboard mode', () => {
    const onOpenDashboard = vi.fn();

    render(
      <FaceModeDashboardButton
        dark={false}
        onOpenDashboard={onOpenDashboard}
      />,
    );

    const button = screen.getByRole('button', { name: 'Dashboard mode' });

    expect(button).toHaveAttribute('title', 'Dashboard mode');
    fireEvent.click(button);

    expect(onOpenDashboard).toHaveBeenCalledTimes(1);
  });
});
