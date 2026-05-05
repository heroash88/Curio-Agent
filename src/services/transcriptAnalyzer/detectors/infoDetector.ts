import type { CardEvent, SportsScoreCardData, AirQualityCardData, AstronomyCardData, CommuteCardData, MapCardData } from '../../cardTypes';
import { isConversationalOffer, isQuestion, keywordScore } from '../helpers';

export function detectSportsScore(normalized: string, original: string): CardEvent | null {
    try {
        const keywords = [
            'score', 'beat', 'defeated', 'won', 'lost', 'final score',
            'quarter-final', 'semifinal', 'semi-final', 'championship',
            'league', 'match', 'game', 'playoff', 'series', 'tournament',
            'overtime', 'penalty', 'shootout', 'innings', 'set point',
            'match point', 'grand slam', 'world cup', 'super bowl',
        ];
        if (!keywords.some(kw => normalized.includes(kw))) return null;
        if (isConversationalOffer(normalized)) return null;
        if (isQuestion(normalized)) return null;

        const nonSportsScore = ['credit score', 'test score', 'score a deal', 'score a ', 'high score', 'score points', 'music score'];
        if (nonSportsScore.some(ns => normalized.includes(ns))) return null;

        const inferStatus = (): string => {
            if (/final\s*score|final$/i.test(normalized)) return 'Final';
            if (/quarter.?final/i.test(normalized)) return 'Quarter-finals';
            if (/semi.?final/i.test(normalized)) return 'Semi-finals';
            if (/half.?time/i.test(normalized)) return 'Half-time';
            if (/in progress|live|ongoing|currently/i.test(normalized)) return 'In Progress';
            if (/overtime|extra time|OT/i.test(normalized)) return 'Overtime';
            if (/penalty|shootout/i.test(normalized)) return 'Penalties';
            return 'Final';
        };

        const dashPattern = /([A-Z][a-zA-Z\s]+?)\s+(\d+)\s*[-–]\s*(\d+)\s+([A-Z][a-zA-Z\s]+)/;
        const dashMatch = original.match(dashPattern);
        if (dashMatch) {
            const data: SportsScoreCardData = {
                homeTeam: dashMatch[1].trim(), awayTeam: dashMatch[4].trim(),
                homeScore: parseInt(dashMatch[2], 10), awayScore: parseInt(dashMatch[3], 10),
                status: inferStatus(),
            };
            return { type: 'sportsScore', data: data as unknown as Record<string, unknown>, autoDismissMs: 15000 };
        }

        const beatPattern = /([A-Z][a-zA-Z\s]+?)\s+(?:beat|defeated|won against|edged|topped|crushed|dominated|swept|eliminated)\s+(?:the\s+)?([A-Z][a-zA-Z\s]+?)\s+(\d+)\s*(?:to|[-–])\s*(\d+)/i;
        const beatMatch = original.match(beatPattern);
        if (beatMatch) {
            const data: SportsScoreCardData = {
                homeTeam: beatMatch[1].trim(), awayTeam: beatMatch[2].trim(),
                homeScore: parseInt(beatMatch[3], 10), awayScore: parseInt(beatMatch[4], 10),
                status: inferStatus(),
            };
            return { type: 'sportsScore', data: data as unknown as Record<string, unknown>, autoDismissMs: 15000 };
        }

        const lostPattern = /([A-Z][a-zA-Z\s]+?)\s+lost\s+to\s+(?:the\s+)?([A-Z][a-zA-Z\s]+?)\s+(\d+)\s*(?:to|[-–])\s*(\d+)/i;
        const lostMatch = original.match(lostPattern);
        if (lostMatch) {
            const data: SportsScoreCardData = {
                homeTeam: lostMatch[2].trim(), awayTeam: lostMatch[1].trim(),
                homeScore: parseInt(lostMatch[4], 10), awayScore: parseInt(lostMatch[3], 10),
                status: inferStatus(),
            };
            return { type: 'sportsScore', data: data as unknown as Record<string, unknown>, autoDismissMs: 15000 };
        }

        const scoreWasPattern = /score\s+(?:was|is|ended|stands)\s+(?:at\s+)?(\d+)\s*(?:to|[-–])\s*(\d+)/i;
        const scoreWasMatch = original.match(scoreWasPattern);
        if (scoreWasMatch) {
            const teamPattern = /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g;
            const teams: string[] = [];
            let m;
            const excludeWords = new Set([
                'The', 'Yesterday', 'Today', 'Tomorrow', 'Monday', 'Tuesday', 'Wednesday',
                'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March',
                'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
                'December', 'Champions', 'League', 'Quarter', 'Semi', 'Final', 'Score',
                'Game', 'Match', 'World', 'Cup', 'Series', 'Bowl', 'Super', 'National',
                'American', 'International', 'Premier', 'Division', 'Conference',
            ]);
            while ((m = teamPattern.exec(original)) !== null) {
                const name = m[1].trim();
                if (name.length > 2 && !excludeWords.has(name)) teams.push(name);
            }
            if (teams.length >= 2) {
                const data: SportsScoreCardData = {
                    homeTeam: teams[0], awayTeam: teams[1],
                    homeScore: parseInt(scoreWasMatch[1], 10), awayScore: parseInt(scoreWasMatch[2], 10),
                    status: inferStatus(),
                };
                return { type: 'sportsScore', data: data as unknown as Record<string, unknown>, autoDismissMs: 15000 };
            }
        }

        return null;
    } catch {
        return null;
    }
}

