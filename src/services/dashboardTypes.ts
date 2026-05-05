export type DashboardWidgetType =
  | "robot_face"
  | "ha_camera"
  | "ha_light"
  | "ha_sensor"
  | "ha_climate"
  | "ha_cover"
  | "ha_media_player"
  | "ha_select"
  | "ha_button_stack"
  | "ha_calendar"
  | "ha_vacuum"
  | "ha_printer"
  | "ha_energy"
  | "weather"
  | "forecast"
  | "clock"
  | "calendar"
  | "commute"
  | "ha_entities"
  | "timers"
  | "music"
  | "youtube_video"
  | "air_quality"
  | "reminders"
  | "alerts"
  | "greeting"
  | "quote"
  | "fun_fact"
  | "astronomy"
  | "notes"
  | "rich_note"
  | "table"
  | "date_info"
  | "system_status"
  | "quick_actions"
  | "tasks"
  | "mail"
  | "messages"
  | "ai_chat"
  | "world_clock"
  | "map"
  | "profile"
  | "daily_summary"
  | "health"
  | "bookmarks"
  | "pomodoro"
  | "habits"
  | "screen_time"
  | "stock"
  | "portfolio"
  | "news"
  | "sketch"
  | "chores"
  | "gmail"
  | "outlook_mail"
  | "slack"
  | "obsidian_notes"
  | "notion_notes"
  | "google_tasks"
  | "notion_projects"
  | "google_calendar"
  | "outlook_calendar"
  | "ical_calendar"
  | "alarms"
  | "stopwatch"
  | "analog_clock"
  | "image_gallery"
  | "github";

export type DashboardWidgetSize = "small" | "medium" | "large" | "xlarge";
export type DashboardLayoutMode = "grid" | "freeform";
export type DashboardPageThemeMode = "light" | "dark";
export type DashboardPageBackgroundStyle =
  | "default"
  | "solid"
  | "gradient"
  | "image"
  | "animated";
export type DashboardAnimationPreset =
  | "matrix"
  | "particles"
  | "waves"
  | "starfield"
  | "aurora"
  | "plasma"
  | "grid"
  | "generated";
export const DASHBOARD_ANIMATION_PRESETS: DashboardAnimationPreset[] = [
  "matrix",
  "particles",
  "waves",
  "starfield",
  "aurora",
  "plasma",
  "grid",
  "generated",
];
export type DashboardGeneratedAnimationKind =
  | "particles"
  | "mesh"
  | "waves"
  | "rain"
  | "snow"
  | "fire"
  | "embers"
  | "lightning"
  | "fog"
  | "bubbles"
  | "orbits"
  | "ribbons"
  | "grid"
  | "nebula"
  | "constellation"
  | "scanlines"
  | "radar"
  | "auroraCurtain"
  | "energyRibbons"
  | "dataStorm"
  | "wormhole";
export const DASHBOARD_GENERATED_ANIMATION_KINDS: DashboardGeneratedAnimationKind[] = [
  "particles",
  "mesh",
  "waves",
  "rain",
  "snow",
  "fire",
  "embers",
  "lightning",
  "fog",
  "bubbles",
  "orbits",
  "ribbons",
  "grid",
  "nebula",
  "constellation",
  "scanlines",
  "radar",
  "auroraCurtain",
  "energyRibbons",
  "dataStorm",
  "wormhole",
];
export type DashboardGeneratedAnimationShape =
  | "dots"
  | "lines"
  | "rings"
  | "glyphs";
export const DASHBOARD_GENERATED_ANIMATION_SHAPES: DashboardGeneratedAnimationShape[] = [
  "dots",
  "lines",
  "rings",
  "glyphs",
];
export type DashboardGeneratedAnimationDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "radial";
export const DASHBOARD_GENERATED_ANIMATION_DIRECTIONS: DashboardGeneratedAnimationDirection[] = [
  "up",
  "down",
  "left",
  "right",
  "radial",
];
export type DashboardGeneratedAnimationBlendMode =
  | "source-over"
  | "screen"
  | "lighter"
  | "overlay"
  | "multiply";
export const DASHBOARD_GENERATED_ANIMATION_BLEND_MODES: DashboardGeneratedAnimationBlendMode[] = [
  "source-over",
  "screen",
  "lighter",
  "overlay",
  "multiply",
];
export interface DashboardGeneratedAnimationLayer {
  kind: DashboardGeneratedAnimationKind;
  colors: string[];
  density?: number;
  speed?: number;
  complexity?: number;
  opacity?: number;
  blendMode?: DashboardGeneratedAnimationBlendMode;
  depth?: number;
  scale?: number;
  trail?: number;
  pulse?: number;
  turbulence?: number;
  blur?: number;
  shape?: DashboardGeneratedAnimationShape;
  direction?: DashboardGeneratedAnimationDirection;
  glow?: boolean;
}
export interface DashboardGeneratedAnimationSpec {
  kind: DashboardGeneratedAnimationKind;
  colors: string[];
  density: number;
  speed: number;
  complexity: number;
  shape?: DashboardGeneratedAnimationShape;
  direction?: DashboardGeneratedAnimationDirection;
  glow?: boolean;
  layers?: DashboardGeneratedAnimationLayer[];
}
export type DashboardAccentPreset =
  | "cobalt"
  | "champagne"
  | "verdant"
  | "graphite"
  | "aurora"
  | "neon"
  | "coral"
  | "moss"
  | "orchid"
  | "sunrise"
  | "arctic"
  | "ember";
export type DashboardCommuteTarget = "home" | "work" | "custom";
export type DashboardTravelMode =
  | "driving"
  | "walking"
  | "bicycling"
  | "transit";
export type DashboardCalendarProvider = "auto" | "google" | "outlook" | "ical" | "zapier" | "mcp";
export type DashboardMailProvider = "auto" | "gmail" | "outlook" | "zapier" | "mcp";
export type DashboardMessagesProvider = "slack" | "mock" | "mcp";
export type DashboardMapTarget = "current" | "home" | "work" | "custom";
export type DashboardProfileStatus = "focus" | "available" | "away" | "offline";
export type DashboardHealthRange = "day" | "week";
export type DashboardNotesProvider = "internal" | "obsidian" | "notion" | "zapier" | "mcp";
export type DashboardTaskProvider = "internal" | "google" | "notion" | "zapier" | "mcp";
export type DashboardNewsProvider = "grounded" | "nytimes" | "combined_world" | "custom_rss";

export type DashboardGitHubTransport = "auto" | "api" | "mcp";
export type DashboardGitHubView =
  | "overview"
  | "pull_requests"
  | "issues"
  | "repos"
  | "notifications"
  | "workflow_runs"
  | "projects"
  | "releases"
  | "profile";
export type DashboardGitHubScope = "me" | "repo";
export type DashboardGitHubInvolvement =
  | "author"
  | "assignee"
  | "review-requested"
  | "mentions";
export type DashboardGitHubItemState = "open" | "closed" | "all";
export type DashboardAiChatTone = "balanced" | "concise" | "friendly" | "technical" | "creative";
export type DashboardAiChatDensity = "comfortable" | "compact";
export type DashboardAiChatTextSize = "small" | "medium" | "large";

export interface DashboardNewsCustomFeed {
  id: string;
  label: string;
  url: string;
  categoryIds: string[];
  enabled?: boolean;
}
export type DashboardCalendarDesign = "list" | "studio";
export type DashboardMusicSource = "youtube" | "spotify";
export type DashboardMusicDesign = "curio" | "spotify";
export type DashboardRichNoteColor =
  | "canary"
  | "rose"
  | "mint"
  | "sky"
  | "lavender"
  | "peach";
