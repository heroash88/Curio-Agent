import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Mic, 
  Clock, 
  Radio, 
  Home, 
  Music, 
  MessageSquare, 
  Wrench, 
  CreditCard, 
  Pause, 
  Play, 
  Trash2, 
  Plus, 
  ChevronUp, 
  ChevronDown, 
  Check, 
  Circle, 
  Lightbulb,
  Plug,
  DoorOpen,
  Lock,
  Thermometer,
  Wind,
  Tv,
  Theater,
  FileText,
  Zap,
  Square,
  Sticker
} from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import { useCardManager } from '../../../contexts/CardManagerContext';
import { requestAmbientSpeech } from '../../../services/ambientOutput';
import {
  createBlankRoutine,
  createRoutineStep,
  MAX_ROUTINES,
  MAX_STEPS_PER_ROUTINE,
  type Routine,
  type RoutineEventKind,
  type RoutineMusicEvent,
  type RoutineStep,
  type ToolCallStepConfig,
  type RoutineStepType,
  type RoutineTriggerType,
} from '../../../services/routineTypes';
import { markRoutineRunAt, getHaMcpUrl, getHaMcpEnabled, getHaMcpTokenAsync } from '../../../utils/settingsStorage';
import type { HAEntity } from '../../../services/haMcpService';

// ── Helpers ──

interface RoutinesSectionProps {
  routines: Routine[];
  setRoutines: (routines: Routine[]) => void;
}

const TRIGGER_LABELS: Record<RoutineTriggerType, { icon: React.ReactNode; label: string; color: string }> = {
  voice: { icon: <Mic size={14} />, label: 'Voice', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  schedule: { icon: <Clock size={14} />, label: 'Schedule', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  event: { icon: <Radio size={14} />, label: 'Event', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  ha_state: { icon: <Home size={14} />, label: 'Home Assistant', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  music: { icon: <Music size={14} />, label: 'Music', color: 'bg-pink-100 text-pink-700 border-pink-200' },
};

const STEP_LABELS: Record<RoutineStepType, { icon: React.ReactNode; label: string; color: string }> = {
  speak: { icon: <MessageSquare size={14} />, label: 'Speak', color: 'bg-sky-50 border-sky-200' },
  tool_call: { icon: <Wrench size={14} />, label: 'Action', color: 'bg-amber-50 border-amber-200' },
  show_card: { icon: <CreditCard size={14} />, label: 'Card', color: 'bg-purple-50 border-purple-200' },
  ha_service: { icon: <Home size={14} />, label: 'Device', color: 'bg-emerald-50 border-emerald-200' },
  wait: { icon: <Pause size={14} />, label: 'Wait', color: 'bg-slate-50 border-slate-200' },
};

const EVENT_LABELS: Record<RoutineEventKind, string> = {
  session_start: 'Session Start',
  session_end: 'Session End',
};

const MUSIC_EVENT_LABELS: Record<RoutineMusicEvent, string> = {
  play_start: 'Music Starts',
  play_stop: 'Music Stops',
};

const WEEKDAYS = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

function stepSummary(step: RoutineStep): string {
  const c = step.config as unknown as Record<string, unknown>;
  switch (step.type) {
    case 'speak': return `"${String(c.text || '').slice(0, 40)}${String(c.text || '').length > 40 ? '...' : ''}"`;
    case 'tool_call': return String(c.toolName || 'tool');
    case 'show_card': return `${String(c.type || 'card')} card`;
    case 'ha_service': return String(c.service || 'service');
    case 'wait': return `${((c.durationMs as number) || 1000) / 1000}s`;
    default: return step.type;
  }
}

function triggerSummary(r: Routine): string {
  if (r.trigger.type === 'voice') return r.trigger.phrase ? `"${r.trigger.phrase}"` : 'No phrase set';
  if (r.trigger.type === 'schedule') {
    const time = r.trigger.cron || '09:00';
    const days = (r.trigger.days || []).map(d => WEEKDAYS[d]?.label || '?').join('');
    return days ? `${time} on ${days}` : time;
  }
  if (r.trigger.type === 'event') return EVENT_LABELS[r.trigger.event as RoutineEventKind] || 'No event';
  if (r.trigger.type === 'ha_state') {
    const entity = r.trigger.haEntityId || 'no entity';
    const state = r.trigger.haState ? ` → ${r.trigger.haState}` : '';
    return `${entity}${state}`;
  }
  if (r.trigger.type === 'music') return MUSIC_EVENT_LABELS[r.trigger.musicEvent as RoutineMusicEvent] || 'Music event';
  return '';
}

// ── Debounced input (saves onBlur, not onChange) ──

const DebouncedInput: React.FC<{
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  type?: string;
  className?: string;
  label?: string;
}> = ({ value, placeholder, onCommit, type = 'text', className, label }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className={label ? 'space-y-1' : ''}>
      {label && <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>}
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() !== value) onCommit(draft.trim()); }}
        onKeyDown={e => e.stopPropagation()}
        className={className || 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-300'}
      />
    </div>
  );
};

const DebouncedTextArea: React.FC<{
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  label?: string;
  rows?: number;
}> = ({ value, placeholder, onCommit, label, rows = 3 }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className={label ? 'space-y-1' : ''}>
      {label && <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>}
      <textarea
        value={draft}
        placeholder={placeholder}
        rows={rows}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() !== value) onCommit(draft.trim()); }}
        onKeyDown={e => e.stopPropagation()}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-300"
      />
    </div>
  );
};

// ── Curated tool options for the tool_call step ──

const TOOL_OPTIONS: { value: string; label: string; group: string }[] = [
  // Weather & environment
  { value: 'get_weather', label: 'Get weather', group: 'Weather' },
  { value: 'show_air_quality', label: 'Show air quality', group: 'Weather' },
  { value: 'show_astronomy', label: 'Show sunrise / sunset', group: 'Weather' },
  // Calendar & time
  { value: 'get_calendar_events', label: 'Show calendar events', group: 'Calendar' },
  { value: 'create_calendar_event', label: 'Create calendar event', group: 'Calendar' },
  { value: 'get_outlook_events', label: 'Show Outlook calendar', group: 'Calendar' },
  { value: 'setTimer', label: 'Set a timer', group: 'Time' },
  { value: 'set_alarm', label: 'Set an alarm', group: 'Time' },
  { value: 'get_alarms', label: 'Show alarms', group: 'Time' },
  { value: 'cancelTimer', label: 'Cancel timer', group: 'Time' },
  // Music
  { value: 'play_music', label: 'Play music', group: 'Music' },
  { value: 'pause_music', label: 'Pause music', group: 'Music' },
  { value: 'resume_music', label: 'Resume music', group: 'Music' },
  { value: 'stop_music', label: 'Stop music', group: 'Music' },
  // Info
  { value: 'show_commute', label: 'Show commute time', group: 'Info' },
  { value: 'show_directions', label: 'Show directions', group: 'Info' },
  { value: 'search_places', label: 'Search nearby places', group: 'Info' },
  { value: 'track_flight', label: 'Track a flight', group: 'Info' },
  { value: 'show_fun_fact', label: 'Show a fun fact', group: 'Info' },
  { value: 'show_joke', label: 'Tell a joke', group: 'Info' },
  { value: 'show_quote', label: 'Show a quote', group: 'Info' },
  { value: 'show_news', label: 'Show news', group: 'Info' },
  // Notes
  { value: 'getMyNotes', label: 'Show my notes', group: 'Notes' },
  { value: 'getMyReminders', label: 'Show my reminders', group: 'Notes' },
  { value: 'saveNote', label: 'Save a note', group: 'Notes' },
  { value: 'setReminder', label: 'Set a reminder', group: 'Notes' },
  { value: 'check_gmail', label: 'Check Gmail', group: 'Messages' },
  { value: 'check_outlook_mail', label: 'Check Outlook mail', group: 'Messages' },
  { value: 'get_slack_messages', label: 'Get Slack messages', group: 'Messages' },
  { value: 'list_slack_channels', label: 'List Slack channels', group: 'Messages' },
  { value: 'show_chores', label: 'Show chores', group: 'Home' },
  { value: 'add_chore', label: 'Add chore', group: 'Home' },
  { value: 'complete_chore', label: 'Complete chore', group: 'Home' },
  { value: 'show_energy', label: 'Show energy dashboard', group: 'Home' },
  { value: 'show_security', label: 'Show security status', group: 'Home' },
  // Custom
  { value: '__custom__', label: '✏️ Custom tool...', group: 'Advanced' },
];

