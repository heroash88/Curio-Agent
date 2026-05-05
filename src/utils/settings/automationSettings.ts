import { DEFAULT_PROACTIVE_CONFIG, MAX_CUSTOM_PROACTIVE_RULES, type ProactiveConfig, type ProactiveRule } from '../../services/proactiveTypes';
import { DEFAULT_ROUTINES, MAX_ROUTINES, MAX_STEPS_PER_ROUTINE, type Routine } from '../../services/routineTypes';
import { useSettingsStorageValue } from './core';


// Proactive Notifications

const getFallbackProactiveConfig = (): ProactiveConfig => {
  const enabled = localStorage.getItem('curio_proactive_enabled') === 'true';
  const leadRaw = localStorage.getItem('curio_calendar_lead_minutes');
  const leadMinutes = leadRaw ? Number.parseInt(leadRaw, 10) : 10;

  let conditions = ['rain', 'snow', 'severe'];
  try {
    const rawConditions = localStorage.getItem('curio_weather_alert_conditions');
    if (rawConditions) {
      const parsed = JSON.parse(rawConditions);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        conditions = parsed;
      }
    }
  } catch {
    conditions = ['rain', 'snow', 'severe'];
  }

  return {
    enabled,
    rules: DEFAULT_PROACTIVE_CONFIG.rules.map((rule) => {
      if (rule.kind === 'calendar') {
        return {
          ...rule,
          leadMinutes: Number.isFinite(leadMinutes) ? Math.max(1, leadMinutes) : rule.leadMinutes,
        };
      }
      if (rule.kind === 'weather') {
        return {
          ...rule,
          conditions,
        };
      }
      return { ...rule };
    }),
  };
};

const normalizeProactiveRule = (rule: ProactiveRule, index: number): ProactiveRule => {
  if (rule.kind === 'calendar') {
    return {
      ...rule,
      id: rule.id || `calendar_rule_${index}`,
      label: rule.label || 'Calendar reminders',
      enabled: rule.enabled ?? true,
      speak: rule.speak ?? true,
      sound: rule.sound ?? true,
      showCard: rule.showCard ?? true,
      priority: rule.priority || 'normal',
      leadMinutes: Math.max(1, Number(rule.leadMinutes || 10)),
    };
  }

  if (rule.kind === 'reminder') {
    return {
      ...rule,
      id: rule.id || `reminder_rule_${index}`,
      label: rule.label || 'Reminder alerts',
      enabled: rule.enabled ?? true,
      speak: rule.speak ?? true,
      sound: rule.sound ?? true,
      showCard: rule.showCard ?? true,
      priority: rule.priority || 'normal',
      dueWindowMinutes: Math.max(1, Number(rule.dueWindowMinutes || 1)),
    };
  }

  if (rule.kind === 'weather') {
    return {
      ...rule,
      id: rule.id || `weather_rule_${index}`,
      label: rule.label || 'Weather changes',
      enabled: rule.enabled ?? true,
      speak: rule.speak ?? true,
      sound: rule.sound ?? false,
      showCard: rule.showCard ?? true,
      priority: rule.priority || 'low',
      conditions: Array.isArray(rule.conditions) ? rule.conditions.filter(Boolean) : ['rain', 'snow', 'severe'],
    };
  }

  if (rule.kind === 'email') {
    return {
      ...rule,
      id: rule.id || `email_rule_${index}`,
      label: rule.label || 'Email alerts',
      enabled: rule.enabled ?? false,
      speak: rule.speak ?? true,
      sound: rule.sound ?? true,
      showCard: rule.showCard ?? true,
      priority: rule.priority || 'normal',
      intervalMinutes: Math.max(1, Number(rule.intervalMinutes || 5)),
      provider: rule.provider || 'gmail',
      conditions: Array.isArray(rule.conditions)
        ? rule.conditions.filter(Boolean)
        : ['new_unread'],
      senderFilter: String(rule.senderFilter || ''),
      keywordFilter: String(rule.keywordFilter || ''),
      deliveryMode: rule.deliveryMode === 'near_push' ? 'near_push' : 'timed',
    };
  }

  if (rule.kind === 'app') {
    const fallback = DEFAULT_PROACTIVE_CONFIG.rules.find(
      (item) => item.kind === 'app' && item.appSource === rule.appSource,
    ) as ProactiveRule | undefined;
    const fallbackApp = fallback?.kind === 'app' ? fallback : undefined;
    const appSource = rule.appSource || fallbackApp?.appSource || 'slack';

    return {
      ...rule,
      id: rule.id || `${appSource}_rule_${index}`,
      kind: 'app',
      appSource,
      label: rule.label || fallbackApp?.label || 'App alert',
      enabled: rule.enabled ?? false,
      speak: rule.speak ?? fallbackApp?.speak ?? false,
      sound: rule.sound ?? true,
      showCard: rule.showCard ?? true,
      priority: rule.priority || fallbackApp?.priority || 'normal',
      intervalMinutes: Math.max(1, Number(rule.intervalMinutes || fallbackApp?.intervalMinutes || 5)),
      conditions: Array.isArray(rule.conditions)
        ? rule.conditions.filter(Boolean)
        : fallbackApp?.conditions || ['new_messages'],
      threshold: Number.isFinite(Number(rule.threshold))
        ? Number(rule.threshold)
        : fallbackApp?.threshold,
      target: rule.target || fallbackApp?.target,
      channelRef: String(rule.channelRef || ''),
      peopleFilter: String(rule.peopleFilter || ''),
      keywordFilter: String(rule.keywordFilter || ''),
      deliveryMode: rule.deliveryMode === 'near_push' ? 'near_push' : 'timed',
    };
  }

  return {
    ...rule,
    id: rule.id || `schedule_rule_${index}`,
    label: rule.label || 'Custom notification',
    enabled: rule.enabled ?? true,
    speak: rule.speak ?? true,
    sound: rule.sound ?? true,
    showCard: rule.showCard ?? true,
    priority: rule.priority || 'normal',
    title: rule.title || rule.label || 'Custom notification',
    message: rule.message || 'Check in with Curio.',
    speakText: rule.speakText || rule.message || 'Check in with Curio.',
    time: /^\d{2}:\d{2}$/.test(rule.time) ? rule.time : '09:00',
    days: Array.isArray(rule.days)
      ? rule.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [1, 2, 3, 4, 5],
  };
};

