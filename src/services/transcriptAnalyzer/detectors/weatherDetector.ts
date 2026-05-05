import type { CardEvent, WeatherCardData } from '../../cardTypes';

export function detectWeather(normalized: string, original: string): CardEvent | null {
    const cookingExclusions = [
        'bake', 'cook', 'oven', 'preheat', 'recipe', 'ingredient', 'minutes',
        'chicken', 'beef', 'pasta', 'sauce', 'garlic', 'olive oil', 'fry',
        'roast', 'grill', 'saute', 'simmer', 'boil', 'broil',
    ];
    if (cookingExclusions.some(kw => normalized.includes(kw))) return null;

    const medicalExclusions = ['fever', 'body temperature', 'patient', 'blood', 'pulse', 'heart rate'];
    if (medicalExclusions.some(kw => normalized.includes(kw))) return null;

    const weatherKeywords = [
        'weather', 'forecast', 'sunny', 'cloudy', 'rainy', 'rain', 'snow',
        'wind', 'humidity', 'clear sky', 'overcast', 'partly cloudy',
        'drizzle', 'hail', 'sleet', 'blizzard', 'tornado', 'hurricane',
        'heat wave', 'cold front', 'warm front', 'barometric', 'dew point',
        'wind chill', 'heat index', 'uv index', 'precipitation',
    ];
    const hasWeatherKeyword = weatherKeywords.some(kw => normalized.includes(kw));

    const hasTempContext = normalized.includes('temperature') &&
        /outside|today|tonight|tomorrow|currently|right now|this morning|this evening|this afternoon/.test(normalized);

    const hasDegreesContext = /\d+\s*°?\s*(?:f|c)\b/i.test(original) &&
        /outside|today|tonight|tomorrow|forecast|weather|currently/.test(normalized);

    const hasSpokenWeatherQuery = /(?:how'?s?\s+the\s+weather|what'?s?\s+(?:the\s+)?(?:weather|temperature)|is\s+it\s+(?:going\s+to\s+)?(?:rain|snow|cold|hot|warm)|what'?s?\s+it\s+like\s+outside|how\s+(?:hot|cold|warm)\s+is\s+it|do\s+i\s+need\s+(?:a\s+)?(?:jacket|umbrella|coat|sweater)|will\s+it\s+(?:rain|snow|be\s+(?:cold|hot|warm)))/.test(normalized);

    if (!hasWeatherKeyword && !hasTempContext && !hasDegreesContext && !hasSpokenWeatherQuery) return null;

    const forecastKeywords = [
        'forecast', 'next few days', 'this week', 'week ahead', 'upcoming days',
        'next 5 days', 'next five days', '5 day', '5-day', 'tomorrow',
        'next week', 'extended forecast', 'weekly forecast', 'outlook',
    ];
    const isForecast = forecastKeywords.some(kw => normalized.includes(kw));

    const tempMatch = original.match(/(-?\d{1,3})\s*°?\s*(F|C|fahrenheit|celsius)?/i);
    if (!tempMatch && !hasSpokenWeatherQuery) return null;

    const temperature = tempMatch ? parseInt(tempMatch[1], 10) : 0;
    if (tempMatch && (temperature > 140 || temperature < -90)) return null;

    const unit = (tempMatch?.[2]?.toUpperCase().startsWith('C') ? 'C' : 'F') as 'F' | 'C';

    let condition = 'clear';
    const conditionMap: [RegExp, string][] = [
        [/\b(?:thunder|lightning|storm)\b/, 'storm'],
        [/\b(?:snow|blizzard|flurr(?:y|ies)|sleet|ice)\b/, 'snow'],
        [/\b(?:rain|shower|drizzle|downpour|precipitation)\b/, 'rain'],
        [/\b(?:cloud|overcast|grey|gray)\b/, 'cloudy'],
        [/\b(?:fog|mist|haz[ey])\b/, 'fog'],
        [/\b(?:sun|clear|bright|blue sk(?:y|ies))\b/, 'clear'],
        [/\bpartly\s+cloud/, 'partly cloudy'],
        [/\bwind(?:y|s)\b/, 'windy'],
    ];
    for (const [re, cond] of conditionMap) {
        if (re.test(normalized)) { condition = cond; break; }
    }

    const humidityMatch = original.match(/humidity\s*(?:is|of|at|:)?\s*(\d{1,3})\s*%/i);
    const humidity = humidityMatch ? parseInt(humidityMatch[1], 10) : undefined;

    const highLowMatch = original.match(/high\s+(?:of\s+)?(-?\d{1,3}).*?low\s+(?:of\s+)?(-?\d{1,3})/i)
        || original.match(/(-?\d{1,3})\s*\/\s*(-?\d{1,3})/);
    const high = highLowMatch ? parseInt(highLowMatch[1], 10) : temperature + 5;
    const low = highLowMatch ? parseInt(highLowMatch[2], 10) : temperature - 5;

    const data: WeatherCardData = { temperature, condition, high, low, unit, humidity, forecastMode: isForecast };
    return {
        type: 'weather',
        data: data as unknown as Record<string, unknown>,
        autoDismissMs: isForecast ? 25000 : undefined,
    };
}