export type DashboardClockDesign =
  | "minimal"
  | "classical"
  | "classical_black_white"
  | "regulator"
  | "railway"
  | "marine"
  | "modern"
  | "instrument";

export type DashboardHaDeviceIcon =
  | "auto"
  | "lightbulb"
  | "lamp"
  | "thermometer"
  | "droplets"
  | "power"
  | "motion"
  | "sun"
  | "door"
  | "gauge"
  | "home"
  | "fan"
  | "flame"
  | "switch"
  | "outlet"
  | "button";
export type DashboardHaDisplaySize = "compact" | "standard" | "large";
export type DashboardRobotFit = "contain" | "cover" | "float";
export type DashboardRobotFaceStyle = "curio" | "astro" | "kiro" | "bender";
export type DashboardRobotWanderMode = "off" | "idle" | "full";
export type DashboardDailySummaryModule =
  | "calendar"
  | "weather"
  | "tasks"
  | "notifications"
  | "devices"
  | "routines"
  | "air";
export type DashboardSystemStatusModule =
  | "network"
  | "voice"
  | "homeAssistant"
  | "storage"
  | "performance"
  | "device"
  | "browser";
export type DashboardActivityModule =
  | "dashboardTime"
  | "aiMessages"
  | "responseCards"
  | "widgetInteractions"
  | "dashboardVisits"
  | "topWidget"
  | "activeHour"
  | "weeklyTrend"
  | "focusScore"
  | "localPrivacy";

export const DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS: Array<{
  id: DashboardSystemStatusModule;
  label: string;
  description: string;
}> = [
  {
    id: "network",
    label: "Network",
    description: "Online state and browser-reported connection estimates.",
  },
  {
    id: "voice",
    label: "Voice",
    description: "Current assistant voice or AI backend.",
  },
  {
    id: "homeAssistant",
    label: "Home Assistant",
    description: "Home Assistant bridge and runtime connection.",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Browser storage usage and local app data.",
  },
  {
    id: "performance",
    label: "Performance",
    description: "Runtime uptime and browser memory when available.",
  },
  {
    id: "device",
    label: "Device",
    description: "Browser-exposed CPU, memory, and touch capability hints.",
  },
  {
    id: "browser",
    label: "Browser",
    description: "Browser, platform, and kiosk runtime details.",
  },
];

export const DASHBOARD_ACTIVITY_MODULE_OPTIONS: Array<{
  id: DashboardActivityModule;
  label: string;
  description: string;
}> = [
  {
    id: "dashboardTime",
    label: "Dashboard time",
    description: "Time spent viewing the dashboard today.",
  },
  {
    id: "aiMessages",
    label: "AI messages",
    description: "Typed and spoken prompts sent to Curio.",
  },
  {
    id: "responseCards",
    label: "Cards created",
    description: "Response cards and tool surfaces generated today.",
  },
  {
    id: "widgetInteractions",
    label: "Widget taps",
    description: "Clicks and taps inside dashboard widgets.",
  },
  {
    id: "dashboardVisits",
    label: "Visits",
    description: "Dashboard sessions opened today.",
  },
  {
    id: "topWidget",
    label: "Top widget",
    description: "Widget type used most often today.",
  },
  {
    id: "activeHour",
    label: "Active hour",
    description: "The hour with the most dashboard time.",
  },
  {
    id: "weeklyTrend",
    label: "Weekly trend",
    description: "Seven-day activity bars and totals.",
  },
  {
    id: "focusScore",
    label: "Focus score",
    description: "A light signal for calm usage versus interaction churn.",
  },
  {
    id: "localPrivacy",
    label: "Privacy",
    description: "A reminder that insights are stored locally.",
  },
];

export type DashboardPortfolioRange = "1d" | "1w" | "1m" | "3m" | "ytd" | "1y" | "5y";

export interface DashboardPortfolioHolding {
  id: string;
  symbol: string;
  shares: number;
  name?: string;
}

export interface DashboardTableCellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
}

export interface DashboardRichNoteItem {
  id: string;
  title: string;
  html: string;
  color: DashboardRichNoteColor;
  createdAt?: number;
  updatedAt?: number;
}

export interface DashboardWorldClockCity {
  label: string;
  timeZone: string;
}

export type DashboardDateInfoMetric =
  | "dayOfYear"
  | "daysLeft"
  | "calendarWeek"
  | "isoWeek"
  | "yearProgress"
  | "monthProgress"
  | "quarter"
  | "daysInMonth"
  | "fiscalYear"
  | "fiscalQuarter"
  | "fiscalWeek"
  | "fiscalDaysLeft";

export interface DashboardDateInfoImportantDate {
  id: string;
  label: string;
  date: string;
  recurringAnnual?: boolean;
  color?: string;
}