export function detectAirQuality(normalized: string, original: string): CardEvent | null {
    const keywords = ['air quality', 'aqi', 'pm2.5', 'pm10', 'ozone', 'air pollution', 'particulate matter', 'smog', 'air index', 'pollen count'];
    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;

    const aqiMatch = original.match(/(?:aqi|air\s+quality\s+index)\s*(?:is|of|at|:)?\s*(\d{1,3})/i)
        || original.match(/(\d{1,3})\s*(?:aqi|air\s+quality\s+index)/i);
    const aqi = aqiMatch ? parseInt(aqiMatch[1], 10) : 0;

    let category = 'Unknown';
    if (aqi > 0) {
        if (aqi <= 50) category = 'Good';
        else if (aqi <= 100) category = 'Moderate';
        else if (aqi <= 150) category = 'Unhealthy for Sensitive Groups';
        else if (aqi <= 200) category = 'Unhealthy';
        else if (aqi <= 300) category = 'Very Unhealthy';
        else category = 'Hazardous';
    } else {
        const catMap: [RegExp, string][] = [
            [/\bgood\b/, 'Good'], [/\bmoderate\b/, 'Moderate'],
            [/\bunhealthy\s+for\s+sensitive/, 'Unhealthy for Sensitive Groups'],
            [/\bunhealthy\b/, 'Unhealthy'], [/\bvery\s+unhealthy\b/, 'Very Unhealthy'],
            [/\bhazardous\b/, 'Hazardous'],
        ];
        for (const [re, cat] of catMap) { if (re.test(normalized)) { category = cat; break; } }
    }

    const pm25Match = original.match(/pm\s*2\.?5\s*(?:is|of|at|:)?\s*([\d.]+)/i);
    const pm10Match = original.match(/pm\s*10\s*(?:is|of|at|:)?\s*([\d.]+)/i);
    const o3Match = original.match(/ozone\s*(?:is|of|at|:)?\s*([\d.]+)/i);
    const no2Match = original.match(/(?:no2|nitrogen\s+dioxide)\s*(?:is|of|at|:)?\s*([\d.]+)/i);
    const adviceMatch = original.match(/(?:recommend|advise|suggest|tip)[:\s]+(.+?)(?:\.|$)/i);

    const data: AirQualityCardData = {
        aqi: aqi || 0, category,
        pm25: pm25Match ? parseFloat(pm25Match[1]) : undefined,
        pm10: pm10Match ? parseFloat(pm10Match[1]) : undefined,
        o3: o3Match ? parseFloat(o3Match[1]) : undefined,
        no2: no2Match ? parseFloat(no2Match[1]) : undefined,
        advice: adviceMatch ? adviceMatch[1].trim() : undefined,
    };

    return { type: 'airQuality', data: data as unknown as Record<string, unknown>, autoDismissMs: 12000 };
}

