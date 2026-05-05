// Card type identifiers
export type CardType =
  | 'device' | 'weather' | 'timer' | 'media' | 'calculation' | 'reminder'
  | 'image' | 'youtube' | 'music' | 'news' | 'funFact' | 'definition' | 'list'
  | 'quote' | 'sportsScore' | 'recipe' | 'translation' | 'finance' | 'stopwatch'
  | 'calendar' | 'alarm' | 'map' | 'places' | 'airQuality' | 'joke' | 'trivia'
  | 'unitConversion' | 'astronomy' | 'commute' | 'camera' | 'thermostat'
  | 'sensorReading' | 'homeStatus' | 'obsidianNote'
  | 'chore' | 'energy' | 'security' | 'flight' | 'gmail'
  | 'outlookMail' | 'slack' | 'github';

// Card event emitted by interceptor/analyzer
export interface CardEvent {
  type: CardType | string;
  data: Record<string, unknown>;
  autoDismissMs?: number;
  persistent?: boolean;
}

// Internal card state managed by reducer
export interface Card {
  id: string;
  type: CardType | string;
  data: Record<string, unknown>;
  createdAt: number;
  autoDismissMs: number;
  persistent: boolean;
  animationState: 'entering' | 'visible' | 'exiting' | 'removed';
}

// Reducer actions
export type CardAction =
  | { type: 'ADD_CARD'; payload: CardEvent }
  | { type: 'REMOVE_CARD'; payload: { id: string } }
  | { type: 'UPDATE_CARD'; payload: { id: string; data: Partial<Card['data']> } }
  | { type: 'SET_ANIMATION_STATE'; payload: { id: string; state: Card['animationState'] } }
  | { type: 'DISMISS_ALL' }
  | { type: 'DISMISS_CAMERA' };

// Props passed to every card type component
export interface CardComponentProps {
  card: Card;
  onDismiss: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}

// Card type registry entry
export interface CardTypeRegistration {
  component: React.ComponentType<CardComponentProps>;
  defaultAutoDismissMs: number;
}

// Card Manager context value
export interface CardManagerContextValue {
  cards: Card[];
  dispatch: React.Dispatch<CardAction>;
  emitCardEvent: (event: CardEvent) => void;
  registerCardType: (type: string, registration: CardTypeRegistration) => void;
  enabled: boolean;
  registry: ReadonlyMap<string, CardTypeRegistration>;
  pauseTimer: (cardId: string) => void;
  resumeTimer: (cardId: string) => void;
}

// --- Data interfaces for each card type ---

export type DeviceSupportedAction = 'turn_on' | 'turn_off' | 'toggle' | 'lock' | 'unlock' | 'open_cover' | 'close_cover' | 'stop_cover';

export type DeviceControlKind = 'toggle' | 'lock' | 'cover' | 'readonly';

export type MediaSupportedAction = 'media_play' | 'media_pause' | 'media_next_track';

export interface DeviceCardData {
  entityId: string;
  friendlyName: string;
  domain: string;
  action: string;
  state: string;
  resolvedState?: string;
  controlKind: string;
  supportedActions: DeviceSupportedAction[];
  error?: string;
}

export interface WeatherCardData {
  temperature: number;
  condition: string;
  high: number;
  low: number;
  humidity?: number;
  forecastMode?: boolean;
  forecast?: Array<{ time: string; temp: number; condition: string }>;
  daily?: Array<{ date: string; highF: number; lowF: number; highC: number; lowC: number; condition: string; humidity?: number }>;
  unit: 'F' | 'C';
}

export interface TimerCardData {
  timerId?: string;
  label: string;
  isAlarm: boolean;
  targetTime: number;
  duration: number;
  completionState: 'running' | 'completed' | 'dismissed';
}

export interface MediaCardData {
  entityId: string;
  playerName: string;
  playbackState: 'playing' | 'paused' | 'idle';
  trackTitle?: string;
  artistName?: string;
  supportedActions: MediaSupportedAction[];
}

export interface CalculationCardData {
  equation: string;
  result: string;
}

export interface ReminderCardData {
  text: string;
  scheduledTime: string;
  dueDateTime?: string;
}

export interface ImageCardData {
  imageUrl: string;
  caption: string;
}

export interface YouTubeCardData {
  videoId?: string;
  searchQuery?: string;
  title?: string;
}

