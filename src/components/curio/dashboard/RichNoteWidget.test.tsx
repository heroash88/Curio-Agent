import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import RichNoteWidget from './RichNoteWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: false,
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    pixelWidth: 520,
    pixelHeight: 420,
    sizeClass: 'large',
    isCompact: false,
  }),
}));

vi.mock('../../../services/dashboardImageStore', () => ({
  addDashboardGalleryImages: vi.fn(async () => ['gallery_test_image']),
  addDashboardGalleryDataUrls: vi.fn(async () => ['gallery_inline_image']),
  getDashboardGalleryImageBlobUrls: vi.fn(async () => ({
    gallery_test_image: 'blob:sticky-test-image',
    gallery_inline_image: 'blob:sticky-inline-image',
  })),
  removeDashboardGalleryImage: vi.fn(async () => {}),
}));

const buildWidget = (config: DashboardWidget['config'] = {}): DashboardWidget => ({
  id: 'sticky-test',
  type: 'rich_note',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    richNoteTitle: 'Launch ideas',
    ...config,
  },
});

const createClipboardData = (html: string, text = '', files: File[] = []) => ({
  files,
  getData: (type: string) => {
    if (type === 'text/html') return html;
    if (type === 'text/plain') return text;
    return '';
  },
});

describe('RichNoteWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pastes formatted content and image files into the note', async () => {
    const onUpdateWidgetConfig = vi.fn();
    const file = new File(['image'], 'clip.png', { type: 'image/png' });
    const imageStore = await import('../../../services/dashboardImageStore');

    render(<RichNoteWidget widget={buildWidget()} onUpdateWidgetConfig={onUpdateWidgetConfig} />);

    const editor = screen.getByRole('textbox', { name: 'Launch ideas note body' });
    fireEvent.paste(editor, {
      clipboardData: createClipboardData(
        '<h2>Plan</h2><ul><li><span style="font-weight: 700; background-color: #fff59d;">Ship notes</span></li></ul>',
        'Plan\nShip notes',
        [file],
      ),
    });

    await waitFor(() => {
      expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
        'sticky-test',
        expect.objectContaining({
          richNoteHtml: expect.stringContaining('data-dashboard-image-id="gallery_test_image"'),
        }),
      );
    }, { timeout: 2000 });

    const latestPatch = onUpdateWidgetConfig.mock.calls.at(-1)?.[1];
    expect(latestPatch.richNoteHtml).toContain('<ul>');
    expect(latestPatch.richNoteHtml).toContain('background-color');
    expect(latestPatch.richNoteHtml).not.toContain('data:image/png;base64');
    expect(imageStore.addDashboardGalleryImages).toHaveBeenCalledWith([file]);
    expect(imageStore.getDashboardGalleryImageBlobUrls).toHaveBeenCalledWith(['gallery_test_image']);
  });

  it('migrates existing inline sticky note images out of widget config', async () => {
    const onUpdateWidgetConfig = vi.fn();
    const imageStore = await import('../../../services/dashboardImageStore');

    render(
      <RichNoteWidget
        widget={buildWidget({
          richNoteHtml: '<p>Old clip</p><img src="data:image/png;base64,b2xk">',
        } as DashboardWidget['config'])}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    await waitFor(() => {
      expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
        'sticky-test',
        expect.objectContaining({
          richNoteHtml: expect.stringContaining('data-dashboard-image-id="gallery_inline_image"'),
        }),
      );
    });

    const latestPatch = onUpdateWidgetConfig.mock.calls.at(-1)?.[1];
    expect(latestPatch.richNoteHtml).not.toContain('data:image/png;base64,b2xk');
    expect(imageStore.addDashboardGalleryDataUrls).toHaveBeenCalledWith([
      'data:image/png;base64,b2xk',
    ]);
  });

  it('updates note color and exports note contents as plain text', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <RichNoteWidget
        widget={buildWidget({
          richNoteHtml: '<h2>Plan</h2><p>Ship notes</p>',
          richNoteColor: 'canary',
        } as DashboardWidget['config'])}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open sticky note tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use rose sticky note color' }));
    expect(onUpdateWidgetConfig).toHaveBeenCalledWith(
      'sticky-test',
      expect.objectContaining({
        richNoteColor: 'rose',
      }),
    );

    const exportLink = screen.getByRole('link', { name: 'Save sticky note as text' });
    expect(exportLink).toHaveAttribute('download', 'Launch-ideas.txt');
    expect(decodeURIComponent(exportLink.getAttribute('href') || '')).toContain('Plan\nShip notes');
  });

  it('keeps note chrome out of the paper and creates additional notes from the plus button', () => {
    const onUpdateWidgetConfig = vi.fn();
    const onCreateWidget = vi.fn();
    const RichNoteWithCreate = RichNoteWidget as React.ComponentType<
      React.ComponentProps<typeof RichNoteWidget> & {
        onCreateWidget?: (
          type: DashboardWidget['type'],
          config: DashboardWidget['config'],
          options?: { afterWidgetId?: string },
        ) => void;
      }
    >;

    render(
      <RichNoteWithCreate
        widget={buildWidget({
          richNoteHtml: '<p>Hello there</p>',
          richNoteTitle: 'Ideas',
          richNoteColor: 'mint',
        } as DashboardWidget['config'])}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
        onCreateWidget={onCreateWidget}
      />,
    );

    const paper = screen.getByTestId('sticky-note-paper');
    expect(paper).toHaveTextContent('Hello there');
    expect(paper).not.toHaveTextContent('Sticky Note');
    expect(paper).not.toHaveTextContent('Paste formatted text');
    expect(paper).toHaveStyle({ boxShadow: 'none' });
    expect(screen.getByRole('textbox', { name: 'Ideas note body' })).not.toHaveAttribute('data-placeholder');
    expect(within(paper).queryByLabelText('Sticky note name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use rose sticky note color' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add sticky note' }));

    expect(onCreateWidget).toHaveBeenCalledWith(
      'rich_note',
      expect.objectContaining({
        richNoteTitle: 'Sticky Note 2',
        richNoteHtml: '',
        richNotePinnedToGrid: false,
      }),
      { afterWidgetId: 'sticky-test' },
    );
    expect(onUpdateWidgetConfig).not.toHaveBeenCalledWith(
      'sticky-test',
      expect.objectContaining({ richNotes: expect.any(Array) }),
    );
  });

  it('keeps the sticky note shell visually quiet with no hover border or glow', () => {
    render(
      <RichNoteWidget
        widget={buildWidget({
          richNoteHtml: '<p>Quiet note</p>',
          richNotePinnedToGrid: false,
        } as DashboardWidget['config'])}
      />,
    );

    const shell = screen.getByTestId('sticky-note-paper').closest('.dashboard-sticky-note-shell');
    expect(shell).toBeTruthy();
    expect(shell?.className).not.toContain('hover:border');
    expect(shell?.className).not.toContain('hover:shadow');
    expect(screen.getByRole('button', { name: 'Add sticky note' }).parentElement).toHaveClass('opacity-0');
  });

  it('keeps the edit tools collapsed and lets the note pin back into the grid', () => {
    const onUpdateWidgetConfig = vi.fn();

    render(
      <RichNoteWidget
        widget={buildWidget({
          richNoteHtml: '<p>Floating note</p>',
          richNotePinnedToGrid: false,
        } as DashboardWidget['config'])}
        onUpdateWidgetConfig={onUpdateWidgetConfig}
      />,
    );

    expect(screen.queryByLabelText('Sticky note name')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Save sticky note as text' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open sticky note tools' }));
    expect(screen.getByLabelText('Sticky note name')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Save sticky note as text' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pin sticky note to grid' }));
    expect(onUpdateWidgetConfig).toHaveBeenCalledWith('sticky-test', {
      richNotePinnedToGrid: true,
    });
  });
});
