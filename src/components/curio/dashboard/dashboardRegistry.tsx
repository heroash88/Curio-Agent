import React, { lazy } from 'react';
import type { AqiData, WeatherData } from '../../../services/weatherService';
import type {
  DashboardRobotFaceStyle,
  DashboardWidget,
  DashboardWidgetConfig,
  DashboardWidgetType,
} from '../../../services/dashboardTypes';
import type { DashboardRobotBubble } from './dashboardRobotBubbles';

type WidgetLoader = () => Promise<{ default: React.ComponentType<any> }>;

const loadGreetingWidget = () => import('./GreetingWidget');
const loadWeatherDashWidget = () => import('./WeatherDashWidget');
const loadForecastWidget = () => import('./ForecastWidget');
const loadClockWidget = () => import('./ClockWidget');
const loadCalendarWidget = () => import('./CalendarWidget');
const loadCommuteWidget = () => import('./CommuteWidget');
const loadHaEntitiesWidget = () => import('./HaEntitiesWidget');
const loadTimersWidget = () => import('./TimersWidget');
const loadStopwatchWidget = () => import('./StopwatchWidget');
const loadMusicWidget = () => import('./MusicWidget');
const loadYouTubeWidget = () => import('./YouTubeWidget');
const loadAirQualityWidget = () => import('./AirQualityWidget');
const loadRemindersWidget = () => import('./RemindersWidget');
const loadAlertsWidget = () => import('./AlertsWidget');
const loadQuoteWidget = () => import('./QuoteWidget');
const loadFunFactWidget = () => import('./FunFactWidget');
const loadAstronomyWidget = () => import('./AstronomyWidget');
const loadNotesWidget = () => import('./NotesWidget');
const loadRichNoteWidget = () => import('./RichNoteWidget');
const loadTableWidget = () => import('./TableWidget');
const loadDateInfoWidget = () => import('./DateInfoWidget');
const loadSystemStatusWidget = () => import('./SystemStatusWidget');
const loadQuickActionsWidget = () => import('./QuickActionsWidget');
const loadTasksWidget = () => import('./TasksWidget');
const loadMailWidget = () => import('./MailWidget');
const loadMessagesWidget = () => import('./MessagesWidget');
const loadAiChatWidget = () => import('./AiChatWidget');
const loadWorldClockWidget = () => import('./WorldClockWidget');
const loadMapWidget = () => import('./MapWidget');
const loadProfileWidget = () => import('./ProfileWidget');
const loadDailySummaryWidget = () => import('./DailySummaryWidget');
const loadHealthWidget = () => import('./HealthWidget');
const loadBookmarksWidget = () => import('./BookmarksWidget');
const loadPomodoroWidget = () => import('./PomodoroWidget');
const loadHabitsWidget = () => import('./HabitsWidget');
const loadScreenTimeWidget = () => import('./ScreenTimeWidget');
const loadStockWidget = () => import('./StockWidget');
const loadPortfolioWidget = () => import('./PortfolioWidget');
const loadNewsWidget = () => import('./NewsWidget');
const loadSketchWidget = () => import('./SketchWidget');
const loadRobotFaceWidget = () => import('./RobotFaceWidget').then((module) => ({ default: module.RobotFaceWidget }));
const loadHaCameraWidget = () => import('./HaCameraWidget');
const loadHaLightWidget = () => import('./HaLightWidget').then((module) => ({ default: module.HaLightWidget }));
const loadHaSensorWidget = () => import('./HaSensorWidget').then((module) => ({ default: module.HaSensorWidget }));
const loadHaClimateWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaClimateWidget }));
const loadHaCoverWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaCoverWidget }));
const loadHaMediaPlayerWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaMediaPlayerWidget }));
const loadHaSelectWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaSelectWidget }));
const loadHaButtonStackWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaButtonStackWidget }));
const loadHaCalendarWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaCalendarWidget }));
const loadHaVacuumWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaVacuumWidget }));
const loadHaPrinterWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaPrinterWidget }));
const loadHaEnergyWidget = () => import('./HaAdvancedWidgets').then((module) => ({ default: module.HaEnergyWidget }));
const loadAnalogClockWidget = () => import('./AnalogClockWidget');
const loadImageGalleryWidget = () => import('./ImageGalleryWidget');
const loadGitHubWidget = () => import('./GitHubWidget');

