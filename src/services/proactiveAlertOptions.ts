import type { AppAlertSource, EmailProactiveRule, NotificationDeliveryMode } from './proactiveTypes';

export interface AlertConditionOption {
  value: string;
  label: string;
  description: string;
}

export const WEATHER_ALERT_OPTIONS: AlertConditionOption[] = [
  { value: 'rain', label: 'Rain', description: 'Rain, showers, and drizzle.' },
  { value: 'snow', label: 'Snow', description: 'Snow, sleet, and blizzard conditions.' },
  { value: 'storm', label: 'Storms', description: 'Thunderstorms and hail.' },
  { value: 'severe', label: 'Severe weather', description: 'Severe warnings and dangerous weather.' },
  { value: 'fog', label: 'Fog or haze', description: 'Fog, mist, haze, or low visibility.' },
  { value: 'clear', label: 'Clear skies', description: 'Switches to clear or sunny weather.' },
  { value: 'cloud', label: 'Cloud cover', description: 'Cloudy or overcast changes.' },
];

export const EMAIL_ALERT_OPTIONS: AlertConditionOption[] = [
  { value: 'new_unread', label: 'New unread', description: 'Unread messages that just appeared.' },
  { value: 'from_sender', label: 'Specific sender', description: 'Only alert when sender matches your filter.' },
  { value: 'subject_keywords', label: 'Subject or keyword', description: 'Only alert when subject or preview matches your words.' },
];

export interface AppAlertPreset {
  source: AppAlertSource;
  label: string;
  description: string;
  defaultConditions: string[];
  defaultIntervalMinutes: number;
  conditionOptions: AlertConditionOption[];
}

export const APP_ALERT_PRESETS: AppAlertPreset[] = [
  {
    source: 'slack',
    label: 'Slack messages',
    description: 'Alert when new messages appear in your recent Slack channel.',
    defaultConditions: ['new_messages'],
    defaultIntervalMinutes: 3,
    conditionOptions: [
      { value: 'new_messages', label: 'New messages', description: 'Recent channel has new messages.' },
      { value: 'specific_channel', label: 'Specific channel', description: 'Only watch the selected channel or DM.' },
      { value: 'specific_people', label: 'Specific people', description: 'Only alert for selected people or mentions.' },
      { value: 'mentions', label: 'Mentions', description: 'Messages mention you or use @here/@channel.' },
      { value: 'keywords', label: 'Priority words', description: 'Messages include urgent, blocker, or outage.' },
    ],
  },
  {
    source: 'commute',
    label: 'Commute & traffic',
    description: 'Alert when the route to a saved place gets slow or heavy.',
    defaultConditions: ['heavy_traffic', 'slow_commute'],
    defaultIntervalMinutes: 10,
    conditionOptions: [
      { value: 'moderate_traffic', label: 'Moderate traffic', description: 'Traffic is above normal.' },
      { value: 'heavy_traffic', label: 'Heavy traffic', description: 'Traffic is heavy on the route.' },
      { value: 'slow_commute', label: 'Commute over limit', description: 'Drive time passes your minute limit.' },
    ],
  },
  {
    source: 'chores',
    label: 'Chores & tasks',
    description: 'Alert when chores or dashboard tasks need attention.',
    defaultConditions: ['pending', 'high_priority'],
    defaultIntervalMinutes: 30,
    conditionOptions: [
      { value: 'pending', label: 'Pending tasks', description: 'There are unfinished chores or tasks.' },
      { value: 'high_priority', label: 'High priority', description: 'A high-priority task is still open.' },
      { value: 'overdue', label: 'Overdue items', description: 'A task due date has passed.' },
    ],
  },
  {
    source: 'air_quality',
    label: 'Air quality',
    description: 'Alert when AQI moves into selected ranges.',
    defaultConditions: ['moderate', 'unhealthy'],
    defaultIntervalMinutes: 10,
    conditionOptions: [
      { value: 'moderate', label: 'Moderate AQI', description: 'AQI reaches moderate or above.' },
      { value: 'unhealthy_sensitive', label: 'Unhealthy for sensitive groups', description: 'AQI is above 100.' },
      { value: 'unhealthy', label: 'Unhealthy AQI', description: 'AQI is above 150.' },
      { value: 'threshold', label: 'Custom threshold', description: 'AQI crosses your chosen number.' },
    ],
  },
  {
    source: 'github',
    label: 'GitHub activity',
    description: 'Alert on new pull requests, issues, notifications, or failing workflow runs.',
    defaultConditions: ['new_notifications', 'review_requested'],
    defaultIntervalMinutes: 10,
    conditionOptions: [
      { value: 'new_notifications', label: 'New notifications', description: 'Unread notifications in your GitHub inbox.' },
      { value: 'review_requested', label: 'Review requested', description: 'New pull requests that need your review.' },
      { value: 'assigned_issues', label: 'Assigned issues', description: 'Issues assigned to you.' },
      { value: 'mentions', label: 'Mentions', description: 'Issues or pull requests where you are mentioned.' },
      { value: 'workflow_failure', label: 'Failing workflow runs', description: 'Workflow runs that ended in failure (requires owner/repo).' },
    ],
  },
];

