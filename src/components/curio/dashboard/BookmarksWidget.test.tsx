import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import BookmarksWidget from './BookmarksWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    muted: 'text-muted',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
    surfaceContainer: 'surface-container',
    surfaceContainerLow: 'surface-container-low',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 2,
    h: 3,
    area: 6,
    pixelWidth: 320,
    pixelHeight: 360,
    sizeClass: 'medium',
    isCompact: false,
    isTall: true,
    isWide: false,
  }),
}));

const STORAGE_KEY = 'etheros_bookmarks';

const widget: DashboardWidget = {
  id: 'bookmarks-test',
  type: 'bookmarks',
  position: 0,
  size: 'medium',
  enabled: true,
  config: {},
};

const bookmarks = [
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com', createdAt: 1 },
  { id: 'docs', name: 'Docs', url: 'https://docs.example.com', createdAt: 2 },
  { id: 'mail', name: 'Mail', url: 'https://mail.example.com', createdAt: 3 },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.example.com', createdAt: 4 },
  { id: 'music', name: 'Music', url: 'https://music.example.com', createdAt: 5 },
];

describe('BookmarksWidget', () => {
  beforeEach(() => {
    // Exercise the legacy Plus-toggle + name/URL form path. InlineQuickAdd
    // has its own coverage in the primitive tests.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders bookmarks as compact rows and keeps delete available without hover', async () => {
    render(<BookmarksWidget widget={widget} />);

    const list = screen.getByTestId('bookmark-list');
    expect(list).toHaveClass('gap-1.5');
    expect(list).not.toHaveClass('grid-cols-2');

    const rows = screen.getAllByTestId('bookmark-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveClass('min-h-10');
    expect(rows[0]).not.toHaveClass('p-2.5');

    const deleteButton = screen.getByRole('button', { name: 'Delete OpenAI' });
    expect(deleteButton).not.toHaveClass('opacity-0');

    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'openai' })]),
    );
  });

  it('opens a compact add form and saves normalized bookmark URLs', async () => {
    render(<BookmarksWidget widget={widget} />);

    const addButton = screen.getByRole('button', { name: 'Add bookmark' });
    expect(addButton).toHaveClass('dashboard-widget-control-button');

    fireEvent.click(addButton);
    fireEvent.change(screen.getByLabelText('Bookmark name'), {
      target: { value: 'Example' },
    });
    fireEvent.change(screen.getByLabelText('Bookmark URL'), {
      target: { value: 'example.com' },
    });
    const saveButton = screen.getByRole('button', { name: 'Save bookmark' });
    expect(saveButton).toHaveClass('dashboard-widget-control-button');

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored[0]).toMatchObject({
      name: 'Example',
      url: 'https://example.com',
    });
    expect(screen.queryByLabelText('Bookmark name')).not.toBeInTheDocument();
  });
});
