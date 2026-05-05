import React, { useCallback, useSyncExternalStore } from 'react';
import { getCardEnabled, setCardEnabled, subscribeToSettingsStorage, type CardToggleKey } from '../../utils/settingsStorage';
import SettingsToggle from './SettingsToggle';

interface CardInfo {
  key: CardToggleKey;
  label: string;
  icon: string;
  description: string;
}

const CARD_GROUPS: { group: string; cards: CardInfo[] }[] = [
  {
    group: 'Core',
    cards: [
      { key: 'weather', label: 'Weather', icon: '🌤️', description: 'Current weather conditions' },
      { key: 'timer', label: 'Timer', icon: '⏱️', description: 'Countdown timers' },
      { key: 'alarm', label: 'Alarms', icon: '⏰', description: 'Alarm management' },
      { key: 'reminder', label: 'Reminders', icon: '🔔', description: 'Task reminders' },
      { key: 'calendar', label: 'Calendar', icon: '📅', description: 'Upcoming events' },
      { key: 'stopwatch', label: 'Stopwatch', icon: '⏲️', description: 'Stopwatch counter' },
    ],
  },
  {
    group: 'Smart Home',
    cards: [
      { key: 'device', label: 'Devices', icon: '💡', description: 'Smart home device controls' },
      { key: 'media', label: 'Media Players', icon: '📺', description: 'HA media player controls' },
      { key: 'camera', label: 'Cameras', icon: '📷', description: 'HA camera feeds' },
      { key: 'thermostat', label: 'Thermostat', icon: '🌡️', description: 'Climate controls' },
    ],
  },
  {
    group: 'Information',
    cards: [
      { key: 'news', label: 'News', icon: '📰', description: 'News headlines' },
      { key: 'finance', label: 'Finance', icon: '📈', description: 'Stock & crypto prices' },
      { key: 'airQuality', label: 'Air Quality', icon: '🌬️', description: 'AQI & pollution data' },
      { key: 'astronomy', label: 'Astronomy', icon: '🔭', description: 'Sunrise, sunset, moon' },
      { key: 'commute', label: 'Commute', icon: '🚗', description: 'Traffic & travel time' },
      { key: 'map', label: 'Directions', icon: '🗺️', description: 'Navigation & maps' },
    ],
  },
  {
    group: 'Knowledge',
    cards: [
      { key: 'definition', label: 'Definitions', icon: '📖', description: 'Word definitions' },
      { key: 'calculation', label: 'Calculations', icon: '🧮', description: 'Math results' },
      { key: 'unitConversion', label: 'Unit Conversion', icon: '🔄', description: 'Unit conversions' },
      { key: 'translation', label: 'Translation', icon: '🌐', description: 'Language translations' },
      { key: 'recipe', label: 'Recipes', icon: '🍳', description: 'Cooking recipes' },
    ],
  },
  {
    group: 'Entertainment',
    cards: [
      { key: 'music', label: 'Music', icon: '🎵', description: 'In-app music player' },
      { key: 'youtube', label: 'YouTube', icon: '▶️', description: 'YouTube videos' },
      { key: 'image', label: 'Images', icon: '🖼️', description: 'Image search results' },
      { key: 'joke', label: 'Jokes', icon: '😂', description: 'Joke cards with reveal' },
      { key: 'trivia', label: 'Trivia', icon: '🧠', description: 'Interactive quiz' },
      { key: 'quote', label: 'Quotes', icon: '💬', description: 'Inspirational quotes' },
      { key: 'funFact', label: 'Fun Facts', icon: '💡', description: 'Interesting facts' },
      { key: 'sportsScore', label: 'Sports', icon: '⚽', description: 'Sports scores' },
    ],
  },
  {
    group: 'Other',
    cards: [
      { key: 'list', label: 'Lists', icon: '📋', description: 'Notes & lists' },
      { key: 'chore', label: 'Chores', icon: '✅', description: 'Chore & task tracker' },
      { key: 'energy', label: 'Energy', icon: '⚡', description: 'Home energy dashboard' },
      { key: 'security', label: 'Security', icon: '🔒', description: 'Alarm & lock status' },
      { key: 'flight', label: 'Flights', icon: '✈️', description: 'Flight tracking' },
      { key: 'gmail', label: 'Gmail', icon: '📧', description: 'Gmail inbox & search' },
    ],
  },
];

const ALL_CARD_KEYS: CardToggleKey[] = [
  'weather', 'timer', 'alarm', 'reminder', 'calendar', 'stopwatch',
  'device', 'media', 'camera', 'thermostat',
  'news', 'finance', 'airQuality', 'astronomy', 'commute', 'map',
  'definition', 'calculation', 'unitConversion', 'translation', 'recipe',
  'music', 'youtube', 'image', 'joke', 'trivia', 'quote', 'funFact', 'sportsScore',
  'list', 'chore', 'energy', 'security', 'flight', 'gmail',
];

// Cached snapshot to avoid infinite re-render loop with useSyncExternalStore
let _cachedTogglesJson = '';
let _cachedToggles: Record<CardToggleKey, boolean> = {} as Record<CardToggleKey, boolean>;

function getCardTogglesSnapshot(): Record<CardToggleKey, boolean> {
  const result = {} as Record<CardToggleKey, boolean>;
  for (const key of ALL_CARD_KEYS) {
    result[key] = getCardEnabled(key);
  }
  const json = JSON.stringify(result);
  if (json !== _cachedTogglesJson) {
    _cachedTogglesJson = json;
    _cachedToggles = result;
  }
  return _cachedToggles;
}

const CardTogglesSection: React.FC = () => {
  const toggles = useSyncExternalStore(subscribeToSettingsStorage, getCardTogglesSnapshot, () => _cachedToggles);

  const handleToggle = useCallback((key: CardToggleKey) => {
    const current = toggles[key] !== false; // default true
    setCardEnabled(key, !current);
  }, [toggles]);

  return (
    <div className="space-y-4">
      {CARD_GROUPS.map(({ group, cards }) => (
        <div key={group}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{group}</p>
          <div className="space-y-1">
            {cards.map(({ key, label, icon, description }) => (
              <SettingsToggle
                key={key}
                label={`${icon} ${label}`}
                description={description}
                enabled={toggles[key] !== false}
                onToggle={() => handleToggle(key)}
                color="bg-violet-500"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CardTogglesSection;
