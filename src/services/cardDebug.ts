/**
 * Card Debug Tool
 * 
 * Call from browser console:
 *   __debugCards.show('weather')     — show a specific card
 *   __debugCards.show('all')         — show one of every card type
 *   __debugCards.list()              — list available card types
 *   __debugCards.clear()             — dismiss all cards
 */

import type { CardEvent } from './cardTypes';

type Emitter = (event: CardEvent) => void;

let _emitter: Emitter | null = null;

export const setDebugEmitter = (emitter: Emitter | null) => {
    _emitter = emitter;
};

const SAMPLE_DATA: Record<string, CardEvent> = {
    weather: {
        type: 'weather',
        data: { temperature: 72, condition: 'Clear', high: 78, low: 62, unit: 'F', humidity: 45, forecast: [
            { time: '2PM', temp: 74, condition: 'clear' },
            { time: '3PM', temp: 76, condition: 'clear' },
            { time: '4PM', temp: 75, condition: 'cloudy' },
            { time: '5PM', temp: 71, condition: 'rain' },
        ], daily: [
            { date: 'Mon', highF: 78, lowF: 62, highC: 26, lowC: 17, condition: 'Clear', humidity: 40 },
            { date: 'Tue', highF: 75, lowF: 60, highC: 24, lowC: 16, condition: 'Partly Cloudy', humidity: 55 },
            { date: 'Wed', highF: 70, lowF: 58, highC: 21, lowC: 14, condition: 'Rain', humidity: 80 },
            { date: 'Thu', highF: 68, lowF: 55, highC: 20, lowC: 13, condition: 'Cloudy', humidity: 65 },
            { date: 'Fri', highF: 73, lowF: 59, highC: 23, lowC: 15, condition: 'Clear', humidity: 35 },
        ]},
    },
    calculation: {
        type: 'calculation',
        data: { equation: '42 × 17 + 3', result: '717' },
    },
    joke: {
        type: 'joke',
        data: { setup: 'Why do programmers prefer dark mode?', punchline: 'Because light attracts bugs.', category: 'Tech' },
    },
    quote: {
        type: 'quote',
        data: { quote: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
    },
    funFact: {
        type: 'funFact',
        data: { fact: 'Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible.' },
    },
    definition: {
        type: 'definition',
        data: { word: 'Serendipity', partOfSpeech: 'noun', pronunciation: '/ˌser.ənˈdɪp.ɪ.ti/', definition: 'The occurrence of events by chance in a happy or beneficial way.' },
    },
    news: {
        type: 'news',
        data: { items: [
            { headline: 'New AI Breakthrough Achieves Human-Level Reasoning', source: 'Tech Daily', summary: 'Researchers demonstrate a new model that passes complex reasoning benchmarks.' },
            { headline: 'Mars Rover Discovers New Mineral Formation', source: 'Space News', summary: 'Curiosity rover finds evidence of ancient water activity.' },
        ]},
    },
    translation: {
        type: 'translation',
        data: { originalText: 'Hello, how are you?', translatedText: 'Hola, ¿cómo estás?', sourceLanguage: 'English', targetLanguage: 'Spanish' },
    },
    reminder: {
        type: 'reminder',
        data: { text: 'Pick up groceries on the way home', scheduledTime: 'In 30 minutes' },
    },
    list: {
        type: 'list',
        data: { title: 'My Notes', items: ['Buy milk and eggs', 'Call the dentist', 'Finish the report', 'Water the plants'], itemIds: ['n1', 'n2', 'n3', 'n4'], deletable: true },
        persistent: true,
    },
    sportsScore: {
        type: 'sportsScore',
        data: { homeTeam: 'Lakers', awayTeam: 'Celtics', homeScore: 108, awayScore: 102, status: 'Final' },
    },
    recipe: {
        type: 'recipe',
        data: { title: 'Pasta Carbonara', ingredients: ['400g spaghetti', '200g pancetta', '4 egg yolks', '100g pecorino', 'Black pepper'], steps: ['Boil pasta in salted water', 'Fry pancetta until crispy', 'Mix egg yolks with cheese', 'Toss hot pasta with pancetta', 'Add egg mixture off heat'] },
    },
    airQuality: {
        type: 'airQuality',
        data: { aqi: 61, category: 'Moderate', advice: 'Air quality is acceptable. Sensitive individuals should limit prolonged outdoor exertion.', pm25: 15.2, pm10: 28.4, o3: 42, no2: 18 },
    },
    finance: {
        type: 'finance',
        data: { symbol: 'AAPL', name: 'Apple Inc.', price: 198.45, change: 3.21, changePercent: 1.64, marketCap: '$3.1T', currency: 'USD' },
    },
    calendar: {
        type: 'calendar',
        data: { date: 'Today', events: [
            { title: 'Team Standup', startTime: '9:00 AM', endTime: '9:15 AM' },
            { title: 'Design Review', startTime: '2:00 PM', endTime: '3:00 PM', location: 'Room 4B' },
            { title: 'Gym', startTime: '6:00 PM', allDay: false },
        ]},
    },
    trivia: {
        type: 'trivia',
        data: { question: 'What is the largest planet in our solar system?', options: ['Mars', 'Jupiter', 'Saturn', 'Neptune'], correctIndex: 1, category: 'Science', explanation: 'Jupiter is the largest planet, with a mass more than twice that of all other planets combined.' },
        persistent: true,
    },
    unitConversion: {
        type: 'unitConversion',
        data: { fromValue: '100', fromUnit: 'km/h', toValue: '62.14', toUnit: 'mph', category: 'speed' },
    },
    astronomy: {
        type: 'astronomy',
        data: { sunrise: '6:42 AM', sunset: '7:18 PM', moonPhase: 'Waxing Gibbous', moonIllumination: 78, dayLength: '12h 36m', goldenHour: '6:48 PM' },
    },
    commute: {
        type: 'commute',
        data: { origin: 'Home', destination: 'Office', duration: '25 min', durationInTraffic: '35 min', distance: '12.4 mi', trafficCondition: 'moderate', route: 'I-405 N', departureTime: '8:15 AM' },
    },
    thermostat: {
        type: 'thermostat',
        data: { name: 'Living Room', currentTemp: 72, targetTemp: 68, unit: 'F', hvacMode: 'cool', humidity: 45 },
    },
    chore: {
        type: 'chore',
        data: {
            title: 'Weekly Chores',
            chores: [
                { id: 'c1', name: 'Vacuum living room', completed: true, lastCompleted: new Date().toISOString(), recurring: 'weekly' },
                { id: 'c2', name: 'Take out trash', completed: false, recurring: 'weekly' },
                { id: 'c3', name: 'Clean bathroom', completed: false, assignee: 'Guest', recurring: 'weekly' },
                { id: 'c4', name: 'Do laundry', completed: false },
            ],
        },
        persistent: true,
    },
    energy: {
        type: 'energy',
        data: {
            currentUsageW: 1840,
            todayKwh: 12.4,
            solarProductionW: 2200,
            solarTodayKwh: 18.1,
            gridImportW: 0,
            gridExportW: 360,
            batteryPercent: 74,
            batteryCharging: true,
            costToday: 1.87,
            costCurrency: '$',
            monthKwh: 312,
        },
    },
    security: {
        type: 'security',
        data: {
            alarmState: 'armed_away',
            alarmName: 'Home Security',
            locks: [
                { entityId: 'lock.front_door', name: 'Front Door', state: 'locked', area: 'Entrance' },
                { entityId: 'lock.back_door', name: 'Back Door', state: 'locked', area: 'Backyard' },
                { entityId: 'lock.garage', name: 'Garage', state: 'unlocked', area: 'Garage' },
            ],
            recentEvents: [
                { time: '8:02 AM', description: 'System armed (away)' },
                { time: '7:58 AM', description: 'Front door locked' },
                { time: '7:45 AM', description: 'Motion: Driveway' },
            ],
        },
    },
    flight: {
        type: 'flight',
        data: {
            flightNumber: 'AA 1234',
            airline: 'American Airlines',
            status: 'active',
            origin: 'Los Angeles',
            originCode: 'LAX',
            destination: 'New York JFK',
            destinationCode: 'JFK',
            departureScheduled: '10:30 AM',
            departureActual: '10:45 AM',
            arrivalScheduled: '7:05 PM',
            arrivalActual: '7:20 PM',
            delayMinutes: 15,
            gate: 'B22',
            terminal: '4',
            aircraft: 'Boeing 737-800',
            altitude: 35000,
            speed: 487,
            progress: 62,
        },
    },
    gmail: {
        type: 'gmail',
        data: {
            mode: 'inbox',
            totalUnread: 3,
            messages: [
                { id: 'm1', threadId: 't1', from: 'sender@example.com', fromName: 'Team Member', subject: 'Q3 Review -- Action Required', snippet: 'Hi, please review the attached slides before our 2pm meeting...', date: '9:14 AM', isUnread: true },
                { id: 'm2', threadId: 't2', from: 'noreply@github.com', fromName: 'GitHub', subject: '[curio-agent] PR #42 merged', snippet: 'Your pull request was merged into main...', date: '8:30 AM', isUnread: true },
                { id: 'm3', threadId: 't3', from: 'friend@example.com', fromName: 'Friend', subject: 'Dinner tonight?', snippet: 'Hey, are you free for dinner around 7?', date: 'Yesterday', isUnread: false },
            ],
        },
        persistent: true,
    },
    timer: {
        type: 'timer',
        data: { label: 'Cooking Timer', targetTime: Date.now() + 300_000, duration: 300_000, completionState: 'running' },
        persistent: true,
    },
    stopwatch: {
        type: 'stopwatch',
        data: { running: true, startTime: Date.now(), pausedElapsed: 0 },
        persistent: true,
    },
    image: {
        type: 'image',
        data: { imageUrl: 'https://images.unsplash.com/photo-1506744626753-1407336b1d46?w=600', caption: 'A beautiful sunset over the mountains' },
    },
    device: {
        type: 'device',
        data: { entityId: 'light.living_room', friendlyName: 'Living Room Light', domain: 'light', action: 'turn_on', state: 'on', resolvedState: 'on', controlKind: 'toggle', supportedActions: ['turn_on', 'turn_off'] },
    },
};

const show = (type: string) => {
    if (!_emitter) {
        console.warn('[CardDebug] No emitter registered. Cards context may not be mounted.');
        return;
    }
    if (type === 'all') {
        Object.values(SAMPLE_DATA).forEach((event, i) => {
            setTimeout(() => _emitter?.(event), i * 200);
        });
        console.log(`[CardDebug] Spawning ${Object.keys(SAMPLE_DATA).length} cards...`);
        return;
    }
    const event = SAMPLE_DATA[type];
    if (!event) {
        console.warn(`[CardDebug] Unknown card type: "${type}". Use __debugCards.list() to see available types.`);
        return;
    }
    _emitter(event);
    console.log(`[CardDebug] Spawned "${type}" card.`);
};

const list = () => {
    console.table(Object.keys(SAMPLE_DATA).map(k => ({ type: k })));
    return Object.keys(SAMPLE_DATA);
};

const clear = () => {
    if (!_emitter) {
        console.warn('[CardDebug] No emitter registered.');
        return;
    }
    _emitter({ type: 'close_all', data: {} });
    console.log('[CardDebug] All cards dismissed.');
};

// Attach to window in dev mode
if (import.meta.env.DEV) {
    (window as any).__debugCards = { show, list, clear };
    console.log('[CardDebug] Ready. Use __debugCards.show("weather"), __debugCards.show("all"), __debugCards.list(), __debugCards.clear()');
}

export { show, list, clear };