const TOOL_ARG_FIELDS: Record<string, { key: string; placeholder: string; help: string }> = {
  get_weather: {
    key: 'city',
    placeholder: 'Optional city name',
    help: 'Leave blank to use the saved weather location.',
  },
  check_gmail: {
    key: 'query',
    placeholder: 'from:alex subject:invoice is:unread',
    help: 'Uses Gmail search syntax. Leave blank for inbox.',
  },
  check_outlook_mail: {
    key: 'query',
    placeholder: 'project update',
    help: 'Searches Outlook mail for this phrase.',
  },
  get_slack_messages: {
    key: 'channel',
    placeholder: '#general or channel ID',
    help: 'Leave blank to use the default recent Slack channel.',
  },
  show_directions: {
    key: 'destination',
    placeholder: 'Work, home, or an address',
    help: 'Where the directions card should route to.',
  },
  get_directions: {
    key: 'destination',
    placeholder: 'Work, home, or an address',
    help: 'Where the directions card should route to.',
  },
  search_places: {
    key: 'query',
    placeholder: 'coffee nearby',
    help: 'What nearby place to search for.',
  },
  play_music: {
    key: 'query',
    placeholder: 'lofi focus music',
    help: 'Music or video query to play.',
  },
  track_flight: {
    key: 'flightNumber',
    placeholder: 'AA123',
    help: 'Flight number to track.',
  },
  show_news: {
    key: 'topic',
    placeholder: 'technology',
    help: 'Optional news topic.',
  },
  open_dashboard_widget: {
    key: 'widget',
    placeholder: 'weather, calendar, slack, map',
    help: 'Dashboard widget to open.',
  },
};

const TOOL_SETUP_NOTES: Record<string, string> = {
  pause_music: 'Pauses whatever Curio is currently playing. No extra setup is needed.',
  resume_music: 'Resumes the paused or ready in-app music player. No extra setup is needed.',
  stop_music: 'Stops the in-app music player and clears the compact player. No extra setup is needed.',
  get_alarms: 'Shows the saved alarm list. No extra setup is needed.',
  cancelTimer: 'Cancels active timers. No extra setup is needed.',
  getMyNotes: 'Shows saved Curio notes. No extra setup is needed.',
  getMyReminders: 'Shows open reminders. No extra setup is needed.',
  list_slack_channels: 'Shows available Slack channels if Slack is connected. No extra setup is needed.',
  show_chores: 'Opens the chores and tasks card. No extra setup is needed.',
  show_energy: 'Opens the energy dashboard card. No extra setup is needed.',
  show_security: 'Opens the security status card. No extra setup is needed.',
};

const TIMER_DURATION_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '25 min', seconds: 1500 },
  { label: '1 hour', seconds: 3600 },
];

const CALENDAR_DURATION_PRESETS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
];

const ALARM_DAY_PRESETS = [
  { label: 'Once', days: [] },
  { label: 'Weekdays', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { label: 'Weekend', days: ['Sat', 'Sun'] },
  { label: 'Every day', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
];

const ROUTINE_WEEKDAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const nextLocalDateTime = (minutesFromNow = 60): string => {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const addMinutesToLocalDateTime = (value: unknown, minutes: number): string => {
  const base = String(value || '').trim();
  if (!base) return '';
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() + minutes);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getDefaultToolArgs = (toolName: string): Record<string, unknown> => {
  const startDateTime = nextLocalDateTime(60);
  switch (toolName) {
    case 'setTimer':
      return { durationSeconds: 300, label: 'Focus timer' };
    case 'set_alarm':
      return { time: '07:00', label: 'Morning alarm', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] };
    case 'create_calendar_event':
      return {
        title: 'New event',
        startDateTime,
        endDateTime: addMinutesToLocalDateTime(startDateTime, 60),
        durationMinutes: 60,
        allDay: false,
      };
    case 'get_calendar_events':
      return { provider: 'auto', maxResults: 10 };
    case 'get_outlook_events':
      return { maxResults: 10 };
    case 'saveNote':
      return { text: '', category: 'general' };
    case 'setReminder':
      return { text: '', timeDescription: 'Soon' };
    case 'show_joke':
      return { setup: '', punchline: '', category: 'general' };
    case 'show_quote':
      return { quote: '', author: '' };
    case 'show_fun_fact':
      return { fact: '' };
    case 'show_news':
      return { items: [] };
    case 'show_air_quality':
      return { aqi: 50, category: 'Good' };
    case 'search_places':
      return { query: 'coffee nearby' };
    case 'get_directions':
    case 'show_directions':
      return { origin: 'Current Location', destination: '', travelMode: 'driving' };
    case 'track_flight':
      return { flightNumber: '' };
    case 'check_gmail':
    case 'check_outlook_mail':
      return { query: '', maxResults: 10 };
    case 'get_slack_messages':
      return { channel: '', limit: 15 };
    case 'add_chore':
      return { name: '', assignee: '' };
    case 'complete_chore':
      return { name: '' };
    default:
      return {};
  }
};

// ── Common HA service presets ──

const HA_SERVICE_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: 'light.turn_on', label: 'Turn lights on', group: 'Lights' },
  { value: 'light.turn_off', label: 'Turn lights off', group: 'Lights' },
  { value: 'light.toggle', label: 'Toggle lights', group: 'Lights' },
  { value: 'switch.turn_on', label: 'Turn switch on', group: 'Switches' },
  { value: 'switch.turn_off', label: 'Turn switch off', group: 'Switches' },
  { value: 'switch.toggle', label: 'Toggle switch', group: 'Switches' },
  { value: 'lock.lock', label: 'Lock door', group: 'Security' },
  { value: 'lock.unlock', label: 'Unlock door', group: 'Security' },
  { value: 'cover.open_cover', label: 'Open cover / garage', group: 'Covers' },
  { value: 'cover.close_cover', label: 'Close cover / garage', group: 'Covers' },
  { value: 'climate.set_hvac_mode', label: 'Set thermostat mode', group: 'Climate' },
  { value: 'climate.set_temperature', label: 'Set temperature', group: 'Climate' },
  { value: 'media_player.media_play', label: 'Play media', group: 'Media' },
  { value: 'media_player.media_pause', label: 'Pause media', group: 'Media' },
  { value: 'media_player.turn_off', label: 'Turn off media player', group: 'Media' },
  { value: 'scene.turn_on', label: 'Activate scene', group: 'Scenes' },
  { value: 'script.turn_on', label: 'Run HA script', group: 'Scripts' },
  { value: '__custom__', label: '✏️ Custom service...', group: 'Advanced' },
];

