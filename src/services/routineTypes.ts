export type RoutineTriggerType = 'voice' | 'schedule' | 'event' | 'ha_state' | 'music';
export type RoutineEventKind = 'session_start' | 'session_end';
export type RoutineMusicEvent = 'play_start' | 'play_stop';
export type RoutineStepType = 'speak' | 'tool_call' | 'show_card' | 'ha_service' | 'wait';

export interface RoutineTrigger {
  type: RoutineTriggerType;
  phrase?: string;
  cron?: string;
  days?: number[];
  event?: RoutineEventKind;
  /** HA state trigger: entity_id to watch */
  haEntityId?: string;
  /** HA state trigger: state value to match (e.g. 'on', 'open', 'detected') */
  haState?: string;
  /** Music trigger event */
  musicEvent?: RoutineMusicEvent;
}

export interface SpeakStepConfig {
  text: string;
}

export interface ToolCallStepConfig {
  toolName: string;
  args?: Record<string, unknown>;
}

export interface ShowCardStepConfig {
  type: string;
  data: Record<string, unknown>;
}

export interface HaServiceStepConfig {
  service: string;
  data?: Record<string, unknown>;
}

export interface WaitStepConfig {
  durationMs: number;
}

export type RoutineStepConfig =
  | SpeakStepConfig
  | ToolCallStepConfig
  | ShowCardStepConfig
  | HaServiceStepConfig
  | WaitStepConfig;

export interface RoutineStep {
  id: string;
  type: RoutineStepType;
  config: RoutineStepConfig;
  enabled: boolean;
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  icon: string;
  trigger: RoutineTrigger;
  steps: RoutineStep[];
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
}

export const MAX_ROUTINES = 20;
export const MAX_STEPS_PER_ROUTINE = 15;

export const createRoutineStep = (type: RoutineStepType): RoutineStep => {
  switch (type) {
    case 'speak':
      return {
        id: `step_${Date.now()}`,
        type,
        enabled: true,
        config: { text: 'Say something helpful.' } as SpeakStepConfig,
      };
    case 'tool_call':
      return {
        id: `step_${Date.now()}`,
        type,
        enabled: true,
        config: { toolName: 'get_weather', args: {} } as ToolCallStepConfig,
      };
    case 'show_card':
      return {
        id: `step_${Date.now()}`,
        type,
        enabled: true,
        config: {
          type: 'list',
          data: { title: 'Routine', items: ['Card content goes here.'] },
        } as ShowCardStepConfig,
      };
    case 'ha_service':
      return {
        id: `step_${Date.now()}`,
        type,
        enabled: true,
        config: { service: 'light.turn_on', data: {} } as HaServiceStepConfig,
      };
    case 'wait':
    default:
      return {
        id: `step_${Date.now()}`,
        type: 'wait',
        enabled: true,
        config: { durationMs: 1000 } as WaitStepConfig,
      };
  }
};

export const createBlankRoutine = (): Routine => ({
  id: `routine_${Date.now()}`,
  name: 'New routine',
  description: '',
  icon: '⚙️',
  trigger: { type: 'voice', phrase: '' },
  steps: [createRoutineStep('speak')],
  enabled: false,
  createdAt: Date.now(),
});

export const PRESET_ROUTINES: Array<Omit<Routine, 'id' | 'createdAt' | 'lastRunAt'>> = [
  {
    name: 'Good Night',
    description: 'Wraps up the day and quiets the house.',
    icon: '🌙',
    trigger: { type: 'voice', phrase: 'good night' },
    enabled: true,
    steps: [
      { id: 'night_speak', type: 'speak', enabled: true, config: { text: 'Good night. I am closing things down.' } as SpeakStepConfig },
      { id: 'night_lights', type: 'ha_service', enabled: true, config: { service: 'light.turn_off', data: {} } as HaServiceStepConfig },
    ],
  },
  {
    name: 'Start Focus Mode',
    description: 'Starts a focused work block.',
    icon: '🎯',
    trigger: { type: 'schedule', cron: '09:00', days: [1, 2, 3, 4, 5] },
    enabled: false,
    steps: [
      { id: 'focus_speak', type: 'speak', enabled: true, config: { text: 'Focus mode is starting. Let us keep distractions low.' } as SpeakStepConfig },
      { id: 'focus_card', type: 'show_card', enabled: true, config: { type: 'list', data: { title: 'Focus Mode', items: ['Silence notifications', 'Review priorities', 'Start your timer'] } } as ShowCardStepConfig },
    ],
  },
];

export const DEFAULT_ROUTINES: Routine[] = PRESET_ROUTINES.map((routine, index) => ({
  ...routine,
  id: `default_routine_${index}`,
  createdAt: Date.now() - (PRESET_ROUTINES.length - index) * 1000,
}));
