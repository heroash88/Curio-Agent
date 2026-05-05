import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { DashboardWidgetFrameContext } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { HabitItem } from '../../../services/habitsPersistence';
import HabitsWidget from './HabitsWidget';

const HABITS_STORAGE_KEY = 'etheros_habits';

const widget: DashboardWidget = {
  id: 'habits_test',
  type: 'habits',
  position: 0,
  size: 'large',
  enabled: true,
  config: { w: 2, h: 3 },
};

const makeHabit = (id: string, name: string): HabitItem => ({
  id,
  name,
  streak: 0,
  completedToday: false,
});

const makeCompletedHabit = (
  id: string,
  name: string,
  lastCompleted: number,
  streak = 3,
): HabitItem => ({
  id,
  name,
  streak,
  completedToday: true,
  lastCompleted,
});

const renderHabitsWidget = () =>
  render(
    <DashboardWidgetFrameContext.Provider
      value={{
        pixelWidth: 360,
        pixelHeight: 360,
        gridWidth: 2,
        gridHeight: 3,
      }}
    >
      <HabitsWidget widget={widget} />
    </DashboardWidgetFrameContext.Provider>,
  );

describe('HabitsWidget', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('curio_theme_mode', 'dark');
  });

  it('renders all habits inside the touch-scrollable list instead of trimming overflow items', () => {
    localStorage.setItem(
      HABITS_STORAGE_KEY,
      JSON.stringify([
        makeHabit('habit_1', 'Hydrate'),
        makeHabit('habit_2', 'Stretch'),
        makeHabit('habit_3', 'Read'),
        makeHabit('habit_4', 'Walk'),
        makeHabit('habit_5', 'Journal'),
        makeHabit('habit_6', 'Meditate'),
      ]),
    );

    renderHabitsWidget();

    const list = screen.getByTestId('habits-widget-list');
    expect(list).toHaveClass('dashboard-widget-touch-scroll', 'min-h-0', 'flex-1');
    expect(within(list).getByText('Meditate')).toBeInTheDocument();
  });

  it('deletes a habit from the widget controls', async () => {
    localStorage.setItem(
      HABITS_STORAGE_KEY,
      JSON.stringify([
        makeHabit('habit_1', 'Hydrate'),
        makeHabit('habit_2', 'Stretch'),
      ]),
    );

    renderHabitsWidget();

    const deleteButton = screen.getByRole('button', {
      name: 'Delete habit Hydrate',
    });

    expect(deleteButton.className).not.toContain('opacity-0');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('Hydrate')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Stretch')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(HABITS_STORAGE_KEY) || '[]')).toEqual([
      expect.objectContaining({ id: 'habit_2', name: 'Stretch' }),
    ]);
  });

  it('persists the daily reset and shows total streaks', () => {
    const yesterday = new Date('2026-04-24T09:00:00').getTime();
    localStorage.setItem(
      HABITS_STORAGE_KEY,
      JSON.stringify([
        makeCompletedHabit('habit_1', 'Hydrate', yesterday, 4),
        makeCompletedHabit('habit_2', 'Stretch', yesterday, 2),
      ]),
    );

    renderHabitsWidget();

    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByText('6 total streaks')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(HABITS_STORAGE_KEY) || '[]')).toEqual([
      expect.objectContaining({ id: 'habit_1', completedToday: false, streak: 4 }),
      expect.objectContaining({ id: 'habit_2', completedToday: false, streak: 2 }),
    ]);
  });
});
