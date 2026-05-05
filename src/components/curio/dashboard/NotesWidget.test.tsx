import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import NotesWidget from './NotesWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 2,
    h: 2,
    area: 4,
    sizeClass: 'medium',
    isWide: false,
    isTall: false,
    isCompact: false,
    pixelWidth: 320,
    pixelHeight: 330,
  }),
}));

vi.mock('../../../utils/settingsStorage', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/settingsStorage')>(
    '../../../utils/settingsStorage',
  );
  return {
    ...actual,
    useObsidianEnabled: () => false,
  };
});

const widget: DashboardWidget = {
  id: 'notes-test',
  type: 'notes',
  position: 0,
  size: 'medium',
  enabled: true,
  config: { w: 2, h: 2 },
};

const notionMocks = vi.hoisted(() => ({
  listNotionWidgetItems: vi.fn(),
  fetchNotionWidgetItem: vi.fn(),
  listZapierWidgetItems: vi.fn(),
  fetchZapierWidgetItem: vi.fn(),
}));

vi.mock('../../../services/notionMcpWidgetService', () => ({
  listNotionWidgetItems: notionMocks.listNotionWidgetItems,
  fetchNotionWidgetItem: notionMocks.fetchNotionWidgetItem,
}));

vi.mock('../../../services/zapierMcpWidgetService', () => ({
  listZapierWidgetItems: notionMocks.listZapierWidgetItems,
  fetchZapierWidgetItem: notionMocks.fetchZapierWidgetItem,
}));

describe('NotesWidget', () => {
  beforeEach(() => {
    notionMocks.listNotionWidgetItems.mockReset();
    notionMocks.fetchNotionWidgetItem.mockReset();
    notionMocks.listZapierWidgetItems.mockReset();
    notionMocks.fetchZapierWidgetItem.mockReset();
    localStorage.clear();
    localStorage.setItem(
      'curio_notes',
      JSON.stringify([
        {
          id: 'note_1',
          text: '## Plan\n- Ship notes\n- Sync all',
          category: 'general',
          createdAt: 10,
        },
        {
          id: 'note_2',
          text: 'Fourth visible note',
          category: 'general',
          createdAt: 7,
        },
        {
          id: 'note_3',
          text: 'Third visible note',
          category: 'general',
          createdAt: 8,
        },
        {
          id: 'note_4',
          text: 'Second visible note',
          category: 'general',
          createdAt: 9,
        },
      ]),
    );
  });

  it('keeps every synced note in the scroll area and opens a rich readable detail view', () => {
    render(<NotesWidget widget={widget} />);

    expect(screen.getByText('Fourth visible note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open note ## Plan' }));

    expect(screen.getAllByRole('heading', { name: 'Plan' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ship notes').tagName.toLowerCase()).toBe('li');
  });

  it('edits note details directly in the widget card', () => {
    render(<NotesWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open note ## Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByLabelText('Note details'), {
      target: { value: '## Updated\n- Done' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note details' }));

    expect(JSON.parse(localStorage.getItem('curio_notes') || '[]')).toEqual([
      expect.objectContaining({ id: 'note_1', text: '## Updated\n- Done' }),
      expect.objectContaining({ id: 'note_2' }),
      expect.objectContaining({ id: 'note_3' }),
      expect.objectContaining({ id: 'note_4' }),
    ]);
    expect(screen.getAllByRole('heading', { name: 'Updated' }).length).toBeGreaterThanOrEqual(1);
  });

  it('opens pulled Notion note content inside the Curio widget', async () => {
    notionMocks.listNotionWidgetItems.mockResolvedValueOnce([
      {
        id: 'page-1',
        title: 'Test Curio',
        preview: 'Project notes',
        url: 'https://www.notion.so/page-1',
      },
    ]);
    notionMocks.fetchNotionWidgetItem.mockResolvedValueOnce({
      id: 'page-1',
      title: 'Test Curio',
      preview: 'Project notes',
      url: 'https://www.notion.so/page-1',
      content: '## Test Curio\nPulled note body from Notion.',
    });

    render(<NotesWidget widget={{
      ...widget,
      type: 'notion_notes',
      config: {
        w: 2,
        h: 2,
        notesProvider: 'notion',
        notionQuery: 'Test Curio',
      },
    }} />);

    expect(await screen.findByText('Test Curio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion note Test Curio' }));

    expect(await screen.findByText('Pulled note body from Notion.')).toBeInTheDocument();
    expect(notionMocks.fetchNotionWidgetItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'page-1',
      title: 'Test Curio',
    }));
    expect(screen.getByRole('link', { name: 'Open in Notion' })).toHaveAttribute(
      'href',
      'https://www.notion.so/page-1',
    );
  });

  it('opens pulled Zapier note content inside the Curio widget', async () => {
    notionMocks.listZapierWidgetItems.mockResolvedValueOnce([
      {
        id: 'zap-note-1',
        title: 'Zapier Meeting Notes',
        preview: 'Agenda preview',
        url: 'https://docs.example.com/zap-note-1',
      },
    ]);
    notionMocks.fetchZapierWidgetItem.mockResolvedValueOnce({
      id: 'zap-note-1',
      title: 'Zapier Meeting Notes',
      preview: 'Agenda preview',
      url: 'https://docs.example.com/zap-note-1',
      content: '## Zapier Meeting Notes\nPulled note body from Zapier.',
    });

    render(<NotesWidget widget={{
      ...widget,
      id: 'zapier-notes',
      config: {
        w: 2,
        h: 2,
        notesProvider: 'zapier',
        zapierQuery: 'meeting notes',
      },
    }} />);

    expect(await screen.findByText('Zapier Meeting Notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Zapier note Zapier Meeting Notes' }));

    expect(await screen.findByText('Pulled note body from Zapier.')).toBeInTheDocument();
    expect(notionMocks.fetchZapierWidgetItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'zap-note-1',
      title: 'Zapier Meeting Notes',
    }));
  });
});
