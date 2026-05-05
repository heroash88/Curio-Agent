import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import TasksWidget from './TasksWidget';
import type { DashboardWidget } from '../../../services/dashboardTypes';

const notionMocks = vi.hoisted(() => ({
  listNotionWidgetItems: vi.fn(),
  fetchNotionWidgetItem: vi.fn(),
  listZapierWidgetItems: vi.fn(),
  fetchZapierWidgetItem: vi.fn(),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: (widgetArg: { config?: Record<string, unknown> } = {}) => {
    const w = Number(widgetArg.config?.w || 3);
    const h = Number(widgetArg.config?.h || 3);
    return {
      w,
      h,
      area: w * h,
      sizeClass: w <= 2 || h <= 2 ? 'small' : 'large',
      isWide: w >= 3,
      isTall: h >= 3,
      isCompact: w <= 2 || h <= 2 || w * h <= 6,
      pixelWidth: w <= 2 ? 320 : 480,
      pixelHeight: h <= 2 ? 240 : 360,
    };
  },
}));

vi.mock('../../../hooks/useDashboardRefresh', () => ({
  useDashboardRefresh: () => ({
    refreshNow: vi.fn(),
  }),
}));

vi.mock('../../../services/notionMcpWidgetService', () => ({
  listNotionWidgetItems: notionMocks.listNotionWidgetItems,
  fetchNotionWidgetItem: notionMocks.fetchNotionWidgetItem,
}));

vi.mock('../../../services/zapierMcpWidgetService', () => ({
  listZapierWidgetItems: notionMocks.listZapierWidgetItems,
  fetchZapierWidgetItem: notionMocks.fetchZapierWidgetItem,
}));

const widget: DashboardWidget = {
  id: 'tasks_test',
  type: 'tasks',
  position: 0,
  size: 'large',
  enabled: true,
  config: { w: 3, h: 3 },
};

