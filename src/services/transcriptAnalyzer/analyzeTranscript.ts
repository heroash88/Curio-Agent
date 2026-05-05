/**
 * Main transcript analysis entry point.
 *
 * Runs text through a priority-ordered chain of detectors and returns
 * at most one CardEvent per call.
 */

import type { CardEvent } from '../cardTypes';
import { isConversationalOffer, isQuestion, keywordScore } from './helpers';
import {
    detectTimer,
    detectAlarm,
    detectStopwatch,
    detectReminder,
    detectNote,
    detectShowNotes,
    detectShowReminders,
    detectDevice,
    detectCamera,
    detectThermostat,
    detectWeather,
    detectCalculation,
    detectUnitConversion,
    detectFinance,
    detectYouTube,
    detectImage,
    detectSportsScore,
    detectAirQuality,
    detectAstronomy,
    detectCommute,
    detectMap,
    detectRecipe,
    detectNews,
    detectCalendar,
    detectJoke,
    detectTrivia,
    detectDefinition,
    detectTranslation,
    detectFunFact,
    detectQuote,
    detectList,
    detectSensorReading,
    detectHomeStatus,
    detectChore,
    detectGmail,
    detectFlight,
    detectEnergy,
    detectSecurity,
    detectSlack,
    detectOutlookMail,
} from './detectors';

/** Minimum transcript length to even consider analysis */
const MIN_TEXT_LENGTH = 5;

/**
 * Analyze AI transcript text and produce a CardEvent if card-worthy content is detected.
 * Pure function -- returns at most one event per call.
 *
 * @param mode - 'ai' = analyzing AI output (conservative, skip conversational text),
 *               'offline' = analyzing user speech (aggressive, user is giving commands).
 *               Default: 'ai'.
 */
export function analyzeTranscript(
    text: string,
    turnHadToolCall: boolean,
    mode: 'ai' | 'offline' = 'ai',
): CardEvent | null {
    if (turnHadToolCall || !text || text.trim().length < MIN_TEXT_LENGTH) return null;

    try {
        // CLOSE_CARDS -- global signal to hide all active cards
        if (/CLOSE_CARDS/i.test(text)) {
            return { type: 'close_all', data: {} };
        }

        const normalized = text.toLowerCase();
        const trimmed = text.trim();

        // -- AI mode: extra false-positive guards --
        if (mode === 'ai') {
            // Short AI responses are almost never card-worthy
            if (trimmed.length < 40) return null;
            if (isConversationalOffer(normalized)) return null;
            if (isQuestion(normalized) && trimmed.length < 200) return null;

            const narrativeSignals = [
                'i was saying', 'as i mentioned', 'to start a conversation',
                'for example', 'let me explain', 'in other words',
                'speaking of which', 'by the way', 'on another note',
                'that reminds me', 'going back to', 'as we discussed',
                'just to clarify', 'to be clear', 'in general',
                'typically', 'usually', 'sometimes', 'often',
                'anyway', 'so anyway', 'moving on', 'back to',
                'what i mean is', 'the thing is', 'you see',
            ];
            if (keywordScore(normalized, narrativeSignals) >= 2) return null;
        }

        // Tier 1 -- explicit user-initiated actions
        const timer = detectTimer(normalized, trimmed);
        if (timer) return timer;

        const alarm = detectAlarm(normalized, trimmed);
        if (alarm) return alarm;

        const stopwatch = detectStopwatch(normalized);
        if (stopwatch) return stopwatch;

        const reminder = detectReminder(normalized, trimmed);
        if (reminder) return reminder;

        const note = detectNote(normalized, trimmed);
        if (note) return note;

        const showNotes = detectShowNotes(normalized);
        if (showNotes) return showNotes;

        const showReminders = detectShowReminders(normalized);
        if (showReminders) return showReminders;

        // Chores / task rotation
        const chore = detectChore(normalized, trimmed);
        if (chore) return chore;

        // Gmail
        const gmail = detectGmail(normalized, trimmed);
        if (gmail) return gmail;

        // Slack (serves cached messages when offline)
        const slack = detectSlack(normalized, trimmed);
        if (slack) return slack;

        // Outlook mail
        const outlookMail = detectOutlookMail(normalized, trimmed);
        if (outlookMail) return outlookMail;

        // Tier 1b -- sensor queries & home status (before device control)
        const sensorReading = detectSensorReading(normalized, trimmed);
        if (sensorReading) return sensorReading;

        const homeStatus = detectHomeStatus(normalized, trimmed);
        if (homeStatus) return homeStatus;

        // Energy & security (HA-dependent)
        const energy = detectEnergy(normalized, trimmed);
        if (energy) return energy;

        const security = detectSecurity(normalized, trimmed);
        if (security) return security;

        // Tier 1c -- device control & camera
        const device = detectDevice(normalized, trimmed);
        if (device) return device;

        const camera = detectCamera(normalized, trimmed);
        if (camera) return camera;

        const thermostat = detectThermostat(normalized, trimmed);
        if (thermostat) return thermostat;

        // Tier 2 -- structured data
        const weather = detectWeather(normalized, trimmed);
        if (weather) return weather;

        const calc = detectCalculation(trimmed);
        if (calc) return calc;

        const unitConv = detectUnitConversion(normalized, trimmed);
        if (unitConv) return unitConv;

        const finance = detectFinance(normalized, trimmed);
        if (finance) return finance;

        // Flight tracking
        const flight = detectFlight(normalized, trimmed);
        if (flight) return flight;

        // Tier 3 -- media / visual
        const youtube = detectYouTube(normalized, trimmed);
        if (youtube) return youtube;

        const image = detectImage(normalized, trimmed);
        if (image) return image;

        // Tier 4 -- informational cards
        const sportsScore = detectSportsScore(normalized, trimmed);
        if (sportsScore) return sportsScore;

        const airQuality = detectAirQuality(normalized, trimmed);
        if (airQuality) return airQuality;

        const astronomy = detectAstronomy(normalized, trimmed);
        if (astronomy) return astronomy;

        const commute = detectCommute(normalized, trimmed);
        if (commute) return commute;

        const map = detectMap(normalized, trimmed);
        if (map) return map;

        const recipe = detectRecipe(normalized, trimmed);
        if (recipe) return recipe;

        const news = detectNews(normalized, trimmed);
        if (news) return news;

        const calendar = detectCalendar(normalized, trimmed);
        if (calendar) return calendar;

        const joke = detectJoke(normalized, trimmed);
        if (joke) return joke;

        const trivia = detectTrivia(normalized, trimmed);
        if (trivia) return trivia;

        const definition = detectDefinition(normalized, trimmed);
        if (definition) return definition;

        const translation = detectTranslation(normalized, trimmed);
        if (translation) return translation;

        const funFact = detectFunFact(normalized, trimmed);
        if (funFact) return funFact;

        const quote = detectQuote(normalized, trimmed);
        if (quote) return quote;

        const list = detectList(normalized, trimmed);
        if (list) return list;

        return null;
    } catch (e) {
        console.error('[TranscriptAnalyzer] Failed to analyze transcript:', {
            textPreview: text.substring(0, 200),
            error: e instanceof Error ? e.message : String(e),
        });
        return null;
    }
}
