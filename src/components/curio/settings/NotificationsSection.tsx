import React, { useCallback, useEffect, useState } from 'react';
import { 
  Bell, 
  Calendar, 
  CloudRain, 
  Clock, 
  ChevronDown,
  Github,
  Mail, 
  MessageSquare,
  Navigation,
  ListTodo,
  Wind,
  Play, 
  Loader2, 
  Volume2,
  BellRing,
  CreditCard,
  ClipboardList
} from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import { useCardManager } from '../../../contexts/CardManagerContext';
import { requestAmbientSpeech } from '../../../services/ambientOutput';
import { playNotificationSound, resumeAudioContext } from '../../../services/audioService';
import {
  NOTIFICATION_PRIORITY_ORDER,
  getNotificationPriorityDetails,
  type NotificationPriorityDetails,
} from '../../../services/notificationPriority';
import {
  ADDITIONAL_ALERT_TEMPLATES,
  APP_ALERT_PRESETS,
  EMAIL_ALERT_OPTIONS,
  WEATHER_ALERT_OPTIONS,
  getAppAlertConditionOptions,
} from '../../../services/proactiveAlertOptions';
import {
  addNotificationRule,
  deleteNotificationRule,
  setNotificationRuleEnabled,
  setNotificationSystemEnabled,
  updateNotificationRule,
  useProactiveConfig,
  useNotificationSystemStatus,
} from '../../../utils/settingsStorage';
import {
  createAppProactiveRule,
  createEmailProactiveRule,
  createScheduledProactiveRule,
  MAX_CUSTOM_PROACTIVE_RULES,
  type AppProactiveRule,
  type EmailProactiveRule,
  type NotificationDeliveryMode,
  type NotificationPriority,
  type ProactiveRule,
  type ScheduledProactiveRule,
  type WeatherProactiveRule,
} from '../../../services/proactiveTypes';

const BlurInput: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  type?: string;
}> = ({ label, value, placeholder, onCommit, type = 'text' }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => onCommit(draft.trim())}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-300"
      />
    </label>
  );
};

const priorityOptions = NOTIFICATION_PRIORITY_ORDER;
const PRIORITY_COLORS: Record<NotificationPriority, { active: string; idle: string }> = {
  low: {
    active: 'bg-slate-100 text-slate-600 border-slate-200',
    idle: 'text-slate-400 border-transparent hover:text-slate-500 hover:border-slate-200',
  },
  normal: {
    active: 'bg-sky-100 text-sky-700 border-sky-200',
    idle: 'text-slate-400 border-transparent hover:text-sky-500 hover:border-sky-200',
  },
  high: {
    active: 'bg-orange-100 text-orange-700 border-orange-200',
    idle: 'text-slate-400 border-transparent hover:text-orange-600 hover:border-orange-200',
  },
};

const weekDays = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

const RULE_ICONS: Record<string, React.ReactNode> = {
  calendar: <Calendar size={18} className="text-sky-500" />,
  reminder: <BellRing size={18} className="text-amber-500" />,
  weather: <CloudRain size={18} className="text-emerald-500" />,
  schedule: <Clock size={18} className="text-violet-500" />,
  email: <Mail size={18} className="text-pink-500" />,
};

const APP_RULE_ICONS: Record<AppProactiveRule['appSource'], React.ReactNode> = {
  slack: <MessageSquare size={18} className="text-indigo-500" />,
  commute: <Navigation size={18} className="text-cyan-500" />,
  chores: <ListTodo size={18} className="text-amber-500" />,
  air_quality: <Wind size={18} className="text-teal-500" />,
  github: <Github size={18} className="text-slate-500" />,
};

const RULE_DESC: Record<string, string> = {
  calendar: 'Announce upcoming events before they begin.',
  reminder: 'Alert when reminders are due.',
  weather: 'Watch for changing weather conditions.',
  schedule: 'Custom notification on your schedule.',
  email: 'Check for new emails periodically.',
  app: 'Use app data like Slack, traffic, tasks, or air quality.',
};