const GreetingWidget = lazy(loadGreetingWidget);
const WeatherDashWidget = lazy(loadWeatherDashWidget);
const ForecastWidget = lazy(loadForecastWidget);
const ClockWidget = lazy(loadClockWidget);
const CalendarWidget = lazy(loadCalendarWidget);
const CommuteWidget = lazy(loadCommuteWidget);
const HaEntitiesWidget = lazy(loadHaEntitiesWidget);
const TimersWidget = lazy(loadTimersWidget);
const StopwatchWidget = lazy(loadStopwatchWidget);
const MusicWidget = lazy(loadMusicWidget);
const YouTubeWidget = lazy(loadYouTubeWidget);
const AirQualityWidget = lazy(loadAirQualityWidget);
const RemindersWidget = lazy(loadRemindersWidget);
const AlertsWidget = lazy(loadAlertsWidget);
const QuoteWidget = lazy(loadQuoteWidget);
const FunFactWidget = lazy(loadFunFactWidget);
const AstronomyWidget = lazy(loadAstronomyWidget);
const NotesWidget = lazy(loadNotesWidget);
const RichNoteWidget = lazy(loadRichNoteWidget);
const TableWidget = lazy(loadTableWidget);
const DateInfoWidget = lazy(loadDateInfoWidget);
const SystemStatusWidget = lazy(loadSystemStatusWidget);
const QuickActionsWidget = lazy(loadQuickActionsWidget);
const TasksWidget = lazy(loadTasksWidget);
const MailWidget = lazy(loadMailWidget);
const MessagesWidget = lazy(loadMessagesWidget);
const AiChatWidget = lazy(loadAiChatWidget);
const WorldClockWidget = lazy(loadWorldClockWidget);
const MapWidget = lazy(loadMapWidget);
const ProfileWidget = lazy(loadProfileWidget);
const DailySummaryWidget = lazy(loadDailySummaryWidget);
const HealthWidget = lazy(loadHealthWidget);
const BookmarksWidget = lazy(loadBookmarksWidget);
const PomodoroWidget = lazy(loadPomodoroWidget);
const HabitsWidget = lazy(loadHabitsWidget);
const ScreenTimeWidget = lazy(loadScreenTimeWidget);
const StockWidget = lazy(loadStockWidget);
const PortfolioWidget = lazy(loadPortfolioWidget);
const NewsWidget = lazy(loadNewsWidget);
const SketchWidget = lazy(loadSketchWidget);
const RobotFaceWidgetPath = lazy(loadRobotFaceWidget);
const HaCameraWidgetPath = lazy(loadHaCameraWidget);
const HaLightWidgetPath = lazy(loadHaLightWidget);
const HaSensorWidgetPath = lazy(loadHaSensorWidget);
const HaClimateWidgetPath = lazy(loadHaClimateWidget);
const HaCoverWidgetPath = lazy(loadHaCoverWidget);
const HaMediaPlayerWidgetPath = lazy(loadHaMediaPlayerWidget);
const HaSelectWidgetPath = lazy(loadHaSelectWidget);
const HaButtonStackWidgetPath = lazy(loadHaButtonStackWidget);
const HaCalendarWidgetPath = lazy(loadHaCalendarWidget);
const HaVacuumWidgetPath = lazy(loadHaVacuumWidget);
const HaPrinterWidgetPath = lazy(loadHaPrinterWidget);
const HaEnergyWidgetPath = lazy(loadHaEnergyWidget);
const AnalogClockWidget = lazy(loadAnalogClockWidget);
const ImageGalleryWidget = lazy(loadImageGalleryWidget);
const GitHubWidget = lazy(loadGitHubWidget);