export interface DashboardWidgetConfig {
  w?: number;
  h?: number;
  city?: string;
  maxItems?: number;
  calendarProvider?: DashboardCalendarProvider;
  calendarSourceId?: string;
  calendarDesign?: DashboardCalendarDesign;
  domain?: string;
  entityIds?: string[];
  commuteTarget?: DashboardCommuteTarget;
  customDestination?: string;
  galleryImageIds?: string[];
  galleryImages?: string[];
  travelMode?: DashboardTravelMode;
  showMapPreview?: boolean;
  showDate?: boolean;
  notesProvider?: DashboardNotesProvider;
  taskProvider?: DashboardTaskProvider;
  notionQuery?: string;
  notionSourceId?: string;
  notionSourceTitle?: string;
  notionSourceUrl?: string;
  zapierQuery?: string;
  zapierSourceId?: string;
  zapierSourceTitle?: string;
  zapierSourceUrl?: string;
  /** ID of the connected generic MCP server to pull from when the
   * widget's provider is set to `"mcp"`. When empty the first enabled
   * general-kind MCP server is used. */
  mcpServerId?: string;
  /** Optional natural-language hint passed to the MCP tool finder. */
  mcpQuery?: string;
  /** Optional Slack channel query for the Messages widget via an MCP.
   * Typical value: a channel name, channel ID, or keyword. */
  mcpChannelQuery?: string;
  /**
   * Optional exact tool name to call on the selected MCP server. When set,
   * widget helpers skip the heuristic tool-matcher and invoke this tool
   * directly. Paste the name from the Settings → External MCP Servers
   * "N tools available" disclosure list.
   */
  mcpToolName?: string;
  /**
   * Optional exact tool name used for "send"-style actions on widgets
   * that support sending (Mail compose). When unset, the heuristic
   * matcher looks for a send/email tool on the selected MCP server.
   */
  mcpSendToolName?: string;
  /**
   * Optional exact tool name used for "reply"-style actions on the
   * Mail widget. When unset, the heuristic matcher looks for a
   * reply-capable tool on the selected MCP server.
   */
  mcpReplyToolName?: string;
  mailProvider?: DashboardMailProvider;
  messagesProvider?: DashboardMessagesProvider;
  aiChatTitle?: string;
  aiChatSystemPrompt?: string;
  aiChatTone?: DashboardAiChatTone;
  aiChatHistoryLimit?: number;
  aiChatShowTimestamps?: boolean;
  aiChatAllowUploads?: boolean;
  aiChatVoiceInput?: boolean;
  aiChatToolUse?: boolean;
  aiChatDensity?: DashboardAiChatDensity;
  aiChatTextSize?: DashboardAiChatTextSize;
  channelId?: string;
  channelName?: string;
  timezones?: string[];
  worldClockCities?: DashboardWorldClockCity[];
  forecastCities?: string[];
  dateInfoMetrics?: DashboardDateInfoMetric[];
  dateInfoImportantDates?: DashboardDateInfoImportantDate[];
  dateInfoFiscalYearStartMonth?: number;
  dateInfoShowWeekNumbers?: boolean;
  mapTarget?: DashboardMapTarget;
  customLocation?: string;
  profileStatus?: DashboardProfileStatus;
  focusLabel?: string;
  healthRange?: DashboardHealthRange;
  timerView?: "all" | "alarms";
  stepGoal?: number;
  moveGoal?: number;
  standGoal?: number;
  exerciseGoal?: number;
  workMins?: number;
  breakMins?: number;
  stopwatchRunning?: boolean;
  stopwatchStartedAt?: number;
  stopwatchElapsedMs?: number;
  stopwatchLaps?: number[];
  stopwatchRequestNonce?: number;
  symbols?: string;
  portfolioHoldings?: DashboardPortfolioHolding[];
  portfolioRange?: DashboardPortfolioRange;
  newsTopic?: string;
  newsProvider?: DashboardNewsProvider;
  newsCategory?: string;
  newsCustomFeedUrl?: string;
  newsCustomFeeds?: DashboardNewsCustomFeed[];
  quoteSource?: 'zenquotes' | 'local';
  quoteSelectedIndex?: number;
  musicSource?: DashboardMusicSource;
  musicDesign?: DashboardMusicDesign;
  youtubeQuery?: string;
  youtubeVideoId?: string;
  youtubeTitle?: string;
  youtubeAutoplay?: boolean;
  youtubeStartSeconds?: number;
  youtubeRequestNonce?: number;
  richNoteTitle?: string;
  richNoteHtml?: string;
  richNoteColor?: DashboardRichNoteColor;
  richNotes?: DashboardRichNoteItem[];
  richNoteActiveId?: string;
  richNotePinnedToGrid?: boolean;
  tableTitle?: string;
  tableCells?: string[][];
  tableHeaderRow?: boolean;
  tableHeaderColor?: string;
  tableColumnWidths?: number[];
  tableCellStyles?: Record<string, DashboardTableCellStyle>;
  tableShowRowNumbers?: boolean;
  tableSortColumn?: number;
  tableSortDirection?: 'asc' | 'desc';
  dailySummaryModules?: DashboardDailySummaryModule[];
  systemStatusModules?: DashboardSystemStatusModule[];
  activityModules?: DashboardActivityModule[];
  accentOverride?: string;
  glowEnabled?: boolean;
  glassEnabled?: boolean;
  clockDesign?: DashboardClockDesign;
  showSecondsHand?: boolean;
  lightShowBrightness?: boolean;
  lightShowColor?: boolean;
  lightShowTemp?: boolean;

  haShowControls?: boolean;
  haShowEntityIds?: boolean;
  haMediaShowArtwork?: boolean;
  haMediaShowVolume?: boolean;
  haMediaShowSourceSelect?: boolean;
  haCameraChromeHidden?: boolean;
  haPrinterShowCamera?: boolean;
  haRoomNames?: string[];
  robotAccentColor?: string;
  robotFaceStyle?: DashboardRobotFaceStyle;
  robotFit?: DashboardRobotFit;
  robotShowGlow?: boolean;
  robotFloatingEnabled?: boolean;
  robotFloatingX?: number;
  robotFloatingY?: number;
  robotFloatingSize?: number;
  robotWanderMode?: DashboardRobotWanderMode;
  robotBubblesEnabled?: boolean;
  robotBubbleEmail?: boolean;
  robotBubbleMessages?: boolean;
  robotBubbleCalendar?: boolean;
  robotBubbleReminders?: boolean;
  robotBubbleNotifications?: boolean;
  robotBubbleWidgetData?: boolean;
  robotBubbleCompanion?: boolean;
  displayName?: string;
  haDeviceIcon?: DashboardHaDeviceIcon;
  haDisplaySize?: DashboardHaDisplaySize;
  haShowLiveBadge?: boolean;
  refreshMode?: "push" | "timed" | "manual";
  refreshIntervalMinutes?: number;
  refreshOnFocus?: boolean;
  showRefreshMetadata?: boolean;

  // GitHub widget settings. Applied by the shared GitHubWidget
  // component; each controls a dimension of what the widget fetches and
  // how it renders across the 1x1 through 5x6 size range.
  githubTransport?: DashboardGitHubTransport;
  githubView?: DashboardGitHubView;
  githubScope?: DashboardGitHubScope;
  githubOwner?: string;
  githubRepo?: string;
  githubInvolvement?: DashboardGitHubInvolvement;
  githubItemState?: DashboardGitHubItemState;
  githubShowStats?: boolean;
  githubShowAvatars?: boolean;
  githubShowLabels?: boolean;
  githubShowProfile?: boolean;
  githubOrgLogin?: string;
  githubProjectScope?: "user" | "org";

  // Dashboard interactivity upgrades
  // Cross-widget dataflow references
  linkedTaskId?: string;
  linkedCommuteId?: string;
  linkedMusicWidgetId?: string;
  linkedWidgetIds?: string[];

  // Per-widget pinning (Mail, YouTube, HaEntities, News, ...)
  pinnedItemIds?: string[];

  // Per-widget overrides for board-level interactivity settings.
  // Presence (not value) determines whether the per-widget override wins.
  ambientPulseEnabled?: boolean;
  freshnessDotEnabled?: boolean;
  swipeGesturesEnabled?: boolean;
  dragReorderEnabled?: boolean;
  rollingNumbersEnabled?: boolean;
  widgetPinningEnabled?: boolean;

  // Widget-specific interactivity wins
  seekBarLiveSyncEnabled?: boolean; // NowPlaying
  breathingRingEnabled?: boolean; // Pomodoro
  valueMorphEnabled?: boolean; // AirQuality, Stocks, etc.
  clockOffsetPreviewEnabled?: boolean; // WorldClock
  pinchZoomEnabled?: boolean; // ImageGallery
  ttsWordHighlightEnabled?: boolean; // RichNote

  // Sparkline history config; store default is 60 samples.
  sparklineMaxSamples?: number;
}

export const DASHBOARD_CLOCK_DESIGN_OPTIONS: Array<{
  value: DashboardClockDesign;
  label: string;
  description: string;
}> = [
  {
    value: "minimal",
    label: "Minimal",
    description: "Quiet porcelain dial with airy markers.",
  },
  {
    value: "classical",
    label: "Classical",
    description: "Warm roman numerals and refined blue hands.",
  },
  {
    value: "classical_black_white",
    label: "Classical B/W",
    description: "Traditional black-and-white dial with every hour number visible.",
  },
  {
    value: "regulator",
    label: "Regulator",
    description: "Ivory regulator dial with brass trim and roman numerals.",
  },
  {
    value: "railway",
    label: "Railway",
    description: "Clean station-clock markers with a crisp red seconds hand.",
  },
  {
    value: "marine",
    label: "Marine",
    description: "Chronometer-inspired face with navy hands and brass casework.",
  },
  {
    value: "modern",
    label: "Modern",
    description: "Glassy studio face with crisp cardinals.",
  },
  {
    value: "instrument",
    label: "Instrument",
    description: "Dark precision dial with luminous markers.",
  },
];