export type MusicPlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export interface MusicCardData {
  playerId: string;
  videoId: string | null;
  id?: string | null;
  uri?: string;
  itemType?: 'track' | 'album' | 'artist' | 'playlist';
  query: string;
  title: string;
  artistOrChannel: string;
  thumbnailUrl: string;
  albumName?: string;
  externalUrl?: string;
  playbackState: MusicPlaybackState;
  currentTimeSeconds: number;
  durationSeconds: number;
  volume: number;
  source: 'youtube' | 'spotify';
  error?: string;
  autoplayBlocked?: boolean;
}

export interface NewsCardData {
  items: Array<{
    headline: string;
    source: string;
    summary: string;
    url?: string;
  }>;
}

export interface FunFactCardData {
  fact: string;
}

export interface DefinitionCardData {
  word: string;
  pronunciation?: string;
  partOfSpeech?: string;
  definition: string;
}

export interface ListCardData {
  title: string;
  items: string[];
  itemIds?: string[];
  deletable?: boolean;
}

export interface QuoteCardData {
  quote: string;
  author: string;
}

export interface SportsScoreCardData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  homeLogoUrl?: string;
  awayLogoUrl?: string;
}

export interface RecipeCardData {
  title: string;
  ingredients: string[];
  steps: string[];
}

