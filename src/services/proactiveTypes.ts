import type { CardEvent } from './cardTypes';

export type NotificationSource =
  | 'calendar'
  | 'weather'
  | 'reminder'
  | 'schedule'
  | 'email'
  | 'slack'
  | 'commute'
  | 'chores'
  | 'air_quality'
  | 'github';
export type NotificationPriority = 'low' | 'normal' | 'high';
export type NotificationDeliveryMode = 'timed' | 'near_push';
export type ProactiveRuleKind = 'calendar' | 'reminder' | 'weather' | 'schedule' | 'email' | 'app';
export type AppAlertSource = 'slack' | 'commute' | 'chores' | 'air_quality' | 'github';

interface ProactiveRuleBase {
  id: string;
  kind: ProactiveRuleKind;
  label: string;
  enabled: boolean;
  speak: boolean;
  sound: boolean;
  showCard: boolean;
  priority: NotificationPriority;
}

export interface CalendarProactiveRule extends ProactiveRuleBase {
  kind: 'calendar';
  leadMinutes: number;
}

export interface ReminderProactiveRule extends ProactiveRuleBase {
  kind: 'reminder';
  dueWindowMinutes: number;
}

export interface WeatherProactiveRule extends ProactiveRuleBase {
  kind: 'weather';
  conditions: string[];
}

export interface ScheduledProactiveRule extends ProactiveRuleBase {
  kind: 'schedule';
  title: string;
  message: string;
  speakText?: string;
  time: string;
  days: number[];
}

export interface EmailProactiveRule extends ProactiveRuleBase {
  kind: 'email';
  /** Check interval in minutes (default 5) */
  intervalMinutes: number;
  /** Which provider: gmail, outlook, or both */
  provider: 'gmail' | 'outlook' | 'both';
  /** Alert presets such as new_unread, from_sender, or subject_keywords. */
  conditions: string[];
  /** Optional sender/name/address filter for targeted email alerts. */
  senderFilter?: string;
  /** Optional subject or body keyword filter. */
  keywordFilter?: string;
  /** "near_push" checks as quickly as the browser app can safely poll. */
  deliveryMode?: NotificationDeliveryMode;
}

export interface AppProactiveRule extends ProactiveRuleBase {
  kind: 'app';
  appSource: AppAlertSource;
  /** Check interval in minutes (default 5) */
  intervalMinutes: number;
  /** Source-specific selected presets such as new_messages or heavy_traffic. */
  conditions: string[];
  /** Optional source-specific threshold, e.g. commute minutes or AQI value. */
  threshold?: number;
  /** Optional source-specific target, e.g. work or home for commute alerts. */
  target?: string;
  /** Optional Slack channel name or ID. */
  channelRef?: string;
  /** Optional user/person filter for Slack message author or mentions. */
  peopleFilter?: string;
  /** Optional keyword filter for Slack priority-word alerts. */
  keywordFilter?: string;
  /** "near_push" checks as quickly as the browser app can safely poll. */
  deliveryMode?: NotificationDeliveryMode;
}

export type ProactiveRule =
  | CalendarProactiveRule
  | ReminderProactiveRule
  | WeatherProactiveRule
  | ScheduledProactiveRule
  | EmailProactiveRule
  | AppProactiveRule;

export interface ProactiveConfig {
  enabled: boolean;
  rules: ProactiveRule[];
}

export interface ProactiveNotification {
  id: string;
  source: NotificationSource;
  title: string;
  message: string;
  cardEvent?: CardEvent;
  speakText?: string;
  sound?: boolean;
  priority: NotificationPriority;
  createdAt: number;
}