const RULE_COLORS: Record<string, string> = {
  calendar: 'border-l-sky-400',
  reminder: 'border-l-amber-400',
  weather: 'border-l-emerald-400',
  schedule: 'border-l-violet-400',
  email: 'border-l-pink-400',
  app: 'border-l-indigo-400',
};

const getRuleIcon = (rule: ProactiveRule): React.ReactNode => {
  if (rule.kind === 'app') return APP_RULE_ICONS[rule.appSource] || <ClipboardList size={18} className="text-slate-400" />;
  return RULE_ICONS[rule.kind] || <ClipboardList size={18} className="text-slate-400" />;
};

const getRuleDescription = (rule: ProactiveRule): string => {
  if (rule.kind === 'app') {
    return APP_ALERT_PRESETS.find((preset) => preset.source === rule.appSource)?.description || RULE_DESC.app;
  }
  return RULE_DESC[rule.kind] || 'Notification rule.';
};

const getRuleBorder = (rule: ProactiveRule): string => {
  if (rule.kind === 'app') {
    if (rule.appSource === 'commute') return 'border-l-cyan-400';
    if (rule.appSource === 'chores') return 'border-l-amber-400';
    if (rule.appSource === 'air_quality') return 'border-l-teal-400';
    return 'border-l-indigo-400';
  }
  return RULE_COLORS[rule.kind] || 'border-l-slate-300';
};

const conditionIsSelected = (conditions: string[], value: string): boolean => conditions.includes(value);

const toggleCondition = (conditions: string[], value: string): string[] => {
  const next = conditionIsSelected(conditions, value)
    ? conditions.filter((item) => item !== value)
    : [...conditions, value];
  return next.length > 0 ? next : [value];
};

type CadencePatch = {
  deliveryMode: NotificationDeliveryMode;
  intervalMinutes: number;
};

const setCadence = (
  mode: NotificationDeliveryMode,
  minutes: number,
): CadencePatch => ({
  deliveryMode: mode,
  intervalMinutes: Math.max(1, minutes),
});

const CADENCE_OPTIONS: Array<{
  mode: NotificationDeliveryMode;
  minutes: number;
  label: string;
  description: string;
}> = [
  { mode: 'near_push', minutes: 1, label: 'Near-push', description: 'Checks about every minute while Curio is open.' },
  { mode: 'timed', minutes: 5, label: 'Every 5 min', description: 'Balanced alerts without hammering APIs.' },
  { mode: 'timed', minutes: 15, label: 'Every 15 min', description: 'Quiet, lower-traffic checking.' },
];

