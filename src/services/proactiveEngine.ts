import { getProactiveConfig } from '../utils/settingsStorage';
import type {
  AppProactiveRule,
  CalendarProactiveRule,
  EmailProactiveRule,
  ProactiveContext,
  ProactiveNotification,
  ProactiveRule,
  ReminderProactiveRule,
  ScheduledProactiveRule,
  WeatherProactiveRule,
} from './proactiveTypes';
import type { AqiData, WeatherData } from './weatherService';
import { subscribeBackgroundTick } from './backgroundTicker';
import { upsertNotificationCenterEntry } from './notificationCenterStore';

interface WeatherSnapshot {
  city: string;
  tempUnit: string;
  weather: WeatherData | null;
  aqi: AqiData | null;
}

const COOLDOWN_MS = 30 * 60 * 1000;
const FLUSH_STAGGER_MS = 2_500;
const MAX_PENDING_QUEUE = 50;
const MAX_EMAIL_ID_HISTORY = 100;

let running = false;
let context: ProactiveContext | null = null;
let weatherSnapshotGetter: (() => WeatherSnapshot | null) | null = null;
let lastWeatherCategory: string | null = null;
const lastEmailCheckAtByRule = new Map<string, number>();
const lastEmailMessageIdsByRule = new Map<string, Set<string>>();
const lastAppCheckAt = new Map<string, number>();
const lastSlackMessageIds = new Map<string, string>();

const deliveredMap = new Map<string, number>();
const pendingQueue: ProactiveNotification[] = [];
const flushTimeoutIds = new Set<number>();
const tickUnsubscribers: Array<() => void> = [];

const getMinuteKey = (date: Date): string =>
  [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ].join('-');

const isDuplicate = (key: string): boolean => {
  const lastDelivered = deliveredMap.get(key);
  return typeof lastDelivered === 'number' && Date.now() - lastDelivered < COOLDOWN_MS;
};

const markDelivered = (key: string) => {
  deliveredMap.set(key, Date.now());
};

// Prune expired dedup entries periodically instead of on every write.
const pruneDeliveredMap = () => {
  if (deliveredMap.size < 50) return;
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const [entryKey, timestamp] of deliveredMap) {
    if (timestamp < cutoff) {
      deliveredMap.delete(entryKey);
    }
  }
};

const clearFlushTimeouts = () => {
  flushTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  flushTimeoutIds.clear();
};

const notifyNow = (notification: ProactiveNotification) => {
  upsertNotificationCenterEntry({
    id: `proactive:${notification.source}:${notification.id}`,
    source: notification.source,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    state: 'delivered',
    createdAt: notification.createdAt,
    unread: true,
  });
  if (!context) return;
  if (notification.cardEvent) context.emitCardEvent(notification.cardEvent);
  if (notification.sound) context.playSound?.(notification.priority);
  if (notification.speakText) context.speak(notification.speakText);
};

const deliver = (notification: ProactiveNotification) => {
  if (!context) return;

  const deliveryKey = `${notification.source}:${notification.id}`;
  if (isDuplicate(deliveryKey)) return;

  markDelivered(deliveryKey);

  upsertNotificationCenterEntry({
    id: `proactive:${notification.source}:${notification.id}`,
    source: notification.source,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    state: context.isSessionActive() ? 'queued' : 'delivered',
    createdAt: notification.createdAt,
    unread: true,
  });

  if (context.isSessionActive()) {
    if (pendingQueue.length < MAX_PENDING_QUEUE) {
      pendingQueue.push(notification);
    }
    return;
  }

  notifyNow(notification);
};

export function flushPendingNotifications(): void {
  if (!context || pendingQueue.length === 0) return;

  clearFlushTimeouts();
  pendingQueue.splice(0).forEach((notification, index) => {
    const timeoutId = window.setTimeout(() => {
      flushTimeoutIds.delete(timeoutId);
      if (!context) return;

      if (context.isSessionActive()) {
        pendingQueue.unshift(notification);
        return;
      }

      notifyNow(notification);
    }, index * FLUSH_STAGGER_MS);

    flushTimeoutIds.add(timeoutId);
  });
}

const getRuleSet = <TRule extends ProactiveRule>(kind: TRule['kind']): TRule[] => {
  const config = getProactiveConfig();
  if (!config.enabled) return [];
  return config.rules.filter((rule) => rule.enabled && rule.kind === kind) as TRule[];
};

const createCardTitle = (rule: ProactiveRule, fallback: string): string =>
  rule.label?.trim() || fallback;

const parseMinutes = (value?: string): number => {
  if (!value) return 0;
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*hr/i);
  const minuteMatch = value.match(/(\d+(?:\.\d+)?)\s*min/i);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  if (!Number.isFinite(hours) && !Number.isFinite(minutes)) return 0;
  return Math.round((Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0));
};

