import type { CardEvent, CalculationCardData, UnitConversionCardData, FinanceCardData } from '../../cardTypes';
import { isConversationalOffer } from '../helpers';

export function detectCalculation(original: string): CardEvent | null {
    const patterns = [
        /(\d[\d\s+\-*/×÷().^%]+\d)\s*(?:=|equals|is)\s*(-?[\d,.]+)/,
        /(?:the\s+)?(?:answer|result|total|sum|product|difference|quotient)\s+(?:is|equals|=)\s*(-?[\d,.]+(?:\.\d+)?)/i,
    ];

    for (const pattern of patterns) {
        const m = original.match(pattern);
        if (m) {
            if (m.length === 2) {
                const data: CalculationCardData = { equation: '', result: m[1].trim() };
                return { type: 'calculation', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
            }
            const data: CalculationCardData = { equation: m[1].trim(), result: m[2].trim() };
            return { type: 'calculation', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
        }
    }

    const sciMatch = original.match(/(-?[\d.]+)\s*[×x]\s*10\^(-?\d+)/);
    if (sciMatch) {
        const data: CalculationCardData = {
            equation: `${sciMatch[1]} × 10^${sciMatch[2]}`,
            result: (parseFloat(sciMatch[1]) * Math.pow(10, parseInt(sciMatch[2]))).toExponential(),
        };
        return { type: 'calculation', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
    }

    return null;
}

export function detectUnitConversion(normalized: string, original: string): CardEvent | null {
    if (!/(?:convert|equals|is\s+(?:about|approximately|roughly|equal\s+to)|\bto\b.*\b(?:in|as)\b)/i.test(normalized) &&
        !/\d+\s*\w+\s*(?:=|is)\s*\d/.test(original)) return null;

    const unitCategories: Record<string, string[]> = {
        length: ['meter', 'metre', 'kilometer', 'kilometre', 'mile', 'foot', 'feet', 'inch', 'yard', 'centimeter', 'centimetre', 'millimeter', 'millimetre', 'nautical mile', 'light year', 'parsec', 'furlong', 'fathom'],
        weight: ['gram', 'kilogram', 'pound', 'ounce', 'ton', 'tonne', 'stone', 'milligram', 'microgram', 'carat'],
        volume: ['liter', 'litre', 'gallon', 'quart', 'pint', 'cup', 'tablespoon', 'teaspoon', 'milliliter', 'millilitre', 'fluid ounce', 'barrel'],
        temperature: ['fahrenheit', 'celsius', 'kelvin'],
        speed: ['mph', 'km/h', 'kmh', 'knot', 'mach', 'meters per second', 'feet per second'],
        area: ['acre', 'hectare', 'square meter', 'square foot', 'square feet', 'square mile', 'square kilometer', 'square yard'],
        digital: ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte', 'bit', 'kilobit', 'megabit', 'gigabit'],
        time: ['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year', 'decade', 'century'],
        energy: ['joule', 'calorie', 'kilocalorie', 'watt hour', 'kilowatt hour', 'btu', 'electronvolt'],
        pressure: ['pascal', 'bar', 'psi', 'atmosphere', 'torr', 'mmhg'],
    };

    const convPattern = /(-?[\d,.]+)\s*([a-zA-Z/\s]+?)\s*(?:is|=|equals|is\s+(?:about|approximately|roughly|equal\s+to))\s*(-?[\d,.]+)\s*([a-zA-Z/\s]+)/i;
    const m = original.match(convPattern);
    if (!m) return null;

    const fromValue = parseFloat(m[1].replace(/,/g, ''));
    const fromUnitRaw = m[2].trim().toLowerCase();
    const toValue = parseFloat(m[3].replace(/,/g, ''));
    const toUnitRaw = m[4].trim().toLowerCase().replace(/[.,!?]$/, '');

    if (isNaN(fromValue) || isNaN(toValue)) return null;

    let category = 'general';
    for (const [cat, units] of Object.entries(unitCategories)) {
        const fromMatch = units.some(u => fromUnitRaw.includes(u) || fromUnitRaw.includes(u.replace(/s$/, '')));
        const toMatch = units.some(u => toUnitRaw.includes(u) || toUnitRaw.includes(u.replace(/s$/, '')));
        if (fromMatch || toMatch) { category = cat; break; }
    }

    if (category === 'general') {
        const unitAbbrevs = /\b(km|mi|lb|kg|oz|ft|in|cm|mm|m|l|ml|gal|qt|pt|°f|°c|mph|kmh|mb|gb|tb|kb)\b/i;
        if (!unitAbbrevs.test(fromUnitRaw) && !unitAbbrevs.test(toUnitRaw)) return null;
    }

    const data: UnitConversionCardData = {
        fromValue,
        fromUnit: m[2].trim(),
        toValue,
        toUnit: m[4].trim().replace(/[.,!?]$/, ''),
        category,
    };

    return { type: 'unitConversion', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
}

export function detectFinance(normalized: string, original: string): CardEvent | null {
    const financeKeywords = [
        'stock', 'share price', 'market cap', 'trading at', 'ticker',
        'nasdaq', 'nyse', 'dow jones', 's&p', 'index', 'etf',
        'cryptocurrency', 'crypto', 'bitcoin', 'ethereum', 'btc', 'eth',
        'forex', 'exchange rate', 'currency pair',
    ];
    if (!financeKeywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;

    const patterns = [
        /\b([A-Z]{1,5})\b\s+(?:is\s+)?(?:trading|priced|valued)\s+(?:at\s+)?\$?([\d,.]+)(?:.*?(?:up|down|change(?:d)?|gain(?:ed)?|los[st]|fell|rose|jump(?:ed)?|drop(?:ped)?)\s+(?:by\s+)?\$?([\d,.]+)(?:\s*%|\s+percent)?)?/i,
        /\b([A-Z]{1,5})\b[:\s]+\$?([\d,.]+)(?:\s*\(([+-]?[\d,.]+)%?\))?/,
        /(bitcoin|ethereum|btc|eth|dogecoin|solana)\s+(?:is\s+)?(?:at|trading\s+at|priced\s+at)\s+\$?([\d,.]+)/i,
    ];

    for (const pattern of patterns) {
        const m = original.match(pattern);
        if (m) {
            const symbol = m[1].toUpperCase();
            const price = parseFloat(m[2].replace(/,/g, ''));
            if (isNaN(price) || price <= 0) continue;

            let change = 0;
            let changePercent = 0;
            if (m[3]) {
                const raw = parseFloat(m[3].replace(/,/g, ''));
                if (!isNaN(raw)) {
                    if (m[0].includes('%') || m[0].includes('percent')) {
                        changePercent = raw;
                        change = price * (raw / 100);
                    } else {
                        change = raw;
                        changePercent = (raw / price) * 100;
                    }
                }
            }

            if (change === 0) {
                if (/\b(?:up|gain|rose|jump|surge|rally|climb)\b/i.test(original)) change = Math.abs(change) || 0.01;
                if (/\b(?:down|los[st]|fell|drop|decline|plunge|tumble)\b/i.test(original)) change = -(Math.abs(change) || 0.01);
            }

            const mcapMatch = original.match(/market\s*cap(?:italization)?\s*(?:of|is|:)?\s*\$?([\d,.]+)\s*(billion|trillion|million|B|T|M)?/i);
            const marketCap = mcapMatch ? `${mcapMatch[1]}${mcapMatch[2] ? ' ' + mcapMatch[2] : ''}` : undefined;

            const data: FinanceCardData = {
                symbol,
                price,
                change,
                changePercent: Math.round(changePercent * 100) / 100,
                marketCap,
            };

            return { type: 'finance', data: data as unknown as Record<string, unknown>, autoDismissMs: 12000 };
        }
    }

    return null;
}