export function detectAstronomy(normalized: string, original: string): CardEvent | null {
    const keywords = [
        'sunrise', 'sunset', 'moon phase', 'moonrise', 'moonset',
        'golden hour', 'blue hour', 'solar noon', 'twilight',
        'full moon', 'new moon', 'crescent', 'waxing', 'waning',
        'gibbous', 'quarter moon', 'lunar', 'eclipse', 'solstice',
        'equinox', 'day length', 'night length', 'astronomical',
    ];

    if (keywordScore(normalized, keywords) < 1) return null;
    if (isConversationalOffer(normalized)) return null;

    const sunriseMatch = original.match(/sunrise\s*(?:is|at|:)?\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    const sunsetMatch = original.match(/sunset\s*(?:is|at|:)?\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    const goldenMatch = original.match(/golden\s+hour\s*(?:is|at|starts?|begins?|:)?\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);

    const timePattern = /(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?)/g;
    const times = [...original.matchAll(timePattern)].map(m => m[1]);

    let moonPhase: string | undefined;
    const moonPhases = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'third quarter', 'waning crescent'];
    for (const phase of moonPhases) { if (normalized.includes(phase)) { moonPhase = phase; break; } }

    const illumMatch = original.match(/(?:illumination|illuminated|lit)\s*(?:is|of|at|:)?\s*(\d{1,3})\s*%/i);
    const dayLenMatch = original.match(/day\s+length\s*(?:is|of|:)?\s*([\d]+\s*(?:hours?|hrs?)\s*(?:and\s+)?[\d]*\s*(?:minutes?|mins?)?)/i);

    const data: AstronomyCardData = {
        sunrise: sunriseMatch?.[1] || (times[0] && normalized.includes('sunrise') ? times[0] : undefined),
        sunset: sunsetMatch?.[1] || (times[1] && normalized.includes('sunset') ? times[1] : undefined),
        moonPhase,
        moonIllumination: illumMatch ? parseInt(illumMatch[1], 10) : undefined,
        dayLength: dayLenMatch ? dayLenMatch[1].trim() : undefined,
        goldenHour: goldenMatch?.[1],
    };

    const hasData = data.sunrise || data.sunset || data.moonPhase || data.moonIllumination || data.dayLength || data.goldenHour;
    if (!hasData) return null;

    return { type: 'astronomy', data: data as unknown as Record<string, unknown>, autoDismissMs: 12000 };
}

export function detectCommute(normalized: string, original: string): CardEvent | null {
    const keywords = ['commute', 'drive time', 'travel time', 'traffic', 'eta', 'estimated time', 'route', 'how long to get', 'how long to drive', 'how long to walk'];
    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;
    if (isQuestion(normalized)) return null;

    const durationMatch = original.match(/(?:takes?|about|approximately|around|roughly|estimated)\s+([\d]+\s*(?:hours?|hrs?|minutes?|mins?)(?:\s*(?:and\s+)?[\d]+\s*(?:minutes?|mins?))?)/i)
        || original.match(/([\d]+\s*(?:hours?|hrs?|minutes?|mins?))\s+(?:drive|commute|travel|trip)/i);
    const distanceMatch = original.match(/([\d,.]+)\s*(?:miles?|mi|kilometers?|km)\b/i);

    let trafficCondition: 'light' | 'moderate' | 'heavy' | 'unknown' = 'unknown';
    if (/\b(?:light|clear|no)\s+traffic\b/i.test(normalized)) trafficCondition = 'light';
    else if (/\b(?:moderate|normal|typical)\s+traffic\b/i.test(normalized)) trafficCondition = 'moderate';
    else if (/\b(?:heavy|bad|terrible|congested|gridlock|backed up)\b/i.test(normalized)) trafficCondition = 'heavy';

    const fromToMatch = original.match(/from\s+(.+?)\s+to\s+(.+?)(?:\.|,|!|$)/i);

    if (!durationMatch && !distanceMatch && trafficCondition === 'unknown') return null;

    const data: CommuteCardData = {
        origin: fromToMatch ? fromToMatch[1].trim() : '',
        destination: fromToMatch ? fromToMatch[2].trim() : '',
        duration: durationMatch ? durationMatch[1].trim() : '',
        distance: distanceMatch ? `${distanceMatch[1]} ${distanceMatch[2] || ''}`.trim() : '',
        trafficCondition,
    };

    return { type: 'commute', data: data as unknown as Record<string, unknown>, autoDismissMs: 12000 };
}

export function detectMap(normalized: string, original: string): CardEvent | null {
    const keywords = [
        'directions to', 'navigate to', 'how to get to', 'route to',
        'directions from', 'turn left', 'turn right', 'head north',
        'head south', 'head east', 'head west', 'take the exit',
        'merge onto', 'continue on', 'follow the', 'take highway',
    ];
    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;

    const destMatch = original.match(/(?:directions?\s+to|navigate\s+to|route\s+to|how\s+to\s+get\s+to)\s+(.+?)(?:\.|,|!|\?|$)/i);
    const destination = destMatch ? destMatch[1].trim() : '';
    if (!destination) return null;

    const originMatch = original.match(/(?:from|starting\s+(?:at|from))\s+(.+?)\s+(?:to|toward)/i);

    let travelMode: 'driving' | 'walking' | 'transit' | 'bicycling' = 'driving';
    if (/\b(?:walk|walking|on\s+foot|pedestrian)\b/i.test(normalized)) travelMode = 'walking';
    else if (/\b(?:transit|bus|train|subway|metro|public\s+transport)\b/i.test(normalized)) travelMode = 'transit';
    else if (/\b(?:bike|bicycle|cycling|biking)\b/i.test(normalized)) travelMode = 'bicycling';

    const distMatch = original.match(/([\d,.]+)\s*(?:miles?|mi|kilometers?|km)\b/i);
    const durMatch = original.match(/([\d]+\s*(?:hours?|hrs?|minutes?|mins?)(?:\s*(?:and\s+)?[\d]+\s*(?:minutes?|mins?))?)/i);

    const steps: Array<{ instruction: string; distance: string }> = [];
    const stepMatches = original.matchAll(/(?:\d+[.)]\s*|[-•]\s*)((?:turn|head|merge|continue|take|go|follow|keep|exit|enter|cross|walk|drive)\s+[^.!]+[.!]?)/gi);
    for (const sm of stepMatches) { steps.push({ instruction: sm[1].trim(), distance: '' }); }

    const data: MapCardData = {
        origin: originMatch ? originMatch[1].trim() : undefined,
        destination,
        travelMode,
        distance: distMatch ? `${distMatch[1]} ${distMatch[2] || ''}`.trim() : undefined,
        duration: durMatch ? durMatch[1].trim() : undefined,
        steps: steps.length > 0 ? steps : undefined,
    };

    return { type: 'map', data: data as unknown as Record<string, unknown>, autoDismissMs: 20000 };
}
