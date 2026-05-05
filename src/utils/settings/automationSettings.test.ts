import { describe, expect, it, beforeEach } from 'vitest';

import { DEFAULT_ROUTINES } from '../../services/routineTypes';
import { getRoutines } from './automationSettings';

describe('automation routine defaults', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not include the confusing Good Morning preset by default', () => {
    expect(DEFAULT_ROUTINES.map((routine) => routine.name)).not.toContain('Good Morning');
    expect(getRoutines().map((routine) => routine.name)).not.toContain('Good Morning');
  });

  it('filters the old built-in Good Morning default from stored routines', () => {
    localStorage.setItem(
      'curio_routines',
      JSON.stringify([
        {
          id: 'default_routine_0',
          name: 'Good Morning',
          description: 'Greets you and summarizes your morning context.',
          icon: 'sun',
          trigger: { type: 'voice', phrase: 'good morning' },
          enabled: true,
          createdAt: 1,
          steps: [
            {
              id: 'morning_speak',
              type: 'speak',
              enabled: true,
              config: { text: 'Good morning. Let me get your day ready.' },
            },
          ],
        },
        {
          id: 'custom_good_morning',
          name: 'Good Morning',
          description: 'User-made morning automation.',
          icon: 'sun',
          trigger: { type: 'voice', phrase: 'start my morning' },
          enabled: true,
          createdAt: 2,
          steps: [
            {
              id: 'custom_step',
              type: 'speak',
              enabled: true,
              config: { text: 'Custom routine.' },
            },
          ],
        },
      ]),
    );

    const routines = getRoutines();

    expect(routines.map((routine) => routine.id)).toEqual(['custom_good_morning']);
    const stored = JSON.parse(localStorage.getItem('curio_routines') || '[]') as Array<{ id: string }>;
    expect(stored.map((routine) => routine.id)).toEqual(['custom_good_morning']);
  });
});