const WIDGET_PRELOADERS: Record<DashboardWidgetType, WidgetLoader> = {
  greeting: loadGreetingWidget,
  weather: loadWeatherDashWidget,
  forecast: loadForecastWidget,
  clock: loadClockWidget,
  calendar: loadCalendarWidget,
  commute: loadCommuteWidget,
  ha_entities: loadHaEntitiesWidget,
  timers: loadTimersWidget,
  stopwatch: loadStopwatchWidget,
  music: loadMusicWidget,
  youtube_video: loadYouTubeWidget,
  air_quality: loadAirQualityWidget,
  reminders: loadRemindersWidget,
  alerts: loadAlertsWidget,
  quote: loadQuoteWidget,
  fun_fact: loadFunFactWidget,
  astronomy: loadAstronomyWidget,
  notes: loadNotesWidget,
  rich_note: loadRichNoteWidget,
  table: loadTableWidget,
  date_info: loadDateInfoWidget,
  system_status: loadSystemStatusWidget,
  quick_actions: loadQuickActionsWidget,
  tasks: loadTasksWidget,
  mail: loadMailWidget,
  messages: loadMessagesWidget,
  ai_chat: loadAiChatWidget,
  world_clock: loadWorldClockWidget,
  map: loadMapWidget,
  profile: loadProfileWidget,
  daily_summary: loadDailySummaryWidget,
  health: loadHealthWidget,
  bookmarks: loadBookmarksWidget,
  pomodoro: loadPomodoroWidget,
  habits: loadHabitsWidget,
  screen_time: loadScreenTimeWidget,
  stock: loadStockWidget,
  portfolio: loadPortfolioWidget,
  news: loadNewsWidget,
  sketch: loadSketchWidget,
  robot_face: loadRobotFaceWidget,
  ha_camera: loadHaCameraWidget,
  ha_light: loadHaLightWidget,
  ha_sensor: loadHaSensorWidget,
  ha_climate: loadHaClimateWidget,
  ha_cover: loadHaCoverWidget,
  ha_media_player: loadHaMediaPlayerWidget,
  ha_select: loadHaSelectWidget,
  ha_button_stack: loadHaButtonStackWidget,
  ha_calendar: loadHaCalendarWidget,
  ha_vacuum: loadHaVacuumWidget,
  ha_printer: loadHaPrinterWidget,
  ha_energy: loadHaEnergyWidget,
  chores: loadTasksWidget,
  gmail: loadMailWidget,
  outlook_mail: loadMailWidget,
  slack: loadMessagesWidget,
  obsidian_notes: loadNotesWidget,
  notion_notes: loadNotesWidget,
  google_tasks: loadTasksWidget,
  notion_projects: loadTasksWidget,
  google_calendar: loadCalendarWidget,
  outlook_calendar: loadCalendarWidget,
  ical_calendar: loadCalendarWidget,
  alarms: loadTimersWidget,
  analog_clock: loadAnalogClockWidget,
  image_gallery: loadImageGalleryWidget,
  github: loadGitHubWidget,
};

const preloadedWidgetTypes = new Set<DashboardWidgetType>();

export const preloadDashboardWidgetComponents = (types: DashboardWidgetType[]) => {
  types.forEach((type) => {
    if (preloadedWidgetTypes.has(type)) return;
    preloadedWidgetTypes.add(type);
    void WIDGET_PRELOADERS[type]?.().catch(() => {
      preloadedWidgetTypes.delete(type);
    });
  });
};

export type DashboardWidgetComponentProps = {
  widget: DashboardWidget;
  weather: WeatherData | null;
  aqi: AqiData | null;
  faceSlot?:
    | React.ReactNode
    | ((faceStyle?: DashboardRobotFaceStyle) => React.ReactNode);
  config?: DashboardWidget['config'];
  activeProfileName?: string | null;
  activeProfileId?: string | null;
  recognizedBy?: string | null;
  updatedAt?: number;
  focused?: boolean;
  robotBubble?: DashboardRobotBubble | null;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
  onOpenWidgetSettings?: (widgetId: string) => void;
  onCreateWidget?: (
    type: DashboardWidgetType,
    configPatch?: Partial<DashboardWidgetConfig>,
    options?: { afterWidgetId?: string },
  ) => void;
};

const withForcedConfig = (
  Component: React.ComponentType<any>,
  forcedConfig: Record<string, unknown>,
): React.FC<any> => {
  const WrappedWidget: React.FC<any> = (props) => (
    <Component
      {...props}
      widget={{
        ...props.widget,
        config: {
          ...(props.widget?.config || {}),
          ...forcedConfig,
        },
      }}
    />
  );
  return WrappedWidget;
};

const ChoresWidget = withForcedConfig(TasksWidget, { taskProvider: 'internal' });
const GmailWidget = withForcedConfig(MailWidget, { mailProvider: 'gmail' });
const OutlookMailWidget = withForcedConfig(MailWidget, { mailProvider: 'outlook' });
const SlackWidget = withForcedConfig(MessagesWidget, { messagesProvider: 'slack' });
const ObsidianNotesWidget = withForcedConfig(NotesWidget, { notesProvider: 'obsidian' });
const NotionNotesWidget = withForcedConfig(NotesWidget, { notesProvider: 'notion' });
const GoogleTasksWidget = withForcedConfig(TasksWidget, { taskProvider: 'google' });
const NotionProjectsWidget = withForcedConfig(TasksWidget, { taskProvider: 'notion' });
const GoogleCalendarWidget = withForcedConfig(CalendarWidget, { calendarProvider: 'google' });
const OutlookCalendarWidget = withForcedConfig(CalendarWidget, { calendarProvider: 'outlook' });
const ICalCalendarWidget = withForcedConfig(CalendarWidget, { calendarProvider: 'ical' });
const AlarmsWidget = withForcedConfig(TimersWidget, { timerView: 'alarms' });

export const WIDGET_COMPONENTS: Record<
  DashboardWidgetType,
  React.ComponentType<any>