const normalizeProactiveConfig = (config: ProactiveConfig): ProactiveConfig => {
  const normalizedExisting = (config.rules || [])
    .slice(0, DEFAULT_PROACTIVE_CONFIG.rules.length + MAX_CUSTOM_PROACTIVE_RULES)
    .map((rule, index) => normalizeProactiveRule(rule, index));
  const existingIds = new Set(normalizedExisting.map((rule) => rule.id));
  const missingDefaults = DEFAULT_PROACTIVE_CONFIG.rules
    .filter((rule) => !existingIds.has(rule.id))
    .map((rule, index) => normalizeProactiveRule(rule, normalizedExisting.length + index));
  const rules = [...normalizedExisting, ...missingDefaults]
    .slice(0, DEFAULT_PROACTIVE_CONFIG.rules.length + MAX_CUSTOM_PROACTIVE_RULES);

  return {
    enabled: config.enabled ?? false,
    rules: rules.length > 0
      ? rules
      : DEFAULT_PROACTIVE_CONFIG.rules.map((rule, index) => normalizeProactiveRule(rule, index)),
  };
};

export const getProactiveConfig = (): ProactiveConfig => {
  if (typeof window === 'undefined') return DEFAULT_PROACTIVE_CONFIG;
  try {
    const raw = localStorage.getItem('curio_proactive_config');
    if (!raw) {
      return getFallbackProactiveConfig();
    }
    return normalizeProactiveConfig(JSON.parse(raw) as ProactiveConfig);
  } catch {
    return getFallbackProactiveConfig();
  }
};

