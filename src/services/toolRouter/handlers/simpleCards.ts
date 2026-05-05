/**
 * Simple card-display handlers: each emits a card with the provided args
 * (optionally mapped) and returns a success result.
 */

import type { CardEvent } from '../../cardTypes';
import { register } from '../router';

const simpleCardHandlers: Array<{
    name: string;
    cardType: string;
    dataMapper?: (args: any) => Record<string, unknown>;
    cardOpts?: Partial<CardEvent>;
}> = [
    { name: 'show_directions', cardType: 'map', dataMapper: (a) => ({ destination: a.destination, origin: a.origin || 'Current Location', travelMode: a.travelMode || 'driving', distance: a.distance, duration: a.duration, steps: a.steps, mapUrl: a.mapUrl }) },
    { name: 'show_air_quality', cardType: 'airQuality' },
    { name: 'show_joke', cardType: 'joke', dataMapper: (a) => ({ setup: a.setup, punchline: a.punchline, category: a.category }) },
    { name: 'show_trivia', cardType: 'trivia', dataMapper: (a) => ({ question: a.question, options: a.options, correctIndex: a.correctIndex, explanation: a.explanation, category: a.category }), cardOpts: { persistent: true } },
    { name: 'show_unit_conversion', cardType: 'unitConversion' },
    { name: 'show_definition', cardType: 'definition', dataMapper: (a) => ({ word: a.word || '', pronunciation: a.pronunciation, partOfSpeech: a.partOfSpeech, definition: a.definition || '' }) },
    { name: 'show_calculation', cardType: 'calculation', dataMapper: (a) => ({ equation: a.equation || '', result: a.result || '' }) },
    { name: 'show_translation', cardType: 'translation', dataMapper: (a) => ({ originalText: a.originalText || '', translatedText: a.translatedText || '', sourceLanguage: a.sourceLanguage || 'Unknown', targetLanguage: a.targetLanguage || 'Unknown' }) },
    { name: 'show_quote', cardType: 'quote', dataMapper: (a) => ({ quote: a.quote || '', author: a.author || 'Unknown' }) },
    { name: 'show_fun_fact', cardType: 'funFact', dataMapper: (a) => ({ fact: a.fact || '' }) },
    { name: 'show_recipe', cardType: 'recipe', dataMapper: (a) => ({ title: a.title || 'Recipe', ingredients: a.ingredients || [], steps: a.steps || [] }), cardOpts: { persistent: true } },
    { name: 'show_astronomy', cardType: 'astronomy' },
    { name: 'show_commute', cardType: 'commute' },
    { name: 'show_thermostat', cardType: 'thermostat', dataMapper: (a) => ({ entityId: a.entityId, name: a.name, currentTemp: a.currentTemp, targetTemp: a.targetTemp, hvacMode: a.hvacMode || 'auto', humidity: a.humidity, unit: a.unit || 'F', supportedModes: a.supportedModes || [] }) },
    { name: 'show_finance_card', cardType: 'finance', dataMapper: (a) => ({ symbol: a.symbol, name: a.name, price: a.price, change: a.change, changePercent: a.changePercent, marketCap: a.marketCap, currency: a.currency }) },
    { name: 'show_news', cardType: 'news', dataMapper: (a) => ({ items: (a.items || []).map((item: any) => typeof item === 'string' ? { headline: item, source: a.source || 'News', summary: '' } : item) }) },
    { name: 'show_list', cardType: 'list', dataMapper: (a) => ({ title: a.title || 'List', items: a.items || [] }) },
    { name: 'show_sensor_reading', cardType: 'sensorReading', dataMapper: (a) => ({ entityId: a.entityId, name: a.name, value: a.value, unit: a.unit, icon: a.icon, history: a.history }) },
    { name: 'show_home_status', cardType: 'homeStatus', dataMapper: (a) => ({ doors: a.doors, windows: a.windows, motion: a.motion, presence: a.presence, summary: a.summary }) },
    {
        name: 'show_stopwatch',
        cardType: 'stopwatch',
        dataMapper: (a) => ({
            startTime: typeof a.startTime === 'number' ? a.startTime : Date.now(),
            pausedElapsed: typeof a.pausedElapsed === 'number' ? a.pausedElapsed : 0,
            running: a.running !== false,
        }),
        cardOpts: { persistent: true },
    },
];

for (const { name, cardType, dataMapper, cardOpts } of simpleCardHandlers) {
    register(name, async (args, ctx) => {
        if (ctx.onCardEvent) {
            try {
                ctx.onCardEvent({
                    type: cardType,
                    data: dataMapper ? dataMapper(args) : args,
                    ...cardOpts,
                } as CardEvent);
            } catch {}
        }
        return { result: { success: true, message: `${cardType} card displayed.` }, emittedCard: true };
    });
}