> = {
  greeting: GreetingWidget,
  weather: WeatherDashWidget,
  forecast: ForecastWidget,
  clock: ClockWidget,
  calendar: CalendarWidget,
  commute: CommuteWidget,
  ha_entities: HaEntitiesWidget,
  timers: TimersWidget,
  stopwatch: StopwatchWidget,
  music: MusicWidget,
  youtube_video: YouTubeWidget,
  air_quality: AirQualityWidget,
  reminders: RemindersWidget,
  alerts: AlertsWidget,
  quote: QuoteWidget,
  fun_fact: FunFactWidget,
  astronomy: AstronomyWidget,
  notes: NotesWidget,
  rich_note: RichNoteWidget,
  table: TableWidget,
  date_info: DateInfoWidget,
  system_status: SystemStatusWidget,
  quick_actions: QuickActionsWidget,
  robot_face: RobotFaceWidgetPath,
  ha_camera: HaCameraWidgetPath,
  ha_light: HaLightWidgetPath,
  ha_sensor: HaSensorWidgetPath,
  ha_climate: HaClimateWidgetPath,
  ha_cover: HaCoverWidgetPath,
  ha_media_player: HaMediaPlayerWidgetPath,
  ha_select: HaSelectWidgetPath,
  ha_button_stack: HaButtonStackWidgetPath,
  ha_calendar: HaCalendarWidgetPath,
  ha_vacuum: HaVacuumWidgetPath,
  ha_printer: HaPrinterWidgetPath,
  ha_energy: HaEnergyWidgetPath,
  tasks: TasksWidget,
  mail: MailWidget,
  messages: MessagesWidget,
  ai_chat: AiChatWidget,
  world_clock: WorldClockWidget,
  map: MapWidget,
  profile: ProfileWidget,
  daily_summary: DailySummaryWidget,
  health: HealthWidget,
  bookmarks: BookmarksWidget,
  pomodoro: PomodoroWidget,
  habits: HabitsWidget,
  screen_time: ScreenTimeWidget,
  stock: StockWidget,
  portfolio: PortfolioWidget,
  news: NewsWidget,
  sketch: SketchWidget,
  chores: ChoresWidget,
  gmail: GmailWidget,
  outlook_mail: OutlookMailWidget,
  slack: SlackWidget,
  obsidian_notes: ObsidianNotesWidget,
  notion_notes: NotionNotesWidget,
  google_tasks: GoogleTasksWidget,
  notion_projects: NotionProjectsWidget,
  google_calendar: GoogleCalendarWidget,
  outlook_calendar: OutlookCalendarWidget,
  ical_calendar: ICalCalendarWidget,
  alarms: AlarmsWidget,
  analog_clock: AnalogClockWidget,
  image_gallery: ImageGalleryWidget,
  github: GitHubWidget,
};

export const DASHBOARD_WIDGET_GROUPS = [
  { key: 'personal', label: 'Personal', types: ['profile', 'daily_summary', 'health', 'greeting', 'habits'] as DashboardWidgetType[] },
  { key: 'productivity', label: 'Productivity', types: ['tasks', 'chores', 'google_tasks', 'notion_projects', 'calendar', 'google_calendar', 'outlook_calendar', 'ical_calendar', 'reminders', 'alerts', 'notes', 'rich_note', 'table', 'obsidian_notes', 'notion_notes', 'timers', 'alarms', 'stopwatch', 'pomodoro', 'stock', 'portfolio', 'sketch'] as DashboardWidgetType[] },
  { key: 'communication', label: 'Communication', types: ['ai_chat', 'mail', 'gmail', 'outlook_mail', 'messages', 'slack', 'github'] as DashboardWidgetType[] },
  { key: 'context', label: 'Context', types: ['weather', 'forecast', 'world_clock', 'commute', 'map', 'air_quality', 'astronomy', 'date_info', 'clock', 'analog_clock'] as DashboardWidgetType[] },
  { key: 'media', label: 'Media', types: ['music', 'youtube_video', 'image_gallery', 'quote', 'fun_fact', 'bookmarks', 'news'] as DashboardWidgetType[] },
  { key: 'smart-home', label: 'Smart Home', types: ['robot_face', 'ha_camera', 'ha_light', 'ha_climate', 'ha_cover', 'ha_media_player', 'ha_select', 'ha_button_stack', 'ha_calendar', 'ha_vacuum', 'ha_printer', 'ha_energy', 'ha_sensor', 'ha_entities'] as DashboardWidgetType[] },
  { key: 'system', label: 'System', types: ['quick_actions', 'system_status', 'screen_time'] as DashboardWidgetType[] },
];