export const getAppAlertPreset = (source: AppAlertSource): AppAlertPreset =>
  APP_ALERT_PRESETS.find((preset) => preset.source === source) || APP_ALERT_PRESETS[0];

export const getAppAlertConditionOptions = (source: AppAlertSource): AlertConditionOption[] =>
  getAppAlertPreset(source).conditionOptions;

export interface AdditionalAlertTemplate {
  id: string;
  label: string;
  description: string;
  category: 'slack' | 'email' | 'weather' | 'commute' | 'tasks' | 'air_quality';
  ruleKind: 'email' | 'app';
  source?: AppAlertSource;
  email?: Partial<EmailProactiveRule>;
  app?: {
    conditions?: string[];
    intervalMinutes?: number;
    deliveryMode?: NotificationDeliveryMode;
    label?: string;
    threshold?: number;
    target?: string;
  };
}

export const ADDITIONAL_ALERT_TEMPLATES: AdditionalAlertTemplate[] = [
  {
    id: 'slack_channel',
    label: 'Slack channel alert',
    description: 'Watch one Slack channel or DM with its own cadence.',
    category: 'slack',
    ruleKind: 'app',
    source: 'slack',
    app: {
      label: 'Slack channel alert',
      conditions: ['new_messages', 'specific_channel'],
      intervalMinutes: 1,
      deliveryMode: 'near_push',
    },
  },
  {
    id: 'slack_person',
    label: 'Slack person alert',
    description: 'Alert when a specific teammate appears or mentions you.',
    category: 'slack',
    ruleKind: 'app',
    source: 'slack',
    app: {
      label: 'Slack person alert',
      conditions: ['specific_people', 'mentions'],
      intervalMinutes: 1,
      deliveryMode: 'near_push',
    },
  },
  {
    id: 'slack_keyword',
    label: 'Slack keyword alert',
    description: 'Watch Slack for urgent words or your own keywords.',
    category: 'slack',
    ruleKind: 'app',
    source: 'slack',
    app: {
      label: 'Slack keyword alert',
      conditions: ['keywords'],
      intervalMinutes: 1,
      deliveryMode: 'near_push',
    },
  },
  {
    id: 'gmail_sender',
    label: 'Gmail sender alert',
    description: 'Create a separate Gmail alert for one person or address.',
    category: 'email',
    ruleKind: 'email',
    email: {
      label: 'Gmail sender alert',
      provider: 'gmail',
      conditions: ['new_unread', 'from_sender'],
      intervalMinutes: 1,
      deliveryMode: 'near_push',
    },
  },
  {
    id: 'outlook_sender',
    label: 'Outlook sender alert',
    description: 'Create a separate Outlook alert for one person or address.',
    category: 'email',
    ruleKind: 'email',
    email: {
      label: 'Outlook sender alert',
      provider: 'outlook',
      conditions: ['new_unread', 'from_sender'],
      intervalMinutes: 1,
      deliveryMode: 'near_push',
    },
  },
  {
    id: 'email_keyword',
    label: 'Email keyword alert',
    description: 'Alert when Gmail or Outlook mail matches a subject keyword.',
    category: 'email',
    ruleKind: 'email',
    email: {
      label: 'Email keyword alert',
      provider: 'both',
      conditions: ['new_unread', 'subject_keywords'],
      intervalMinutes: 1,
      deliveryMode: 'near_push',
    },
  },
  {
    id: 'traffic_limit',
    label: 'Commute limit alert',
    description: 'Create another traffic rule with a different route limit.',
    category: 'commute',
    ruleKind: 'app',
    source: 'commute',
    app: {
      label: 'Commute limit alert',
      conditions: ['slow_commute'],
      intervalMinutes: 10,
      threshold: 30,
      target: 'work',
    },
  },
  {
    id: 'task_overdue',
    label: 'Overdue task alert',
    description: 'Only alert when chores or tasks are overdue.',
    category: 'tasks',
    ruleKind: 'app',
    source: 'chores',
    app: {
      label: 'Overdue task alert',
      conditions: ['overdue'],
      intervalMinutes: 30,
    },
  },
  {
    id: 'aqi_threshold',
    label: 'AQI threshold alert',
    description: 'Create another air-quality rule with its own AQI limit.',
    category: 'air_quality',
    ruleKind: 'app',
    source: 'air_quality',
    app: {
      label: 'AQI threshold alert',
      conditions: ['threshold'],
      intervalMinutes: 10,
      threshold: 100,
    },
  },
];