// Normalize a weather description into a category we can dedup on, so
// "light rain" and "moderate rain" both map to "rain" instead of each
// firing its own alert on every refresh.
const categorizeWeather = (desc: string): string => {
  const lower = desc.toLowerCase();
  if (lower.includes('thunder') || lower.includes('storm')) return 'storm';
  if (lower.includes('snow') || lower.includes('sleet') || lower.includes('blizzard')) return 'snow';
  if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower')) return 'rain';
  if (lower.includes('severe') || lower.includes('tornado') || lower.includes('hurricane')) return 'severe';
  if (lower.includes('fog') || lower.includes('mist') || lower.includes('haze')) return 'fog';
  if (lower.includes('clear') || lower.includes('sun')) return 'clear';
  if (lower.includes('cloud')) return 'cloud';
  return lower.split(/\s+/)[0] || lower;
};

const checkCalendar = async (): Promise<void> => {
  if (!context || document.visibilityState === 'hidden') return;

  const rules = getRuleSet<CalendarProactiveRule>('calendar');
  if (rules.length === 0) return;

  try {
    // Skip silently if Google Calendar is not connected. Background proactive
    // checks must not trigger an interactive OAuth popup, and the account may
    // simply not be configured yet.
    const { getGoogleCalendarAccessToken } = await import('../utils/settingsStorage');
    if (!getGoogleCalendarAccessToken()) return;

    const { listEvents } = await import('./googleCalendarApi');
    const maxLeadMinutes = Math.max(...rules.map((rule) => rule.leadMinutes));
    const now = new Date();
    const windowEnd = new Date(now.getTime() + maxLeadMinutes * 60_000);
    const events = await listEvents(8, now.toISOString(), windowEnd.toISOString());

    events.forEach((event) => {
      const startValue = event.startDateTime || event.startTime;
      if (!startValue || event.allDay) return;

      const startDate = new Date(startValue);
      const diffMinutes = Math.round((startDate.getTime() - now.getTime()) / 60_000);
      if (diffMinutes < 0) return;

      rules.forEach((rule) => {
        if (diffMinutes > rule.leadMinutes) return;

        const title = event.title || 'Upcoming event';
        const message = `${title} starts in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}.`;
        deliver({
          id: `${rule.id}:${event.id || title}:${startDate.toISOString()}`,
          source: 'calendar',
          title,
          message,
          speakText: rule.speak ? message : undefined,
          sound: rule.sound,
          cardEvent: rule.showCard
            ? {
              type: 'calendar',
              data: { events: [event], date: 'Upcoming', mode: 'view' },
              autoDismissMs: 15_000,
            }
            : undefined,
          priority: rule.priority,
          createdAt: Date.now(),
        });
      });
    });
  } catch (error) {
    console.warn('[ProactiveEngine] Calendar check failed:', error);
  }
};

const checkReminders = async (): Promise<void> => {
  if (!context || document.visibilityState === 'hidden') return;

  const rules = getRuleSet<ReminderProactiveRule>('reminder');
  if (rules.length === 0) return;

  try {
    const { getReminders } = await import('./notesPersistence');
    const reminders = getReminders().filter((reminder) => !reminder.done && reminder.dueDateTime);
    const now = Date.now();

    reminders.forEach((reminder) => {
      if (!reminder.dueDateTime) return;

      const dueAt = new Date(reminder.dueDateTime).getTime();
      const diffMinutes = Math.round((dueAt - now) / 60_000);

      rules.forEach((rule) => {
        if (diffMinutes < 0 || diffMinutes > rule.dueWindowMinutes) return;

        const message = diffMinutes <= 0
          ? reminder.text
          : `${reminder.text} in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}.`;

        deliver({
          id: `${rule.id}:${reminder.id}:${reminder.dueDateTime}`,
          source: 'reminder',
          title: createCardTitle(rule, 'Reminder'),
          message,
          speakText: rule.speak ? `Reminder: ${message}` : undefined,
          sound: rule.sound,
          cardEvent: rule.showCard
            ? {
              type: 'reminder',
              data: {
                text: reminder.text,
                scheduledTime: reminder.timeDescription,
                dueDateTime: reminder.dueDateTime,
              },
              autoDismissMs: 15_000,
            }
            : undefined,
          priority: rule.priority,
          createdAt: Date.now(),
        });
      });
    });
  } catch (error) {
    console.warn('[ProactiveEngine] Reminder check failed:', error);
  }
};

const matchesScheduledRule = (rule: ScheduledProactiveRule, now: Date): boolean => {
  const [hours, minutes] = rule.time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;

  return now.getHours() === hours
    && now.getMinutes() === minutes
    && (rule.days.length === 0 || rule.days.includes(now.getDay()));
};