// ── Card type options for show_card step ──

const CARD_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'weather', label: 'Weather' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'timer', label: 'Timer' },
  { value: 'funFact', label: 'Fun fact' },
  { value: 'quote', label: 'Quote' },
  { value: 'joke', label: 'Joke' },
  { value: 'trivia', label: 'Trivia' },
  { value: 'airQuality', label: 'Air quality' },
  { value: 'astronomy', label: 'Astronomy' },
  { value: 'commute', label: 'Commute' },
  { value: 'map', label: 'Map / Directions' },
  { value: 'finance', label: 'Finance' },
  { value: 'sportsScore', label: 'Sports score' },
  { value: 'chore', label: 'Chores' },
  { value: 'energy', label: 'Energy dashboard' },
  { value: 'security', label: 'Security status' },
  { value: 'flight', label: 'Flight tracker' },
  { value: 'gmail', label: 'Gmail inbox' },
  { value: 'outlookMail', label: 'Outlook inbox' },
  { value: 'slack', label: 'Slack messages' },
];

// ── Wait duration presets ──

const WAIT_PRESETS: { label: string; ms: number }[] = [
  { label: '1s', ms: 1000 },
  { label: '2s', ms: 2000 },
  { label: '3s', ms: 3000 },
  { label: '5s', ms: 5000 },
  { label: '10s', ms: 10000 },
];

// ── HA entity loader -- lazy, only fetches when user opens the device picker ──

let _haEntityCache: HAEntity[] | null = null;
let _haEntityFetchPromise: Promise<HAEntity[]> | null = null;

// Invalidate cache when settings change (user reconnects HA)
if (typeof window !== 'undefined') {
  window.addEventListener('curio:settings-changed', () => { _haEntityCache = null; });
}

async function loadHaEntities(): Promise<HAEntity[]> {
  if (_haEntityCache) return _haEntityCache;
  if (_haEntityFetchPromise) return _haEntityFetchPromise;

  if (!getHaMcpEnabled()) return [];
  const url = getHaMcpUrl();
  const token = await getHaMcpTokenAsync();
  if (!url || !token) return [];

  _haEntityFetchPromise = (async () => {
    try {
      const { HomeAssistantMCPClient } = await import('../../../services/haMcpService');
      const client = new HomeAssistantMCPClient(url, token);
      const entities = await client.listEntities({ silent: true });
      _haEntityCache = entities;
      return entities;
    } catch {
      return [];
    } finally {
      _haEntityFetchPromise = null;
    }
  })();

  return _haEntityFetchPromise;
}

// Domains that are actionable (skip sensors, binary_sensors, etc.)
const ACTIONABLE_DOMAINS = new Set([
  'light', 'switch', 'cover', 'lock', 'climate', 'fan',
  'media_player', 'scene', 'script', 'vacuum', 'input_boolean',
  'automation', 'button',
]);

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  light: <Lightbulb size={14} />, 
  switch: <Plug size={14} />, 
  cover: <DoorOpen size={14} />, 
  lock: <Lock size={14} />,
  climate: <Thermometer size={14} />, 
  fan: <Wind size={14} />, 
  media_player: <Tv size={14} />, 
  scene: <Theater size={14} />,
  script: <FileText size={14} />, 
  vacuum: <Sticker size={14} />, // vacuum replacement
  input_boolean: <Circle size={14} />, 
  automation: <Zap size={14} />,
  button: <Square size={14} />,
};

function useHaEntities() {
  const [entities, setEntities] = useState<HAEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Returns a trigger function -- does NOT auto-fetch on mount
  const triggerFetch = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    const result = await loadHaEntities();
    setEntities(result);
    setLoading(false);
  }, []);

  return { entities, loading, triggerFetch };
}

// ── HA Service + Device picker ──

