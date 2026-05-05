/**
 * Tool declarations for the Gemini Live API session.
 * Extracted from LiveClient.connect() to keep the connection logic clean.
 */

import { Type, FunctionDeclaration } from '@google/genai';

/** All built-in tool declarations that Curio registers with the model. */
export function getBuiltInToolDeclarations(): FunctionDeclaration[] {
    return [
        {
            name: 'show_finance_card',
            description: 'Displays a visual finance card. ONLY call this AFTER you have found the exact, current stock/crypto prices through available market data or configured search grounding. Do NOT guess or use zero values. You MUST pass the actual found price and change.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING, description: 'Ticker symbol' },
                    name: { type: Type.STRING, description: 'Asset name' },
                    price: { type: Type.NUMBER, description: 'Current price' },
                    change: { type: Type.NUMBER, description: 'Price change amount' },
                    changePercent: { type: Type.NUMBER, description: 'Percentage change' },
                    marketCap: { type: Type.STRING, description: 'Market capitalization' },
                    currency: { type: Type.STRING, description: 'Currency (e.g. USD)' },
                },
                required: ['symbol', 'price', 'change', 'changePercent'],
            },
        },
        {
            name: 'get_financial_data',
            description: 'Fetches real-time price, change, and market data for stocks or crypto. ALWAYS use this BEFORE calling show_finance_card if you need reliable market data. Pass a standard ticker symbol.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING, description: 'Ticker symbol (e.g., AAPL, BTC-USD, MSFT)' },
                },
                required: ['symbol'],
            },
        },
        {
            name: 'toggleCamera',
            description: 'Turns the camera on or off for visual recognition and vision tasks.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    enabled: { type: Type.BOOLEAN, description: 'Whether to enable the camera (true) or disable it (false).' },
                },
                required: ['enabled'],
            },
        },
        {
            name: 'flipCamera',
            description: 'Switches the active device camera between front/user-facing and rear/environment-facing cameras when the device has more than one camera. Use when the user asks to flip, switch, use the front camera, or use the back camera. If the camera is off, call toggleCamera(enabled: true) first.',
            parameters: {
                type: Type.OBJECT,
                properties: {},
            },
        },
        {
            name: 'disconnectSession',
            description: 'Ends the current voice session. ONLY call this when the user EXPLICITLY asks to disconnect, end the session, or says goodbye. NEVER call this automatically after completing a task like playing music, setting a timer, or answering a question.',
        },
        {
            name: 'setTimer',
            description: 'Sets a timer or countdown for the user. Use this when the user asks to set a timer, countdown, or alarm. The timer will be displayed on screen with a visual countdown.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    durationSeconds: { type: Type.NUMBER, description: 'Duration of the timer in seconds.' },
                    label: { type: Type.STRING, description: 'A short label for the timer (e.g., "Cooking Timer", "5 Minute Break").' },
                    isAlarm: { type: Type.BOOLEAN, description: 'Whether this is an alarm (true) or a regular timer (false). Alarms play a sound and greet the user when they go off.' },
                },
                required: ['durationSeconds'],
            },
        },
        {
            name: 'saveNote',
            description: 'Saves a note or something the user wants to remember. Use this when the user says "remember this", "write a note", "save this", "note that", or asks you to remember something.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING, description: 'The note text to save.' },
                    category: { type: Type.STRING, description: 'Optional category like "shopping", "idea", "todo", "general".' },
                },
                required: ['text'],
            },
        },
        {
            name: 'getMyNotes',
            description: 'Retrieves all saved personal Curio notes, including note ids and 1-based list indexes for follow-up edits or deletes. Use this when the user asks "what are my notes?", "what did I ask you to remember?", "show my notes", or says "personal notes". This is separate from Obsidian notes and does not require an external notes connection.',
        },
        {
            name: 'deleteNote',
            description: 'Deletes one saved personal Curio note. Use this when the user asks to delete, remove, or erase one of their personal notes. Prefer the id returned by getMyNotes; otherwise use the 1-based index from getMyNotes or exact note text. Do not use this for Obsidian notes.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: 'Exact note id returned by getMyNotes.' },
                    index: { type: Type.NUMBER, description: '1-based note number from the latest getMyNotes result.' },
                    text: { type: Type.STRING, description: 'Exact or distinctive existing note text when no id or index is available.' },
                },
            },
        },
        {
            name: 'updateNote',
            description: 'Edits one saved personal Curio note. Use this when the user asks to change, update, rename, correct, or edit one of their personal notes. Prefer the id returned by getMyNotes; otherwise use the 1-based index from getMyNotes or exact current note text. Do not use this for Obsidian notes.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: 'Exact note id returned by getMyNotes.' },
                    index: { type: Type.NUMBER, description: '1-based note number from the latest getMyNotes result.' },
                    currentText: { type: Type.STRING, description: 'Exact or distinctive current note text when no id or index is available.' },
                    newText: { type: Type.STRING, description: 'The full replacement text for the note.' },
                },
                required: ['newText'],
            },
        },
        {
            name: 'setReminder',
            description: 'Sets a reminder for the user. Use this when the user says "remind me to...", "set a reminder for...", or "don\'t let me forget to...".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING, description: 'What to remind the user about.' },
                    timeDescription: { type: Type.STRING, description: 'When to remind them, in natural language (e.g., "in 30 minutes", "at 5 PM", "tomorrow morning").' },
                    dueDateTime: { type: Type.STRING, description: 'RFC 3339 timestamp for when the task is due, expressed in the user\'s local timezone using the UTC offset from the system prompt (e.g., "2026-04-08T20:00:00-07:00"). Always include the UTC offset, never use "Z" (UTC) unless the offset is +00:00.' },
                },
                required: ['text'],
            },
        },
        {
            name: 'getMyReminders',
            description: 'Retrieves all active reminders. Use this when the user asks "what are my reminders?", "what do I need to do?".',
        },
        {
            name: 'cancelTimer',
            description: 'Cancels an active timer or alarm. Use when the user says "cancel the timer", "stop the alarm", "never mind the timer".',
        },
        {
            name: 'play_music',
            description: 'Searches YouTube for a song and starts in-app music playback. Use this for requests like "play Bohemian Rhapsody", "play jazz music", or "put on a song".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: 'The song, artist, or music query to search for.' },
                },
                required: ['query'],
            },
        },
        {
            name: 'play_youtube_video',
            description: 'Opens an in-app YouTube video player for video playback requests. Use when the user asks to watch/show a video, trailer, clip, tutorial, or says "play this on YouTube". In dashboard mode this should route to the YouTube widget.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: 'Video search query (e.g., "lofi coding stream", "Interstellar trailer").' },
                    videoId: { type: Type.STRING, description: 'Optional explicit YouTube video ID to open directly.' },
                    title: { type: Type.STRING, description: 'Optional preferred title to show in the player context.' },
                    autoplay: { type: Type.BOOLEAN, description: 'Whether playback should autoplay when opened (default true).' },
                },
                required: ['query'],
            },
        },
        {
            name: 'open_dashboard_widget',
            description: 'Ensures a dashboard widget is visible and enabled, adding it when missing. Use when the user asks to add/show/open/enable a specific widget.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    widget: { type: Type.STRING, description: 'Widget name or type (e.g., "weather", "calendar", "youtube", "notes", "chores", "music").' },
                    query: { type: Type.STRING, description: 'Optional default/search query for widgets that support content queries (like YouTube/news).' },
                    videoId: { type: Type.STRING, description: 'Optional YouTube video ID when opening the YouTube widget.' },
                    title: { type: Type.STRING, description: 'Optional title/context string for widget initialization.' },
                    autoplay: { type: Type.BOOLEAN, description: 'Optional autoplay toggle for media widgets.' },
                },
                required: ['widget'],
            },
        },
        {
            name: 'generate_dashboard_theme',
            description: 'Applies a custom visual theme to the dashboard based on the user request. Use when the user asks to restyle, theme, recolor, animate, or make the dashboard look like a mood/place/style such as Matrix, cyberpunk, ocean, space, aurora, plasma, synthwave grid, warm sunrise, fire, snow, rain, storms, fog, underwater bubbles, or AI mesh. For open-ended requests, pass the full natural-language prompt instead of only a simple color so Curio can infer mode, palette, glass, and animation. For novel animated backgrounds that are not one of the hardcoded presets, set animationPreset to generated and provide generatedAnimation so Curio can render that effect with its canvas engine. Respect explicit light mode or dark mode wording.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    prompt: { type: Type.STRING, description: 'Optional natural-language theme request from the user. Use this when the request is stylistic or open-ended.' },
                    themeMode: { type: Type.STRING, description: 'Optional page theme mode: light or dark.' },
                    accentPreset: { type: Type.STRING, description: 'Optional accent preset: cobalt, champagne, verdant, graphite, aurora, neon, coral, moss, orchid, sunrise, arctic, or ember.' },
                    accentColor: { type: Type.STRING, description: 'Optional custom CSS accent color, such as #22f7a5 or rgb(255, 43, 214), when the requested style needs a custom palette beyond presets.' },
                    backgroundStyle: { type: Type.STRING, description: 'Optional background style: default, solid, gradient, image, or animated.' },
                    backgroundColor: { type: Type.STRING, description: 'Optional CSS color or CSS background string, such as a hex color or gradient.' },
                    glassEffectEnabled: { type: Type.BOOLEAN, description: 'Whether translucent dashboard glass should be enabled.' },
                    animationPreset: { type: Type.STRING, description: 'Optional animation preset for animated backgrounds: matrix, particles, waves, starfield, aurora, plasma, grid, or generated. Use generated for new effects not covered by the preset list.' },
                    generatedAnimation: {
                        type: Type.OBJECT,
                        description: 'Optional structured animation spec when animationPreset is generated. This is not JavaScript code; Curio renders it through its safe canvas animation engine.',
                        properties: {
                            kind: { type: Type.STRING, description: 'Generated effect family: particles, mesh, waves, rain, snow, fire, embers, lightning, fog, bubbles, orbits, ribbons, grid, nebula, constellation, scanlines, radar, auroraCurtain, energyRibbons, dataStorm, or wormhole.' },
                            colors: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'One to six CSS colors for the generated effect, such as ["#7dd3fc", "#f0abfc"].' },
                            density: { type: Type.NUMBER, description: 'Motion density from 0 to 100.' },
                            speed: { type: Type.NUMBER, description: 'Motion speed from 0 to 100.' },
                            complexity: { type: Type.NUMBER, description: 'Visual complexity from 0 to 100.' },
                            shape: { type: Type.STRING, description: 'Optional shape style: dots, lines, rings, or glyphs.' },
                            direction: { type: Type.STRING, description: 'Optional motion direction: up, down, left, right, or radial.' },
                            glow: { type: Type.BOOLEAN, description: 'Whether the generated animation should glow.' },
                            layers: {
                                type: Type.ARRAY,
                                description: 'Optional layered cinematic composition. Use this for maximum wow-factor desktop themes. Each layer is still safe JSON, not executable code.',
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        kind: { type: Type.STRING, description: 'Layer effect family: particles, mesh, waves, rain, snow, fire, embers, lightning, fog, bubbles, orbits, ribbons, grid, nebula, constellation, scanlines, radar, auroraCurtain, energyRibbons, dataStorm, or wormhole.' },
                                        colors: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'One to six CSS colors for this layer.' },
                                        density: { type: Type.NUMBER, description: 'Optional layer density from 0 to 100.' },
                                        speed: { type: Type.NUMBER, description: 'Optional layer speed from 0 to 100.' },
                                        complexity: { type: Type.NUMBER, description: 'Optional layer complexity from 0 to 100.' },
                                        opacity: { type: Type.NUMBER, description: 'Layer opacity from 0 to 100.' },
                                        blendMode: { type: Type.STRING, description: 'Canvas blend mode: source-over, screen, lighter, overlay, or multiply.' },
                                        depth: { type: Type.NUMBER, description: 'Layer depth/parallax order from 0 to 100.' },
                                        scale: { type: Type.NUMBER, description: 'Layer scale from 0 to 100.' },
                                        trail: { type: Type.NUMBER, description: 'Motion trail intensity from 0 to 100.' },
                                        pulse: { type: Type.NUMBER, description: 'Pulse/breathing intensity from 0 to 100.' },
                                        turbulence: { type: Type.NUMBER, description: 'Noise/drift turbulence from 0 to 100.' },
                                        blur: { type: Type.NUMBER, description: 'Glow/softness blur from 0 to 100.' },
                                        shape: { type: Type.STRING, description: 'Optional shape style: dots, lines, rings, or glyphs.' },
                                        direction: { type: Type.STRING, description: 'Optional motion direction: up, down, left, right, or radial.' },
                                        glow: { type: Type.BOOLEAN, description: 'Whether this layer should glow.' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            name: 'reset_dashboard_theme',
            description: 'Resets the active dashboard page theme back to the user defaults by clearing generated page colors, background, animation, and glass overrides.',
        },
        { name: 'pause_music', description: 'Pauses the currently playing in-app music track.' },
        { name: 'resume_music', description: 'Resumes the currently paused or ready in-app music track.' },
        { name: 'stop_music', description: 'Stops the current in-app music playback and clears the compact player.' },
        { name: 'get_music_state', description: 'Returns the current in-app music playback state, active track metadata, and whether music is currently available to control.' },
        {
            name: 'get_weather',
            description: 'Retrieves real-time weather, location, air quality (AQI), and 7-day forecast. Without a city parameter, returns the user\'s local weather. With a city parameter, fetches weather for that specific city. Includes humidity, wind speed, and daily forecasts with high/low temps. When the user asks about future weather or forecasts, include the daily forecast data in your response.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    city: { type: Type.STRING, description: 'Optional city name to get weather for (e.g., "Tokyo", "London", "New York"). If omitted, returns the user\'s local weather.' },
                    forecast: { type: Type.BOOLEAN, description: 'Set to true when the user asks about future weather, forecasts, tomorrow, this week, or upcoming days. Shows a larger 5-day forecast card.' },
                },
            },
        },
        {
            name: 'get_calendar_events',
            description: 'Fetches upcoming events from the user\'s calendar. Uses Google, Outlook, or imported iCal calendars depending on what is connected and requested. Use when user asks "what\'s on my calendar?", "do I have anything today?", "what\'s my schedule?", "any meetings tomorrow?". Returns events and automatically shows a calendar card. Imported iCal calendars are read-only.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    maxResults: { type: Type.NUMBER, description: 'Max events to return (default 10)' },
                    timeMin: { type: Type.STRING, description: 'Start of time range as RFC 3339 (e.g., "2026-04-14T00:00:00-07:00"). Defaults to now.' },
                    timeMax: { type: Type.STRING, description: 'End of time range as RFC 3339 (e.g., "2026-04-15T00:00:00-07:00"). Optional.' },
                    provider: { type: Type.STRING, description: 'Optional calendar provider: auto, google, outlook, or ical.' },
                    calendarSourceId: { type: Type.STRING, description: 'Optional imported iCal source id. Use "all" for all imported iCal calendars.' },
                },
            },
        },
        {
            name: 'create_calendar_event',
            description: 'Creates a new event on the user\'s Google Calendar. Use when user says "add a meeting", "schedule lunch", "put X on my calendar", "create an event". Requires Google OAuth sign-in.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: 'Event title' },
                    startDateTime: { type: Type.STRING, description: 'Start time as RFC 3339 with timezone offset (e.g., "2026-04-15T14:00:00-07:00")' },
                    endDateTime: { type: Type.STRING, description: 'End time as RFC 3339 with timezone offset. Defaults to 1 hour after start.' },
                    location: { type: Type.STRING, description: 'Event location' },
                    description: { type: Type.STRING, description: 'Event description or notes' },
                    allDay: { type: Type.BOOLEAN, description: 'Whether this is an all-day event' },
                },
                required: ['title', 'startDateTime'],
            },
        },
        {
            name: 'update_calendar_event',
            description: 'Updates an existing Google Calendar event. Use when user says "move my meeting to 3 PM", "rename the event", "change the location". You must first call get_calendar_events to find the event ID.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    eventId: { type: Type.STRING, description: 'The event ID from get_calendar_events' },
                    title: { type: Type.STRING, description: 'New title (omit to keep current)' },
                    startDateTime: { type: Type.STRING, description: 'New start time as RFC 3339 (omit to keep current)' },
                    endDateTime: { type: Type.STRING, description: 'New end time as RFC 3339 (omit to keep current)' },
                    location: { type: Type.STRING, description: 'New location (omit to keep current)' },
                    description: { type: Type.STRING, description: 'New description (omit to keep current)' },
                },
                required: ['eventId'],
            },
        },
        {
            name: 'delete_calendar_event',
            description: 'Deletes an event from the user\'s Google Calendar. Use when user says "cancel my meeting", "remove the event", "delete the appointment". You must first call get_calendar_events to find the event ID.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    eventId: { type: Type.STRING, description: 'The event ID from get_calendar_events' },
                    title: { type: Type.STRING, description: 'Title of the event being deleted (for confirmation message)' },
                },
                required: ['eventId'],
            },
        },
        {
            name: 'set_alarm',
            description: 'Sets a recurring or one-time alarm. Use when user says "set an alarm for 7 AM", "wake me up at 6".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    time: { type: Type.STRING, description: 'Alarm time in HH:mm 24h format (e.g., "07:00", "22:30")' },
                    label: { type: Type.STRING, description: 'Label for the alarm' },
                    days: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Days to repeat (e.g., ["Mon","Tue","Wed"]). Empty for one-time.' },
                },
                required: ['time'],
            },
        },
        { name: 'get_alarms', description: 'Shows all saved alarms. Use when user says "show my alarms", "what alarms do I have", "open alarms".' },
        {
            name: 'delete_alarm',
            description: 'Deletes an alarm by its label or time. Use when user says "delete the 7 AM alarm", "remove my morning alarm".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    alarmId: { type: Type.STRING, description: 'The alarm ID to delete' },
                    label: { type: Type.STRING, description: 'Label of alarm to delete (fuzzy match)' },
                    time: { type: Type.STRING, description: 'Time of alarm to delete (HH:mm)' },
                },
            },
        },
        {
            name: 'show_directions',
            description: 'Shows a directions/map card. Use when user asks "how do I get to...", "directions to...", "navigate to...".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    destination: { type: Type.STRING, description: 'Destination address or place' },
                    origin: { type: Type.STRING, description: 'Starting point (default: current location)' },
                    travelMode: { type: Type.STRING, description: 'Travel mode: driving, walking, transit, bicycling' },
                    distance: { type: Type.STRING, description: 'Estimated distance' },
                    duration: { type: Type.STRING, description: 'Estimated travel time' },
                    steps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { instruction: { type: Type.STRING }, distance: { type: Type.STRING } }, required: ['instruction', 'distance'] } },
                    mapUrl: { type: Type.STRING, description: 'URL to open in maps app' },
                },
                required: ['destination'],
            },
        },
        {
            name: 'show_air_quality',
            description: 'Shows an air quality card. Use when user asks about air quality, AQI, pollution levels.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    aqi: { type: Type.NUMBER, description: 'AQI value' },
                    category: { type: Type.STRING, description: 'Category (Good, Moderate, Unhealthy, etc.)' },
                    pollutant: { type: Type.STRING, description: 'Primary pollutant' },
                    pm25: { type: Type.NUMBER, description: 'PM2.5 level' },
                    pm10: { type: Type.NUMBER, description: 'PM10 level' },
                    o3: { type: Type.NUMBER, description: 'Ozone level' },
                    no2: { type: Type.NUMBER, description: 'NO2 level' },
                    advice: { type: Type.STRING, description: 'Health advice' },
                },
                required: ['aqi', 'category'],
            },
        },
        {
            name: 'show_joke',
            description: 'Shows a joke card with setup and punchline reveal. Use when user asks for a joke. Read the setup aloud, then pause briefly to let the user tap "Reveal Punchline" on the card, or read the punchline yourself after a beat.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    setup: { type: Type.STRING, description: 'The joke setup' },
                    punchline: { type: Type.STRING, description: 'The punchline' },
                    category: { type: Type.STRING, description: 'Joke category' },
                },
                required: ['setup', 'punchline'],
            },
        },
        {
            name: 'show_trivia',
            description: 'Shows an interactive trivia/quiz card. Use when user asks for trivia, quiz, or "test my knowledge". IMPORTANT: After calling this tool, you MUST read the question aloud and list the answer options (A, B, C, D) so the user can hear them. Wait for the user to answer before revealing the correct one.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING, description: 'The trivia question' },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: '4 answer options' },
                    correctIndex: { type: Type.NUMBER, description: 'Index of correct answer (0-3)' },
                    explanation: { type: Type.STRING, description: 'Explanation of the answer' },
                    category: { type: Type.STRING, description: 'Category (Science, History, etc.)' },
                },
                required: ['question', 'options', 'correctIndex'],
            },
        },
        {
            name: 'show_unit_conversion',
            description: 'Shows a unit conversion card. Use when user asks "how many cups in a liter", "convert 5 miles to km".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    fromValue: { type: Type.NUMBER, description: 'Original value' },
                    fromUnit: { type: Type.STRING, description: 'Original unit' },
                    toValue: { type: Type.NUMBER, description: 'Converted value' },
                    toUnit: { type: Type.STRING, description: 'Target unit' },
                    category: { type: Type.STRING, description: 'Category (length, weight, temperature, volume, speed, area, time, data)' },
                },
                required: ['fromValue', 'fromUnit', 'toValue', 'toUnit', 'category'],
            },
        },
        {
            name: 'show_definition',
            description: 'Shows a word definition card. Use when user asks "define X", "what does X mean", "definition of X". Always use this tool instead of just speaking the definition.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    word: { type: Type.STRING, description: 'The word being defined' },
                    pronunciation: { type: Type.STRING, description: 'Phonetic pronunciation (e.g., "/ˈkjʊəriəs/")' },
                    partOfSpeech: { type: Type.STRING, description: 'Part of speech (noun, verb, adjective, etc.)' },
                    definition: { type: Type.STRING, description: 'The definition text' },
                },
                required: ['word', 'definition'],
            },
        },
        {
            name: 'show_calculation',
            description: 'Shows a calculation/math result card. Use for ANY math question: "what is 5 + 3", "calculate 15% of 200", "square root of 144". Always use this tool for math.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    equation: { type: Type.STRING, description: 'The math expression (e.g., "5 + 3", "15% of 200")' },
                    result: { type: Type.STRING, description: 'The computed result' },
                },
                required: ['equation', 'result'],
            },
        },
        {
            name: 'show_translation',
            description: 'Shows a translation card. Use when user asks "how do you say X in Spanish", "translate X to French", or any translation request. Always use this tool for translations.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    originalText: { type: Type.STRING, description: 'The original text' },
                    translatedText: { type: Type.STRING, description: 'The translated text' },
                    sourceLanguage: { type: Type.STRING, description: 'Source language (e.g., "English")' },
                    targetLanguage: { type: Type.STRING, description: 'Target language (e.g., "Spanish")' },
                },
                required: ['originalText', 'translatedText', 'sourceLanguage', 'targetLanguage'],
            },
        },
        {
            name: 'show_sports_score',
            description: 'Shows a sports score card. Use when user asks about game scores, match results, "what was the score of the game", "who won the match". Search for the latest score first, then display it.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    homeTeam: { type: Type.STRING, description: 'Home team name' },
                    awayTeam: { type: Type.STRING, description: 'Away team name' },
                    homeScore: { type: Type.NUMBER, description: 'Home team score' },
                    awayScore: { type: Type.NUMBER, description: 'Away team score' },
                    status: { type: Type.STRING, description: 'Game status (e.g., "Final", "In Progress", "Q3 5:42", "Half-time")' },
                    homeLogoUrl: { type: Type.STRING, description: 'URL of home team logo image (optional)' },
                    awayLogoUrl: { type: Type.STRING, description: 'URL of away team logo image (optional)' },
                },
                required: ['homeTeam', 'awayTeam', 'homeScore', 'awayScore', 'status'],
            },
        },
        {
            name: 'show_quote',
            description: 'Shows a quote card. Use when user asks for a quote, "give me a quote", "inspirational quote", or when you share a famous quote. Always use this tool instead of just speaking the quote.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    quote: { type: Type.STRING, description: 'The quote text' },
                    author: { type: Type.STRING, description: 'Who said it' },
                },
                required: ['quote', 'author'],
            },
        },
        {
            name: 'show_fun_fact',
            description: 'Shows a fun fact card. Use when you share a fun fact, "did you know" moment, or interesting trivia fact. Also use when user asks "tell me a fun fact", "tell me something interesting". Always use this tool instead of just speaking the fact.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    fact: { type: Type.STRING, description: 'The fun fact text' },
                },
                required: ['fact'],
            },
        },
        {
            name: 'show_recipe',
            description: 'Shows a recipe card with ingredients and step-by-step instructions. ALWAYS use this tool when the user asks for a recipe, how to cook something, or food preparation instructions. Provide complete ingredients list and detailed steps.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: 'Recipe name (e.g., "Chicken Parmesan")' },
                    ingredients: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of ingredients with quantities (e.g., "2 cups flour", "1 lb chicken breast")' },
                    steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Step-by-step cooking instructions' },
                },
                required: ['title', 'ingredients', 'steps'],
            },
        },
        {
            name: 'show_astronomy',
            description: 'Shows astronomy info card (sunrise, sunset, moon phase, etc.). Use when user asks about sunrise, sunset, moon, astronomy.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    sunrise: { type: Type.STRING, description: 'Sunrise time' },
                    sunset: { type: Type.STRING, description: 'Sunset time' },
                    moonPhase: { type: Type.STRING, description: 'Moon phase name' },
                    moonIllumination: { type: Type.NUMBER, description: 'Moon illumination percentage' },
                    dayLength: { type: Type.STRING, description: 'Length of day' },
                    goldenHour: { type: Type.STRING, description: 'Golden hour time' },
                    nextEvent: { type: Type.STRING, description: 'Next astronomical event' },
                    nextEventTime: { type: Type.STRING, description: 'Time of next event' },
                },
            },
        },
        {
            name: 'show_commute',
            description: 'Shows a commute/traffic card. Use when user asks about commute, traffic, "how long to get to work".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    origin: { type: Type.STRING, description: 'Starting point' },
                    destination: { type: Type.STRING, description: 'Destination' },
                    duration: { type: Type.STRING, description: 'Normal duration' },
                    durationInTraffic: { type: Type.STRING, description: 'Duration with current traffic' },
                    distance: { type: Type.STRING, description: 'Distance' },
                    trafficCondition: { type: Type.STRING, description: 'Traffic: light, moderate, heavy, unknown' },
                    route: { type: Type.STRING, description: 'Route name' },
                    departureTime: { type: Type.STRING, description: 'Suggested departure time' },
                },
                required: ['origin', 'destination', 'duration', 'distance', 'trafficCondition'],
            },
        },
        {
            name: 'show_camera',
            description: 'Shows a Home Assistant camera feed card AND streams frames for vision analysis. Use when user asks "what do you see at the front door?", "show me the garage camera", "what\'s happening in the backyard?", "check the doorbell". If a camera is already showing, calling this again switches to the new camera without duplicating. Do NOT use toggleCamera for HA cameras.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    entityId: { type: Type.STRING, description: 'HA camera entity ID (e.g., camera.front_door)' },
                    cameraName: { type: Type.STRING, description: 'Friendly name of the camera' },
                },
                required: ['entityId', 'cameraName'],
            },
        },
        {
            name: 'close_camera',
            description: 'Closes/dismisses the camera feed card. Use when user says "close the camera", "hide the camera", "stop showing the camera".',
        },
        {
            name: 'show_thermostat',
            description: 'Shows a thermostat card with current/target temperature and HVAC mode. Use when user asks about thermostat, temperature at home, or after adjusting climate.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    entityId: { type: Type.STRING, description: 'HA climate entity ID' },
                    name: { type: Type.STRING, description: 'Thermostat name' },
                    currentTemp: { type: Type.NUMBER, description: 'Current temperature' },
                    targetTemp: { type: Type.NUMBER, description: 'Target temperature' },
                    hvacMode: { type: Type.STRING, description: 'HVAC mode: heat, cool, heat_cool, auto, off, fan_only, dry' },
                    humidity: { type: Type.NUMBER, description: 'Current humidity percentage' },
                    unit: { type: Type.STRING, description: 'Temperature unit: F or C' },
                    supportedModes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Supported HVAC modes' },
                },
                required: ['entityId', 'name', 'currentTemp', 'targetTemp', 'hvacMode'],
            },
        },
        {
            name: 'search_places',
            description: 'Searches for places, businesses, restaurants, attractions, or any point of interest using Google Places API. Use when user asks "find a restaurant near me", "coffee shops nearby", "best pizza in New York", "gas stations around here", "pharmacies open now", etc. Returns name, address, rating, opening hours, phone, and Google Maps link. If the user\'s location is known, results are biased toward that area.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: 'Search query (e.g., "Italian restaurants", "gas stations", "pharmacies open now")' },
                    latitude: { type: Type.NUMBER, description: 'Optional latitude to bias results toward (from user location)' },
                    longitude: { type: Type.NUMBER, description: 'Optional longitude to bias results toward (from user location)' },
                    radiusMeters: { type: Type.NUMBER, description: 'Optional search radius in meters (default 10000)' },
                },
                required: ['query'],
            },
        },
        {
            name: 'get_directions',
            description: 'Fetches real-time directions with live traffic data using Google Routes API. ALWAYS call this BEFORE show_directions or show_commute to get accurate distance, duration, traffic conditions, and turn-by-turn steps. Pass the user\'s coordinates as originLatitude/originLongitude when available for best results.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    origin: { type: Type.STRING, description: 'Starting address or place name (used if no lat/lng provided)' },
                    destination: { type: Type.STRING, description: 'Destination address or place name' },
                    travelMode: { type: Type.STRING, description: 'Travel mode: driving, walking, bicycling, transit (default: driving)' },
                    originLatitude: { type: Type.NUMBER, description: 'Origin latitude (from user location for best accuracy)' },
                    originLongitude: { type: Type.NUMBER, description: 'Origin longitude (from user location for best accuracy)' },
                },
                required: ['destination'],
            },
        },
        // ── Obsidian notes tools ──
        {
            name: 'obsidian_search_notes',
            description: 'Searches the user\'s Obsidian vault for notes matching a query. Use when the user asks to find, search, or look up notes in Obsidian. Requires Obsidian with Local REST API plugin.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: 'Search query to find notes' },
                },
                required: ['query'],
            },
        },
        {
            name: 'obsidian_read_note',
            description: 'Reads the content of a specific note from the user\'s Obsidian vault by file path. Use when the user asks to read, open, or show a specific Obsidian note.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    path: { type: Type.STRING, description: 'Path to the note in the vault (e.g. "Daily/2026-04-14.md" or "Projects/ideas.md")' },
                },
                required: ['path'],
            },
        },
        {
            name: 'obsidian_create_note',
            description: 'Creates a new note in the user\'s Obsidian vault. Use when the user asks to create, write, or save a new note to Obsidian.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    path: { type: Type.STRING, description: 'Path for the new note (e.g. "Notes/my-note.md"). Must end in .md' },
                    content: { type: Type.STRING, description: 'Markdown content for the note' },
                },
                required: ['path', 'content'],
            },
        },
        {
            name: 'obsidian_append_note',
            description: 'Appends content to an existing note in the user\'s Obsidian vault. Use when the user asks to add to, append to, or update an existing Obsidian note.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    path: { type: Type.STRING, description: 'Path to the existing note (e.g. "Daily/2026-04-14.md")' },
                    content: { type: Type.STRING, description: 'Markdown content to append' },
                },
                required: ['path', 'content'],
            },
        },
        {
            name: 'run_routine',
            description: 'Runs a saved Curio routine by ID. Use the [ROUTINES] section in the system prompt to find the exact routineId that matches the user\'s configured voice trigger or named routine.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    routineId: { type: Type.STRING, description: 'The saved routine ID to run.' },
                },
                required: ['routineId'],
            },
        },
        {
            name: 'list_routines',
            description: 'Lists all configured routines with their names, triggers, steps, and enabled status. Use when user asks "what routines do I have?", "show my routines", "list my automations".',
        },
        {
            name: 'list_notifications',
            description: 'Lists all configured proactive notification rules (calendar, reminders, weather, custom schedules) with their settings. Use when user asks "what notifications do I have?", "show my notification settings", "what alerts are set up?".',
        },
        // ── Chore / Task rotation ──
        {
            name: 'show_chores',
            description: 'Shows the chore/task rotation card. Use when user asks "show my chores", "what chores are left", "task list", "who does what".',
        },
        {
            name: 'add_chore',
            description: 'Adds a new chore or task to the rotation list.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: 'Name of the chore or task' },
                    assignee: { type: Type.STRING, description: 'Person assigned to this chore (optional)' },
                    recurring: { type: Type.STRING, description: 'Recurrence: daily, weekly, or monthly (optional)' },
                },
                required: ['name'],
            },
        },
        {
            name: 'complete_chore',
            description: 'Marks a chore as completed. Use when user says "I did the dishes", "mark vacuuming done", "finished the laundry".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: 'Name of the chore to mark complete (fuzzy match)' },
                },
                required: ['name'],
            },
        },
        {
            name: 'reset_chores',
            description: 'Resets all chores to incomplete. Use when user says "reset chores", "start fresh", "new week".',
        },
        // ── Energy dashboard ──
        {
            name: 'show_energy',
            description: 'Shows the home energy dashboard card. Use when user asks about power usage, energy consumption, solar production, battery level, or electricity cost. Fetch data from Home Assistant energy sensors first.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    currentUsageW: { type: Type.NUMBER, description: 'Current power usage in watts' },
                    todayKwh: { type: Type.NUMBER, description: 'Energy used today in kWh' },
                    monthKwh: { type: Type.NUMBER, description: 'Energy used this month in kWh' },
                    solarProductionW: { type: Type.NUMBER, description: 'Current solar production in watts' },
                    solarTodayKwh: { type: Type.NUMBER, description: 'Solar energy produced today in kWh' },
                    gridImportW: { type: Type.NUMBER, description: 'Power being imported from grid in watts' },
                    gridExportW: { type: Type.NUMBER, description: 'Power being exported to grid in watts' },
                    batteryPercent: { type: Type.NUMBER, description: 'Battery charge percentage (0-100)' },
                    batteryCharging: { type: Type.BOOLEAN, description: 'Whether battery is currently charging' },
                    costToday: { type: Type.NUMBER, description: 'Estimated cost today in local currency' },
                    costCurrency: { type: Type.STRING, description: 'Currency symbol (e.g. $, EUR)' },
                },
            },
        },
        // ── Security ──
        {
            name: 'show_security',
            description: 'Shows the home security card with alarm state, lock status, and recent events. Use when user asks about home security, alarm status, whether doors are locked, or recent security events.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    alarmState: { type: Type.STRING, description: 'Alarm state: disarmed, armed_home, armed_away, armed_night, triggered, pending, arming, unknown' },
                    alarmEntityId: { type: Type.STRING, description: 'HA alarm entity ID' },
                    alarmName: { type: Type.STRING, description: 'Friendly name of the alarm panel' },
                    locks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                entityId: { type: Type.STRING },
                                name: { type: Type.STRING },
                                state: { type: Type.STRING, description: 'locked, unlocked, or unknown' },
                                area: { type: Type.STRING },
                            },
                            required: ['entityId', 'name', 'state'],
                        },
                        description: 'List of lock entities and their states',
                    },
                    recentEvents: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                time: { type: Type.STRING },
                                description: { type: Type.STRING },
                                type: { type: Type.STRING },
                            },
                            required: ['time', 'description', 'type'],
                        },
                        description: 'Recent security events',
                    },
                },
                required: ['alarmState'],
            },
        },
        // ── Flight tracking ──
        {
            name: 'track_flight',
            description: 'Looks up and shows a flight tracking card. Use when user asks about a flight by number (e.g. "track AA123", "where is United 456") OR by route (e.g. "flights from New York to LA"). No API key required for basic lookups.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    flightNumber: { type: Type.STRING, description: 'Flight number (e.g. "AA123", "UA456"). Use this for number-based lookups.' },
                    originCity: { type: Type.STRING, description: 'Origin city or airport name/code for route-based lookups (e.g. "New York", "JFK")' },
                    destinationCity: { type: Type.STRING, description: 'Destination city or airport name/code for route-based lookups (e.g. "Los Angeles", "LAX")' },
                },
            },
        },
        // ── Gmail ──
        {
            name: 'check_gmail',
            description: 'Reads the user\'s Gmail inbox or searches for emails. Use when user asks "check my email", "any new emails?", "do I have messages from X", "search my email for Y". Requires Gmail OAuth sign-in.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: 'Optional Gmail search query (e.g. "from:sender@example.com", "subject:invoice", "is:unread"). Leave empty for inbox.' },
                    maxResults: { type: Type.NUMBER, description: 'Max emails to fetch (default 10)' },
                },
            },
        },
        {
            name: 'reply_gmail',
            description: 'Replies to a Gmail email. ONLY call this when the user EXPLICITLY says "reply", "respond", "send a reply", or "write back". NEVER reply automatically. If gmail_reply_enabled is false, tell the user to enable replies in Settings.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    threadId: { type: Type.STRING, description: 'Thread ID of the email to reply to' },
                    messageId: { type: Type.STRING, description: 'Message ID of the email to reply to' },
                    to: { type: Type.STRING, description: 'Recipient email address' },
                    subject: { type: Type.STRING, description: 'Subject of the original email' },
                    body: { type: Type.STRING, description: 'The reply message body' },
                },
                required: ['threadId', 'messageId', 'to', 'subject', 'body'],
            },
        },
        // ── Microsoft Outlook ──
        {
            name: 'get_outlook_events',
            description: 'Fetches upcoming events from the user\'s Microsoft Outlook calendar. Use when user asks about their Outlook calendar, schedule, or meetings and they use Outlook. Requires Microsoft OAuth sign-in.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    maxResults: { type: Type.NUMBER, description: 'Max events to return (default 10)' },
                    timeMin: { type: Type.STRING, description: 'Start of time range as RFC 3339 (defaults to now)' },
                    timeMax: { type: Type.STRING, description: 'End of time range as RFC 3339' },
                },
            },
        },
        {
            name: 'create_outlook_event',
            description: 'Creates a new event on the user\'s Microsoft Outlook calendar. Use when user says "add a meeting to Outlook", "schedule in Outlook". Requires Microsoft OAuth sign-in.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: 'Event title' },
                    startDateTime: { type: Type.STRING, description: 'Start time as RFC 3339 with timezone offset' },
                    endDateTime: { type: Type.STRING, description: 'End time as RFC 3339 (defaults to 1 hour after start)' },
                    location: { type: Type.STRING, description: 'Event location' },
                    description: { type: Type.STRING, description: 'Event description' },
                },
                required: ['title', 'startDateTime'],
            },
        },
        {
            name: 'update_outlook_event',
            description: 'Updates an existing Microsoft Outlook calendar event. Call get_outlook_events first to find the event ID.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    eventId: { type: Type.STRING, description: 'The event ID from get_outlook_events' },
                    title: { type: Type.STRING, description: 'New title (omit to keep current)' },
                    startDateTime: { type: Type.STRING, description: 'New start time as RFC 3339 (omit to keep current)' },
                    endDateTime: { type: Type.STRING, description: 'New end time as RFC 3339 (omit to keep current)' },
                    location: { type: Type.STRING, description: 'New location (omit to keep current)' },
                    description: { type: Type.STRING, description: 'New description (omit to keep current)' },
                },
                required: ['eventId'],
            },
        },
        {
            name: 'delete_outlook_event',
            description: 'Deletes an event from the user\'s Microsoft Outlook calendar. Call get_outlook_events first to find the event ID.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    eventId: { type: Type.STRING, description: 'The event ID from get_outlook_events' },
                    title: { type: Type.STRING, description: 'Title of the event being deleted (for confirmation message)' },
                },
                required: ['eventId'],
            },
        },
        {
            name: 'check_outlook_mail',
            description: 'Reads the user\'s Outlook inbox or searches for emails. Use when user asks "check my Outlook email", "any new Outlook messages?", "search Outlook for X". Requires Microsoft OAuth sign-in.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    query: { type: Type.STRING, description: 'Optional search query (e.g. "from:sender@example.com", "subject:invoice"). Leave empty for inbox.' },
                    maxResults: { type: Type.NUMBER, description: 'Max emails to fetch (default 10)' },
                },
            },
        },
        {
            name: 'reply_outlook_mail',
            description: 'Replies to an Outlook email. ONLY call when user EXPLICITLY says "reply". NEVER reply automatically. If outlook_reply_enabled is false, tell the user to enable replies in Settings.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    messageId: { type: Type.STRING, description: 'Message ID of the email to reply to' },
                    body: { type: Type.STRING, description: 'The reply message body' },
                },
                required: ['messageId', 'body'],
            },
        },
        {
            name: 'send_outlook_mail',
            description: 'Sends a new email via Outlook. Use when user says "send an email via Outlook", "email X using Outlook".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    to: { type: Type.STRING, description: 'Recipient email address' },
                    subject: { type: Type.STRING, description: 'Email subject' },
                    body: { type: Type.STRING, description: 'Email body text' },
                },
                required: ['to', 'subject', 'body'],
            },
        },
        // ── Slack ──
        {
            name: 'send_slack_message',
            description: 'Sends a message to a Slack channel or user. Use when user says "send a Slack message", "message X on Slack", "post to #channel".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    channel: { type: Type.STRING, description: 'Channel name (e.g. "#general") or user name' },
                    text: { type: Type.STRING, description: 'Message text to send' },
                },
                required: ['channel', 'text'],
            },
        },
        {
            name: 'get_slack_messages',
            description: 'Fetches recent messages from Slack. Use when user asks "what\'s on my Slack?", "check my Slack messages", "show Slack messages", "any Slack messages?", "what\'s in #general?". If no channel is specified, fetches messages from the most active recent channel automatically.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    channel: { type: Type.STRING, description: 'Optional channel name (e.g. "#general") or channel ID. If omitted, fetches from the most active channel.' },
                    limit: { type: Type.NUMBER, description: 'Max messages to return (default 15)' },
                },
            },
        },
        {
            name: 'list_slack_channels',
            description: 'Lists available Slack channels. Use when user asks "what Slack channels do I have?", "show my Slack channels".',
        },
        // ── GitHub ──
        {
            name: 'check_github',
            description: 'Fetches a structured snapshot from GitHub and shows a GitHub response card. Use when the user asks about GitHub pull requests, issues, repositories, notifications, workflow runs, or releases. Requires GitHub connection (PAT, OAuth, or the built-in GitHub Remote MCP server).',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    view: {
                        type: Type.STRING,
                        description: 'Which slice to return: overview, pull_requests, issues, repos, notifications, workflow_runs, or releases. Defaults to overview.',
                    },
                    owner: { type: Type.STRING, description: 'Repository owner. Required for workflow_runs and releases, optional for pull_requests/issues.' },
                    repo: { type: Type.STRING, description: 'Repository name. Required for workflow_runs and releases.' },
                    repoFullName: { type: Type.STRING, description: 'Convenience: "owner/repo" string, parsed instead of owner+repo.' },
                    state: { type: Type.STRING, description: 'open, closed, or all. Defaults to open.' },
                    maxItems: { type: Type.NUMBER, description: 'Max items to return (default 10, max 25).' },
                },
            },
        },
        {
            name: 'show_news',
            description: 'Shows a news card with headlines. Use when you have news headlines to share after searching. Provide an array of items with headline, source, and optional summary.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { headline: { type: Type.STRING }, source: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ['headline'] }, description: 'News items with headline, source, and optional summary' },
                    source: { type: Type.STRING, description: 'Default source name if not per-item' },
                },
                required: ['items'],
            },
        },
        {
            name: 'show_list',
            description: 'Shows a visual list card. Use when presenting a numbered or bulleted list of items to the user (e.g., "top 5 movies", "here are your options", "steps to do X"). Always prefer this over just speaking a long list.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: 'List title (e.g., "Top 5 Movies", "Shopping List")' },
                    items: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List items as strings' },
                },
                required: ['title', 'items'],
            },
        },
        {
            name: 'show_sensor_reading',
            description: 'Shows a sensor reading card for Home Assistant sensors. Use when user asks about a specific sensor value (temperature, humidity, power, battery level, etc.). Fetch the sensor data from HA first, then display it.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    entityId: { type: Type.STRING, description: 'HA sensor entity ID (e.g., sensor.living_room_temperature)' },
                    name: { type: Type.STRING, description: 'Friendly name of the sensor' },
                    value: { type: Type.STRING, description: 'Current sensor value' },
                    unit: { type: Type.STRING, description: 'Unit of measurement (e.g., "°F", "%", "W")' },
                    icon: { type: Type.STRING, description: 'Optional icon name' },
                },
                required: ['entityId', 'name', 'value'],
            },
        },
        {
            name: 'show_home_status',
            description: 'Shows a home status overview card with door/window/motion/presence states. Use when user asks "are any doors open?", "home status", "is anyone home?", "check the house". Fetch entity states from HA first.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    doors: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, state: { type: Type.STRING } }, required: ['name', 'state'] }, description: 'Door sensor states' },
                    windows: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, state: { type: Type.STRING } }, required: ['name', 'state'] }, description: 'Window sensor states' },
                    motion: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, state: { type: Type.STRING } }, required: ['name', 'state'] }, description: 'Motion sensor states' },
                    presence: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, state: { type: Type.STRING } }, required: ['name', 'state'] }, description: 'Presence/person states' },
                    summary: { type: Type.STRING, description: 'Brief summary of home status' },
                },
            },
        },
        {
            name: 'show_stopwatch',
            description: 'Shows a stopwatch card that the user can start, stop, lap, and reset. Use when user says "start a stopwatch", "I need a stopwatch", "time me".',
        },
    ] as FunctionDeclaration[];
}