const checkCustomSchedules = () => {
  if (!context || document.visibilityState === 'hidden') return;

  const rules = getRuleSet<ScheduledProactiveRule>('schedule');
  if (rules.length === 0) return;

  const now = new Date();
  const minuteKey = getMinuteKey(now);

  rules.forEach((rule) => {
    if (!matchesScheduledRule(rule, now)) return;

    deliver({
      id: `${rule.id}:${minuteKey}`,
      source: 'schedule',
      title: rule.title,
      message: rule.message,
      speakText: rule.speak ? (rule.speakText || rule.message) : undefined,
      sound: rule.sound,
      cardEvent: rule.showCard
        ? {
          type: 'list',
          data: { title: rule.title, items: [rule.message] },
          autoDismissMs: 12_000,
        }
        : undefined,
      priority: rule.priority,
      createdAt: Date.now(),
    });
  });
};

const checkWeather = () => {
  if (!context || !weatherSnapshotGetter || document.visibilityState === 'hidden') return;

  const rules = getRuleSet<WeatherProactiveRule>('weather');
  if (rules.length === 0) return;

  const snapshot = weatherSnapshotGetter();
  const condition = snapshot?.weather?.desc;
  if (!condition) return;

  const category = categorizeWeather(condition);

  // Only fire when the normalized category changes. First snapshot seeds the
  // baseline and does not fire.
  if (category === lastWeatherCategory) return;
  const previousCategory = lastWeatherCategory;
  lastWeatherCategory = category;
  if (previousCategory === null) return;

  rules.forEach((rule) => {
    const matches = rule.conditions.some((candidate) =>
      category.includes(candidate.toLowerCase()) || condition.toLowerCase().includes(candidate.toLowerCase()),
    );
    if (!matches) return;

    const city = snapshot?.city || snapshot?.weather?.city || 'your area';
    const message = `${city} weather changed to ${condition}.`;
    deliver({
      id: `${rule.id}:${city}:${category}`,
      source: 'weather',
      title: createCardTitle(rule, 'Weather alert'),
      message,
      speakText: rule.speak ? message : undefined,
      sound: rule.sound,
      cardEvent: rule.showCard
        ? {
          type: 'list',
          data: { title: createCardTitle(rule, 'Weather alert'), items: [message] },
          autoDismissMs: 12_000,
        }
        : undefined,
      priority: rule.priority,
      createdAt: Date.now(),
    });
  });
};

type Mail = {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet?: string;
  date?: string;
  isUnread?: boolean;
};

const splitFilterTerms = (value?: string): string[] =>
  String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const matchesAnyTerm = (value: string, terms: string[]): boolean => {
  if (terms.length === 0) return true;
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
};

const shouldCheckEmailRule = (rule: EmailProactiveRule): boolean => {
  const now = Date.now();
  const intervalMs = Math.max(60_000, (rule.intervalMinutes || 5) * 60_000);
  const last = lastEmailCheckAtByRule.get(rule.id) || 0;
  if (now - last < intervalMs) return false;
  lastEmailCheckAtByRule.set(rule.id, now);
  return true;
};

const buildGmailQuery = (rule: EmailProactiveRule): string => {
  const parts: string[] = [];
  if (rule.conditions.includes('new_unread')) parts.push('is:unread');
  if (rule.conditions.includes('from_sender') && rule.senderFilter?.trim()) {
    parts.push(`from:${rule.senderFilter.trim()}`);
  }
  if (rule.conditions.includes('subject_keywords') && rule.keywordFilter?.trim()) {
    parts.push(rule.keywordFilter.trim());
  }
  return parts.join(' ');
};

const buildOutlookQuery = (rule: EmailProactiveRule): string => {
  const terms = [
    ...(rule.conditions.includes('from_sender') ? splitFilterTerms(rule.senderFilter) : []),
    ...(rule.conditions.includes('subject_keywords') ? splitFilterTerms(rule.keywordFilter) : []),
  ];
  return terms.join(' OR ');
};

const getRuleSeenEmailIds = (ruleId: string): Set<string> => {
  const seen = lastEmailMessageIdsByRule.get(ruleId);
  if (seen) return seen;
  const next = new Set<string>();
  lastEmailMessageIdsByRule.set(ruleId, next);
  return next;
};

const rememberEmailIds = (ruleId: string, messages: Mail[]): void => {
  const seen = getRuleSeenEmailIds(ruleId);
  messages.forEach((message) => seen.add(message.id));
  if (seen.size > MAX_EMAIL_ID_HISTORY * 2) {
    const trimmed = [...seen].slice(-MAX_EMAIL_ID_HISTORY);
    lastEmailMessageIdsByRule.set(ruleId, new Set(trimmed));
  }
};

const filterEmailMessages = (rule: EmailProactiveRule, seenKey: string, messages: Mail[]): Mail[] => {
  const seen = getRuleSeenEmailIds(seenKey);
  const senderTerms = rule.conditions.includes('from_sender') ? splitFilterTerms(rule.senderFilter) : [];
  const keywordTerms = rule.conditions.includes('subject_keywords') ? splitFilterTerms(rule.keywordFilter) : [];

  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    if (rule.conditions.includes('new_unread') && !message.isUnread) return false;
    const senderText = `${message.fromName || ''} ${message.from || ''}`;
    const keywordText = `${message.subject || ''} ${message.snippet || ''}`;
    if (senderTerms.length > 0 && !matchesAnyTerm(senderText, senderTerms)) return false;
    if (keywordTerms.length > 0 && !matchesAnyTerm(keywordText, keywordTerms)) return false;
    return true;
  });
};