export const DASHBOARD_MUSIC_SOURCE_OPTIONS: Array<{
  value: DashboardMusicSource;
  label: string;
  description: string;
}> = [
  {
    value: "youtube",
    label: "YouTube",
    description: "Search YouTube Music and play inside Curio.",
  },
  {
    value: "spotify",
    label: "Spotify",
    description: "Search Spotify and control an active Spotify device.",
  },
];

export const DASHBOARD_MUSIC_DESIGN_OPTIONS: Array<{
  value: DashboardMusicDesign;
  label: string;
  description: string;
}> = [
  {
    value: "curio",
    label: "Curio",
    description: "Waveform-first Curio media controls.",
  },
  {
    value: "spotify",
    label: "Spotify",
    description: "Dark album-art player with green playback controls.",
  },
];

export interface DashboardWidgetFreeformLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
}

export interface DashboardWidgetLayout {
  freeform?: DashboardWidgetFreeformLayout;
}

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  position: number;
  size: DashboardWidgetSize;
  config: DashboardWidgetConfig;
  enabled: boolean;
  layout?: DashboardWidgetLayout;
}

export interface DashboardPage {
  id: string;
  name: string;
  appearance?: DashboardPageAppearance;
  widgets: DashboardWidget[];
  createdAt: number;
  updatedAt: number;
}

export interface DashboardPageAppearance {
  themeMode?: DashboardPageThemeMode;
  accentPreset?: DashboardAccentPreset;
  accentColor?: string;
  backgroundStyle?: DashboardPageBackgroundStyle;
  backgroundColor?: string;
  glassEffectEnabled?: boolean;
  animationPreset?: DashboardAnimationPreset;
  generatedAnimation?: DashboardGeneratedAnimationSpec;
}

export type DashboardAnimationIntensity = 'off' | 'subtle' | 'full';

export interface DashboardInteractivitySettings {
  animationIntensity: DashboardAnimationIntensity;

  // Ambient / status
  ambientPulseEnabled: boolean;
  freshnessDotEnabled: boolean;
  staleRevalidateSheenEnabled: boolean;

  // Direct manipulation
  swipeGesturesEnabled: boolean;
  doubleClickEditEnabled: boolean;
  dragReorderEnabled: boolean;

  // Discovery
  commandPaletteEnabled: boolean;

  // Cross-widget dataflow
  dropIntentsEnabled: boolean;
  hoverSelectionBusEnabled: boolean;

  // State + UX
  undoToastsEnabled: boolean;
  widgetPinningEnabled: boolean;
  relativeTimeHintsEnabled: boolean;
  rollingNumbersEnabled: boolean;
  inlineQuickAddEnabled: boolean;
  optimisticActionsEnabled: boolean;
  insightsActionsEnabled: boolean;
  ariaLiveUpdatesEnabled: boolean;
  sparklineHistoryEnabled: boolean;
}

export const DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS: DashboardInteractivitySettings = {
  animationIntensity: 'full',
  ambientPulseEnabled: true,
  freshnessDotEnabled: true,
  staleRevalidateSheenEnabled: true,
  swipeGesturesEnabled: true,
  doubleClickEditEnabled: true,
  dragReorderEnabled: true,
  commandPaletteEnabled: true,
  dropIntentsEnabled: true,
  hoverSelectionBusEnabled: true,
  undoToastsEnabled: true,
  widgetPinningEnabled: true,
  relativeTimeHintsEnabled: true,
  rollingNumbersEnabled: true,
  inlineQuickAddEnabled: true,
  optimisticActionsEnabled: true,
  insightsActionsEnabled: true,
  ariaLiveUpdatesEnabled: true,
  sparklineHistoryEnabled: true,
};

export interface DashboardBoardPreferences {
  mode: DashboardLayoutMode;
  snapToGrid: boolean;
  accentPreset: DashboardAccentPreset;
  accentColor?: string;
  glassEffectEnabled: boolean;
  glassEffectIntensity: number;
  reduceMotion: boolean;
  widgetGlowEnabled: boolean;
  showPageSwitcher: boolean;
  pageKeyboardShortcutsEnabled: boolean;
  interactivity: DashboardInteractivitySettings;
}

