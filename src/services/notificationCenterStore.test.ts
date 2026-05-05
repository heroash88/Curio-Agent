import { beforeEach, describe, expect, it } from 'vitest';

import { getNotificationCenterEntries } from './notificationCenterStore';

describe('notificationCenterStore migrations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes old Good Morning routine notification history', () => {
    localStorage.setItem(
      'curio_notification_center_v1',
      JSON.stringify([
        {
          id: 'routine:default_routine_0:1',
          source: 'routine',
          title: 'Good Morning',
          message: 'Completed 4 steps.',
          priority: 'normal',
          state: 'completed',
          createdAt: 1,
          unread: true,
        },
        {
          id: 'weather_1',
          source: 'weather',
          title: 'Rain soon',
          message: 'Light rain is expected.',
          priority: 'normal',
          state: 'delivered',
          createdAt: 2,
          unread: true,
        },
      ]),
    );

    const entries = getNotificationCenterEntries();

    expect(entries.map((entry) => entry.id)).toEqual(['weather_1']);
    const stored = JSON.parse(localStorage.getItem('curio_notification_center_v1') || '[]') as Array<{ id: string }>;
    expect(stored.map((entry) => entry.id)).toEqual(['weather_1']);
  });
});
