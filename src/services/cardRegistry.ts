/**
 * Static card type registry — built at module load time, not during React render.
 * Each entry maps a card type string to its lazy-loaded component and default auto-dismiss.
 */

import React from 'react';
import type { CardTypeRegistration } from './cardTypes';

// Lazy-load card components — they are only rendered when a card of that type
// is emitted by the AI, so there's no reason to bundle them all eagerly.
const DeviceCard = React.lazy(() => import('../components/cards/DeviceCard'));
const WeatherCard = React.lazy(() => import('../components/cards/WeatherCard'));
const TimerCard = React.lazy(() => import('../components/cards/TimerCard'));
const MediaCard = React.lazy(() => import('../components/cards/MediaCard'));
const CalculationCard = React.lazy(() => import('../components/cards/CalculationCard'));
const ReminderCard = React.lazy(() => import('../components/cards/ReminderCard'));
const ImageCard = React.lazy(() => import('../components/cards/ImageCard'));
const YouTubeCard = React.lazy(() => import('../components/cards/YouTubeCard'));
const MusicCard = React.lazy(() => import('../components/cards/MusicCard'));
const NewsCard = React.lazy(() => import('../components/cards/NewsCard'));
const FunFactCard = React.lazy(() => import('../components/cards/FunFactCard'));
const DefinitionCard = React.lazy(() => import('../components/cards/DefinitionCard'));
const ListCard = React.lazy(() => import('../components/cards/ListCard'));
const QuoteCard = React.lazy(() => import('../components/cards/QuoteCard'));
const SportsScoreCard = React.lazy(() => import('../components/cards/SportsScoreCard'));
const RecipeCard = React.lazy(() => import('../components/cards/RecipeCard'));
const TranslationCard = React.lazy(() => import('../components/cards/TranslationCard'));
const FinanceCard = React.lazy(() => import('../components/cards/FinanceCard').then(m => ({ default: m.FinanceCard })));
const StopwatchCard = React.lazy(() => import('../components/cards/StopwatchCard'));
const CalendarCard = React.lazy(() => import('../components/cards/CalendarCard'));
const AlarmCard = React.lazy(() => import('../components/cards/AlarmCard'));
const MapCard = React.lazy(() => import('../components/cards/MapCard'));
const PlacesCard = React.lazy(() => import('../components/cards/PlacesCard'));
const AirQualityCard = React.lazy(() => import('../components/cards/AirQualityCard'));
const JokeCard = React.lazy(() => import('../components/cards/JokeCard'));
const TriviaCard = React.lazy(() => import('../components/cards/TriviaCard'));
const UnitConversionCard = React.lazy(() => import('../components/cards/UnitConversionCard'));
const AstronomyCard = React.lazy(() => import('../components/cards/AstronomyCard'));
const CommuteCard = React.lazy(() => import('../components/cards/CommuteCard'));
const CameraCard = React.lazy(() => import('../components/cards/CameraCard'));
const ThermostatCard = React.lazy(() => import('../components/cards/ThermostatCard'));
const SensorReadingCard = React.lazy(() => import('../components/cards/SensorReadingCard'));
const HomeStatusCard = React.lazy(() => import('../components/cards/HomeStatusCard'));
const ObsidianNoteCard = React.lazy(() => import('../components/cards/ObsidianNoteCard'));
const ChoreCard = React.lazy(() => import('../components/cards/ChoreCard'));
const EnergyCard = React.lazy(() => import('../components/cards/EnergyCard'));
const SecurityCard = React.lazy(() => import('../components/cards/SecurityCard'));
const FlightCard = React.lazy(() => import('../components/cards/FlightCard'));
const GmailCard = React.lazy(() => import('../components/cards/GmailCard'));
const OutlookMailCard = React.lazy(() => import('../components/cards/OutlookMailCard'));
const SlackCard = React.lazy(() => import('../components/cards/SlackCard'));

/**
 * Static registry of all built-in card types.
 * Built once at module load time — no React effects needed.
 */
