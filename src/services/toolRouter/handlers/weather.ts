/**
 * Weather handler. The current weather resolver lives on the live-client
 * handler bag (ctx.handler.get_weather) so this entry just wraps it with
 * card emission.
 */

import { register } from '../router';

register('get_weather', async (args, ctx) => {
    if (!ctx.handler?.get_weather) return { result: { success: false, error: 'Weather handler not available' }, emittedCard: false };
    try {
        const result = await ctx.handler.get_weather(args?.city);
        if (ctx.onCardEvent && result?.weather) {
            const w = result.weather;
            const u = (result.tempUnit === 'C' ? 'C' : 'F') as 'F' | 'C';
            const isForecast = !!args?.forecast;
            try {
                ctx.onCardEvent({
                    type: 'weather',
                    data: {
                        temperature: u === 'C' ? w.tempC : w.tempF,
                        condition: w.desc || 'Clear',
                        high: u === 'C' ? (w.daily?.[0]?.highC ?? w.tempC + 5) : (w.daily?.[0]?.highF ?? w.tempF + 5),
                        low: u === 'C' ? (w.daily?.[0]?.lowC ?? w.tempC - 5) : (w.daily?.[0]?.lowF ?? w.tempF - 5),
                        humidity: w.humidity, unit: u, forecastMode: isForecast,
                        daily: w.daily?.map((d: any) => ({ date: d.date, highF: d.highF, lowF: d.lowF, highC: d.highC, lowC: d.lowC, condition: d.condition, humidity: d.humidity })),
                    },
                    autoDismissMs: isForecast ? 25000 : 15000,
                });
            } catch {}
        }
        return { result, emittedCard: !!result?.weather };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
