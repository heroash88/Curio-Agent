import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import ImageGalleryWidget from './ImageGalleryWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../services/dashboardImageStore', () => ({
  addDashboardGalleryImages: vi.fn(async () => ['gallery_test_image']),
  addDashboardGalleryDataUrls: vi.fn(async () => ['gallery_migrated_image']),
  getDashboardGalleryImageBlobUrls: vi.fn(async () => ({})),
  removeDashboardGalleryImage: vi.fn(async () => {}),
}));

const buildWidget = (config: DashboardWidget['config'] = {}): DashboardWidget => ({
  id: 'gallery-test',
  type: 'image_gallery',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 4,
    h: 4,
    ...config,
  },
});

describe('ImageGalleryWidget', () => {
  it('uses the shared multi-color gallery icon for the empty widget header', () => {
    const { container } = render(<ImageGalleryWidget widget={buildWidget()} />);

    expect(container.querySelector('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(screen.getByText('Image Gallery')).toBeInTheDocument();
    expect(container.querySelector('svg rect[fill="#DBEAFE"]')).toBeInTheDocument();
    expect(container.querySelector('svg circle[fill="#3B82F6"]')).toBeInTheDocument();
  });

  it('keeps the active gallery photo full-bleed inside the shared widget body', () => {
    render(
      <ImageGalleryWidget
        widget={buildWidget({
          galleryImages: ['data:image/png;base64,curio'],
        })}
      />,
    );

    const image = screen.getByRole('img', { name: 'Gallery 1' });

    expect(image.closest('[data-widget-primitive="body"]')).toBeInTheDocument();
    expect(image).toHaveClass('h-full', 'w-full', 'object-cover');
  });

  it('stores uploaded gallery images as lightweight references instead of data URLs', async () => {
    const onUpdateWidgetConfig = vi.fn();

    const { container } = render(
      <ImageGalleryWidget
        widget={buildWidget()}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(['photo'], 'photo.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(onUpdateWidgetConfig).toHaveBeenCalled();
    });

    const latestPatch = onUpdateWidgetConfig.mock.calls.at(-1)?.[1];
    expect(latestPatch).toMatchObject({ galleryImageIds: ['gallery_test_image'] });
    expect(JSON.stringify(latestPatch)).not.toContain('data:image/');
  });
});
