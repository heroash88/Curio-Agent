import { describe, expect, it, vi } from 'vitest';
import { executeRoutine } from './routineEngine';
import type { Routine } from './routineTypes';

describe('routineEngine', () => {
  it('marks a routine failed when a tool step returns an unsuccessful result', async () => {
    const routine: Routine = {
      id: 'routine_tool_failure',
      name: 'Tool Failure',
      icon: '*',
      enabled: true,
      createdAt: 1,
      trigger: { type: 'voice', phrase: 'tool failure' },
      steps: [
        {
          id: 'tool_step',
          type: 'tool_call',
          enabled: true,
          config: { toolName: 'show_directions', args: { destination: '' } },
        },
      ],
    };

    const result = await executeRoutine(routine, {
      callTool: vi.fn(async () => ({ success: false, error: 'Destination is required' })),
    });

    expect(result.completed).toBe(false);
    expect(result.error).toContain('Destination is required');
    expect(result.stepsRun).toBe(1);
  });
});