export const CARD_REGISTRY: ReadonlyMap<string, CardTypeRegistration> = new Map<string, CardTypeRegistration>([
    ['device',         { component: DeviceCard,         defaultAutoDismissMs: 15000 }],
    ['weather',        { component: WeatherCard,        defaultAutoDismissMs: 15000 }],
    ['timer',          { component: TimerCard,          defaultAutoDismissMs: 0 }],
    ['media',          { component: MediaCard,          defaultAutoDismissMs: 0 }],
    ['calculation',    { component: CalculationCard,    defaultAutoDismissMs: 15000 }],
    ['reminder',       { component: ReminderCard,       defaultAutoDismissMs: 15000 }],
    ['image',          { component: ImageCard,          defaultAutoDismissMs: 15000 }],
    ['youtube',        { component: YouTubeCard,        defaultAutoDismissMs: 15000 }],
    ['music',          { component: MusicCard,          defaultAutoDismissMs: 0 }],
    ['news',           { component: NewsCard,           defaultAutoDismissMs: 20000 }],
    ['funFact',        { component: FunFactCard,        defaultAutoDismissMs: 15000 }],
    ['definition',     { component: DefinitionCard,     defaultAutoDismissMs: 15000 }],
    ['list',           { component: ListCard,           defaultAutoDismissMs: 15000 }],
    ['quote',          { component: QuoteCard,          defaultAutoDismissMs: 15000 }],
    ['sportsScore',    { component: SportsScoreCard,    defaultAutoDismissMs: 15000 }],
    ['recipe',         { component: RecipeCard,         defaultAutoDismissMs: 0 }],
    ['translation',    { component: TranslationCard,    defaultAutoDismissMs: 15000 }],
    ['finance',        { component: FinanceCard,        defaultAutoDismissMs: 20000 }],
    ['stopwatch',      { component: StopwatchCard,      defaultAutoDismissMs: 0 }],
    ['calendar',       { component: CalendarCard,       defaultAutoDismissMs: 20000 }],
    ['alarm',          { component: AlarmCard,          defaultAutoDismissMs: 0 }],
    ['map',            { component: MapCard,            defaultAutoDismissMs: 20000 }],
    ['places',         { component: PlacesCard,         defaultAutoDismissMs: 20000 }],
    ['airQuality',     { component: AirQualityCard,     defaultAutoDismissMs: 15000 }],
    ['joke',           { component: JokeCard,           defaultAutoDismissMs: 20000 }],
    ['trivia',         { component: TriviaCard,         defaultAutoDismissMs: 0 }],
    ['unitConversion', { component: UnitConversionCard, defaultAutoDismissMs: 15000 }],
    ['astronomy',      { component: AstronomyCard,      defaultAutoDismissMs: 15000 }],
    ['commute',        { component: CommuteCard,        defaultAutoDismissMs: 15000 }],
    ['camera',         { component: CameraCard,         defaultAutoDismissMs: 0 }],
    ['thermostat',     { component: ThermostatCard,     defaultAutoDismissMs: 15000 }],
    ['sensorReading',  { component: SensorReadingCard,  defaultAutoDismissMs: 15000 }],
    ['homeStatus',     { component: HomeStatusCard,     defaultAutoDismissMs: 15000 }],
    ['obsidianNote',   { component: ObsidianNoteCard,   defaultAutoDismissMs: 20000 }],
    ['chore',          { component: ChoreCard,          defaultAutoDismissMs: 0 }],
    ['energy',         { component: EnergyCard,         defaultAutoDismissMs: 20000 }],
    ['security',       { component: SecurityCard,       defaultAutoDismissMs: 20000 }],
    ['flight',         { component: FlightCard,         defaultAutoDismissMs: 30000 }],
    ['gmail',          { component: GmailCard,          defaultAutoDismissMs: 0 }],
    ['outlookMail',    { component: OutlookMailCard,    defaultAutoDismissMs: 0 }],
    ['slack',          { component: SlackCard,          defaultAutoDismissMs: 0 }],
]);