const deliverEmailRule = (
  rule: EmailProactiveRule,
  provider: 'gmail' | 'outlook',
  messages: Mail[],
): void => {
  if (messages.length === 0) return;
  const first = messages[0];
  const providerLabel = provider === 'gmail' ? 'Gmail' : 'Outlook';
  const message = messages.length === 1
    ? `New ${providerLabel} email from ${first.fromName || first.from}: ${first.subject}`
    : `${messages.length} new ${providerLabel} emails. Latest from ${first.fromName || first.from}: ${first.subject}`;

  deliver({
    id: `${rule.id}:${provider}:${first.id}`,
    source: 'email',
    title: createCardTitle(rule, `${providerLabel} alert`),
    message,
    speakText: rule.speak ? message : undefined,
    sound: rule.sound,
    cardEvent: rule.showCard
      ? {
        type: provider === 'gmail' ? 'gmail' : 'outlookMail',
        data: { messages, totalUnread: messages.length, mode: 'inbox' },
        persistent: true,
      }
      : undefined,
    priority: rule.priority,
    createdAt: Date.now(),
  });
};

const checkEmailRule = async (rule: EmailProactiveRule): Promise<void> => {
  const useGmail = rule.provider === 'gmail' || rule.provider === 'both';
  const useOutlook = rule.provider === 'outlook' || rule.provider === 'both';

  if (useGmail) {
    try {
      const { listMessages } = await import('./gmailApi');
      const { messages } = await listMessages({
        maxResults: 8,
        labelIds: ['INBOX'],
        query: buildGmailQuery(rule),
      });
      const seenKey = `${rule.id}:gmail`;
      const matches = filterEmailMessages(rule, seenKey, messages);
      rememberEmailIds(seenKey, messages);
      deliverEmailRule(rule, 'gmail', matches);
    } catch {
      // Gmail may not be connected; skip this provider.
    }
  }

  if (useOutlook) {
    try {
      const { listMessages } = await import('./outlookMailApi');
      const { messages } = await listMessages({
        maxResults: 8,
        query: buildOutlookQuery(rule),
      });
      const seenKey = `${rule.id}:outlook`;
      const matches = filterEmailMessages(rule, seenKey, messages);
      rememberEmailIds(seenKey, messages);
      deliverEmailRule(rule, 'outlook', matches);
    } catch {
      // Outlook may not be connected; skip this provider.
    }
  }
};

const checkEmail = async (): Promise<void> => {
  if (!context || document.visibilityState === 'hidden') return;

  const rules = getRuleSet<EmailProactiveRule>('email');
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (!shouldCheckEmailRule(rule)) continue;
    await checkEmailRule(rule);
  }
};

const shouldCheckAppRule = (rule: AppProactiveRule): boolean => {
  const now = Date.now();
  const intervalMs = Math.max(60_000, (rule.intervalMinutes || 5) * 60_000);
  const last = lastAppCheckAt.get(rule.id) || 0;
  if (now - last < intervalMs) return false;
  lastAppCheckAt.set(rule.id, now);
  return true;
};

