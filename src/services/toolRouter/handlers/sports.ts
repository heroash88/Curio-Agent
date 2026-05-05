/**
 * Sports score card handler. Falls back to the Wikipedia REST summary API
 * to find a team logo when the caller did not supply one.
 */

import { register } from '../router';

register('show_sports_score', async (args, ctx) => {
    const homeTeam = args.homeTeam || '';
    const awayTeam = args.awayTeam || '';
    let homeLogoUrl = args.homeLogoUrl || '';
    let awayLogoUrl = args.awayLogoUrl || '';

    if (!homeLogoUrl || !awayLogoUrl) {
        const SPORT_SUFFIXES = ['', ' FC', ' F.C.', ' CF', ' (basketball)', ' (NBA)', ' (NFL)', ' (American football)', ' (MLB)', ' (baseball)', ' (NHL)', ' (ice hockey)', ' (soccer)'];
        const fetchLogo = async (team: string): Promise<string> => {
            for (const suffix of SPORT_SUFFIXES) {
                try {
                    const query = (team + suffix).replace(/\s+/g, '_');
                    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                    if (!res.ok) continue;
                    const json = await res.json();
                    const desc = ((json.description || '') + ' ' + (json.extract || '')).toLowerCase();
                    const isSportsRelated = /club|team|football|soccer|basketball|baseball|hockey|nba|nfl|mlb|nhl|league|athletic|sport|franchise|roster|season|coach|stadium|arena/.test(desc);
                    if (json.thumbnail?.source && isSportsRelated) return json.thumbnail.source;
                } catch {}
            }
            return '';
        };
        const [homeLogo, awayLogo] = await Promise.all([
            homeLogoUrl ? Promise.resolve(homeLogoUrl) : fetchLogo(homeTeam),
            awayLogoUrl ? Promise.resolve(awayLogoUrl) : fetchLogo(awayTeam),
        ]);
        homeLogoUrl = homeLogo;
        awayLogoUrl = awayLogo;
    }

    if (ctx.onCardEvent) {
        try {
            ctx.onCardEvent({
                type: 'sportsScore',
                data: { homeTeam, awayTeam, homeScore: args.homeScore ?? 0, awayScore: args.awayScore ?? 0, status: args.status || 'Final', homeLogoUrl, awayLogoUrl },
            });
        } catch {}
    }
    return {
        result: {
            success: true,
            message: 'Sports score card displayed. Use these score details in your reply.',
            homeTeam,
            awayTeam,
            homeScore: args.homeScore ?? 0,
            awayScore: args.awayScore ?? 0,
            status: args.status || 'Final',
        },
        emittedCard: true,
    };
});