const HaServicePicker: React.FC<{
  service: string;
  entityId: string;
  onServiceChange: (service: string) => void;
  onEntityChange: (entityId: string) => void;
}> = ({ service, entityId, onServiceChange, onEntityChange }) => {
  const { entities, loading, triggerFetch } = useHaEntities();
  const [expanded, setExpanded] = useState(false);
  const isCustom = service !== '' && !HA_SERVICE_OPTIONS.some(o => o.value === service && o.value !== '__custom__');

  // Filter entities to those matching the selected service domain
  const serviceDomain = service.split('.')[0] || '';
  const matchingEntities = entities.filter(e =>
    ACTIONABLE_DOMAINS.has(e.domain) &&
    (serviceDomain === '' || e.domain === serviceDomain || serviceDomain === 'scene' || serviceDomain === 'script')
  );

  const entityGroups = matchingEntities.reduce<Record<string, HAEntity[]>>((acc, e) => {
    (acc[e.domain] = acc[e.domain] || []).push(e);
    return acc;
  }, {});

  const selectedEntity = entities.find(e => e.entity_id === entityId);

  const handleOpenPicker = () => {
    // Fetch lazily -- only when user actually opens the dropdown
    void triggerFetch();
    setExpanded(v => !v);
  };

  return (
    <div className="space-y-3">
      {/* Service selector */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Service</label>
        <GroupedSelect
          value={isCustom ? '__custom__' : (service || 'light.turn_on')}
          options={HA_SERVICE_OPTIONS}
          onChange={v => {
            if (v === '__custom__') {
              onServiceChange('');
            } else {
              onServiceChange(v);
              const newDomain = v.split('.')[0];
              if (selectedEntity && selectedEntity.domain !== newDomain) {
                onEntityChange('');
              }
            }
          }}
        />
        {isCustom && (
          <div className="mt-2">
            <DebouncedInput
              value={service}
              placeholder="domain.service (e.g. notify.mobile_app)"
              onCommit={onServiceChange}
            />
          </div>
        )}
      </div>

      {/* Device picker -- lazy loaded */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Device</label>
        <button
          type="button"
          onClick={handleOpenPicker}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition-all hover:border-slate-300 hover:shadow-sm"
        >
          <span className={selectedEntity ? 'text-slate-700 font-medium' : 'text-slate-400'}>
            {loading
              ? '⏳ Loading devices...'
              : selectedEntity
                ? <div className="flex items-center gap-2">
                    {DOMAIN_ICONS[selectedEntity.domain] || <Home size={14} />}
                    <span>{selectedEntity.name}</span>
                  </div>
                : !getHaMcpEnabled()
                  ? 'Home Assistant not connected'
                  : 'Pick a device (optional)'}
          </span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {loading && (
              <div className="px-3 py-4 text-center text-xs text-slate-400">Loading your devices...</div>
            )}
            {!loading && entities.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                {getHaMcpEnabled() ? 'No devices found. Check your HA connection.' : 'Connect Home Assistant in Settings first.'}
              </div>
            )}
            {!loading && entities.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => { onEntityChange(''); setExpanded(false); }}
                  className="w-full px-3 py-2.5 text-left text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100 transition-colors"
                >
                  No specific device (applies to all)
                </button>
                {Object.entries(entityGroups).map(([domain, domainEntities]) => (
                  <div key={domain}>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 sticky top-0 border-b border-slate-100">
                      {DOMAIN_ICONS[domain] || <Home size={14} />}
                      <span>{domain}</span>
                    </div>
                    {domainEntities.map(e => (
                      <button
                        key={e.entity_id}
                        type="button"
                        onClick={() => { onEntityChange(e.entity_id); setExpanded(false); }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-violet-50 ${
                          entityId === e.entity_id ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        <span className="font-medium">{e.name}</span>
                        <span className="ml-2 text-[10px] text-slate-400">{e.entity_id}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {entityId && !expanded && (
          <p className="mt-1.5 text-[10px] text-slate-400 truncate">
            Device: <span className="font-mono text-slate-500">{selectedEntity?.name || entityId}</span>
          </p>
        )}
      </div>
    </div>
  );
};

// ── Grouped <select> helper ──

function GroupedSelect({ value, options, onChange, className }: {
  value: string;
  options: { value: string; label: string; group: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const groups = options.reduce<Record<string, typeof options>>((acc, o) => {
    (acc[o.group] = acc[o.group] || []).push(o);
    return acc;
  }, {});
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className || 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 cursor-pointer'}
    >
      {Object.entries(groups).map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

const ToolArgShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="settings-unified-subpanel rounded-xl border border-amber-100 bg-white/70 p-3 space-y-3">
    {children}
  </div>
);

const FieldHelp: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  children ? <p className="mt-1.5 text-[10px] text-slate-400 leading-relaxed">{children}</p> : null
);

const PresetButton: React.FC<{
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}> = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl px-3 py-2 text-[11px] font-bold transition-all ${
      active ? 'bg-violet-500 text-white shadow-md shadow-violet-100' : 'border border-slate-200 bg-white text-slate-500 hover:border-violet-300 hover:text-violet-600'
    }`}
  >
    {children}
  </button>
);

const JsonArgsEditor: React.FC<{
  args: Record<string, unknown>;
  onCommit: (args: Record<string, unknown>) => void;
}> = ({ args, onCommit }) => {
  const [draft, setDraft] = useState(JSON.stringify(args || {}, null, 2));
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(JSON.stringify(args || {}, null, 2));
    setError('');
  }, [args]);

  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">JSON arguments</label>
      <textarea
        value={draft}
        placeholder='{ "query": "status report" }'
        rows={4}
        onChange={event => {
          setDraft(event.target.value);
          setError('');
        }}
        onBlur={() => {
          const trimmed = draft.trim();
          if (!trimmed) {
            onCommit({});
            return;
          }
          try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              setError('Use a JSON object, like { "query": "status report" }.');
              return;
            }
            onCommit(parsed as Record<string, unknown>);
          } catch {
            setError('This is not valid JSON yet.');
          }
        }}
        onKeyDown={e => e.stopPropagation()}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-300"
      />
      {error ? <p className="text-[10px] font-semibold text-red-500">{error}</p> : <FieldHelp>Optional arguments passed to the custom tool.</FieldHelp>}
    </div>
  );
};

const ToolActionConfigurator: React.FC<{
  toolName: string;
  args: Record<string, unknown>;
  onArgsChange: (args: Record<string, unknown>) => void;
}> = ({ toolName, args, onArgsChange }) => {
  const setArg = (key: string, value: unknown) => {
    const next = { ...args };
    if (value === '' || value === undefined || value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onArgsChange(next);
  };

  const setArgs = (patch: Record<string, unknown>) => onArgsChange({ ...args, ...patch });

  const renderTextField = (
    key: string,
    label: string,
    placeholder: string,
    help?: string,
    type = 'text',
  ) => (
    <div>
      <DebouncedInput
        label={label}
        type={type}
        value={String(args[key] || '')}
        placeholder={placeholder}
        onCommit={value => setArg(key, value)}
      />
      <FieldHelp>{help}</FieldHelp>
    </div>
  );

  const renderNumberField = (key: string, label: string, placeholder: string, help?: string) => (
    <div>
      <DebouncedInput
        label={label}
        type="number"
        value={args[key] == null ? '' : String(args[key])}
        placeholder={placeholder}
        onCommit={value => setArg(key, value ? Number(value) : '')}
      />
      <FieldHelp>{help}</FieldHelp>
    </div>
  );

  const renderSelect = (
    key: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    fallback: string,
    help?: string,
  ) => (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</label>
      <select
        value={String(args[key] || fallback)}
        onChange={event => setArg(key, event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 cursor-pointer"
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <FieldHelp>{help}</FieldHelp>
    </div>
  );

  if (!toolName) return null;

  if (toolName === 'setTimer') {
    const duration = Number(args.durationSeconds || 300);
    return (
      <ToolArgShell>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Timer duration</label>
          <div className="flex flex-wrap gap-2">
            {TIMER_DURATION_PRESETS.map(preset => (
              <PresetButton
                key={preset.seconds}
                active={duration === preset.seconds}
                onClick={() => setArg('durationSeconds', preset.seconds)}
              >
                {preset.label}
              </PresetButton>
            ))}
          </div>
        </div>
        {renderNumberField('durationSeconds', 'Custom seconds', '300', 'Overrides the preset duration when edited.')}
        {renderTextField('label', 'Timer label', 'Focus sprint, laundry, tea')}
      </ToolArgShell>
    );
  }

  if (toolName === 'set_alarm') {
    const days = Array.isArray(args.days) ? args.days.map(String) : [];
    return (
      <ToolArgShell>
        {renderTextField('time', 'Alarm time', '07:00', undefined, 'time')}
        {renderTextField('label', 'Alarm label', 'Morning alarm')}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Repeat</label>
          <div className="mb-2 flex flex-wrap gap-2">
            {ALARM_DAY_PRESETS.map(preset => (
              <PresetButton
                key={preset.label}
                active={JSON.stringify(days) === JSON.stringify(preset.days)}
                onClick={() => setArg('days', preset.days)}
              >
                {preset.label}
              </PresetButton>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ROUTINE_WEEKDAY_OPTIONS.map(day => (
              <PresetButton
                key={day}
                active={days.includes(day)}
                onClick={() => {
                  const next = days.includes(day) ? days.filter(item => item !== day) : [...days, day];
                  setArg('days', next);
                }}
              >
                {day}
              </PresetButton>
            ))}
          </div>
        </div>
      </ToolArgShell>
    );
  }

  if (toolName === 'create_calendar_event') {
    const startDateTime = String(args.startDateTime || '');
    const durationMinutes = Number(args.durationMinutes || 60);
    return (
      <ToolArgShell>
        {renderTextField('title', 'Event title', 'Coffee with teammate')}
        {renderTextField('startDateTime', 'Start date and time', nextLocalDateTime(60), 'Uses your local timezone.', 'datetime-local')}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Duration</label>
          <div className="flex flex-wrap gap-2">
            {CALENDAR_DURATION_PRESETS.map(preset => (
              <PresetButton
                key={preset.minutes}
                active={!args.allDay && durationMinutes === preset.minutes}
                onClick={() => setArgs({
                  durationMinutes: preset.minutes,
                  allDay: false,
                  endDateTime: addMinutesToLocalDateTime(startDateTime, preset.minutes),
                })}
              >
                {preset.label}
              </PresetButton>
            ))}
            <PresetButton
              active={args.allDay === true}
              onClick={() => setArgs({ allDay: args.allDay !== true, endDateTime: '' })}
            >
              All day
            </PresetButton>
          </div>
        </div>
        {!args.allDay && renderTextField('endDateTime', 'End date and time', addMinutesToLocalDateTime(startDateTime, durationMinutes), undefined, 'datetime-local')}
        {renderTextField('location', 'Location', 'Conference room, cafe, address')}
        <DebouncedTextArea
          label="Description"
          value={String(args.description || '')}
          placeholder="Optional notes for the calendar event"
          onCommit={value => setArg('description', value)}
          rows={2}
        />
      </ToolArgShell>
    );
  }

  if (toolName === 'get_calendar_events') {
    return (
      <ToolArgShell>
        {renderSelect('provider', 'Calendar source', [
          { value: 'auto', label: 'Auto' },
          { value: 'google', label: 'Google Calendar' },
          { value: 'outlook', label: 'Outlook Calendar' },
          { value: 'ical', label: 'Imported iCal' },
        ], 'auto')}
        {renderNumberField('maxResults', 'Max events', '10')}
        {renderTextField('timeMin', 'Start after', nextLocalDateTime(0), 'Optional range start.', 'datetime-local')}
        {renderTextField('timeMax', 'End before', nextLocalDateTime(24 * 60), 'Optional range end.', 'datetime-local')}
      </ToolArgShell>
    );
  }

  if (toolName === 'get_outlook_events') {
    return (
      <ToolArgShell>
        {renderNumberField('maxResults', 'Max events', '10')}
        {renderTextField('timeMin', 'Start after', nextLocalDateTime(0), 'Optional range start.', 'datetime-local')}
        {renderTextField('timeMax', 'End before', nextLocalDateTime(24 * 60), 'Optional range end.', 'datetime-local')}
      </ToolArgShell>
    );
  }

  if (toolName === 'saveNote') {
    return (
      <ToolArgShell>
        <DebouncedTextArea
          label="Note text"
          value={String(args.text || '')}
          placeholder="What should Curio save?"
          onCommit={value => setArg('text', value)}
        />
        {renderTextField('category', 'Category', 'general, work, home')}
      </ToolArgShell>
    );
  }

  if (toolName === 'setReminder') {
    return (
      <ToolArgShell>
        <DebouncedTextArea
          label="Reminder text"
          value={String(args.text || '')}
          placeholder="Take out recycling"
          onCommit={value => setArg('text', value)}
          rows={2}
        />
        {renderTextField('timeDescription', 'When', 'Tomorrow morning, in 20 minutes, Friday at 3 PM')}
        {renderTextField('dueDateTime', 'Exact date and time', nextLocalDateTime(120), 'Optional exact time if you want the reminder card to sort precisely.', 'datetime-local')}
      </ToolArgShell>
    );
  }

  if (toolName === 'show_joke') {
    return (
      <ToolArgShell>
        {renderTextField('setup', 'Setup', 'Why did the robot take a nap?')}
        {renderTextField('punchline', 'Punchline', 'It needed to recharge.')}
        {renderTextField('category', 'Category', 'dad joke')}
      </ToolArgShell>
    );
  }

  if (toolName === 'show_quote') {
    return (
      <ToolArgShell>
        <DebouncedTextArea label="Quote" value={String(args.quote || '')} placeholder="The quote to show" onCommit={value => setArg('quote', value)} rows={2} />
        {renderTextField('author', 'Author', 'Author name')}
      </ToolArgShell>
    );
  }

  if (toolName === 'show_fun_fact') {
    return (
      <ToolArgShell>
        <DebouncedTextArea label="Fun fact" value={String(args.fact || '')} placeholder="A useful or delightful fact" onCommit={value => setArg('fact', value)} rows={3} />
      </ToolArgShell>
    );
  }

  if (toolName === 'show_news') {
    const items = Array.isArray(args.items) ? args.items : [];
    const value = items.map(item => typeof item === 'string' ? item : String((item as { headline?: unknown }).headline || '')).filter(Boolean).join('\n');
    return (
      <ToolArgShell>
        <DebouncedTextArea
          label="Headlines"
          value={value}
          placeholder="One headline per line"
          onCommit={text => setArg('items', text.split('\n').map(line => line.trim()).filter(Boolean).map(headline => ({ headline })))}
          rows={4}
        />
        {renderTextField('source', 'Source label', 'News')}
      </ToolArgShell>
    );
  }

  if (toolName === 'show_air_quality') {
    return (
      <ToolArgShell>
        {renderNumberField('aqi', 'AQI', '58')}
        {renderSelect('category', 'Category', [
          { value: 'Good', label: 'Good' },
          { value: 'Moderate', label: 'Moderate' },
          { value: 'Unhealthy for Sensitive Groups', label: 'Unhealthy for Sensitive Groups' },
          { value: 'Unhealthy', label: 'Unhealthy' },
          { value: 'Very Unhealthy', label: 'Very Unhealthy' },
        ], 'Good')}
        {renderTextField('pollutant', 'Main pollutant', 'PM2.5')}
        {renderTextField('advice', 'Advice', 'Open windows later today')}
      </ToolArgShell>
    );
  }

  if (toolName === 'show_astronomy') {
    return (
      <ToolArgShell>
        {renderTextField('sunrise', 'Sunrise', '6:18 AM')}
        {renderTextField('sunset', 'Sunset', '7:55 PM')}
        {renderTextField('moonPhase', 'Moon phase', 'Waxing crescent')}
      </ToolArgShell>
    );
  }

  if (toolName === 'show_commute') {
    return (
      <ToolArgShell>
        {renderTextField('destination', 'Destination', 'Work, school, or address')}
        {renderTextField('duration', 'Duration', '22 min')}
        {renderTextField('traffic', 'Traffic', 'Light, moderate, heavy')}
      </ToolArgShell>
    );
  }

  if (toolName === 'get_directions' || toolName === 'show_directions') {
    return (
      <ToolArgShell>
        {renderTextField('destination', 'Destination', 'Work, home, or an address')}
        {renderTextField('origin', 'Origin', 'Current Location')}
        {renderSelect('travelMode', 'Travel mode', [
          { value: 'driving', label: 'Driving' },
          { value: 'walking', label: 'Walking' },
          { value: 'transit', label: 'Transit' },
          { value: 'bicycling', label: 'Bicycling' },
        ], 'driving')}
      </ToolArgShell>
    );
  }

  if (toolName === 'search_places') {
    return (
      <ToolArgShell>
        {renderTextField('query', 'Search for', 'coffee nearby')}
        {renderNumberField('radiusMeters', 'Radius meters', '10000')}
      </ToolArgShell>
    );
  }

  if (toolName === 'track_flight') {
    return (
      <ToolArgShell>
        {renderTextField('flightNumber', 'Flight number', 'AA123')}
        <div className="grid grid-cols-2 gap-2">
          {renderTextField('originCity', 'Origin city', 'Seattle')}
          {renderTextField('destinationCity', 'Destination city', 'New York')}
        </div>
        <FieldHelp>Use either a flight number or an origin/destination pair.</FieldHelp>
      </ToolArgShell>
    );
  }

  if (toolName === 'check_gmail' || toolName === 'check_outlook_mail') {
    return (
      <ToolArgShell>
        {renderTextField('query', 'Mail search', 'from:alex subject:invoice is:unread')}
        {renderNumberField('maxResults', 'Max messages', '10')}
      </ToolArgShell>
    );
  }

  if (toolName === 'get_slack_messages') {
    return (
      <ToolArgShell>
        {renderTextField('channel', 'Slack channel', '#general or channel ID')}
        {renderNumberField('limit', 'Message limit', '15')}
      </ToolArgShell>
    );
  }

  if (toolName === 'play_music') {
    return (
      <ToolArgShell>
        {renderTextField('query', 'Music search', 'lofi focus music')}
      </ToolArgShell>
    );
  }

  if (toolName === 'add_chore') {
    return (
      <ToolArgShell>
        {renderTextField('name', 'Chore name', 'Take out trash')}
        {renderTextField('assignee', 'Assignee', 'You')}
        {renderTextField('recurring', 'Repeats', 'daily, weekly, blank')}
      </ToolArgShell>
    );
  }

  if (toolName === 'complete_chore') {
    return (
      <ToolArgShell>
        {renderTextField('name', 'Chore to complete', 'trash, dishes, laundry')}
      </ToolArgShell>
    );
  }

  const argField = TOOL_ARG_FIELDS[toolName];
  if (argField) {
    return (
      <ToolArgShell>
        <DebouncedInput
          label="Action parameters"
          value={String(args[argField.key] || '')}
          placeholder={argField.placeholder}
          onCommit={value => setArg(argField.key, value)}
        />
        <FieldHelp>{argField.help}</FieldHelp>
      </ToolArgShell>
    );
  }

  const note = TOOL_SETUP_NOTES[toolName];
  if (note) {
    return (
      <div className="settings-unified-subpanel rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">No setup needed</div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>
      </div>
    );
  }

  return (
    <div className="settings-unified-subpanel rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Advanced action</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        This tool has no guided routine controls yet. Use custom JSON arguments if it needs inputs.
      </p>
    </div>
  );
};

// ── Step Editor ──

const StepEditor: React.FC<{
  step: RoutineStep;
  onUpdate: (updater: (s: RoutineStep) => RoutineStep) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}> = ({ step, onUpdate, onDelete, onMove, isFirst, isLast }) => {
  const c = step.config as unknown as Record<string, unknown>;
  const meta = STEP_LABELS[step.type];

  // For tool_call: track whether user picked a preset or custom
  const toolName = String(c.toolName || '');
  const isCustomTool = toolName !== '' && !TOOL_OPTIONS.some(o => o.value === toolName && o.value !== '__custom__');
  const [showCustomToolInput, setShowCustomToolInput] = useState(isCustomTool);
  const toolArgs = c.args && typeof c.args === 'object' && !Array.isArray(c.args)
    ? c.args as Record<string, unknown>
    : {};
  const updateToolArgs = (nextArgs: Record<string, unknown>) => {
    onUpdate(s => {
      const currentConfig = s.config as ToolCallStepConfig;
      return { ...s, config: { ...currentConfig, args: nextArgs } };
    });
  };

  // For ha_service
  const haService = String(c.service || '');

  return (
    <div
      data-testid="routine-step-card"
      className={`settings-unified-step settings-unified-subpanel rounded-xl border-2 p-3.5 transition-all ${step.enabled ? meta.color : 'bg-slate-50/50 border-slate-200 opacity-50'}`}
    >
      {/* Header row: type selector + controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.icon}</span>
          <select
            value={step.type}
            onChange={e => {
              const t = e.target.value as RoutineStepType;
              if (t !== step.type) {
                const fresh = createRoutineStep(t);
                onUpdate(() => ({ ...fresh, id: step.id, enabled: step.enabled }));
              }
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 outline-none cursor-pointer hover:border-slate-300 transition-colors"
          >
            {(Object.entries(STEP_LABELS) as [RoutineStepType, { icon: React.ReactNode; label: string; color: string }][]).map(([t, m]) => (
              <option key={t} value={t}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove(-1)} disabled={isFirst} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition-colors">
            <ChevronUp size={14} />
          </button>
          <button onClick={() => onMove(1)} disabled={isLast} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition-colors">
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => onUpdate(s => ({ ...s, enabled: !s.enabled }))}
            className={`rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold transition-all ${step.enabled ? 'bg-violet-500 text-white shadow-sm' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
            title={step.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
          >
            {step.enabled ? <Check size={10} /> : <Circle size={10} />}
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── speak ── */}
      {step.type === 'speak' && (
        <DebouncedInput
          label="What to say"
          value={String(c.text || '')}
          placeholder='e.g. "Good morning! Here is your day."'
          onCommit={v => onUpdate(s => ({ ...s, config: { text: v } }))}
        />
      )}

      {/* ── tool_call ── */}
      {step.type === 'tool_call' && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Action</label>
            <GroupedSelect
              value={isCustomTool || showCustomToolInput ? '__custom__' : (toolName || 'get_weather')}
              options={TOOL_OPTIONS}
              onChange={v => {
                if (v === '__custom__') {
                  setShowCustomToolInput(true);
                  onUpdate(s => ({ ...s, config: { ...s.config, toolName: '', args: {} } }));
                } else {
                  setShowCustomToolInput(false);
                  onUpdate(s => ({ ...s, config: { toolName: v, args: getDefaultToolArgs(v) } }));
                }
              }}
            />
          </div>
          {(isCustomTool || showCustomToolInput) && (
            <div className="settings-unified-subpanel rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-3">
              <div className="mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Advanced custom tool</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Use this only when you know the registered tool name. Most routines should use one of the guided actions above.
                </p>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-violet-500 mb-1.5">Custom Tool Name</label>
              <DebouncedInput
                value={toolName}
                placeholder="Enter your custom tool name (e.g. my_custom_action)"
                onCommit={v => onUpdate(s => ({ ...s, config: { ...s.config, toolName: v } }))}
              />
              <div className="mt-3">
                <JsonArgsEditor args={toolArgs} onCommit={updateToolArgs} />
              </div>
            </div>
          )}
          {!isCustomTool && !showCustomToolInput && (
            <ToolActionConfigurator toolName={toolName || 'get_weather'} args={toolArgs} onArgsChange={updateToolArgs} />
          )}
        </div>
      )}

      {/* ── show_card ── */}
      {step.type === 'show_card' && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Card type</label>
          <select
            value={String(c.type || 'list')}
            onChange={e => onUpdate(s => ({ ...s, config: { ...s.config, type: e.target.value } }))}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 cursor-pointer"
          >
            {CARD_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── ha_service ── */}
      {step.type === 'ha_service' && (
        <HaServicePicker
          service={haService}
          entityId={String(c.entityId || '')}
          onServiceChange={v => onUpdate(s => ({ ...s, config: { ...(s.config as unknown as Record<string, unknown>), service: v } as unknown as typeof s.config }))}
          onEntityChange={v => onUpdate(s => ({ ...s, config: { ...(s.config as unknown as Record<string, unknown>), entityId: v } as unknown as typeof s.config }))}
        />
      )}

      {/* ── wait ── */}
      {step.type === 'wait' && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Pause duration</label>
          <div className="flex flex-wrap gap-2">
            {WAIT_PRESETS.map(p => {
              const active = (c.durationMs as number) === p.ms;
              return (
                <button
                  key={p.ms}
                  onClick={() => onUpdate(s => ({ ...s, config: { durationMs: p.ms } }))}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    active ? 'bg-violet-500 text-white shadow-md scale-105' : 'bg-white border border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-500'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Routine Card (collapsed = summary, expanded = full editor) ──

const RoutineCard: React.FC<{
  routine: Routine;
  onUpdate: (updater: (r: Routine) => Routine) => void;
  onDelete: () => void;
  onRun: () => Promise<{ completed: boolean; error?: string } | void>;
}> = ({ routine, onUpdate, onDelete, onRun }) => {
  const [expanded, setExpanded] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const enabledSteps = routine.steps.filter(s => s.enabled);
  const meta = TRIGGER_LABELS[routine.trigger.type];

  const handleRun = useCallback(async () => {
    setRunState('running');
    try {
      const result = await onRun();
      if (result && !result.completed) {
        throw new Error(result.error || 'Routine failed');
      }
      setRunState('done');
      setTimeout(() => setRunState('idle'), 2500);
    } catch {
      setRunState('error');
      setTimeout(() => setRunState('idle'), 3000);
    }
  }, [onRun]);

  const updateStep = (stepId: string, updater: (s: RoutineStep) => RoutineStep) => {
    onUpdate(r => ({ ...r, steps: r.steps.map(s => s.id === stepId ? updater(s) : s) }));
  };

  const moveStep = (stepId: string, dir: -1 | 1) => {
    const idx = routine.steps.findIndex(s => s.id === stepId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= routine.steps.length) return;
    const next = [...routine.steps];
    [next[idx], next[target]] = [next[target], next[idx]];
    onUpdate(r => ({ ...r, steps: next }));
  };

  // Accent color for the left border based on trigger type
  const borderAccent = routine.enabled
    ? routine.trigger.type === 'voice' ? 'border-l-sky-400' :
      routine.trigger.type === 'schedule' ? 'border-l-violet-400' :
      routine.trigger.type === 'event' ? 'border-l-amber-400' :
      routine.trigger.type === 'ha_state' ? 'border-l-emerald-400' :
      routine.trigger.type === 'music' ? 'border-l-pink-400' :
      'border-l-slate-300'
    : 'border-l-slate-200';

  return (
    <div
      data-testid="routine-settings-card"
      className={`settings-unified-card rounded-2xl border border-slate-200 border-l-4 ${borderAccent} bg-white transition-all shadow-sm hover:shadow-md ${!routine.enabled ? 'opacity-60' : ''}`}
    >
      {/* -- Collapsed summary (always visible) -- */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-2xl shrink-0">{routine.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-slate-700 truncate">{routine.name}</p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>
              {meta.icon} {meta.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {triggerSummary(routine)} — {enabledSteps.length} step{enabledSteps.length !== 1 ? 's' : ''}
            {routine.lastRunAt ? ` · last run ${new Date(routine.lastRunAt).toLocaleString()}` : ''}
          </p>
          {/* Step pills preview */}
          {!expanded && enabledSteps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {enabledSteps.slice(0, 5).map(s => (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 px-2 py-0.5 text-[10px] text-slate-500 font-medium">
                  {STEP_LABELS[s.type].icon} {stepSummary(s)}
                </span>
              ))}
              {enabledSteps.length > 5 && (
                <span className="text-[10px] text-slate-400 self-center">+{enabledSteps.length - 5} more</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleRun}
            disabled={runState === 'running'}
            className={`rounded-xl px-3 py-1.5 text-[10px] font-bold shadow-sm transition-all active:scale-95 ${
              runState === 'running' ? 'bg-amber-100 text-amber-700 animate-pulse' :
              runState === 'done' ? 'bg-emerald-100 text-emerald-700' :
              runState === 'error' ? 'bg-red-100 text-red-700' :
              'bg-violet-500 text-white hover:bg-violet-600 shadow-violet-200'
            }`}
            title="Test run this routine now"
          >
            {runState === 'running' ? '⏳ Running...' :
             runState === 'done' ? '✓ Done' :
             runState === 'error' ? '✗ Error' :
             <div className="flex items-center gap-1.5">
               <Play size={12} fill="currentColor" />
               <span>Run</span>
             </div>}
          </button>
          <SettingsToggle
            label=""
            enabled={routine.enabled}
            onToggle={() => onUpdate(r => ({ ...r, enabled: !r.enabled }))}
            color="bg-violet-500"
          />
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* ── Expanded editor ── */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-5">
          {/* Name + Icon */}
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <DebouncedInput
              label="Name"
              value={routine.name}
              placeholder="Routine name"
              onCommit={v => onUpdate(r => ({ ...r, name: v || r.name }))}
            />
            <DebouncedInput
              label="Icon"
              value={routine.icon}
              placeholder="emoji"
              onCommit={v => onUpdate(r => ({ ...r, icon: v || r.icon }))}
            />
          </div>

          {/* Trigger */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Trigger</label>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.entries(TRIGGER_LABELS) as [RoutineTriggerType, { icon: React.ReactNode; label: string; color: string }][]).map(([t, m]) => (
                <button
                  key={t}
                  onClick={() => onUpdate(r => ({
                    ...r,
                    trigger: t === 'voice'
                      ? { type: 'voice', phrase: r.trigger.phrase || '' }
                      : t === 'schedule'
                        ? { type: 'schedule', cron: r.trigger.cron || '09:00', days: r.trigger.days || [1, 2, 3, 4, 5] }
                        : t === 'ha_state'
                          ? { type: 'ha_state', haEntityId: r.trigger.haEntityId || '', haState: r.trigger.haState || '' }
                          : t === 'music'
                            ? { type: 'music', musicEvent: r.trigger.musicEvent || 'play_start' }
                            : { type: 'event', event: r.trigger.event || 'session_start' },
                  }))}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    routine.trigger.type === t
                      ? 'bg-violet-500 text-white shadow-md shadow-violet-200 scale-105'
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-violet-300 hover:text-violet-500'
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {routine.trigger.type === 'voice' && (
              <div
                data-testid="routine-trigger-panel"
                className="settings-unified-subpanel rounded-xl border border-sky-100 bg-sky-50/50 p-3"
              >
                <DebouncedInput
                  label="Trigger phrase"
                  value={routine.trigger.phrase || ''}
                  placeholder='Say "start focus" to trigger'
                  onCommit={v => onUpdate(r => ({ ...r, trigger: { type: 'voice', phrase: v } }))}
                />
              </div>
            )}

            {routine.trigger.type === 'schedule' && (
              <div
                data-testid="routine-trigger-panel"
                className="settings-unified-subpanel rounded-xl border border-violet-100 bg-violet-50/30 p-3 space-y-3"
              >
                <DebouncedInput
                  label="Time"
                  value={routine.trigger.cron || '09:00'}
                  placeholder="HH:MM (e.g. 09:00)"
                  type="time"
                  onCommit={v => onUpdate(r => ({ ...r, trigger: { ...r.trigger, type: 'schedule', cron: v || '09:00' } }))}
                />
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Days</label>
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map(d => {
                      const active = (routine.trigger.days || []).includes(d.value);
                      return (
                        <button
                          key={d.value}
                          onClick={() => onUpdate(r => {
                            const cur = r.trigger.days || [];
                            const next = active ? cur.filter(x => x !== d.value) : [...cur, d.value].sort();
                            return { ...r, trigger: { ...r.trigger, type: 'schedule', days: next } };
                          })}
                          className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${
                            active ? 'bg-violet-500 text-white shadow-sm' : 'bg-white text-slate-400 border border-slate-200 hover:border-violet-300'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {routine.trigger.type === 'event' && (
              <div
                data-testid="routine-trigger-panel"
                className="settings-unified-subpanel flex gap-2 rounded-xl border border-amber-100 bg-amber-50/30 p-3"
              >
                {(['session_start', 'session_end'] as RoutineEventKind[]).map(ek => (
                  <button
                    key={ek}
                    onClick={() => onUpdate(r => ({ ...r, trigger: { type: 'event', event: ek } }))}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                      routine.trigger.event === ek
                        ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                        : 'bg-white text-slate-500 border border-slate-200 hover:border-amber-300'
                    }`}
                  >
                    {EVENT_LABELS[ek]}
                  </button>
                ))}
              </div>
            )}

            {routine.trigger.type === 'ha_state' && (
              <div
                data-testid="routine-trigger-panel"
                className="settings-unified-subpanel rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 space-y-2.5"
              >
                <DebouncedInput
                  label="Entity ID"
                  value={routine.trigger.haEntityId || ''}
                  placeholder="Entity ID (e.g. binary_sensor.front_door)"
                  onCommit={v => onUpdate(r => ({ ...r, trigger: { ...r.trigger, type: 'ha_state', haEntityId: v } }))}
                />
                <DebouncedInput
                  label="Match state"
                  value={routine.trigger.haState || ''}
                  placeholder="State to match (e.g. on, open) — leave empty for any change"
                  onCommit={v => onUpdate(r => ({ ...r, trigger: { ...r.trigger, type: 'ha_state', haState: v } }))}
                />
              </div>
            )}

            {routine.trigger.type === 'music' && (
              <div
                data-testid="routine-trigger-panel"
                className="settings-unified-subpanel flex gap-2 rounded-xl border border-pink-100 bg-pink-50/30 p-3"
              >
                {(['play_start', 'play_stop'] as RoutineMusicEvent[]).map(me => (
                  <button
                    key={me}
                    onClick={() => onUpdate(r => ({ ...r, trigger: { type: 'music', musicEvent: me } }))}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                      routine.trigger.musicEvent === me
                        ? 'bg-pink-500 text-white shadow-md shadow-pink-200'
                        : 'bg-white text-slate-500 border border-slate-200 hover:border-pink-300'
                    }`}
                  >
                    {MUSIC_EVENT_LABELS[me]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Steps ({routine.steps.length})
                </label>
              </div>
              {routine.steps.length < MAX_STEPS_PER_ROUTINE && (
                <button
                  onClick={() => onUpdate(r => ({ ...r, steps: [...r.steps, createRoutineStep('speak')] }))}
                  className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-1.5 text-[11px] font-bold text-violet-600 transition-all hover:bg-violet-100 hover:shadow-sm active:scale-95"
                >
                  + Add Step
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              {routine.steps.map((step, i) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  onUpdate={updater => updateStep(step.id, updater)}
                  onDelete={() => onUpdate(r => ({ ...r, steps: r.steps.filter(s => s.id !== step.id) }))}
                  onMove={dir => moveStep(step.id, dir)}
                  isFirst={i === 0}
                  isLast={i === routine.steps.length - 1}
                />
              ))}
              {routine.steps.length === 0 && (
                <div className="settings-unified-subpanel rounded-xl border-2 border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
                  <div className="flex justify-center mb-3 text-slate-300">
                    <Plus size={24} />
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    No steps yet. Add one above to define what this routine does.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Delete routine */}
          <button
            onClick={onDelete}
            className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-500 transition-all hover:bg-red-100 hover:border-red-300 active:scale-[0.98]"
          >
            Delete Routine
          </button>
        </div>
      )}
    </div>
  );
};

// ── Main Section ──

const RoutinesSection: React.FC<RoutinesSectionProps> = ({ routines, setRoutines }) => {
  const { emitCardEvent } = useCardManager();

  const updateRoutine = useCallback((id: string, updater: (r: Routine) => Routine) => {
    setRoutines(routines.map(r => r.id === id ? updater(r) : r));
  }, [routines, setRoutines]);

  const runRoutine = useCallback(async (routine: Routine) => {
    const { executeRoutine } = await import('../../../services/routineEngine');
    const result = await executeRoutine({ ...routine, enabled: true }, {
      emitCardEvent,
      speak: (text) => requestAmbientSpeech({ text, reason: 'routine' }),
    });
    if (result.completed) {
      markRoutineRunAt(routine.id);
    }
    return result;
  }, [emitCardEvent]);

  return (
    <SettingsSection title="Routines" icon={<Zap size={18} className="text-amber-500" />}>
      <div data-testid="routines-settings-scope" className="settings-consistency-scope space-y-3">
        {routines.length === 0 && (
          <div className="settings-unified-card rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-full bg-violet-100 text-violet-600">
                <Zap size={32} />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-600">No routines yet</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xs mx-auto">
              Create a routine to automate actions like reading the weather, showing your calendar, or controlling smart home devices.
            </p>
          </div>
        )}

        {routines.map(routine => (
          <RoutineCard
            key={routine.id}
            routine={routine}
            onUpdate={updater => updateRoutine(routine.id, updater)}
            onDelete={() => setRoutines(routines.filter(r => r.id !== routine.id))}
            onRun={() => runRoutine(routine)}
          />
        ))}

        {routines.length < MAX_ROUTINES && (
          <button
            onClick={() => setRoutines([...routines, createBlankRoutine()])}
            className="flex items-center justify-center gap-2 w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-400 transition-all hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50/50 active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>Add Routine</span>
          </button>
        )}

        {routines.length > 0 && (
          <p className="text-[10px] text-slate-400 leading-relaxed px-1">
            Tap to expand and edit. Voice routines trigger when you say the phrase. Scheduled routines run automatically. Say "list my routines" to the AI to see them.
          </p>
        )}
      </div>
    </SettingsSection>
  );
};

export default React.memo(RoutinesSection);
