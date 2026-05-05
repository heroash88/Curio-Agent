import type { CardEvent } from './cardTypes';
import { requestAmbientSpeech } from './ambientOutput';
import type {
  HaServiceStepConfig,
  Routine,
  RoutineStep,
  ShowCardStepConfig,
  SpeakStepConfig,
  ToolCallStepConfig,
  WaitStepConfig,
} from './routineTypes';
import { getToolHandler, type ToolCallContext } from './toolCallRouter';
import {
  getHaMcpEnabled,
  getHaMcpTokenAsync,
  getHaMcpUrl,
  getTempUnit,
  getWeatherCity,
} from '../utils/settingsStorage';
import { upsertNotificationCenterEntry } from './notificationCenterStore';

export interface RoutineExecutionResult {
  completed: boolean;
  error?: string;
  stepsRun: number;
  totalSteps: number;
}

export interface RoutineContext {
  emitCardEvent?: (event: CardEvent) => void;
  speak?: (text: string) => void | Promise<void>;
  callTool?: (toolName: string, args?: Record<string, unknown>) => Promise<unknown>;
  abortSignal?: AbortSignal;
  onStepComplete?: (stepsRun: number, totalSteps: number) => void;
}

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, durationMs));

const throwIfAborted = (abortSignal?: AbortSignal) => {
  if (abortSignal?.aborted) {
    throw new DOMException('Routine cancelled', 'AbortError');
  }
};

const buildToolContext = (context: RoutineContext): ToolCallContext => ({
  onCardEvent: context.emitCardEvent,
  disconnect: () => {},
  startHaCameraStream: async () => {},
  stopHaCameraStream: () => {},
  isHaCameraStreaming: false,
  // Provide a real get_weather handler so weather cards are populated
  handler: {
    get_weather: async (city?: string) => {
      try {
        const { getUnifiedWeather } = await import('./weatherService');
        const requestedCity = city?.trim() || getWeatherCity();
        const { weather, aqi } = await getUnifiedWeather(requestedCity, false, true);
        return {
          city: weather?.city || requestedCity,
          tempUnit: getTempUnit(),
          weather,
          aqi,
          timestamp: new Date().toISOString(),
        };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  },
});

const throwIfToolFailed = (toolName: string, result: unknown): void => {
  if (!result || typeof result !== 'object') return;
  const payload = 'result' in result && typeof (result as { result?: unknown }).result === 'object'
    ? (result as { result?: Record<string, unknown> }).result
    : result as Record<string, unknown>;

  if (payload?.success === false) {
    throw new Error(String(payload.error || `${toolName} failed`));
  }
};

async function executeToolStep(
  config: ToolCallStepConfig,
  context: RoutineContext,
): Promise<void> {
  if (context.callTool) {
    const result = await context.callTool(config.toolName, config.args || {});
    throwIfToolFailed(config.toolName, result);
    return;
  }

  const handler = getToolHandler(config.toolName);
  if (!handler) {
    console.warn(`[RoutineEngine] No handler registered for "${config.toolName}".`);
    return;
  }

  const result = await handler(config.args || {}, buildToolContext(context));
  throwIfToolFailed(config.toolName, result);
}

async function executeHomeAssistantService(
  config: HaServiceStepConfig,
): Promise<void> {
  if (!getHaMcpEnabled()) {
    console.debug('[RoutineEngine] Skipping HA service because integration is disabled.');
    return;
  }

  const url = getHaMcpUrl()?.replace(/\/+$/, '');
  const token = await getHaMcpTokenAsync();
  if (!url || !token) {
    console.warn('[RoutineEngine] Missing Home Assistant URL or token for routine step.');
    return;
  }

  const [domain, service] = config.service.split('.');
  if (!domain || !service) {
    console.warn(`[RoutineEngine] Invalid Home Assistant service "${config.service}".`);
    return;
  }

  // Merge entityId from config into the service data payload
  const entityId = (config as unknown as Record<string, unknown>).entityId as string | undefined;
  const body: Record<string, unknown> = { ...(config.data || {}) };
  if (entityId) body.entity_id = entityId;

  const response = await fetch(`${url}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Home Assistant service failed (${response.status}): ${errorBody}`);
  }
}

async function executeStep(
  step: RoutineStep,
  context: RoutineContext,
): Promise<void> {
  throwIfAborted(context.abortSignal);

  switch (step.type) {
    case 'speak': {
      const config = step.config as SpeakStepConfig;
      const text = config.text?.trim();
      if (!text) {
        return;
      }

      if (context.speak) {
        await context.speak(text);
      } else {
        requestAmbientSpeech({ text, reason: 'routine' });
      }
      return;
    }

    case 'wait': {
      const config = step.config as WaitStepConfig;
      const durationMs = Math.max(0, Number(config.durationMs || 0));
      if (durationMs > 0) {
        await wait(durationMs);
      }
      return;
    }

    case 'tool_call': {
      await executeToolStep(step.config as ToolCallStepConfig, context);
      return;
    }

    case 'ha_service': {
      await executeHomeAssistantService(step.config as HaServiceStepConfig);
      return;
    }

    case 'show_card': {
      const config = step.config as ShowCardStepConfig;
      context.emitCardEvent?.({
        type: config.type as CardEvent['type'],
        data: config.data,
      });
      return;
    }

    default:
      console.warn(`[RoutineEngine] Unsupported step type "${(step as RoutineStep).type}".`);
  }
}

export async function executeRoutine(
  routine: Routine,
  context: RoutineContext = {},
): Promise<RoutineExecutionResult> {
  if (!routine.enabled) {
    return {
      completed: false,
      error: 'Routine is disabled',
      stepsRun: 0,
      totalSteps: 0,
    };
  }

  const enabledSteps = routine.steps.filter((step) => step.enabled);
  let stepsRun = 0;
  let firstError: string | undefined;
  const notificationId = `routine:${routine.id}:${Date.now()}`;

  upsertNotificationCenterEntry({
    id: notificationId,
    source: 'routine',
    title: `${routine.icon} ${routine.name}`,
    message: 'Routine running.',
    priority: 'normal',
    state: 'running',
    unread: true,
  });

  console.log(`[RoutineEngine] Starting routine "${routine.name}" (${routine.id}).`);

  for (const step of enabledSteps) {
    throwIfAborted(context.abortSignal);

    try {
      await executeStep(step, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      firstError ||= message;
      console.error(`[RoutineEngine] Step "${step.id}" failed in "${routine.name}":`, error);
    } finally {
      stepsRun += 1;
      context.onStepComplete?.(stepsRun, enabledSteps.length);
    }
  }

  console.log(`[RoutineEngine] Finished routine "${routine.name}".`);

  upsertNotificationCenterEntry({
    id: notificationId,
    source: 'routine',
    title: `${routine.icon} ${routine.name}`,
    message: firstError
      ? `Finished with issues after ${stepsRun} step${stepsRun === 1 ? '' : 's'}: ${firstError}`
      : `Completed ${stepsRun} step${stepsRun === 1 ? '' : 's'}.`,
    priority: firstError ? 'high' : 'normal',
    state: firstError ? 'failed' : 'completed',
    unread: true,
  });

  return {
    completed: !firstError,
    error: firstError,
    stepsRun,
    totalSteps: enabledSteps.length,
  };
}