export interface ProactiveContext {
  speak: (text: string) => void;
  playSound?: (priority: NotificationPriority) => void;
  emitCardEvent: (event: CardEvent) => void;
  isSessionActive: () => boolean;
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: false,
  rules: [
    {
      id: 'calendar_default',
      kind: 'calendar',
      label: 'Calendar reminders',
      enabled: true,
      speak: true,
      sound: true,
      showCard: true,
      priority: 'normal',
      leadMinutes: 10,
    },
    {
      id: 'reminder_default',
      kind: 'reminder',
      label: 'Reminder alerts',
      enabled: true,
      speak: true,
      sound: true,
      showCard: true,
      priority: 'normal',
      dueWindowMinutes: 1,
    },
    {
      id: 'weather_default',
      kind: 'weather',
      label: 'Weather changes',
      enabled: true,
      speak: true,
      sound: false,
      showCard: true,
      priority: 'low',
      conditions: ['rain', 'snow', 'severe', 'storm'],
    },
    {
      id: 'email_default',
      kind: 'email',
      label: 'Email alerts',
      enabled: false,
      speak: true,
      sound: true,
      showCard: true,
      priority: 'normal',
      intervalMinutes: 5,
      provider: 'gmail',
      conditions: ['new_unread'],
    },
    {
      id: 'slack_default',
      kind: 'app',
      appSource: 'slack',
      label: 'Slack messages',
      enabled: false,
      speak: false,
      sound: true,
      showCard: true,
      priority: 'normal',
      intervalMinutes: 3,
      conditions: ['new_messages'],
      deliveryMode: 'timed',
    },
    {
      id: 'commute_default',
      kind: 'app',
      appSource: 'commute',
      label: 'Commute & traffic',
      enabled: false,
      speak: true,
      sound: true,
      showCard: true,
      priority: 'normal',
      intervalMinutes: 10,
      conditions: ['heavy_traffic', 'slow_commute'],
      threshold: 35,
      target: 'work',
    },
    {
      id: 'chores_default',
      kind: 'app',
      appSource: 'chores',
      label: 'Chores & tasks',
      enabled: false,
      speak: false,
      sound: true,
      showCard: true,
      priority: 'low',
      intervalMinutes: 30,
      conditions: ['pending', 'high_priority'],
    },
    {
      id: 'air_quality_default',
      kind: 'app',
      appSource: 'air_quality',
      label: 'Air quality',
      enabled: false,
      speak: true,
      sound: true,
      showCard: true,
      priority: 'normal',
      intervalMinutes: 10,
      conditions: ['moderate', 'unhealthy'],
      threshold: 75,
    },
  ],
};

export const MAX_CUSTOM_PROACTIVE_RULES = 12;

export const createScheduledProactiveRule = (): ScheduledProactiveRule => ({
  id: `notification_${Date.now()}`,
  kind: 'schedule',
  label: 'Custom notification',
  enabled: true,
  speak: true,
  sound: true,
  showCard: true,
  priority: 'normal',
  title: 'Custom notification',
  message: 'Check in with Curio.',
  speakText: 'Check in with Curio.',
  time: '09:00',
  days: [1, 2, 3, 4, 5],
});

export const createEmailProactiveRule = (
  overrides: Partial<EmailProactiveRule> = {},
): EmailProactiveRule => ({
  id: `email_notification_${Date.now()}`,
  kind: 'email',
  label: 'Email alert',
  enabled: true,
  speak: true,
  sound: true,
  showCard: true,
  priority: 'normal',
  intervalMinutes: 5,
  provider: 'gmail',
  conditions: ['new_unread'],
  deliveryMode: 'timed',
  ...overrides,
});

export const createAppProactiveRule = (
  appSource: AppAlertSource,
  overrides: Partial<AppProactiveRule> = {},
): AppProactiveRule => {
  const base = {
    id: `${appSource}_notification_${Date.now()}`,
    kind: 'app' as const,
    appSource,
    enabled: true,
    speak: false,
    sound: true,
    showCard: true,
    priority: 'normal' as NotificationPriority,
    deliveryMode: 'timed' as NotificationDeliveryMode,
  };

  if (appSource === 'commute') {
    return {
      ...base,
      label: 'Commute & traffic',
      speak: true,
      intervalMinutes: 10,
      conditions: ['heavy_traffic', 'slow_commute'],
      threshold: 35,
      target: 'work',
      ...overrides,
    };
  }

  if (appSource === 'chores') {
    return {
      ...base,
      label: 'Chores & tasks',
      priority: 'low',
      intervalMinutes: 30,
      conditions: ['pending', 'high_priority'],
      ...overrides,
    };
  }

  if (appSource === 'air_quality') {
    return {
      ...base,
      label: 'Air quality',
      speak: true,
      intervalMinutes: 10,
      conditions: ['moderate', 'unhealthy'],
      threshold: 75,
      ...overrides,
    };
  }

  return {
    ...base,
    label: 'Slack messages',
    intervalMinutes: 3,
    conditions: ['new_messages'],
    ...overrides,
  };
};