export const setProactiveConfig = (config: ProactiveConfig) => {
  const normalized = normalizeProactiveConfig(config);
  localStorage.setItem('curio_proactive_config', JSON.stringify(normalized));
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const useProactiveConfig = () =>
  useSettingsStorageValue(getProactiveConfig, DEFAULT_PROACTIVE_CONFIG);

export interface NotificationSystemStatus {
  enabled: boolean;
  availableRuleCount: number;
  activeRuleCount: number;
  pausedRuleCount: number;
}

const updateProactiveConfig = (updater: (config: ProactiveConfig) => ProactiveConfig) => {
  setProactiveConfig(updater(getProactiveConfig()));
};

export const getNotificationRuleEffectiveEnabled = (
  ruleId: string,
  config: ProactiveConfig = getProactiveConfig(),
): boolean => {
  if (!config.enabled) return false;
  return Boolean(config.rules.find((rule) => rule.id === ruleId)?.enabled);
};

export const getActiveNotificationRuleCount = (
  config: ProactiveConfig = getProactiveConfig(),
): number => {
  if (!config.enabled) return 0;
  return config.rules.filter((rule) => rule.enabled).length;
};

export const getNotificationSystemStatus = (
  config: ProactiveConfig = getProactiveConfig(),
): NotificationSystemStatus => {
  const activeRuleCount = getActiveNotificationRuleCount(config);
  return {
    enabled: config.enabled,
    availableRuleCount: config.rules.length,
    activeRuleCount,
    pausedRuleCount: config.rules.length - activeRuleCount,
  };
};

export const useNotificationSystemStatus = () =>
  useSettingsStorageValue(
    getNotificationSystemStatus,
    getNotificationSystemStatus(DEFAULT_PROACTIVE_CONFIG),
  );

export const setNotificationSystemEnabled = (enabled: boolean) => {
  updateProactiveConfig((config) => ({
    ...config,
    enabled,
  }));
};

export const updateNotificationRule = (
  ruleId: string,
  updater: (rule: ProactiveRule) => ProactiveRule,
) => {
  updateProactiveConfig((config) => ({
    ...config,
    rules: config.rules.map((rule) =>
      rule.id === ruleId ? updater(rule) : rule,
    ),
  }));
};

export const setNotificationRuleEnabled = (ruleId: string, enabled: boolean) => {
  updateNotificationRule(ruleId, (rule) => ({
    ...rule,
    enabled,
  }));
};

export const toggleNotificationRuleEnabled = (ruleId: string) => {
  updateNotificationRule(ruleId, (rule) => ({
    ...rule,
    enabled: !rule.enabled,
  }));
};

export const deleteNotificationRule = (ruleId: string) => {
  updateProactiveConfig((config) => ({
    ...config,
    rules: config.rules.filter((rule) => rule.id !== ruleId),
  }));
};

export const addNotificationRule = (rule: ProactiveRule) => {
  updateProactiveConfig((config) => ({
    ...config,
    rules: [...config.rules, rule],
  }));
};

export const getProactiveEnabled = (): boolean => getProactiveConfig().enabled;

export const setProactiveEnabled = (enabled: boolean) => {
  setNotificationSystemEnabled(enabled);
};

export const useProactiveEnabled = () => useSettingsStorageValue(getProactiveEnabled, false);

export const getCalendarLeadMinutes = (): number => {
  const rule = getProactiveConfig().rules.find((item) => item.kind === 'calendar');
  return rule?.kind === 'calendar' ? rule.leadMinutes : 10;
};

export const setCalendarLeadMinutes = (leadMinutes: number) => {
  const config = getProactiveConfig();
  setProactiveConfig({
    ...config,
    rules: config.rules.map((rule) =>
      rule.kind === 'calendar'
        ? {
          ...rule,
          leadMinutes: Math.max(1, leadMinutes),
        }
        : rule
    ),
  });
};

export const useCalendarLeadMinutes = () => useSettingsStorageValue(getCalendarLeadMinutes, 10);

export const getWeatherAlertConditions = (): string[] => {
  const rule = getProactiveConfig().rules.find((item) => item.kind === 'weather');
  return rule?.kind === 'weather' ? rule.conditions : ['rain', 'snow', 'severe'];
};

export const setWeatherAlertConditions = (conditions: string[]) => {
  const config = getProactiveConfig();
  setProactiveConfig({
    ...config,
    rules: config.rules.map((rule) =>
      rule.kind === 'weather'
        ? {
          ...rule,
          conditions,
        }
        : rule
    ),
  });
};


// Routines

const normalizeRoutine = (routine: Routine, index: number): Routine => ({
  ...routine,
  id: routine.id || `routine_${index}_${Date.now()}`,
  name: routine.name || `Routine ${index + 1}`,
  description: routine.description || '',
  icon: routine.icon || 'Routine',
  enabled: routine.enabled ?? true,
  createdAt: routine.createdAt || Date.now(),
  trigger: {
    ...routine.trigger,
    days: Array.isArray(routine.trigger.days)
      ? routine.trigger.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : routine.trigger.days,
  },
  steps: (routine.steps || [])
    .slice(0, MAX_STEPS_PER_ROUTINE)
    .map((step, stepIndex) => ({
      ...step,
      id: step.id || `${routine.id || `routine_${index}`}_step_${stepIndex}`,
      enabled: step.enabled ?? true,
    })),
});

const isRemovedDefaultRoutine = (routine: Routine): boolean =>
  routine.id === 'default_routine_0' &&
  routine.name === 'Good Morning' &&
  routine.trigger.type === 'voice' &&
  routine.trigger.phrase?.toLowerCase().trim() === 'good morning' &&
  routine.steps.some((step) => step.id.startsWith('morning_'));

const normalizeRoutines = (routines: Routine[]): Routine[] => {
  return routines
    .slice(0, MAX_ROUTINES)
    .map(normalizeRoutine)
    .filter((routine) => !isRemovedDefaultRoutine(routine));
};

export const getRoutines = (): Routine[] => {
  if (typeof window === 'undefined') return DEFAULT_ROUTINES;
  try {
    const raw = localStorage.getItem('curio_routines');
    if (!raw) {
      return DEFAULT_ROUTINES;
    }
    const parsed = JSON.parse(raw) as Routine[];
    const routines = normalizeRoutines(parsed);
    if (Array.isArray(parsed) && routines.length !== Math.min(parsed.length, MAX_ROUTINES)) {
      localStorage.setItem('curio_routines', JSON.stringify(routines));
    }
    return routines;
  } catch {
    return DEFAULT_ROUTINES;
  }
};
export const setRoutines = (routines: Routine[]) => {
  localStorage.setItem('curio_routines', JSON.stringify(normalizeRoutines(routines)));
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const markRoutineRunAt = (routineId: string, lastRunAt = Date.now()) => {
  setRoutines(
    getRoutines().map((routine) =>
      routine.id === routineId
        ? {
          ...routine,
          lastRunAt,
        }
        : routine
    ),
  );
};

export const useRoutines = () =>
  useSettingsStorageValue(getRoutines, DEFAULT_ROUTINES);