const CadenceSelector: React.FC<{
  deliveryMode?: NotificationDeliveryMode;
  intervalMinutes: number;
  onChange: (patch: CadencePatch) => void;
}> = ({ deliveryMode = 'timed', intervalMinutes, onChange }) => (
  <div className="space-y-1.5">
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Refresh style</span>
    <div className="grid grid-cols-3 gap-2">
      {CADENCE_OPTIONS.map((option) => {
        const active = deliveryMode === option.mode
          && (option.mode === 'near_push' || Number(intervalMinutes) === option.minutes);
        return (
          <button
            key={`${option.mode}-${option.minutes}`}
            type="button"
            onClick={() => onChange(setCadence(option.mode, option.minutes))}
            className={`rounded-xl border px-3 py-2 text-left transition-all ${
              active
                ? 'border-violet-300 bg-violet-100 text-violet-800'
                : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200'
            }`}
          >
            <span className="block text-xs font-bold">{option.label}</span>
            <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{option.description}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const buildNotificationPreview = (rule: ProactiveRule) => {
  let title = rule.label;
  let message = '';
  let speakText = '';

  if (rule.kind === 'calendar') {
    title = 'Calendar Preview';
    message = 'Meeting with team starts in 10 minutes.';
    speakText = message;
  } else if (rule.kind === 'reminder') {
    title = 'Reminder Preview';
    message = 'Pick up groceries.';
    speakText = `Reminder: ${message}`;
  } else if (rule.kind === 'weather') {
    title = 'Weather Alert Preview';
    message = 'Sample City weather changed to rain.';
    speakText = message;
  } else if (rule.kind === 'schedule') {
    const sr = rule as ScheduledProactiveRule;
    title = sr.title || 'Custom Notification';
    message = sr.message || 'Check in with Curio.';
    speakText = sr.speakText || sr.message || 'Check in with Curio.';
  } else if (rule.kind === 'email') {
    title = 'Email Preview';
    const sender = rule.senderFilter?.trim() || 'John';
    const subject = rule.keywordFilter?.trim() || 'Project update';
    message = `New ${rule.provider === 'both' ? 'email' : rule.provider} message from ${sender}: ${subject}`;
    speakText = `You have a new email from ${sender} about ${subject}.`;
  } else if (rule.kind === 'app') {
    if (rule.appSource === 'slack') {
      title = 'Slack Preview';
      const channel = rule.channelRef?.trim() || 'general';
      const people = rule.peopleFilter?.trim();
      message = people
        ? `New Slack message from ${people} in #${channel}.`
        : `3 new Slack messages in #${channel}.`;
    } else if (rule.appSource === 'commute') {
      title = 'Commute Preview';
      message = 'Traffic to work is heavy; current drive is 42 minutes.';
    } else if (rule.appSource === 'chores') {
      title = 'Task Preview';
      message = '3 tasks still open.';
    } else {
      title = 'Air Quality Preview';
      message = 'Air quality is Moderate with AQI 82.';
    }
    speakText = message;
  }

  return {
    title,
    message,
    speakText: rule.speak ? speakText : '',
  };
};

const playRulePreviewSound = async (priority: NotificationPriority) => {
  try {
    await resumeAudioContext();
    playNotificationSound(priority);
  } catch (error) {
    console.warn('[NotificationsSection] Unable to preview notification sound:', error);
  }
};

const PriorityButton: React.FC<{
  active: boolean;
  details: NotificationPriorityDetails;
  style: { active: string; idle: string };
  onClick: () => void;
}> = ({ active, details, style, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`${details.label} priority: ${details.description}; ${details.soundDescription}`}
    title={`${details.label}: ${details.description}. Sound: ${details.soundDescription}.`}
    className={`min-w-[4.9rem] rounded-lg border px-2.5 py-1.5 text-left transition-all ${
      active ? style.active : style.idle
    }`}
  >
    <span className="block text-[10px] font-bold leading-none">{details.label}</span>
    <span className="mt-1 block text-[9px] font-semibold leading-tight opacity-75">{details.description}</span>
  </button>
);

const NotificationsSection: React.FC = () => {
  const { emitCardEvent } = useCardManager();
  const proactiveConfig = useProactiveConfig();
  const notificationSystemStatus = useNotificationSystemStatus();
  const [testingRule, setTestingRule] = useState<string | null>(null);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);

  const updateRule = (ruleId: string, updater: (rule: ProactiveRule) => ProactiveRule) => {
    updateNotificationRule(ruleId, updater);
  };

  const deleteRule = (ruleId: string) => {
    deleteNotificationRule(ruleId);
  };

  const testRule = useCallback(async (rule: ProactiveRule) => {
    setTestingRule(rule.id);
    try {
      const { title, message, speakText } = buildNotificationPreview(rule);

      if (rule.sound) {
        await playRulePreviewSound(rule.priority);
      }

      // Show card
      if (rule.showCard) {
        emitCardEvent({
          type: 'list',
          data: { title: title, items: [message] },
          autoDismissMs: 8000,
        });
      }

      // Speak
      if (speakText) {
        requestAmbientSpeech({ text: speakText, reason: 'notification' });
      }

      // Brief delay so the user sees the "testing" state
      await new Promise(r => setTimeout(r, 1500));
    } finally {
      setTestingRule(null);
    }
  }, [emitCardEvent]);

  const scheduleRules = proactiveConfig.rules.filter(r => r.kind === 'schedule');

  return (
    <SettingsSection title="Notifications" icon={<Bell size={18} className="text-violet-500" />}>
      <div data-testid="notifications-settings-scope" className="settings-consistency-scope space-y-3">
        <SettingsToggle
          label="Proactive Notifications"
          description="Calendar, reminders, weather, and custom alerts"
          enabled={notificationSystemStatus.enabled}
          onToggle={() => setNotificationSystemEnabled(!notificationSystemStatus.enabled)}
          color="bg-violet-500"
          icon={<Bell size={14} className="text-violet-500" />}
        />

        {notificationSystemStatus.enabled && (
          <div className="space-y-3 mt-3">
            {proactiveConfig.rules.map(rule => {
              const icon = getRuleIcon(rule);
              const borderColor = getRuleBorder(rule);
              const priorityMeta = getNotificationPriorityDetails(rule.priority);
              const preview = buildNotificationPreview(rule);
              const priorityStyle = PRIORITY_COLORS[rule.priority] || PRIORITY_COLORS.normal;
              const isOpen = openRuleId === rule.id;

              return (
                <div
                  key={rule.id}
                  data-testid="notification-rule-card"
                  className={`settings-unified-card rounded-2xl border border-slate-200 border-l-4 ${borderColor} bg-white shadow-sm overflow-hidden transition-all hover:shadow-md`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenRuleId(isOpen ? null : rule.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition-all hover:bg-slate-50/80"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-700 truncate">{rule.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{getRuleDescription(rule)}</div>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${priorityStyle.active}`}
                      title={`${priorityMeta.description}. Sound: ${priorityMeta.soundDescription}.`}
                    >
                      {priorityMeta.label}
                    </span>
                    <button
                      onClick={() => void testRule(rule)}
                      disabled={testingRule === rule.id}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition-all active:scale-95 ${
                        testingRule === rule.id
                          ? 'bg-amber-100 text-amber-600 animate-pulse'
                          : 'bg-violet-500 text-white hover:bg-violet-600 shadow-sm shadow-violet-200'
                      }`}
                      title="Preview this notification"
                    >
                      {testingRule === rule.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
                      <span>Test</span>
                    </button>
                    <SettingsToggle
                      label=""
                      enabled={rule.enabled}
                      onToggle={() => setNotificationRuleEnabled(rule.id, !rule.enabled)}
                      color="bg-violet-500"
                    />
                  </div>

                  {isOpen && (
                    <>
                      {/* Delivery toggles */}
                      <div
                        data-testid="notification-delivery-row"
                        className="settings-unified-toolbar flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 bg-slate-50/50"
                      >
                        <div className="flex items-center gap-2">
                          {([
                            { key: 'speak' as const, label: 'Speak', icon: <Volume2 size={12} />, val: rule.speak },
                            { key: 'sound' as const, label: 'Sound', icon: <BellRing size={12} />, val: rule.sound },
                            { key: 'showCard' as const, label: 'Card', icon: <CreditCard size={12} />, val: rule.showCard },
                          ]).map(({ key, label, icon, val }) => (
                            <button
                              key={key}
                              onClick={() => updateRule(rule.id, r => ({ ...r, [key]: !val }))}
                              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all ${
                                val
                                  ? 'bg-violet-100 text-violet-700 border border-violet-200'
                                  : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {icon}
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="flex-1" />
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {priorityOptions.map(p => {
                            const pmeta = getNotificationPriorityDetails(p);
                            const pstyle = PRIORITY_COLORS[p];
                            return (
                              <PriorityButton
                                key={p}
                                details={pmeta}
                                style={pstyle}
                                active={rule.priority === p}
                                onClick={() => updateRule(rule.id, r => ({ ...r, priority: p }))}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {(rule.speak || rule.sound) && (
                        <div className="px-4 py-2 border-t border-slate-100 text-[11px] leading-5 text-slate-400">
                          {rule.sound && (
                            <span className="mr-3 font-semibold text-slate-500">
                              Sound: {priorityMeta.soundDescription}
                            </span>
                          )}
                          {rule.speak && preview.speakText && (
                            <span>
                              AI will say: "{preview.speakText}"
                            </span>
                          )}
                        </div>
                      )}

                      {/* Kind-specific config */}
                      <div className="px-4 py-3 border-t border-slate-100 space-y-3">
                    {rule.kind === 'calendar' && (
                      <div
                        data-testid="notification-rule-config"
                        className="settings-unified-subpanel rounded-xl border border-sky-100 bg-sky-50/30 p-3"
                      >
                        <BlurInput label="Lead Minutes" value={String(rule.leadMinutes)}
                          type="number"
                          onCommit={v => updateRule(rule.id, r => ({ ...r, leadMinutes: Math.max(1, parseInt(v, 10) || (r as any).leadMinutes) }))} />
                        <p className="mt-1.5 text-[10px] text-slate-400">How many minutes before an event to notify you.</p>
                      </div>
                    )}
                    {rule.kind === 'reminder' && (
                      <div
                        data-testid="notification-rule-config"
                        className="settings-unified-subpanel rounded-xl border border-amber-100 bg-amber-50/30 p-3"
                      >
                        <BlurInput label="Due Window (minutes)" value={String(rule.dueWindowMinutes)}
                          type="number"
                          onCommit={v => updateRule(rule.id, r => ({ ...r, dueWindowMinutes: Math.max(1, parseInt(v, 10) || (r as any).dueWindowMinutes) }))} />
                        <p className="mt-1.5 text-[10px] text-slate-400">How far ahead to check for upcoming reminders.</p>
                      </div>
                    )}
                    {rule.kind === 'weather' && (
                      <div
                        data-testid="notification-rule-config"
                        className="settings-unified-subpanel rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 space-y-2"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Weather alert types</span>
                        <div className="grid grid-cols-2 gap-2">
                          {WEATHER_ALERT_OPTIONS.map((option) => {
                            const selected = rule.conditions.includes(option.value);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateRule(rule.id, r => {
                                  const weatherRule = r as WeatherProactiveRule;
                                  return { ...weatherRule, conditions: toggleCondition(weatherRule.conditions, option.value) };
                                })}
                                className={`rounded-xl border px-3 py-2 text-left transition-all ${
                                  selected
                                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200'
                                }`}
                              >
                                <span className="block text-xs font-bold">{option.label}</span>
                                <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{option.description}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {rule.kind === 'email' && (
                      <div
                        data-testid="notification-rule-config"
                        className="settings-unified-subpanel rounded-xl border border-pink-100 bg-pink-50/30 p-3 space-y-3"
                      >
                        <CadenceSelector
                          deliveryMode={rule.deliveryMode}
                          intervalMinutes={rule.intervalMinutes}
                          onChange={patch => updateRule(rule.id, r => ({ ...r, ...patch }))}
                        />
                        <BlurInput label="Check Every (minutes)" value={String(rule.intervalMinutes)}
                          type="number"
                          onCommit={v => updateRule(rule.id, r => ({ ...r, deliveryMode: 'timed', intervalMinutes: Math.max(1, parseInt(v, 10) || 5) }))} />
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider</span>
                          <div className="flex gap-2">
                            {(['gmail', 'outlook', 'both'] as const).map(p => (
                              <button key={p}
                                onClick={() => updateRule(rule.id, r => ({ ...r, provider: p }))}
                                className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                  (rule as any).provider === p
                                    ? 'bg-violet-500 text-white shadow-sm shadow-violet-200'
                                    : 'bg-white text-slate-500 border border-slate-200 hover:border-violet-300'
                                }`}
                              >
                                {p === 'both' ? 'Both' : p === 'gmail' ? 'Gmail' : 'Outlook'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alert when</span>
                          <div className="grid grid-cols-2 gap-2">
                            {EMAIL_ALERT_OPTIONS.map((option) => {
                              const selected = rule.conditions.includes(option.value);
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => updateRule(rule.id, r => {
                                    const emailRule = r as EmailProactiveRule;
                                    return { ...emailRule, conditions: toggleCondition(emailRule.conditions, option.value) };
                                  })}
                                  className={`rounded-xl border px-3 py-2 text-left transition-all ${
                                    selected
                                      ? 'border-pink-300 bg-pink-100 text-pink-800'
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-pink-200'
                                  }`}
                                >
                                  <span className="block text-xs font-bold">{option.label}</span>
                                  <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{option.description}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <BlurInput
                            label="Sender filter"
                            value={rule.senderFilter || ''}
                            placeholder="Name, email, or domain"
                            onCommit={v => updateRule(rule.id, r => ({ ...r, senderFilter: v }))}
                          />
                          <BlurInput
                            label="Keyword filter"
                            value={rule.keywordFilter || ''}
                            placeholder="urgent, invoice, school"
                            onCommit={v => updateRule(rule.id, r => ({ ...r, keywordFilter: v }))}
                          />
                        </div>
                      </div>
                    )}
                    {rule.kind === 'schedule' && (
                      <div
                        data-testid="notification-rule-config"
                        className="settings-unified-subpanel rounded-xl border border-violet-100 bg-violet-50/30 p-3 space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <BlurInput label="Title" value={rule.title}
                            onCommit={v => updateRule(rule.id, r => ({ ...r, title: v || (r as any).title, label: v || r.label }))} />
                          <BlurInput label="Time" value={rule.time} placeholder="09:00" type="time"
                            onCommit={v => updateRule(rule.id, r => ({ ...r, time: /^\d{2}:\d{2}$/.test(v) ? v : (r as any).time }))} />
                        </div>
                        <BlurInput label="Message" value={rule.message}
                          onCommit={v => updateRule(rule.id, r => {
                            const sr = r as ScheduledProactiveRule;
                            const msg = v || sr.message;
                            return { ...sr, message: msg, speakText: (!sr.speakText || sr.speakText === sr.message) ? msg : sr.speakText };
                          })} />
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Days</span>
                          <div className="flex gap-1.5">
                            {weekDays.map(day => (
                              <button key={day.value}
                                onClick={() => updateRule(rule.id, r => {
                                  const sr = r as ScheduledProactiveRule;
                                  const next = sr.days.includes(day.value)
                                    ? sr.days.filter(d => d !== day.value)
                                    : [...sr.days, day.value].sort((a, b) => a - b);
                                  return { ...sr, days: next };
                                })}
                                className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${
                                  rule.days.includes(day.value)
                                    ? 'bg-violet-500 text-white shadow-sm'
                                    : 'bg-white text-slate-400 border border-slate-200 hover:border-violet-300'
                                }`}
                              >
                                {day.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => deleteRule(rule.id)}
                          className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-bold text-red-500 transition-all hover:bg-red-100 hover:border-red-300 active:scale-[0.98]">
                          Delete Notification
                        </button>
	                      </div>
	                    )}
                    {rule.kind === 'app' && (
                      <div
                        data-testid="notification-rule-config"
                        className="settings-unified-subpanel rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 space-y-3"
                      >
                        <CadenceSelector
                          deliveryMode={rule.deliveryMode}
                          intervalMinutes={rule.intervalMinutes}
                          onChange={patch => updateRule(rule.id, r => ({ ...r, ...patch }))}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <BlurInput label="Check Every (minutes)" value={String(rule.intervalMinutes)}
                            type="number"
                            onCommit={v => updateRule(rule.id, r => ({ ...r, deliveryMode: 'timed', intervalMinutes: Math.max(1, parseInt(v, 10) || 5) }))} />
                          {(rule.appSource === 'commute' || rule.appSource === 'air_quality') && (
                            <BlurInput
                              label={rule.appSource === 'commute' ? 'Minute Limit' : 'AQI Limit'}
                              value={String(rule.threshold || (rule.appSource === 'commute' ? 35 : 75))}
                              type="number"
                              onCommit={v => updateRule(rule.id, r => ({ ...r, threshold: Math.max(1, parseInt(v, 10) || (r as AppProactiveRule).threshold || 1) }))}
                            />
                          )}
                        </div>
                        {rule.appSource === 'commute' && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Route</span>
                            <div className="flex gap-2">
                              {(['work', 'home'] as const).map(target => (
                                <button
                                  key={target}
                                  type="button"
                                  onClick={() => updateRule(rule.id, r => ({ ...r, target }))}
                                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                    rule.target === target
                                      ? 'bg-violet-500 text-white shadow-sm shadow-violet-200'
                                      : 'bg-white text-slate-500 border border-slate-200 hover:border-violet-300'
                                  }`}
                                >
                                  To {target}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {rule.appSource === 'slack' && (
                          <div className="grid grid-cols-2 gap-3">
                            <BlurInput
                              label="Channel"
                              value={rule.channelRef || ''}
                              placeholder="#general, DM name, or channel ID"
                              onCommit={v => updateRule(rule.id, r => ({
                                ...(r as AppProactiveRule),
                                channelRef: v.replace(/^#/, ''),
                                conditions: v
                                  ? Array.from(new Set([...(r as AppProactiveRule).conditions, 'specific_channel']))
                                  : (r as AppProactiveRule).conditions,
                              }))}
                            />
                            <BlurInput
                              label="People"
                              value={rule.peopleFilter || ''}
                              placeholder="@name, display name, or user ID"
                              onCommit={v => updateRule(rule.id, r => ({
                                ...(r as AppProactiveRule),
                                peopleFilter: v,
                                conditions: v
                                  ? Array.from(new Set([...(r as AppProactiveRule).conditions, 'specific_people']))
                                  : (r as AppProactiveRule).conditions,
                              }))}
                            />
                            <div className="col-span-2">
                              <BlurInput
                                label="Keyword filter"
                                value={rule.keywordFilter || ''}
                                placeholder="urgent, outage, blocker, school"
                                onCommit={v => updateRule(rule.id, r => ({
                                  ...(r as AppProactiveRule),
                                  keywordFilter: v,
                                  conditions: v
                                    ? Array.from(new Set([...(r as AppProactiveRule).conditions, 'keywords']))
                                    : (r as AppProactiveRule).conditions,
                                }))}
                              />
                            </div>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alert when</span>
                          <div className="grid grid-cols-2 gap-2">
                            {getAppAlertConditionOptions(rule.appSource).map((option) => {
                              const selected = rule.conditions.includes(option.value);
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => updateRule(rule.id, r => {
                                    const appRule = r as AppProactiveRule;
                                    return { ...appRule, conditions: toggleCondition(appRule.conditions, option.value) };
                                  })}
                                  className={`rounded-xl border px-3 py-2 text-left transition-all ${
                                    selected
                                      ? 'border-indigo-300 bg-indigo-100 text-indigo-800'
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200'
                                  }`}
                                >
                                  <span className="block text-xs font-bold">{option.label}</span>
                                  <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{option.description}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
	                  </div>
                    </>
                  )}
	                </div>
	              );
            })}

            {scheduleRules.length < MAX_CUSTOM_PROACTIVE_RULES && (
              <button
                onClick={() => addNotificationRule(createScheduledProactiveRule())}
                className="w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-400 transition-all hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50/50 active:scale-[0.98]"
              >
                + Add Custom Notification
              </button>
            )}

            <div className="settings-unified-card rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Add another alert</div>
              <div className="grid grid-cols-2 gap-2">
                {ADDITIONAL_ALERT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-label={template.label}
                    onClick={() => {
                      if (template.ruleKind === 'email') {
                        const rule = createEmailProactiveRule({
                          ...template.email,
                          id: `email_notification_${Date.now()}_${Math.round(Math.random() * 10000)}`,
                        });
                        addNotificationRule(rule);
                        setOpenRuleId(rule.id);
                        return;
                      }

                      if (!template.source) return;
                      const rule = createAppProactiveRule(template.source, {
                        ...template.app,
                        id: `${template.source}_notification_${Date.now()}_${Math.round(Math.random() * 10000)}`,
                      });
                      addNotificationRule(rule);
                      setOpenRuleId(rule.id);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-all hover:border-violet-300 hover:bg-violet-50"
                  >
                    <span className="block text-xs font-bold text-slate-700">
                      {template.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!notificationSystemStatus.enabled && (
          <div className="settings-unified-card rounded-2xl bg-gradient-to-br from-violet-50 to-sky-50 border border-violet-100 p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-violet-100 text-violet-600">
                <Bell size={32} />
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Enable to get proactive alerts for calendar events, reminders, weather, email, Slack, traffic, tasks, and air quality.
            </p>
          </div>
        )}
      </div>
    </SettingsSection>
  );
};

export default React.memo(NotificationsSection);