/**
 * Build the final tools array for the Gemini session config.
 * Handles Google Search grounding and MCP tool merging.
 *
 * For 3.1 Live models on the free tier, native googleSearch grounding causes
 * an immediate disconnect. Instead we expose a `google_search` function call
 * that proxies through Flash Lite's text API with search grounding enabled.
 */
export function buildToolsArray(
    modelName: string,
    mcpTools: FunctionDeclaration[],
): any[] {
    const useNativeGoogleSearch = !modelName.includes('3.1');
    const toolsArray: any[] = [];

    if (useNativeGoogleSearch) {
        toolsArray.push({ googleSearch: {} });
        console.log('[ToolDeclarations] Google Search grounding ENABLED for model:', modelName);
    } else {
        console.log('[ToolDeclarations] Native Google Search grounding DISABLED for model:', modelName, '-- using Flash Lite search proxy');
    }

    const builtIn = getBuiltInToolDeclarations();

    // For 3.1: add the proxy google_search function declaration.
    // NOTE: the description is deliberately restrictive so the model doesn't
    // fire a search on every "what is X" utterance. Rule 3 in the system prompt
    // reinforces this with explicit negative examples.
    const searchProxy: FunctionDeclaration[] = useNativeGoogleSearch ? [] : [{
        name: 'google_search',
        description: "Search the web. This is a METERED, rate-limited tool -- every call costs quota. Call it ONLY when the answer strictly requires fresh, real-world data you cannot already know: today's news, today's/future weather forecast, live sports scores, current stock or crypto prices, or events from the last few weeks. Before calling, ask yourself: 'Would a reasonable answer exist in general knowledge?' If yes, DO NOT call -- answer directly. DO NOT call for: greetings, small talk, acknowledgements ('ok', 'thanks'), math, unit or currency conversions, definitions, spelling, grammar, jokes, quotes, trivia, recipes, historical facts, science concepts, how-to explanations, biographies of well-known figures, or anything already covered by the system prompt or other tools (weather now, time, calendar, HA devices). Never call more than once per user turn. Never call with a single keyword or a greeting.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: {
                    type: Type.STRING,
                    description: 'A focused, multi-word search query (minimum 4 characters, must contain a space). Example: "SpaceX launch schedule April 2026". Bad: "SpaceX", "hi", "what".',
                },
            },
            required: ['query'],
        },
    }];

    const isSearchMcpTool = (tool: FunctionDeclaration) => {
        const searchableText = `${tool.name || ''} ${tool.description || ''}`;
        return /search|fresh\/current public information|code\/documentation|company\/business/i.test(searchableText);
    };
    // Gemini Live always has a search path here: native Google Search on
    // non-3.1 models, or Curio's google_search proxy on 3.1 models. External
    // search MCPs such as Exa are fallback-only for backends without search.
    const filteredMcp = mcpTools.filter(t => !isSearchMcpTool(t));
    const allDeclarations = [...builtIn, ...searchProxy, ...filteredMcp]
        .filter(t => useNativeGoogleSearch ? t.name !== 'get_financial_data' : true);

    toolsArray.push({ functionDeclarations: allDeclarations });

    console.log('[ToolDeclarations] MCP tools included:', filteredMcp.map(t => t.name).join(', ') || 'none');
    return toolsArray;
}