const checkSlackRule = async (rule: AppProactiveRule): Promise<void> => {
  try {
    const slack = await import('./slackApi');
    const channelRef = rule.channelRef?.trim();
    const channel = channelRef
      ? await slack.resolveChannel(channelRef)
        .then(async (channelId) => {
          const channels = await slack.listChannels(200).catch(() => []);
          return channels.find((item) => item.id === channelId) || { id: channelId, name: channelRef.replace(/^#/, '') };
        })
      : (await slack.getRecentMessages(1)).channel;
    const messages = await slack.listMessages(channel.id, 8, channel.name);
    const latest = messages[messages.length - 1];
    if (!latest?.id) return;

    const previousLatestId = lastSlackMessageIds.get(rule.id);
    lastSlackMessageIds.set(rule.id, latest.id);
    if (!previousLatestId || previousLatestId === latest.id) return;

    const previousNumeric = Number(previousLatestId);
    const newMessages = messages.filter((message) => {
      const currentNumeric = Number(message.id);
      if (Number.isFinite(currentNumeric) && Number.isFinite(previousNumeric)) {
        return currentNumeric > previousNumeric;
      }
      return message.id > previousLatestId;
    });
    const peopleTerms = rule.conditions.includes('specific_people') ? splitFilterTerms(rule.peopleFilter) : [];
    const keywordTerms = rule.keywordFilter?.trim()
      ? splitFilterTerms(rule.keywordFilter)
      : ['urgent', 'blocker', 'outage', 'asap', 'critical'];
    const relevant = newMessages.filter((message) => {
      const text = message.text.toLowerCase();
      const userText = String(message.user || '').toLowerCase();
      if (peopleTerms.length > 0 && !peopleTerms.some((term) => userText.includes(term) || text.includes(term))) {
        return false;
      }
      if (rule.conditions.includes('mentions') && /@(?:here|channel|everyone)|\byou\b/.test(text)) return true;
      if (rule.conditions.includes('keywords') && keywordTerms.some((term) => text.includes(term))) return true;
      if (peopleTerms.length > 0 && rule.conditions.includes('specific_people')) return true;
      return rule.conditions.includes('new_messages');
    });
    if (relevant.length === 0) return;

    const message = `${relevant.length} new Slack message${relevant.length === 1 ? '' : 's'} in #${channel.name}.`;
    deliver({
      id: `${rule.id}:${channel.id}:${latest.id}`,
      source: 'slack',
      title: createCardTitle(rule, 'Slack alert'),
      message,
      speakText: rule.speak ? message : undefined,
      sound: rule.sound,
      cardEvent: rule.showCard
        ? {
          type: 'slack',
          data: { channel: channel.id, channelName: channel.name, messages: relevant, mode: 'messages', offline: false },
          persistent: true,
        }
        : undefined,
      priority: rule.priority,
      createdAt: Date.now(),
    });
  } catch {
    // Slack may not be connected; silently skip proactive checks.
  }
};

const checkCommuteRule = async (rule: AppProactiveRule): Promise<void> => {
  try {
    const { computeRoute } = await import('./routesApi');
    const { getHomeLocation, getWorkLocation } = await import('../utils/settingsStorage');
    const destination = rule.target === 'home' ? getHomeLocation() : getWorkLocation();
    const origin = rule.target === 'home' ? getWorkLocation() : getHomeLocation();
    if (!destination) return;

    const result = await computeRoute(origin || '', destination, 'driving');
    if (!result.success || !result.route) return;

    const route = result.route;
    const durationMinutes = parseMinutes(route.durationInTraffic || route.duration);
    const threshold = Number(rule.threshold || 35);
    const conditions = rule.conditions;
    const matchesTraffic =
      (conditions.includes('heavy_traffic') && route.trafficCondition === 'heavy') ||
      (conditions.includes('moderate_traffic') && ['moderate', 'heavy'].includes(route.trafficCondition));
    const matchesSlowCommute = conditions.includes('slow_commute') && durationMinutes >= threshold;
    if (!matchesTraffic && !matchesSlowCommute) return;

    const message = `Traffic to ${rule.target === 'home' ? 'home' : 'work'} is ${route.trafficCondition}; current drive is ${route.durationInTraffic || route.duration}.`;
    deliver({
      id: `${rule.id}:${route.trafficCondition}:${route.durationInTraffic || route.duration}`,
      source: 'commute',
      title: createCardTitle(rule, 'Commute alert'),
      message,
      speakText: rule.speak ? message : undefined,
      sound: rule.sound,
      cardEvent: rule.showCard
        ? {
          type: 'commute',
          data: {
            origin: route.origin,
            destination: route.destination,
            duration: route.duration,
            durationInTraffic: route.durationInTraffic,
            distance: route.distance,
            trafficCondition: route.trafficCondition,
            route: route.route,
          },
          autoDismissMs: 15_000,
        }
        : undefined,
      priority: rule.priority,
      createdAt: Date.now(),
    });
  } catch {
    // Routing depends on network/location settings; skip if unavailable.
  }
};

const checkChoresRule = async (rule: AppProactiveRule): Promise<void> => {
  try {
    const { getChores } = await import('./chorePersistence');
    const chores = getChores().filter((chore) => !chore.completed);
    const now = Date.now();
    const overdue = chores.filter((chore) => chore.dueDate && new Date(chore.dueDate).getTime() < now);
    const highPriority = chores.filter((chore) => chore.priority === 'high');
    const conditions = rule.conditions;
    const matches =
      (conditions.includes('pending') && chores.length > 0) ||
      (conditions.includes('high_priority') && highPriority.length > 0) ||
      (conditions.includes('overdue') && overdue.length > 0);
    if (!matches) return;

    const message = overdue.length > 0
      ? `${overdue.length} chore${overdue.length === 1 ? '' : 's'} overdue.`
      : highPriority.length > 0
        ? `${highPriority.length} high priority task${highPriority.length === 1 ? '' : 's'} open.`
        : `${chores.length} task${chores.length === 1 ? '' : 's'} still open.`;
    deliver({
      id: `${rule.id}:${chores.length}:${highPriority.length}:${overdue.length}`,
      source: 'chores',
      title: createCardTitle(rule, 'Task alert'),
      message,
      speakText: rule.speak ? message : undefined,
      sound: rule.sound,
      cardEvent: rule.showCard
        ? {
          type: 'chore',
          data: { title: createCardTitle(rule, 'Chores & tasks'), chores, mode: 'list' },
          persistent: true,
        }
        : undefined,
      priority: rule.priority,
      createdAt: Date.now(),
    });
  } catch {
    // Local task store unavailable; skip.
  }
};

const checkAirQualityRule = (rule: AppProactiveRule): void => {
  const snapshot = weatherSnapshotGetter?.();
  const aqi = snapshot?.aqi;
  if (!aqi) return;

  const value = aqi.value;
  const conditions = rule.conditions;
  const matches =
    (conditions.includes('moderate') && value >= 51) ||
    (conditions.includes('unhealthy_sensitive') && value >= 101) ||
    (conditions.includes('unhealthy') && value >= 151) ||
    (conditions.includes('threshold') && value >= Number(rule.threshold || 75));
  if (!matches) return;

  const message = `Air quality is ${aqi.category} with AQI ${value}.`;
  deliver({
    id: `${rule.id}:${aqi.category}:${Math.floor(value / 10)}`,
    source: 'air_quality',
    title: createCardTitle(rule, 'Air quality alert'),
    message,
    speakText: rule.speak ? message : undefined,
    sound: rule.sound,
    cardEvent: rule.showCard
      ? {
        type: 'airQuality',
        data: {
          aqi: value,
          category: aqi.category,
          advice: value >= 151
            ? 'Air quality is unhealthy. Consider reducing outdoor time.'
            : value >= 101
              ? 'Sensitive groups should limit prolonged outdoor exertion.'
              : 'Air quality has changed from your selected alert range.',
        },
        autoDismissMs: 15_000,
      }
      : undefined,
    priority: rule.priority,
    createdAt: Date.now(),
  });
};

const lastGitHubNotificationIds = new Map<string, Set<string>>();
const lastGitHubPrIds = new Map<string, Set<string>>();
const lastGitHubIssueIds = new Map<string, Set<string>>();
const lastGitHubWorkflowIds = new Map<string, Set<string>>();

const trackGitHubSeen = (
  store: Map<string, Set<string>>,
  ruleKey: string,
  ids: string[],
): string[] => {
  const seen = store.get(ruleKey) || new Set<string>();
  const fresh = ids.filter((id) => !seen.has(id));
  ids.forEach((id) => seen.add(id));
  if (seen.size > 400) {
    const trimmed = [...seen].slice(-200);
    store.set(ruleKey, new Set(trimmed));
  } else {
    store.set(ruleKey, seen);
  }
  return fresh;
};

const checkGitHubRule = async (rule: AppProactiveRule): Promise<void> => {
  try {
    const { hasGitHubAccessToken, getGitHubAuthMode } = await import('../utils/settingsStorage');
    const { isGitHubMcpAvailable, mcpListNotifications, mcpListPullRequests, mcpListIssues, mcpListWorkflowRuns } = await import('./githubMcpWidgetService');
    const useMcp = getGitHubAuthMode() === 'mcp' || (!hasGitHubAccessToken() && isGitHubMcpAvailable());
    if (!hasGitHubAccessToken() && !isGitHubMcpAvailable()) return;

    const conditions = rule.conditions || [];
    const ownerRepo = (rule.target || '').trim().match(/^([^/\s]+)\/([^/\s]+)$/);
    const owner = ownerRepo?.[1];
    const repo = ownerRepo?.[2];

    if (conditions.includes('new_notifications')) {
      try {
        const api = await import('./githubApi');
        const notifications = useMcp
          ? await mcpListNotifications({ perPage: 15 })
          : await api.listNotifications({ perPage: 15 });
        const unread = notifications.filter((notification) => notification.unread);
        const fresh = trackGitHubSeen(lastGitHubNotificationIds, rule.id, unread.map((notification) => notification.id));
        const relevantIds = new Set(fresh);
        const relevant = unread.filter((notification) => relevantIds.has(notification.id));
        if (relevant.length > 0) {
          const sample = relevant[0];
          const message = relevant.length === 1
            ? `New GitHub notification in ${sample.repoFullName}: ${sample.title}.`
            : `${relevant.length} new GitHub notifications.`;
          deliver({
            id: `${rule.id}:gh-notifications:${sample.id}`,
            source: 'github',
            title: createCardTitle(rule, 'GitHub notification'),
            message,
            speakText: rule.speak ? message : undefined,
            sound: rule.sound,
            cardEvent: rule.showCard
              ? { type: 'github', data: { view: 'notifications', items: relevant, count: relevant.length }, persistent: true }
              : undefined,
            priority: rule.priority,
            createdAt: Date.now(),
          });
        }
      } catch {
        // GitHub may be offline or unauthenticated; skip silently.
      }
    }

    if (conditions.includes('review_requested') || conditions.includes('mentions')) {
      try {
        const api = await import('./githubApi');
        const prs = useMcp
          ? await mcpListPullRequests({ perPage: 15 })
          : await api.listMyPullRequests({
              perPage: 15,
              involvement: conditions.includes('review_requested') ? 'review-requested' : 'mentions',
            });
        const fresh = trackGitHubSeen(lastGitHubPrIds, rule.id, prs.map((pr) => String(pr.id)));
        const relevantIds = new Set(fresh);
        const relevant = prs.filter((pr) => relevantIds.has(String(pr.id)));
        if (relevant.length > 0) {
          const sample = relevant[0];
          const message = relevant.length === 1
            ? `New PR needs your review: ${sample.title} in ${sample.repoFullName}.`
            : `${relevant.length} pull requests need your attention.`;
          deliver({
            id: `${rule.id}:gh-prs:${sample.id}`,
            source: 'github',
            title: createCardTitle(rule, 'GitHub pull requests'),
            message,
            speakText: rule.speak ? message : undefined,
            sound: rule.sound,
            cardEvent: rule.showCard
              ? { type: 'github', data: { view: 'pull_requests', items: relevant, count: relevant.length }, persistent: true }
              : undefined,
            priority: rule.priority,
            createdAt: Date.now(),
          });
        }
      } catch {
        // Skip on failure.
      }
    }

    if (conditions.includes('assigned_issues')) {
      try {
        const api = await import('./githubApi');
        const issues = useMcp
          ? await mcpListIssues({ perPage: 15 })
          : await api.listMyIssues({ perPage: 15, involvement: 'assignee' });
        const fresh = trackGitHubSeen(lastGitHubIssueIds, rule.id, issues.map((issue) => String(issue.id)));
        const relevantIds = new Set(fresh);
        const relevant = issues.filter((issue) => relevantIds.has(String(issue.id)));
        if (relevant.length > 0) {
          const sample = relevant[0];
          const message = relevant.length === 1
            ? `Issue assigned to you: ${sample.title} in ${sample.repoFullName}.`
            : `${relevant.length} issues assigned to you.`;
          deliver({
            id: `${rule.id}:gh-issues:${sample.id}`,
            source: 'github',
            title: createCardTitle(rule, 'GitHub issues'),
            message,
            speakText: rule.speak ? message : undefined,
            sound: rule.sound,
            cardEvent: rule.showCard
              ? { type: 'github', data: { view: 'issues', items: relevant, count: relevant.length }, persistent: true }
              : undefined,
            priority: rule.priority,
            createdAt: Date.now(),
          });
        }
      } catch {
        // Skip on failure.
      }
    }

    if (conditions.includes('workflow_failure') && owner && repo) {
      try {
        const api = await import('./githubApi');
        const runs = useMcp
          ? await mcpListWorkflowRuns({ owner, repo, perPage: 10 })
          : await api.listWorkflowRuns(owner, repo, { perPage: 10 });
        const failures = runs.filter((run) => run.conclusion === 'failure' || run.conclusion === 'timed_out');
        const fresh = trackGitHubSeen(lastGitHubWorkflowIds, rule.id, failures.map((run) => String(run.id)));
        const relevantIds = new Set(fresh);
        const relevant = failures.filter((run) => relevantIds.has(String(run.id)));
        if (relevant.length > 0) {
          const sample = relevant[0];
          const message = `${sample.name} failed in ${sample.repoFullName} on ${sample.headBranch || 'main'}.`;
          deliver({
            id: `${rule.id}:gh-workflow:${sample.id}`,
            source: 'github',
            title: createCardTitle(rule, 'Workflow failure'),
            message,
            speakText: rule.speak ? message : undefined,
            sound: rule.sound,
            cardEvent: rule.showCard
              ? { type: 'github', data: { view: 'workflow_runs', items: relevant, count: relevant.length, owner, repo }, persistent: true }
              : undefined,
            priority: rule.priority,
            createdAt: Date.now(),
          });
        }
      } catch {
        // Skip on failure.
      }
    }
  } catch {
    // Top-level import failures should never surface to the user.
  }
};

const checkAppAlerts = async (): Promise<void> => {
  if (!context || document.visibilityState === 'hidden') return;

  const rules = getRuleSet<AppProactiveRule>('app');
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (!shouldCheckAppRule(rule)) continue;
    if (rule.appSource === 'slack') await checkSlackRule(rule);
    else if (rule.appSource === 'commute') await checkCommuteRule(rule);
    else if (rule.appSource === 'chores') await checkChoresRule(rule);
    else if (rule.appSource === 'air_quality') checkAirQualityRule(rule);
    else if (rule.appSource === 'github') await checkGitHubRule(rule);
  }
};

export function setWeatherSnapshotGetter(getter: () => WeatherSnapshot | null): void {
  weatherSnapshotGetter = getter;
}

const clearSubscriptions = () => {
  tickUnsubscribers.splice(0).forEach((fn) => fn());
};

// Per-rule state is keyed by rule id. When the user removes a rule, drop its
// entries so these maps cannot grow without bound across settings churn.
const pruneStaleRuleState = (activeRuleIds: Set<string>) => {
  for (const key of lastEmailCheckAtByRule.keys()) {
    if (!activeRuleIds.has(key)) lastEmailCheckAtByRule.delete(key);
  }
  for (const key of lastEmailMessageIdsByRule.keys()) {
    // seenKey is `${ruleId}:gmail` or `${ruleId}:outlook`; fall back to the
    // raw key for safety if a caller ever stored by bare rule id.
    const ruleId = key.split(':')[0] || key;
    if (!activeRuleIds.has(ruleId)) lastEmailMessageIdsByRule.delete(key);
  }
  for (const key of lastAppCheckAt.keys()) {
    if (!activeRuleIds.has(key)) lastAppCheckAt.delete(key);
  }
  for (const key of lastSlackMessageIds.keys()) {
    if (!activeRuleIds.has(key)) lastSlackMessageIds.delete(key);
  }
};

// Signature of the proactive config restricted to fields that affect the
// subscription topology. Settings events fire for unrelated state (dashboard
// colors, clock format, etc.), and tearing down/resetting everything on each
// of those is wasteful and triggers redundant network calls.
let lastSubscriptionSignature: string | null = null;
const computeSubscriptionSignature = (): string => {
  const config = getProactiveConfig();
  if (!config.enabled) return 'disabled';
  const parts = config.rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const interval = (rule as { intervalMinutes?: number }).intervalMinutes ?? '';
      return `${rule.kind}:${rule.id}:${interval}`;
    });
  parts.sort();
  return `enabled|${parts.join('|')}`;
};