export interface TranslationCardData {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface StopwatchCardData {
  startTime: number;
  pausedElapsed: number;
  running: boolean;
}

export interface FinanceCardData {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  currency?: string;
  marketCap?: string;
}

// --- New card data interfaces ---

export interface CalendarCardData {
  events: Array<{
    id?: string;
    title: string;
    startTime: string;
    endTime?: string;
    location?: string;
    description?: string;
    allDay?: boolean;
  }>;
  date: string;
  mode?: 'view' | 'created' | 'updated' | 'deleted';
  message?: string;
}

export interface AlarmCardData {
  alarms: Array<{
    id: string;
    label: string;
    time: string; // HH:mm
    enabled: boolean;
    days?: string[]; // e.g. ['Mon','Tue']
    targetTime?: number;
  }>;
  mode: 'list' | 'ringing';
  ringingAlarmId?: string;
}

export interface MapCardData {
  origin?: string;
  destination: string;
  travelMode: 'driving' | 'walking' | 'transit' | 'bicycling';
  distance?: string;
  duration?: string;
  steps?: Array<{ instruction: string; distance: string }>;
  mapUrl?: string;
  encodedPolyline?: string;
  staticMapUrl?: string;
}

export interface PlacesCardData {
  query: string;
  places: Array<{
    name: string;
    address: string;
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    openNow?: boolean;
    location?: { latitude: number; longitude: number };
    staticMapUrl?: string;
    mapsUrl?: string;
  }>;
  centerMapUrl?: string;
}

export interface AirQualityCardData {
  aqi: number;
  category: string;
  pollutant?: string;
  pm25?: number;
  pm10?: number;
  o3?: number;
  no2?: number;
  advice?: string;
}

export interface JokeCardData {
  setup: string;
  punchline: string;
  category?: string;
}

export interface TriviaCardData {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  category?: string;
  revealed?: boolean;
}

export interface UnitConversionCardData {
  fromValue: number;
  fromUnit: string;
  toValue: number;
  toUnit: string;
  category: string; // e.g. 'length', 'weight', 'temperature', 'volume'
}

export interface AstronomyCardData {
  sunrise?: string;
  sunset?: string;
  moonPhase?: string;
  moonIllumination?: number;
  dayLength?: string;
  goldenHour?: string;
  nextEvent?: string;
  nextEventTime?: string;
}

export interface CommuteCardData {
  origin: string;
  destination: string;
  duration: string;
  durationInTraffic?: string;
  distance: string;
  trafficCondition: 'light' | 'moderate' | 'heavy' | 'unknown';
  route?: string;
  departureTime?: string;
}

export interface CameraCardData {
  entityId: string;
  cameraName: string;
  streamUrl?: string;
  snapshotUrl?: string;
  haUrl?: string;
  haToken?: string;
  isStreaming: boolean;
  cameras?: { entity_id: string; name: string }[];
}

export interface ThermostatCardData {
  entityId: string;
  name: string;
  currentTemp: number;
  targetTemp: number;
  hvacMode: 'heat' | 'cool' | 'heat_cool' | 'auto' | 'off' | 'fan_only' | 'dry';
  humidity?: number;
  unit: 'F' | 'C';
  supportedModes: string[];
}

// Timer persistence
export interface PersistedTimer {
  id: string;
  label: string;
  isAlarm: boolean;
  targetTime: number;
  duration: number;
  createdAt: number;
}

// ── Sensor reading card (temperature, humidity, etc. from HA sensors) ──

export interface SensorReadingCardData {
  entityId: string;
  friendlyName: string;
  value: string;
  unit?: string;
  deviceClass?: string; // 'temperature', 'humidity', 'pressure', 'battery', etc.
  area?: string;
  icon?: string;
}

// ── Home status card (doors, garage, motion, presence) ──

export type HomeStatusKind = 'door' | 'garage' | 'motion' | 'presence' | 'window';

export interface HomeStatusItem {
  entityId: string;
  friendlyName: string;
  state: string; // 'open', 'closed', 'on', 'off', 'home', 'not_home', etc.
  area?: string;
  icon?: string;
}

export interface HomeStatusCardData {
  kind: HomeStatusKind;
  title: string;
  items: HomeStatusItem[];
  query?: string; // original user query
}

// ── Obsidian note card ──

export interface ObsidianNoteCardData {
  title: string;
  content: string;
  path?: string;
  matches?: Array<{ filename: string; context?: string }>;
  mode: 'view' | 'search' | 'created' | 'appended';
}

// ── Chore/Task rotation card ──

export interface ChoreItem {
  id: string;
  name: string;
  assignee?: string;
  category?: string;
  dueDate?: string; // ISO date string
  dueDateTime?: string; // ISO date-time string
  completed: boolean;
  priority?: 'high' | 'medium' | 'low';
  recurring?: 'daily' | 'weekly' | 'monthly';
  lastCompleted?: string;
}

export interface ChoreCardData {
  title: string;
  chores: ChoreItem[];
  mode: 'list' | 'updated';
  message?: string;
}

// ── Energy dashboard card ──

export interface EnergyCardData {
  currentUsageW?: number;
  todayKwh?: number;
  monthKwh?: number;
  solarProductionW?: number;
  solarTodayKwh?: number;
  gridImportW?: number;
  gridExportW?: number;
  batteryPercent?: number;
  batteryCharging?: boolean;
  costToday?: number;
  costCurrency?: string;
  sources?: Array<{ name: string; watts: number; color?: string }>;
}

// ── Security card ──

export interface SecurityCardData {
  alarmState: 'disarmed' | 'armed_home' | 'armed_away' | 'armed_night' | 'triggered' | 'pending' | 'arming' | 'unknown';
  alarmEntityId?: string;
  alarmName?: string;
  locks?: Array<{ entityId: string; name: string; state: 'locked' | 'unlocked' | 'unknown'; area?: string }>;
  recentEvents?: Array<{ time: string; description: string; type: 'motion' | 'door' | 'lock' | 'alarm' }>;
}

// ── Flight tracking card ──

export interface FlightCardData {
  flightNumber: string;
  airline?: string;
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | 'unknown';
  departureScheduled?: string;
  departureActual?: string;
  arrivalScheduled?: string;
  arrivalActual?: string;
  delayMinutes?: number;
  gate?: string;
  terminal?: string;
  aircraft?: string;
  altitude?: number;
  speed?: number;
  progress?: number; // 0-100
}

// ── Gmail card ──

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  labels?: string[];
}

export interface GmailCardData {
  messages: GmailMessage[];
  totalUnread?: number;
  mode: 'inbox' | 'thread' | 'sent' | 'search';
  query?: string;
  threadSubject?: string;
  threadMessages?: Array<{ from: string; body: string; date: string }>;
}

// ── Outlook Mail card ──

export interface OutlookMailMessage {
  id: string;
  conversationId: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  body?: string;
}

export interface OutlookMailCardData {
  messages: OutlookMailMessage[];
  totalUnread?: number;
  mode: 'inbox' | 'thread' | 'sent' | 'search';
  query?: string;
  threadSubject?: string;
  threadMessages?: Array<{ from: string; body: string; date: string }>;
}

// ── Slack card ──

export interface SlackChannel {
  id: string;
  name: string;
  isIm?: boolean;
  isMpim?: boolean;
}

export interface SlackMessage {
  id: string;
  channel: string;
  user: string;
  text: string;
  timestamp: string;
}

export interface SlackCardData {
  channel: string;
  channelName?: string;
  messages: SlackMessage[];
  mode: 'messages' | 'sent';
  offline?: boolean;
  cachedAt?: string;
}