export interface DashboardWidgetCatalogItem {
  type: DashboardWidgetType;
  label: string;
  icon: string;
  defaultSize: DashboardWidgetSize;
  description: string;
  category:
    | "Personal"
    | "Productivity"
    | "Communication"
    | "Context"
    | "Media"
    | "Smart Home"
    | "System";
  keywords?: string[];
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export const MAX_DASHBOARD_WIDGETS = 48;

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardBoardPreferences = {
  mode: "grid",
  snapToGrid: true,
  accentPreset: "cobalt",
  glassEffectEnabled: true,
  glassEffectIntensity: 50,
  reduceMotion: false,
  widgetGlowEnabled: false,
  showPageSwitcher: true,
  pageKeyboardShortcutsEnabled: true,
  interactivity: DEFAULT_DASHBOARD_INTERACTIVITY_SETTINGS,
};
export const WIDGET_CATALOG: DashboardWidgetCatalogItem[] = [
  {
    type: "image_gallery",
    label: "Image Gallery",
    icon: "🖼️",
    category: "Media",
    description: "Upload and swipe through your favorite photos.",
    defaultSize: "large",
    minW: 2,
    minH: 2,
  },
  {
    type: "profile",
    label: "Profile",
    icon: "🪪",
    defaultSize: "medium",
    description:
      "Dynamic operator profile, recognition source, and current status.",
    category: "Personal",
    keywords: ["identity", "user", "operator", "status"],
    minW: 1,
    minH: 1,
    maxW: 8,
    maxH: 6,
  },
  {
    type: "daily_summary",
    label: "Daily Summary",
    icon: "🌤",
    defaultSize: "xlarge",
    description:
      "A premium overview of your day, next event, and task pressure.",
    category: "Personal",
    keywords: ["summary", "overview", "greeting", "briefing"],
    minW: 2,
    minH: 2,
    maxW: 8,
    maxH: 6,
  },
  {
    type: "health",
    label: "Activity",
    icon: "🫀",
    defaultSize: "large",
    description: "Daily movement, stand, exercise, and wellness-style stats.",
    category: "Personal",
    keywords: ["health", "fitness", "rings", "steps", "heart"],
    minW: 2,
    minH: 2,
    maxW: 6,
    maxH: 6,
  },
  {
    type: "greeting",
    label: "Greeting",
    icon: "👋",
    defaultSize: "large",
    description: "Shows the greeting, user name, and date.",
    category: "Personal",
    keywords: ["hello", "summary"],
  },
  {
    type: "tasks",
    label: "Tasks",
    icon: "✅",
    defaultSize: "medium",
    description: "Interactive to-dos with quick add, priority, edit, and complete.",
    category: "Productivity",
    keywords: ["todo", "checklist", "tasks"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 5,
  },
  {
    type: "notes",
    label: "Notes",
    icon: "📝",
    defaultSize: "medium",
    description: "Recent notes saved in Curio.",
    category: "Productivity",
    keywords: ["notes", "memo", "ideas"],
  },
  {
    type: "rich_note",
    label: "Sticky Note",
    icon: "🗒️",
    defaultSize: "large",
    description:
      "A rich sticky note for pasted formatted text, lists, screenshots, and images.",
    category: "Productivity",
    keywords: ["sticky", "note", "rich text", "formatted", "word", "paste", "image"],
    minW: 2,
    minH: 2,
    maxW: 6,
    maxH: 6,
  },
  {
    type: "table",
    label: "Table",
    icon: "▦",
    defaultSize: "large",
    description:
      "Editable dashboard table that can be created manually or pasted from Word, Sheets, or Excel.",
    category: "Productivity",
    keywords: ["table", "spreadsheet", "grid", "excel", "sheets", "word", "paste"],
    minW: 4,
    minH: 3,
    maxW: 8,
    maxH: 6,
  },
  {
    type: "calendar",
    label: "Calendar",
    icon: "📆",
    defaultSize: "large",
    description: "Upcoming calendar events from Google, Outlook, Zapier, or imported iCal sources.",
    category: "Productivity",
    keywords: ["events", "schedule", "agenda", "ical", "ics", "zapier"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 6,
  },
  {
    type: "reminders",
    label: "Reminders",
    icon: "🔔",
    defaultSize: "medium",
    description: "Upcoming reminders saved in Curio.",
    category: "Productivity",
    keywords: ["alerts", "remind", "due"],
  },
  {
    type: "alerts",
    label: "Alerts",
    icon: "!",
    defaultSize: "large",
    description: "Priority notification cards from the Curio notification center.",
    category: "Productivity",
    keywords: ["alerts", "notifications", "activity", "priority"],
    minW: 2,
    minH: 2,
    maxW: 6,
    maxH: 4,
  },
  {
    type: "timers",
    label: "Timers",
    icon: "⏱",
    defaultSize: "small",
    description: "All active timers and alarms from Curio.",
    category: "Productivity",
    keywords: ["timer", "alarm"],
  },
  {
    type: "mail",
    label: "Mail",
    icon: "📧",
    defaultSize: "large",
    description:
      "Email preview for Gmail, Outlook, or Zapier with provider-aware fallback.",
    category: "Communication",
    keywords: ["email", "gmail", "outlook", "zapier", "inbox"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "messages",
    label: "Messages",
    icon: "💬",
    defaultSize: "large",
    description: "Slack or mock message feed with quick context switching.",
    category: "Communication",
    keywords: ["slack", "chat", "messages", "inbox"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "ai_chat",
    label: "AI Chat",
    icon: "AI",
    defaultSize: "xlarge",
    description: "Dashboard chat bot with rich replies, image and chart rendering, HTML/CSS previews, voice input, file attachments, and local history.",
    category: "Communication",
    keywords: ["ai", "chat", "bot", "assistant", "llm", "voice", "files", "images", "charts", "html", "markdown"],
    minW: 3,
    minH: 3,
    maxW: 8,
    maxH: 7,
  },
  {
    type: "weather",
    label: "Weather",
    icon: "🌤",
    defaultSize: "large",
    description: "Current temperature, conditions, and forecast context.",
    category: "Context",
    keywords: ["weather", "forecast", "temperature"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 5,
  },
  {
    type: "forecast",
    label: "Weather Outlook",
    icon: "🌦",
    defaultSize: "large",
    description: "Five-day outlook across multiple tracked cities.",
    category: "Context",
    keywords: ["forecast", "weather", "outlook", "cities"],
    minW: 2,
    minH: 3,
  },
  {
    type: "clock",
    label: "Clock",
    icon: "🕐",
    defaultSize: "medium",
    description: "Large digital clock that follows display settings.",
    category: "Context",
    keywords: ["time", "clock"],
  },
  {
    type: "world_clock",
    label: "World Clock",
    icon: "🌍",
    defaultSize: "large",
    description: "Local time plus a configurable world clock stack.",
    category: "Context",
    keywords: ["timezone", "clock", "world", "time"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 5,
  },
  {
    type: "commute",
    label: "Traffic",
    icon: "🚗",
    defaultSize: "medium",
    description: "Travel time to home, work, or a custom destination.",
    category: "Context",
    keywords: ["traffic", "route", "directions", "commute"],
  },
  {
    type: "map",
    label: "Map",
    icon: "🗺",
    defaultSize: "large",
    description: "Location map for current, home, work, or a custom place.",
    category: "Context",
    keywords: ["map", "location", "directions", "place"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 5,
  },
  {
    type: "air_quality",
    label: "Air Quality",
    icon: "🌬",
    defaultSize: "small",
    description: "Animated AQI effects and guidance for the current weather location.",
    category: "Context",
    keywords: ["air", "aqi", "environment", "pollution"],
    minW: 1,
    minH: 1,
    maxW: 4,
    maxH: 4,
  },
  {
    type: "astronomy",
    label: "Astronomy",
    icon: "🌅",
    defaultSize: "medium",
    description: "Animated sun path, daylight, sunset, and moon phase for your location.",
    category: "Context",
    keywords: ["sunrise", "sunset", "moon", "daylight", "astronomy"],
  },
  {
    type: "date_info",
    label: "Date Info",
    icon: "📆",
    defaultSize: "medium",
    description: "Editable date facts, mini month, fiscal calendar, expanded calendar, and important dates.",
    category: "Context",
    keywords: ["date", "calendar", "week", "month", "fiscal", "year", "events"],
  },
  {
    type: "music",
    label: "Now Playing",
    icon: "🎵",
    defaultSize: "large",
    description:
      "Current in-app music playback state with richer media context.",
    category: "Media",
    keywords: ["music", "player", "audio", "now playing"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 4,
  },
  {
    type: "youtube_video",
    label: "YouTube",
    icon: "▶️",
    defaultSize: "large",
    description:
      "Search YouTube, browse results, and play video inline with tap controls.",
    category: "Media",
    keywords: ["youtube", "video", "watch", "search", "player"],
    minW: 2,
    minH: 2,
    maxW: 8,
    maxH: 8,
  },
  {
    type: "quote",
    label: "Quote",
    icon: "💬",
    defaultSize: "medium",
    description: "ZenQuotes-backed quote rotation with manual picking and timing controls.",
    category: "Media",
    keywords: ["quote", "inspiration", "zenquotes"],
  },
  {
    type: "fun_fact",
    label: "Fun Fact",
    icon: "🧠",
    defaultSize: "medium",
    description: "Hourly fun facts from Useless Facts with a local fallback.",
    category: "Media",
    keywords: ["fact", "learn", "info", "useless facts"],
  },
  {
    type: "robot_face",
    label: "Robot Face",
    icon: "🤖",
    defaultSize: "xlarge",
    description: "The interactive AI robot face.",
    category: "Smart Home",
    keywords: ["face", "robot", "assistant"],
    minW: 1,
    minH: 1,
    maxW: 6,
    maxH: 6,
  },
  {
    type: "ha_camera",
    label: "Camera",
    icon: "📹",
    defaultSize: "large",
    description: "Live or snapshot view of a Home Assistant camera entity.",
    category: "Smart Home",
    keywords: ["camera", "security", "home assistant"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "ha_light",
    label: "Light Controller",
    icon: "💡",
    defaultSize: "small",
    description: "Toggle and control Home Assistant lights.",
    category: "Smart Home",
    keywords: ["lights", "smart home", "home assistant"],
    minW: 2,
    minH: 2,
    maxW: 3,
    maxH: 3,
  },
  {
    type: "ha_sensor",
    label: "Sensor Value",
    icon: "🌡️",
    defaultSize: "small",
    description: "Display a value from a Home Assistant sensor entity.",
    category: "Smart Home",
    keywords: ["sensor", "temperature", "motion", "door", "presence"],
    minW: 2,
    minH: 2,
    maxW: 3,
    maxH: 3,
  },
  {
    type: "ha_climate",
    label: "Climate",
    icon: "🌡️",
    defaultSize: "medium",
    description: "Glass-style thermostat with target temperature and modes.",
    category: "Smart Home",
    keywords: ["thermostat", "climate", "heat", "cool", "home assistant", "glass"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 4,
  },
  {
    type: "ha_cover",
    label: "Cover / Shutter",
    icon: "🪟",
    defaultSize: "medium",
    description: "Open, close, stop, and position blinds, covers, doors, and shutters.",
    category: "Smart Home",
    keywords: ["cover", "blind", "shade", "shutter", "garage", "glass"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 4,
  },
  {
    type: "ha_media_player",
    label: "HA Media Player",
    icon: "🎛️",
    defaultSize: "medium",
    description: "Control a Home Assistant media player with artwork, transport, sources, and volume.",
    category: "Smart Home",
    keywords: ["media", "speaker", "tv", "music", "artwork", "source", "glass"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 4,
  },
  {
    type: "ha_select",
    label: "Select",
    icon: "☑️",
    defaultSize: "small",
    description: "Dropdown-style control for HA select and input_select entities.",
    category: "Smart Home",
    keywords: ["select", "dropdown", "mode", "option", "glass"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 4,
  },
  {
    type: "ha_button_stack",
    label: "Button Stack",
    icon: "🔘",
    defaultSize: "medium",
    description: "Glass-style button grid for scenes, scripts, buttons, switches, and lights.",
    category: "Smart Home",
    keywords: ["button", "scene", "script", "actions", "sub controls", "glass"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "ha_calendar",
    label: "HA Calendar",
    icon: "🗓️",
    defaultSize: "medium",
    description: "Upcoming events from a Home Assistant calendar entity.",
    category: "Smart Home",
    keywords: ["calendar", "events", "schedule", "glass"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "ha_vacuum",
    label: "Vacuum",
    icon: "🧭",
    defaultSize: "medium",
    description: "Glass-inspired vacuum status with start, pause, home, and locate controls.",
    category: "Smart Home",
    keywords: ["vacuum", "cleaner", "robot", "glass"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "ha_printer",
    label: "3D Printer",
    icon: "🖨️",
    defaultSize: "large",
    description: "Glass-style 3D printer progress, camera preview, action buttons, status, and temps.",
    category: "Smart Home",
    keywords: ["printer", "3d printer", "bambu", "creality", "moonraker", "klipper", "camera", "pause", "glass"],
    minW: 2,
    minH: 2,
    maxW: 6,
    maxH: 5,
  },
  {
    type: "ha_energy",
    label: "Energy",
    icon: "⚡",
    defaultSize: "medium",
    description: "Glass-inspired power and energy sensor summary.",
    category: "Smart Home",
    keywords: ["energy", "power", "solar", "grid", "battery", "glass"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "ha_entities",
    label: "Home",
    icon: "🏠",
    defaultSize: "medium",
    description: "Status snapshot from Home Assistant.",
    category: "Smart Home",
    keywords: ["home", "smart home", "devices"],
  },
  {
    type: "system_status",
    label: "System",
    icon: "📡",
    defaultSize: "medium",
    description: "Configurable system health, network, storage, device, browser, and integration status.",
    category: "System",
    keywords: ["system", "status", "connections", "device", "storage", "browser"],
    minW: 2,
    minH: 2,
    maxW: 4,
    maxH: 4,
  },
  {
    type: "quick_actions",
    label: "Quick Actions",
    icon: "⚡",
    defaultSize: "medium",
    description: "Shortcut buttons for common voice commands.",
    category: "System",
    keywords: ["actions", "shortcuts", "voice"],
  },
  {
    type: "bookmarks",
    label: "Bookmarks",
    icon: "🔖",
    defaultSize: "medium",
    description: "Quick access links with automated icons.",
    category: "Productivity",
    keywords: ["links", "web", "browser"],
    minW: 2,
    minH: 2,
  },
  {
    type: "pomodoro",
    label: "Pomodoro",
    icon: "⏲️",
    defaultSize: "medium",
    description: "Focus timer with work/break intervals.",
    category: "Productivity",
    keywords: ["timer", "focus", "work"],
    minW: 2,
    minH: 2,
  },
  {
    type: "habits",
    label: "Habits",
    icon: "📈",
    defaultSize: "medium",
    description: "Track daily habits and build streaks.",
    category: "Productivity",
    keywords: ["tracking", "goals", "streaks"],
    minW: 2,
    minH: 2,
  },
  {
    type: "screen_time",
    label: "Insights",
    icon: "📊",
    defaultSize: "large",
    description: "Local Curio usage insights for dashboard time, AI messages, cards, widget taps, visits, and weekly trends.",
    category: "Personal",
    keywords: ["usage", "screen", "insights", "analytics", "dashboard", "messages"],
    minW: 2,
    minH: 2,
    maxW: 8,
    maxH: 8,
  },
  {
    type: "stock",
    label: "Stocks",
    icon: "📈",
    defaultSize: "medium",
    description: "Real-time market watchlist for stocks and funds.",
    category: "Productivity",
    keywords: ["market", "finance", "trading", "watchlist"],
    minW: 2,
    minH: 2,
  },
  {
    type: "portfolio",
    label: "Portfolio",
    icon: "💼",
    defaultSize: "large",
    description: "Track holdings, live value, gains, losses, and historical portfolio charts. Shrinks to a 1x1 total tile.",
    category: "Productivity",
    keywords: ["portfolio", "market", "finance", "stocks", "holdings", "investment"],
    minW: 1,
    minH: 1,
    maxW: 6,
    maxH: 5,
  },
  {
    type: "news",
    label: "News",
    icon: "📰",
    defaultSize: "large",
    description: "Personalized news feed based on your interests.",
    category: "Media",
    keywords: ["feed", "rss", "articles"],
    minW: 2,
    minH: 2,
  },
  {
    type: "sketch",
    label: "Freeform",
    icon: "✏️",
    defaultSize: "large",
    description:
      "Canvas for sketching, shapes, notes, files, and connected diagrams.",
    category: "Productivity",
    keywords: ["draw", "sketch", "whiteboard", "freeform", "diagram", "files"],
    minW: 2,
    minH: 2,
    maxW: 6,
    maxH: 6,
  },
  {
    type: "chores",
    label: "Chores",
    icon: "🧹",
    defaultSize: "medium",
    description:
      "Dedicated household chores surface with its own categories, timing, and priorities.",
    category: "Productivity",
    keywords: ["chores", "household", "tasks"],
    minW: 2,
    minH: 2,
  },
  {
    type: "gmail",
    label: "Gmail",
    icon: "📮",
    defaultSize: "large",
    description: "Dedicated Gmail inbox surface with reply support.",
    category: "Communication",
    keywords: ["gmail", "mail", "email"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "outlook_mail",
    label: "Outlook Mail",
    icon: "📨",
    defaultSize: "large",
    description: "Dedicated Outlook inbox surface with reply support.",
    category: "Communication",
    keywords: ["outlook", "mail", "email"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "slack",
    label: "Slack Channel",
    icon: "🟣",
    defaultSize: "large",
    description: "Focused Slack channel widget with offline cache fallback.",
    category: "Communication",
    keywords: ["slack", "messages", "channel"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 5,
  },
  {
    type: "obsidian_notes",
    label: "Obsidian Notes",
    icon: "📓",
    defaultSize: "medium",
    description: "Recent notes written to Obsidian from Curio.",
    category: "Productivity",
    keywords: ["obsidian", "vault", "notes"],
    minW: 2,
    minH: 2,
  },
  {
    type: "notion_notes",
    label: "Notion Notes",
    icon: "📝",
    defaultSize: "medium",
    description: "Notes and pages loaded directly from the connected Notion MCP server.",
    category: "Productivity",
    keywords: ["notion", "notes", "pages", "mcp"],
    minW: 2,
    minH: 2,
  },
  {
    type: "google_tasks",
    label: "Google Tasks",
    icon: "📋",
    defaultSize: "medium",
    description:
      "Dedicated Google Tasks list with add, complete, and delete controls.",
    category: "Productivity",
    keywords: ["google tasks", "tasks", "todo"],
    minW: 2,
    minH: 2,
  },
  {
    type: "notion_projects",
    label: "Notion Projects",
    icon: "🗂️",
    defaultSize: "medium",
    description: "Projects and tasks loaded directly from the connected Notion MCP server.",
    category: "Productivity",
    keywords: ["notion", "projects", "tasks", "mcp"],
    minW: 2,
    minH: 2,
  },
  {
    type: "google_calendar",
    label: "Google Calendar",
    icon: "🗓️",
    defaultSize: "large",
    description:
      "Google Calendar agenda widget with provider pinned to Google.",
    category: "Productivity",
    keywords: ["google calendar", "calendar", "agenda"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 6,
  },
  {
    type: "outlook_calendar",
    label: "Outlook Calendar",
    icon: "📆",
    defaultSize: "large",
    description:
      "Outlook Calendar agenda widget with provider pinned to Outlook.",
    category: "Productivity",
    keywords: ["outlook calendar", "calendar", "agenda"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 6,
  },
  {
    type: "ical_calendar",
    label: "iCal Calendar",
    icon: "📥",
    defaultSize: "large",
    description:
      "Read-only agenda widget for imported .ics and .ical calendar files.",
    category: "Productivity",
    keywords: ["ical", "ics", "apple calendar", "imported calendar", "agenda"],
    minW: 2,
    minH: 2,
    maxW: 5,
    maxH: 6,
  },
  {
    type: "alarms",
    label: "Alarms",
    icon: "⏰",
    defaultSize: "small",
    description: "Alarm-focused timer widget for active alarms only.",
    category: "Productivity",
    keywords: ["alarm", "clock", "wake"],
    minW: 2,
    minH: 2,
  },
  {
    type: "stopwatch",
    label: "Stopwatch",
    icon: "⏱️",
    defaultSize: "medium",
    description: "Count up elapsed time with start, pause, laps, and reset.",
    category: "Productivity",
    keywords: ["stopwatch", "elapsed", "lap", "timer", "count up"],
    minW: 1,
    minH: 1,
  },
  {
    type: "analog_clock",
    label: "Analog Clock",
    icon: "🕰️",
    defaultSize: "medium",
    description: "A premium analog timepiece with smooth hand movements.",
    category: "Context",
    keywords: ["time", "clock", "analog"],
    minW: 1,
    minH: 1,
  },
  {
    type: "github",
    label: "GitHub",
    icon: "🐙",
    defaultSize: "large",
    description:
      "GitHub dashboard surface for pull requests, issues, repos, notifications, workflow runs, projects, releases, and profile stats. Connects via personal token, OAuth token, or the built-in GitHub Remote MCP server.",
    category: "Communication",
    keywords: [
      "github",
      "git",
      "pr",
      "pull request",
      "issue",
      "repo",
      "repository",
      "project",
      "actions",
      "workflow",
      "release",
      "notification",
      "octocat",
    ],
    minW: 1,
    minH: 1,
    maxW: 6,
    maxH: 6,
  },
];

const DEFAULT_GRID_SIZES: Record<
  DashboardWidgetType,
  { w: number; h: number }
> = {
  image_gallery: { w: 4, h: 4 },
  robot_face: { w: 3, h: 3 },
  ha_camera: { w: 4, h: 3 },
  ha_light: { w: 2, h: 2 },
  ha_sensor: { w: 2, h: 2 },
  ha_climate: { w: 2, h: 3 },
  ha_cover: { w: 2, h: 3 },
  ha_media_player: { w: 3, h: 3 },
  ha_select: { w: 2, h: 3 },
  ha_button_stack: { w: 3, h: 3 },
  ha_calendar: { w: 3, h: 3 },
  ha_vacuum: { w: 3, h: 3 },
  ha_printer: { w: 4, h: 3 },
  ha_energy: { w: 3, h: 3 },
  weather: { w: 3, h: 3 },
  forecast: { w: 3, h: 3 },
  clock: { w: 2, h: 2 },
  calendar: { w: 4, h: 4 },
  commute: { w: 2, h: 2 },
  ha_entities: { w: 3, h: 3 },
  timers: { w: 2, h: 2 },
  music: { w: 3, h: 3 },
  youtube_video: { w: 4, h: 3 },
  air_quality: { w: 2, h: 2 },
  reminders: { w: 2, h: 3 },
  alerts: { w: 4, h: 2 },
  greeting: { w: 4, h: 2 },
  quote: { w: 2, h: 2 },
  fun_fact: { w: 2, h: 2 },
  astronomy: { w: 2, h: 2 },
  notes: { w: 2, h: 3 },
  rich_note: { w: 3, h: 3 },
  table: { w: 4, h: 3 },
  date_info: { w: 2, h: 3 },
  system_status: { w: 3, h: 2 },
  quick_actions: { w: 3, h: 3 },
  tasks: { w: 2, h: 3 },
  mail: { w: 3, h: 3 },
  messages: { w: 3, h: 3 },
  ai_chat: { w: 4, h: 4 },
  world_clock: { w: 3, h: 3 },
  map: { w: 2, h: 4 },
  profile: { w: 2, h: 3 },
  daily_summary: { w: 4, h: 3 },
  health: { w: 2, h: 4 },
  bookmarks: { w: 2, h: 3 },
  pomodoro: { w: 2, h: 3 },
  habits: { w: 2, h: 3 },
  screen_time: { w: 3, h: 3 },
  stock: { w: 2, h: 2 },
  portfolio: { w: 4, h: 4 },
  news: { w: 3, h: 3 },
  sketch: { w: 4, h: 4 },
  chores: { w: 2, h: 3 },
  gmail: { w: 3, h: 3 },
  outlook_mail: { w: 3, h: 3 },
  slack: { w: 3, h: 3 },
  obsidian_notes: { w: 2, h: 3 },
  notion_notes: { w: 2, h: 3 },
  google_tasks: { w: 2, h: 3 },
  notion_projects: { w: 2, h: 3 },
  google_calendar: { w: 4, h: 4 },
  outlook_calendar: { w: 4, h: 4 },
  ical_calendar: { w: 4, h: 4 },
  alarms: { w: 2, h: 2 },
  stopwatch: { w: 2, h: 3 },
  analog_clock: { w: 2, h: 2 },
  github: { w: 3, h: 3 },
};

const SIZE_BOUNDS: Partial<
  Record<
    DashboardWidgetType,
    { minW: number; minH: number; maxW: number; maxH: number }
  >
> = {
  ha_light: { minW: 2, minH: 2, maxW: 3, maxH: 3 },
  ha_sensor: { minW: 2, minH: 2, maxW: 3, maxH: 3 },
  ha_climate: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  ha_cover: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  ha_media_player: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  ha_select: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  ha_button_stack: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  ha_calendar: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  ha_vacuum: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  ha_printer: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  ha_energy: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  robot_face: { minW: 1, minH: 1, maxW: 6, maxH: 6 },
  daily_summary: { minW: 2, minH: 2, maxW: 8, maxH: 6 },
  weather: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  forecast: { minW: 2, minH: 3, maxW: 4, maxH: 5 },
  alerts: { minW: 2, minH: 2, maxW: 6, maxH: 4 },
  calendar: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  map: { minW: 2, minH: 2, maxW: 4, maxH: 6 },
  health: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  mail: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  messages: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  ai_chat: { minW: 3, minH: 3, maxW: 8, maxH: 7 },
  youtube_video: { minW: 2, minH: 2, maxW: 12, maxH: 8 },
  stock: { minW: 2, minH: 2, maxW: 4, maxH: 4 },
  portfolio: { minW: 1, minH: 1, maxW: 6, maxH: 5 },
  news: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  sketch: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  rich_note: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  table: { minW: 4, minH: 3, maxW: 8, maxH: 6 },
  image_gallery: { minW: 2, minH: 2, maxW: 8, maxH: 8 },
  chores: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  gmail: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  outlook_mail: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  slack: { minW: 2, minH: 2, maxW: 5, maxH: 5 },
  obsidian_notes: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  notion_notes: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  google_tasks: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  notion_projects: { minW: 2, minH: 2, maxW: 4, maxH: 5 },
  google_calendar: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  outlook_calendar: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  ical_calendar: { minW: 2, minH: 2, maxW: 6, maxH: 6 },
  alarms: { minW: 2, minH: 2, maxW: 4, maxH: 4 },
  stopwatch: { minW: 1, minH: 1, maxW: 4, maxH: 4 },
  github: { minW: 1, minH: 1, maxW: 6, maxH: 6 },
};

export const getDashboardCatalogItem = (
  type: DashboardWidgetType,
): DashboardWidgetCatalogItem | undefined =>
  WIDGET_CATALOG.find((item) => item.type === type);

export const getWidgetSizeBounds = (type: DashboardWidgetType) => {
  const fromCatalog = getDashboardCatalogItem(type);
  const bounds = SIZE_BOUNDS[type];
  return {
    minW: bounds?.minW ?? fromCatalog?.minW ?? 1,
    minH: bounds?.minH ?? fromCatalog?.minH ?? 1,
    maxW: bounds?.maxW ?? fromCatalog?.maxW ?? 8,
    maxH: bounds?.maxH ?? fromCatalog?.maxH ?? 8,
  };
};

export const clampWidgetDimensions = (
  type: DashboardWidgetType,
  width: number,
  height: number,
  maxColumns = 8,
) => {
  const bounds = getWidgetSizeBounds(type);
  const maxAllowedWidth = Math.max(
    1,
    Math.min(bounds.maxW, Math.round(maxColumns || 1)),
  );
  const minAllowedWidth = Math.min(bounds.minW, maxAllowedWidth);
  return {
    // On constrained layouts like the single-column mobile stack, fit the widget
    // into the available track count instead of forcing a desktop-only minimum.
    w: Math.max(
      minAllowedWidth,
      Math.min(maxAllowedWidth, Math.round(width || 1)),
    ),
    h: Math.max(bounds.minH, Math.min(bounds.maxH, Math.round(height || 1))),
  };
};

export const getWidgetDefaultGridSize = (
  type: DashboardWidgetType,
  size?: DashboardWidgetSize,
) => {
  const fallback = DEFAULT_GRID_SIZES[type] || { w: 2, h: 2 };

  if (size === "small") {
    return clampWidgetDimensions(
      type,
      Math.min(fallback.w, 2),
      Math.min(fallback.h, 2),
    );
  }
  if (size === "medium") {
    return clampWidgetDimensions(
      type,
      Math.max(2, Math.min(fallback.w, 3)),
      Math.max(2, Math.min(fallback.h, 3)),
    );
  }
  if (size === "large") {
    return clampWidgetDimensions(
      type,
      Math.max(2, fallback.w),
      Math.max(2, fallback.h),
    );
  }

  return clampWidgetDimensions(type, fallback.w, fallback.h);
};

const deriveSizeFromGrid = (w: number, h: number): DashboardWidgetSize => {
  const area = w * h;
  if (area >= 12) return "xlarge";
  if (area >= 8) return "large";
  if (area >= 4) return "medium";
  return "small";
};

export const createDashboardWidget = (
  type: DashboardWidgetType,
  position: number,
  overrides: Partial<DashboardWidget> = {},
): DashboardWidget => {
  const catalogEntry = getDashboardCatalogItem(type);
  const defaultConfig: DashboardWidgetConfig =
    type === "rich_note"
      ? { richNotePinnedToGrid: true }
      : type === "notion_notes"
        ? { notesProvider: "notion" }
        : type === "notion_projects"
          ? { taskProvider: "notion" }
      : type === "robot_face"
        ? { robotFloatingEnabled: true }
        : {};
  const requestedSize = overrides.size || catalogEntry?.defaultSize || "medium";
  const requestedWidth =
    overrides.config?.w ?? getWidgetDefaultGridSize(type, requestedSize).w;
  const requestedHeight =
    overrides.config?.h ?? getWidgetDefaultGridSize(type, requestedSize).h;
  const dimensions = clampWidgetDimensions(
    type,
    requestedWidth,
    requestedHeight,
  );

  return {
    id: overrides.id || `widget_${type}_${Date.now()}_${position}`,
    type,
    position,
    size: overrides.size || deriveSizeFromGrid(dimensions.w, dimensions.h),
    config: { ...defaultConfig, ...overrides.config, w: dimensions.w, h: dimensions.h },
    enabled: overrides.enabled ?? true,
    layout: overrides.layout,
  };
};

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  createDashboardWidget("profile", 0, { config: { w: 2, h: 3 } }),
  createDashboardWidget("daily_summary", 1, {
    config: {
      w: 4,
      h: 3,
      showDate: true,
      dailySummaryModules: [
        "weather",
        "calendar",
        "tasks",
        "notifications",
        "devices",
        "routines",
      ],
    },
  }),
  createDashboardWidget("world_clock", 2, {
    config: {
      w: 3,
      h: 3,
      timezones: ["America/Los_Angeles", "Europe/London", "Asia/Tokyo"],
    },
  }),
  createDashboardWidget("health", 3, {
    config: {
      w: 2,
      h: 4,
      stepGoal: 8500,
      moveGoal: 650,
      exerciseGoal: 45,
      standGoal: 12,
    },
  }),
  createDashboardWidget("map", 4, {
    config: { w: 2, h: 4, mapTarget: "current" },
  }),
  createDashboardWidget("calendar", 5, {
    config: { w: 4, h: 4, maxItems: 5, calendarDesign: "list" },
  }),
  createDashboardWidget("messages", 6, {
    config: { w: 3, h: 3, messagesProvider: "slack", maxItems: 4 },
  }),
  createDashboardWidget("weather", 7, { config: { w: 3, h: 3 } }),
  createDashboardWidget("music", 8, { config: { w: 3, h: 3, musicSource: "youtube", musicDesign: "curio" } }),
  createDashboardWidget("tasks", 9, { config: { w: 2, h: 3, maxItems: 5 } }),
  createDashboardWidget("sketch", 10, { config: { w: 4, h: 3 } }),
  createDashboardWidget("alerts", 11, { config: { w: 4, h: 2, maxItems: 4 } }),
];