const configureSubscriptions = () => {
  const signature = computeSubscriptionSignature();
  if (signature === lastSubscriptionSignature) return;
  lastSubscriptionSignature = signature;

  clearSubscriptions();

  const config = getProactiveConfig();
  if (!config.enabled) {
    // Drop all per-rule state since nothing is active anymore.
    lastEmailCheckAtByRule.clear();
    lastEmailMessageIdsByRule.clear();
    lastAppCheckAt.clear();
    lastSlackMessageIds.clear();
    console.log('[ProactiveEngine] Disabled; no subscriptions.');
    return;
  }

  const activeRuleIds = new Set(
    config.rules.filter((rule) => rule.enabled).map((rule) => rule.id),
  );
  pruneStaleRuleState(activeRuleIds);

  const hasCalendar = config.rules.some((r) => r.enabled && r.kind === 'calendar');
  const hasReminder = config.rules.some((r) => r.enabled && (r.kind === 'reminder' || r.kind === 'schedule'));
  const hasWeather = config.rules.some((r) => r.enabled && r.kind === 'weather');
  const hasEmail = config.rules.some((r) => r.enabled && r.kind === 'email');
  const hasAppAlerts = config.rules.some((r) => r.enabled && r.kind === 'app');

  if (hasCalendar) {
    void checkCalendar();
    tickUnsubscribers.push(subscribeBackgroundTick(60, () => void checkCalendar()));
  }

  if (hasReminder) {
    void checkReminders();
    checkCustomSchedules();
    tickUnsubscribers.push(subscribeBackgroundTick(30, () => {
      void checkReminders();
      checkCustomSchedules();
    }));
  }

  if (hasWeather) {
    checkWeather();
    tickUnsubscribers.push(subscribeBackgroundTick(300, checkWeather));
  }

  if (hasEmail) {
    void checkEmail();
    // Wake up often enough to honor near-push rules while each rule gates its own cadence.
    tickUnsubscribers.push(subscribeBackgroundTick(60, () => void checkEmail()));
  }

  if (hasAppAlerts) {
    void checkAppAlerts();
    tickUnsubscribers.push(subscribeBackgroundTick(60, () => void checkAppAlerts()));
  }

  // Prune dedup map every 15 minutes so it stays bounded without per-write cost.
  tickUnsubscribers.push(subscribeBackgroundTick(900, pruneDeliveredMap));

  const activeTypes = [
    hasCalendar && 'calendar',
    hasReminder && 'reminder/schedule',
    hasWeather && 'weather',
    hasEmail && 'email',
    hasAppAlerts && 'app alerts',
  ].filter(Boolean);
  console.log(`[ProactiveEngine] Active: ${activeTypes.join(', ') || 'none'}.`);
};

const onSettingsChanged = () => {
  if (!running) return;
  configureSubscriptions();
};

export function startProactiveEngine(nextContext: ProactiveContext): void {
  context = nextContext;

  if (running) return;
  running = true;

  configureSubscriptions();
  window.addEventListener('curio:settings-changed', onSettingsChanged);
}

export function stopProactiveEngine(): void {
  clearSubscriptions();
  clearFlushTimeouts();
  pendingQueue.length = 0;
  deliveredMap.clear();
  lastWeatherCategory = null;
  lastEmailCheckAtByRule.clear();
  lastEmailMessageIdsByRule.clear();
  lastAppCheckAt.clear();
  lastSlackMessageIds.clear();
  lastSubscriptionSignature = null;
  window.removeEventListener('curio:settings-changed', onSettingsChanged);
  context = null;
  running = false;

  console.log('[ProactiveEngine] Stopped.');
}