describe('TasksWidget', () => {
  beforeEach(() => {
    notionMocks.listNotionWidgetItems.mockReset();
    notionMocks.fetchNotionWidgetItem.mockReset();
    notionMocks.listZapierWidgetItems.mockReset();
    notionMocks.fetchZapierWidgetItem.mockReset();
    localStorage.clear();
    // Use the verbose add row in these existing tests. The inline
    // quick-add primitive has its own coverage below.
    localStorage.setItem(
      'curio_dashboard_prefs',
      JSON.stringify({ interactivity: { inlineQuickAddEnabled: false } }),
    );
    localStorage.setItem(
      'curio_tasks',
      JSON.stringify([
        {
          id: 'task_1',
          name: 'hello',
          completed: false,
          priority: 'medium',
        },
      ]),
    );
  });

  it('uses the board accent token and a single clean circular completion control', () => {
    const { container } = render(<TasksWidget widget={widget} />);

    const completeButton = screen.getByRole('button', { name: 'Complete task hello' });
    const addButton = screen.getByRole('button', { name: 'Add task' });

    expect(completeButton).toHaveClass('overflow-hidden');
    expect(completeButton).toHaveClass('text-[var(--ether-primary)]');
    expect(completeButton.className).not.toContain('--ether-teal');
    expect(addButton.className).not.toContain('--ether-teal');
    expect(addButton).toHaveClass('bg-[var(--ether-primary)]');
    expect(container.querySelector('.lucide-circle')).not.toBeInTheDocument();
  });

  it('keeps the task list touch-scrollable when resized', () => {
    render(<TasksWidget widget={widget} />);

    expect(screen.getByTestId('tasks-widget-list')).toHaveClass(
      'dashboard-widget-touch-scroll',
      'min-h-0',
      'flex-1',
    );
  });

  it('keeps all active tasks visible inside the scroll area instead of trimming by widget height', () => {
    localStorage.setItem(
      'curio_tasks',
      JSON.stringify(
        Array.from({ length: 6 }, (_, index) => ({
          id: `task_${index + 1}`,
          name: `Task ${index + 1}`,
          completed: false,
          priority: 'medium',
        })),
      ),
    );

    render(<TasksWidget widget={widget} />);

    expect(within(screen.getByTestId('tasks-widget-list')).getByText('Task 6')).toBeInTheDocument();
  });

  it('can show completed tasks and re-add them to the active list', () => {
    localStorage.setItem(
      'curio_tasks',
      JSON.stringify([
        {
          id: 'task_done',
          name: 'Done task',
          completed: true,
          priority: 'medium',
        },
      ]),
    );

    render(<TasksWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show completed tasks' }));
    expect(screen.getByText('Done task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen task Done task' }));
    expect(JSON.parse(localStorage.getItem('curio_tasks') || '[]')).toEqual([
      expect.objectContaining({ id: 'task_done', completed: false }),
    ]);
  });

  it('edits an internal task title without leaving the widget', () => {
    render(<TasksWidget widget={widget} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit task hello' }));
    const editor = screen.getByLabelText('Task title');
    fireEvent.change(editor, { target: { value: 'hello again' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(JSON.parse(localStorage.getItem('curio_tasks') || '[]')).toEqual([
      expect.objectContaining({ id: 'task_1', name: 'hello again' }),
    ]);
  });

  it('keeps internal tasks and chores in separate local stores', () => {
    localStorage.setItem(
      'curio_tasks',
      JSON.stringify([
        {
          id: 'task_only',
          name: 'Task only',
          completed: false,
          priority: 'low',
        },
      ]),
    );
    localStorage.setItem(
      'curio_chores',
      JSON.stringify([
        {
          id: 'chore_only',
          name: 'Chore only',
          completed: false,
          priority: 'high',
        },
      ]),
    );

    const choresWidget: DashboardWidget = {
      ...widget,
      id: 'chores_test',
      type: 'chores',
    };

    const { unmount } = render(<TasksWidget widget={widget} />);
    expect(screen.getByText('Task only')).toBeInTheDocument();
    expect(screen.queryByText('Chore only')).not.toBeInTheDocument();
    unmount();

    render(<TasksWidget widget={choresWidget} />);
    expect(screen.getByText('Chore only')).toBeInTheDocument();
    expect(screen.queryByText('Task only')).not.toBeInTheDocument();
  });

  it('adds tasks and chores to their own stores with selected priorities', () => {
    const choresWidget: DashboardWidget = {
      ...widget,
      id: 'chores_test',
      type: 'chores',
    };

    const { unmount } = render(<TasksWidget widget={widget} />);
    fireEvent.change(screen.getByLabelText('Task priority'), {
      target: { value: 'high' },
    });
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), {
      target: { value: 'Task priority item' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(JSON.parse(localStorage.getItem('curio_tasks') || '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Task priority item', priority: 'high' }),
      ]),
    );
    expect(JSON.parse(localStorage.getItem('curio_chores') || '[]')).toEqual([]);
    unmount();
    cleanup();

    render(<TasksWidget widget={choresWidget} />);
    fireEvent.change(screen.getByLabelText('Chore priority'), {
      target: { value: 'low' },
    });
    fireEvent.change(screen.getByPlaceholderText('Add a chore...'), {
      target: { value: 'Chore priority item' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add chore' }));

    expect(JSON.parse(localStorage.getItem('curio_chores') || '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Chore priority item', priority: 'low' }),
      ]),
    );
    expect(JSON.parse(localStorage.getItem('curio_tasks') || '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Task priority item', priority: 'high' }),
      ]),
    );
  });

  it('uses stacked 2x3 create controls without clipping the add button', () => {
    const compactWidget: DashboardWidget = {
      ...widget,
      id: 'tasks_2x3',
      config: { ...widget.config, w: 2, h: 3 },
    };

    render(<TasksWidget widget={compactWidget} />);

    const draftInput = screen.getByPlaceholderText('What needs doing?');
    const prioritySelect = screen.getByLabelText('Task priority');
    const addButton = screen.getByRole('button', { name: 'Add task' });

    expect(draftInput.parentElement).toHaveClass(
      'grid',
      'grid-cols-[minmax(0,1fr)_auto]',
    );
    expect(draftInput).toHaveClass('min-w-0');
    expect(draftInput).toHaveClass('px-3', 'text-[12px]');
    expect(prioritySelect).toHaveClass('col-span-2', 'w-full');
    expect(prioritySelect).toBeVisible();
    expect(addButton).toBeVisible();
  });

  it('allows changing the priority for an existing internal task', () => {
    render(<TasksWidget widget={widget} />);

    fireEvent.change(screen.getByLabelText('Priority for hello'), {
      target: { value: 'low' },
    });

    expect(JSON.parse(localStorage.getItem('curio_tasks') || '[]')).toEqual([
      expect.objectContaining({ id: 'task_1', priority: 'low' }),
    ]);
  });

  it('uses a distinct icon for chores', () => {
    const choresWidget: DashboardWidget = {
      ...widget,
      id: 'chores_test',
      type: 'chores',
    };

    const { container } = render(<TasksWidget widget={choresWidget} />);

    expect(container.querySelector('.lucide-spray-can')).toBeInTheDocument();
  });

  it('renders clear chore date controls and a dropdown time selector', () => {
    const choresWidget: DashboardWidget = {
      ...widget,
      id: 'chores_test',
      type: 'chores',
    };

    render(<TasksWidget widget={choresWidget} />);

    const category = screen.getByRole('combobox', { name: 'Chore category' });
    const date = screen.getByLabelText('Chore date');
    const time = screen.getByRole('combobox', { name: 'Chore time' });

    [category, date, time].forEach((control) => {
      expect(control).toHaveClass('bg-[var(--ether-control-bg)]');
      expect(control).toHaveClass('text-[var(--ether-on-surface)]');
      expect(control).toHaveClass('opacity-100');
    });
    expect(date).toHaveAttribute('type', 'date');
    expect(time).toHaveTextContent('No time');
    expect(time).toHaveTextContent('12:30 AM');
    expect(time).toHaveTextContent('11:45 PM');
  });

  it('opens pulled Notion project content inside the Curio widget', async () => {
    notionMocks.listNotionWidgetItems.mockResolvedValueOnce([
      {
        id: 'project-1',
        title: 'Test Curio Project',
        preview: 'Roadmap',
        status: 'In progress',
        url: 'https://www.notion.so/project-1',
      },
    ]);
    notionMocks.fetchNotionWidgetItem.mockResolvedValueOnce({
      id: 'project-1',
      title: 'Test Curio Project',
      preview: 'Roadmap',
      status: 'In progress',
      url: 'https://www.notion.so/project-1',
      content: '## Test Curio Project\nRoadmap details from Notion.',
    });

    render(<TasksWidget widget={{
      ...widget,
      id: 'notion-projects',
      type: 'notion_projects',
      config: {
        w: 3,
        h: 3,
        taskProvider: 'notion',
        notionQuery: 'Test Curio Project',
      },
    }} />);

    expect(await screen.findByText('Test Curio Project')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion item Test Curio Project' }));

    expect(await screen.findByText('Roadmap details from Notion.')).toBeInTheDocument();
    expect(notionMocks.fetchNotionWidgetItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'project-1',
      title: 'Test Curio Project',
    }));
    expect(screen.getByRole('link', { name: 'Open in Notion' })).toHaveAttribute(
      'href',
      'https://www.notion.so/project-1',
    );
  });

  it('opens pulled Zapier task content inside the Curio widget', async () => {
    notionMocks.listZapierWidgetItems.mockResolvedValueOnce([
      {
        id: 'zap-task-1',
        title: 'Send launch email',
        preview: 'Draft copy',
        status: 'open',
      },
    ]);
    notionMocks.fetchZapierWidgetItem.mockResolvedValueOnce({
      id: 'zap-task-1',
      title: 'Send launch email',
      preview: 'Draft copy',
      status: 'open',
      content: '## Send launch email\nTask details from Zapier.',
    });

    render(<TasksWidget widget={{
      ...widget,
      id: 'zapier-tasks',
      config: {
        w: 3,
        h: 3,
        taskProvider: 'zapier',
        zapierQuery: 'open tasks',
      },
    }} />);

    expect(await screen.findByText('Send launch email')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Zapier item Send launch email' }));

    expect(await screen.findByText('Task details from Zapier.')).toBeInTheDocument();
    expect(notionMocks.fetchZapierWidgetItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'zap-task-1',
      title: 'Send launch email',
    }));
  });
});
