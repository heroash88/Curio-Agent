import type {
    CardEvent, RecipeCardData, NewsCardData, CalendarCardData,
    JokeCardData, TriviaCardData, DefinitionCardData,
    FunFactCardData, QuoteCardData, ListCardData,
} from '../../cardTypes';
import { isConversationalOffer, isQuestion, keywordScore } from '../helpers';

export function detectRecipe(normalized: string, original: string): CardEvent | null {
    try {
        const strongKeywords = [
            'recipe for', 'recipe is', 'ingredients', "here's how to make",
            "you'll need", 'steps to make', 'how to cook', 'how to make',
            'here is a recipe', 'here\'s a recipe', 'cooking instructions',
            'preparation steps', 'method:', 'directions:',
        ];
        const weakKeywords = [
            'toss some', 'mix together', 'combine the', 'stir in', 'add the',
            'bake at', 'cook for', 'preheat', 'season with', 'marinate',
            'saute', 'simmer', 'bring to a boil', 'let it rest',
        ];

        const hasStrongKeyword = strongKeywords.some(kw => normalized.includes(kw));
        const weakScore = keywordScore(normalized, weakKeywords);

        const cookingIngredients = /\b(chicken|beef|pork|fish|salmon|shrimp|lamb|turkey|tofu|pasta|rice|garlic|onion|olive oil|butter|salt|pepper|flour|sugar|egg|milk|cheese|sauce|cream|lemon|tomato|basil|oregano|thyme|rosemary|paprika|cumin|cinnamon|ginger|soy sauce|honey|vinegar|broth|stock|mushroom|potato|carrot|celery|bell pepper|avocado|spinach|kale|quinoa|lentil|bean|chickpea|coconut)\b/i;
        const hasCookingContext = cookingIngredients.test(normalized);

        if (!hasStrongKeyword && !(weakScore >= 2 && hasCookingContext)) return null;
        if (isConversationalOffer(normalized)) return null;

        const titleMatch = original.match(/recipe\s+(?:for|is)\s+(.+?)(?:\.|,|:|!|$)/i)
            || original.match(/how\s+to\s+(?:make|cook|prepare|bake)\s+(.+?)(?:\.|,|:|!|$)/i)
            || original.match(/here'?s?\s+(?:a\s+)?(?:recipe\s+for|how\s+to\s+make)\s+(.+?)(?:\.|,|:|!|$)/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Recipe';

        const ingredients: string[] = [];
        const ingredientMatches = original.match(/[-•*]\s*([^\n,]+)/g);
        if (ingredientMatches) {
            for (const item of ingredientMatches) ingredients.push(item.replace(/^[-•*]\s*/, '').trim());
        }

        if (ingredients.length === 0) {
            const foodItems = original.match(/\b(?:chicken|beef|pork|fish|salmon|shrimp|lamb|turkey|tofu|pasta|rice|garlic|onion|olive oil|butter|salt|pepper|flour|sugar|eggs?|milk|cheese|cream|lemon|tomato|basil|oregano|thyme|rosemary|paprika|cumin|cinnamon|ginger|soy sauce|honey|vinegar|broth|stock|mushrooms?|potatoes?|carrots?|celery|bell peppers?|avocado|spinach|kale|quinoa|lentils?|beans?|chickpeas?|coconut)\b/gi);
            if (foodItems) {
                const unique = [...new Set(foodItems.map(f => f.toLowerCase()))];
                unique.forEach(item => ingredients.push(item.charAt(0).toUpperCase() + item.slice(1)));
            }
        }

        const steps: string[] = [];
        const stepMatches = original.match(/\d+[.)]\s*([^\n]+)/g);
        if (stepMatches) {
            for (const step of stepMatches) steps.push(step.replace(/^\d+[.)]\s*/, '').trim());
        }

        if (steps.length === 0) {
            const actionPatterns = original.match(/(?:toss|mix|combine|stir|add|bake|cook|fry|boil|grill|roast|season|preheat|marinate|saute|simmer|let it|serve|drain|chop|dice|slice|mince|whisk|fold|knead|roll|spread|brush|drizzle|garnish|plate)\s+[^.!]+[.!]/gi);
            if (actionPatterns) actionPatterns.slice(0, 8).forEach(step => steps.push(step.trim()));
        }

        const data: RecipeCardData = { title, ingredients, steps };
        return { type: 'recipe', data: data as unknown as Record<string, unknown>, autoDismissMs: 12000 };
    } catch { return null; }
}

export function detectNews(normalized: string, original: string): CardEvent | null {
    try {
        const strongKeywords = ['breaking news', 'headline', 'latest news', 'top stories', 'news update', 'current events', 'news flash'];
        const weakKeywords = ['reported', 'according to', 'sources say', 'officials say', 'announced today', 'press release'];

        if (!strongKeywords.some(kw => normalized.includes(kw)) && keywordScore(normalized, weakKeywords) < 2) return null;
        if (isConversationalOffer(normalized)) return null;

        const sourceMatch = original.match(/(?:according to|reported by|source:\s*|from\s+)([A-Z][a-zA-Z\s]+?)(?:[,.]|\s+that|\s+reports)/i);
        const source = sourceMatch ? sourceMatch[1].trim() : 'News';

        const items: Array<{ headline: string; source: string; summary: string }> = [];
        const numberedItems = original.match(/\d+[.)]\s*([^\n]+)/g);
        const lines = original.split('\n').map(l => l.trim()).filter(l => l.length > 10);

        if (numberedItems && numberedItems.length > 1) {
            for (const item of numberedItems) {
                const cleaned = item.replace(/^\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim();
                if (cleaned.length > 0) items.push({ headline: cleaned, source, summary: '' });
            }
        } else if (lines.length > 1) {
            for (const line of lines) {
                const cleaned = line.replace(/^\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim();
                if (cleaned.length > 0) items.push({ headline: cleaned, source, summary: '' });
            }
        }

        if (items.length === 0) {
            const headlineMatch = original.match(/headline[:\s]+(.+?)(?:\.|$)/i);
            items.push({ headline: headlineMatch ? headlineMatch[1].trim() : original.substring(0, 80).trim(), source, summary: original.substring(0, 200).trim() });
        }

        const data: NewsCardData = { items };
        return { type: 'news', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
    } catch { return null; }
}

export function detectCalendar(normalized: string, original: string): CardEvent | null {
    const keywords = [
        'calendar', 'schedule', 'agenda', 'appointment', 'meeting',
        'event today', 'events today', 'upcoming events', 'your schedule',
        'you have a meeting', 'scheduled for', 'on your calendar',
    ];
    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;
    if (isQuestion(normalized)) return null;

    const events: Array<{ title: string; startTime: string; endTime?: string; location?: string; allDay?: boolean }> = [];

    const numberedItems = original.matchAll(/\d+[.)]\s*(.+?)(?:\n|$)/g);
    for (const item of numberedItems) {
        const text = item[1].trim();
        const timeMatch = text.match(/(?:at|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        const endTimeMatch = text.match(/(?:to|until|-)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        const locationMatch = text.match(/(?:at|in|@)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$)/i);
        events.push({
            title: text.replace(/(?:at|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, '').trim() || text,
            startTime: timeMatch ? timeMatch[1] : '',
            endTime: endTimeMatch ? endTimeMatch[1] : undefined,
            location: locationMatch ? locationMatch[1].trim() : undefined,
        });
    }

    if (events.length === 0) {
        const singleMatch = original.match(/(?:you\s+have\s+(?:a|an)\s+)?(.+?)\s+(?:at|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (singleMatch) events.push({ title: singleMatch[1].trim(), startTime: singleMatch[2] });
    }

    if (events.length === 0 && /all\s*day/i.test(normalized)) {
        const allDayMatch = original.match(/(?:all\s*day)\s*(?:event|:)?\s*(.+?)(?:\.|,|$)/i);
        if (allDayMatch) events.push({ title: allDayMatch[1].trim(), startTime: '', allDay: true });
    }

    if (events.length === 0) return null;

    const data: CalendarCardData = { events, date: new Date().toISOString().split('T')[0] };
    return { type: 'calendar', data: data as unknown as Record<string, unknown>, autoDismissMs: 12000 };
}

export function detectJoke(normalized: string, original: string): CardEvent | null {
    const jokeIntros = [
        'here\'s a joke', 'here is a joke', 'knock knock', 'why did the',
        'what do you call', 'what did the', 'how do you', 'a man walks into',
        'what\'s the difference between', 'why don\'t', 'why can\'t',
        'what happens when', 'did you hear about', 'i\'ve got a joke',
        'here\'s one for you', 'joke:', 'riddle:',
    ];
    if (!jokeIntros.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;
    if (original.length < 20) return null;

    let setup = '';
    let punchline = '';

    const qaMatch = original.match(/(?:Q:|Question:)\s*(.+?)\s*(?:A:|Answer:)\s*(.+?)(?:\.|!|$)/i);
    if (qaMatch) { setup = qaMatch[1].trim(); punchline = qaMatch[2].trim(); }

    if (!punchline) {
        const questionAnswer = original.match(/((?:why|what|how|where|when|who)\s+.+?\?)\s*(.+?)(?:\.|!|$)/i);
        if (questionAnswer) { setup = questionAnswer[1].trim(); punchline = questionAnswer[2].trim(); }
    }

    if (!punchline) {
        const knockMatch = original.match(/knock\s+knock[.!]?\s*who'?s\s+there\??\s*(.+?)[.!]?\s*\1\s+who\??\s*(.+?)(?:\.|!|$)/i);
        if (knockMatch) { setup = `Knock knock! Who's there? ${knockMatch[1]}. ${knockMatch[1]} who?`; punchline = knockMatch[2].trim(); }
    }

    if (!punchline) {
        const sentences = original.split(/(?<=[.!?])\s+/);
        if (sentences.length >= 2) {
            const mid = Math.ceil(sentences.length / 2);
            setup = sentences.slice(0, mid).join(' ').trim();
            punchline = sentences.slice(mid).join(' ').trim();
        } else { setup = original; punchline = ''; }
    }

    if (!setup) return null;

    let category: string | undefined;
    if (/knock knock/i.test(normalized)) category = 'Knock-knock';
    else if (/\bpun\b|wordplay/i.test(normalized)) category = 'Pun';
    else if (/\bdad\s+joke/i.test(normalized)) category = 'Dad joke';
    else if (/\briddle/i.test(normalized)) category = 'Riddle';

    const data: JokeCardData = { setup, punchline, category };
    return { type: 'joke', data: data as unknown as Record<string, unknown>, autoDismissMs: 10000 };
}

export function detectTrivia(normalized: string, original: string): CardEvent | null {
    const keywords = ['trivia', 'quiz', 'multiple choice', 'test your knowledge', 'trivia question', 'quiz question', 'pop quiz', 'brain teaser'];
    if (!keywords.some(kw => normalized.includes(kw))) return null;
    if (isConversationalOffer(normalized)) return null;

    const questionMatch = original.match(/(?:question|trivia|quiz)[:\s]+(.+?\?)/i) || original.match(/(.+?\?)/);
    const question = questionMatch ? questionMatch[1].trim() : '';
    if (!question) return null;

    const options: string[] = [];
    const letterOptions = original.matchAll(/\b([A-D])[.)]\s*(.+?)(?=\b[A-D][.)]\s|\n|$)/gi);
    for (const opt of letterOptions) options.push(opt[2].trim());

    if (options.length === 0) {
        const numberedOptions = original.matchAll(/\b([1-4])[.)]\s*(.+?)(?=\b[1-4][.)]\s|\n|$)/g);
        for (const opt of numberedOptions) options.push(opt[2].trim());
    }

    let correctIndex = 0;
    const answerMatch = original.match(/(?:answer|correct)\s*(?:is|:)\s*(?:option\s+)?([A-D1-4])/i);
    if (answerMatch) {
        const ans = answerMatch[1].toUpperCase();
        if (/[A-D]/.test(ans)) correctIndex = ans.charCodeAt(0) - 65;
        else correctIndex = parseInt(ans) - 1;
    }

    const explMatch = original.match(/(?:explanation|because|the reason)[:\s]+(.+?)(?:\.|!|$)/i);
    const catMatch = original.match(/(?:category|topic)[:\s]+(.+?)(?:\.|,|!|$)/i);

    const data: TriviaCardData = {
        question,
        options: options.length >= 2 ? options : ['True', 'False'],
        correctIndex: Math.min(correctIndex, Math.max(options.length - 1, 1)),
        explanation: explMatch ? explMatch[1].trim() : undefined,
        category: catMatch ? catMatch[1].trim() : undefined,
    };

    return { type: 'trivia', data: data as unknown as Record<string, unknown>, autoDismissMs: 15000 };
}

export function detectDefinition(_normalized: string, original: string): CardEvent | null {
    try {
        if (!/\b(?:definition|defined|means|refers to|describes|denotes|signifies|the word|the term|the concept)\b/i.test(original)) return null;
        if (/\?/.test(original) && original.length < 150) return null;
        if (/^(?:hey|hi|hello|what's|how's|good|nice|great)/i.test(original.trim())) return null;

        const patterns = [
            /(?:the\s+word\s+)?[""\u201C]?(\w{2,})[""\u201D]?\s+is\s+defined\s+as\s+(.+?)(?:\.|$)/i,
            /the\s+word\s+[""\u201C]?(\w{2,})[""\u201D]?\s+means\s+(.+?)(?:\.|$)/i,
            /definition\s+of\s+[""\u201C]?(\w{2,})[""\u201D]?[:\s]+(.+?)(?:\.|$)/i,
            /(?:the\s+)?(?:term|word|concept)\s+[""\u201C]?(\w{2,})[""\u201D]?\s+(?:refers\s+to|describes|denotes|signifies|represents)\s+(.+?)(?:\.|$)/i,
            /[""\u201C]?(\w{2,})[""\u201D]?\s*[:\-\u2013]\s*(?:a|an)\s+(?:noun|verb|adjective|adverb)\s+(?:meaning\s+|that\s+means\s+)(.+?)(?:\.|$)/i,
        ];

        for (const pattern of patterns) {
            const match = original.match(pattern);
            if (match) {
                const word = match[1].trim();
                const definition = match[2].trim();
                if (!word || !definition || definition.length < 10) continue;
                if (word.length < 2 || word.length > 30) continue;

                const trivialWords = new Set([
                    'it', 'this', 'that', 'i', 'we', 'they', 'he', 'she', 'the', 'a', 'an',
                    'is', 'are', 'was', 'were', 'what', 'how', 'why', 'when', 'where', 'who',
                    'my', 'your', 'our', 'their', 'its', 'his', 'her', 'me', 'you', 'us',
                    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may',
                    'pop', 'hey', 'hi', 'hello', 'ok', 'okay', 'sure', 'yeah', 'yes', 'no',
                ]);
                if (trivialWords.has(word.toLowerCase())) continue;
                if (/^(?:today|tonight|tomorrow|here|there|now|up|going|doing)/i.test(definition)) continue;

                const posMatch = original.match(/\b(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection)\b/i);
                const pronMatch = original.match(/(?:pronounced|pronunciation)[:\s]+[/\[]?(.+?)[/\]]?(?:\s|,|\.)/i);

                const data: DefinitionCardData = {
                    word, definition,
                    partOfSpeech: posMatch ? posMatch[1].toLowerCase() : undefined,
                    pronunciation: pronMatch ? pronMatch[1].trim() : undefined,
                };
                return { type: 'definition', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
            }
        }
        return null;
    } catch { return null; }
}

export function detectTranslation(normalized: string, original: string): CardEvent | null {
    try {
        const languages = [
            'spanish', 'french', 'german', 'italian', 'portuguese', 'japanese',
            'chinese', 'mandarin', 'cantonese', 'korean', 'russian', 'arabic',
            'hindi', 'dutch', 'swedish', 'greek', 'turkish', 'polish', 'hebrew',
            'thai', 'vietnamese', 'indonesian', 'malay', 'tagalog', 'filipino',
            'swahili', 'czech', 'danish', 'finnish', 'norwegian', 'hungarian',
            'romanian', 'ukrainian', 'persian', 'farsi', 'urdu', 'bengali',
            'tamil', 'telugu', 'marathi', 'gujarati', 'punjabi', 'nepali',
            'sinhala', 'burmese', 'khmer', 'lao', 'mongolian', 'tibetan',
            'amharic', 'yoruba', 'igbo', 'hausa', 'zulu', 'xhosa',
            'afrikaans', 'catalan', 'basque', 'galician', 'welsh', 'irish',
            'scottish gaelic', 'icelandic', 'latvian', 'lithuanian', 'estonian',
            'slovenian', 'croatian', 'serbian', 'bosnian', 'albanian',
            'macedonian', 'bulgarian', 'slovak', 'maltese', 'luxembourgish',
            'esperanto', 'latin', 'sanskrit',
        ];

        const translatesTo = original.match(/[""\u201C]?(.+?)[""\u201D]?\s+translates\s+to\s+[""\u201C]?(.+?)[""\u201D]?(?:\s+in\s+(\w+))?(?:\.|$)/i);
        if (translatesTo) {
            const targetLang = translatesTo[3] || languages.find(l => normalized.includes(l)) || 'Unknown';
            return { type: 'translation', data: { originalText: translatesTo[1].trim(), translatedText: translatesTo[2].trim(), sourceLanguage: 'English', targetLanguage: targetLang.charAt(0).toUpperCase() + targetLang.slice(1) } as unknown as Record<string, unknown>, autoDismissMs: 8000 };
        }

        const meansIn = original.match(/[""\u201C]?(.+?)[""\u201D]?\s+means\s+[""\u201C]?(.+?)[""\u201D]?\s+in\s+(\w+)/i);
        if (meansIn && languages.includes(meansIn[3].toLowerCase())) {
            return { type: 'translation', data: { originalText: meansIn[1].trim(), translatedText: meansIn[2].trim(), sourceLanguage: 'English', targetLanguage: meansIn[3].charAt(0).toUpperCase() + meansIn[3].slice(1) } as unknown as Record<string, unknown>, autoDismissMs: 8000 };
        }

        const inLang = original.match(/in\s+(\w+),?\s+[""\u201C]?(.+?)[""\u201D]?\s+(?:is|means|would\s+be)\s+[""\u201C]?(.+?)[""\u201D]?(?:\.|$)/i);
        if (inLang && languages.includes(inLang[1].toLowerCase())) {
            return { type: 'translation', data: { originalText: inLang[2].trim(), translatedText: inLang[3].trim(), sourceLanguage: 'English', targetLanguage: inLang[1].charAt(0).toUpperCase() + inLang[1].slice(1) } as unknown as Record<string, unknown>, autoDismissMs: 8000 };
        }

        const theTranslation = original.match(/the\s+(?:\w+\s+)?translation\s+(?:of\s+)?[""\u201C]?(.+?)[""\u201D]?\s+(?:is|would\s+be)\s+[""\u201C]?(.+?)[""\u201D]?(?:\.|$)/i);
        if (theTranslation) {
            const targetLang = languages.find(l => normalized.includes(l)) || 'Unknown';
            return { type: 'translation', data: { originalText: theTranslation[1].trim(), translatedText: theTranslation[2].trim(), sourceLanguage: 'English', targetLanguage: targetLang.charAt(0).toUpperCase() + targetLang.slice(1) } as unknown as Record<string, unknown>, autoDismissMs: 8000 };
        }

        const howToSay = original.match(/(?:how\s+(?:to|do\s+you)\s+say\s+)?[""\u201C]?(.+?)[""\u201D]?\s+in\s+(\w+)\s*(?:is|:)\s*[""\u201C]?(.+?)[""\u201D]?(?:\.|$)/i);
        if (howToSay && languages.includes(howToSay[2].toLowerCase())) {
            return { type: 'translation', data: { originalText: howToSay[1].trim(), translatedText: howToSay[3].trim(), sourceLanguage: 'English', targetLanguage: howToSay[2].charAt(0).toUpperCase() + howToSay[2].slice(1) } as unknown as Record<string, unknown>, autoDismissMs: 8000 };
        }

        return null;
    } catch { return null; }
}

export function detectFunFact(normalized: string, original: string): CardEvent | null {
    try {
        const phrases = [
            'fun fact', 'did you know', 'interesting fact', "here's a fact",
            'fascinating fact', 'cool fact', 'amazing fact', 'little known fact',
            'bet you didn\'t know', 'here\'s something interesting',
        ];
        if (!phrases.some(p => normalized.includes(p))) return null;
        if (isConversationalOffer(normalized)) return null;

        let fact = original;
        for (const phrase of phrases) {
            const idx = normalized.indexOf(phrase);
            if (idx !== -1) {
                const afterPhrase = original.substring(idx + phrase.length).replace(/^[:\s,!]+/, '').trim();
                if (afterPhrase.length > 0) { fact = afterPhrase; break; }
            }
        }

        if (fact.length < 30) return null;

        const data: FunFactCardData = { fact };
        return { type: 'funFact', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
    } catch { return null; }
}

export function detectQuote(_normalized: string, original: string): CardEvent | null {
    try {
        const patterns: Array<{ re: RegExp; quoteIdx: number; authorIdx: number }> = [
            { re: /[""\u201C](.{10,}?)[""\u201D]\s*[\u2014\u2013-]\s*([A-Z][a-zA-Z\s.]+)/, quoteIdx: 1, authorIdx: 2 },
            { re: /[""\u201C](.{10,}?)[""\u201D]\s+by\s+([A-Z][a-zA-Z\s.]+)/, quoteIdx: 1, authorIdx: 2 },
            { re: /([A-Z][a-zA-Z\s.]+?)\s+once\s+said\s+[""\u201C](.{10,}?)[""\u201D]/, quoteIdx: 2, authorIdx: 1 },
            { re: /as\s+([A-Z][a-zA-Z\s.]+?)\s+(?:said|wrote|noted|observed|remarked),?\s+[""\u201C](.{10,}?)[""\u201D]/i, quoteIdx: 2, authorIdx: 1 },
            { re: /([A-Z][a-zA-Z\s.]+?)\s+(?:famously|notably|wisely)?\s*(?:said|wrote|stated|declared|proclaimed)\s+[""\u201C](.{10,}?)[""\u201D]/, quoteIdx: 2, authorIdx: 1 },
            { re: /[""\u201C](.{10,}?)[""\u201D]\s*(?:attributed\s+to|credited\s+to)\s+([A-Z][a-zA-Z\s.]+)/, quoteIdx: 1, authorIdx: 2 },
        ];

        for (const { re, quoteIdx, authorIdx } of patterns) {
            const match = original.match(re);
            if (match) {
                const quote = match[quoteIdx].trim();
                const author = match[authorIdx].trim();
                if (!quote || !author) continue;
                if (/^(The|This|That|It|They|We|He|She|You|My|Our|Your|His|Her|Its|Their)$/i.test(author)) continue;

                const data: QuoteCardData = { quote, author };
                return { type: 'quote', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
            }
        }
        return null;
    } catch { return null; }
}

export function detectList(normalized: string, original: string): CardEvent | null {
    try {
        const phrases = [
            'here are', 'here\'s a list', 'top 5', 'top 10', 'top 3',
            'top 7', 'top 20', 'the list', 'list of', 'best of',
            'worst of', 'most popular', 'recommended',
        ];
        const ordinalPattern = /first\b.*second\b.*third\b/i;
        if (!phrases.some(p => normalized.includes(p)) && !ordinalPattern.test(normalized)) return null;
        if (isConversationalOffer(normalized)) return null;

        const titleMatch = original.match(/(?:here\s+are\s+(?:the\s+)?|top\s+\d+\s+|list\s+of\s+|best\s+|most\s+popular\s+)(.+?)(?:[:\n.]|$)/i);
        const title = titleMatch ? titleMatch[1].trim() : 'List';

        const items: string[] = [];
        const numberedItems = original.match(/\d+[.)]\s*([^\n]+)/g);
        if (numberedItems) {
            for (const item of numberedItems) items.push(item.replace(/^\d+[.)]\s*/, '').trim());
        }

        if (items.length === 0) {
            const bulletItems = original.match(/[-•*]\s*([^\n]+)/g);
            if (bulletItems) {
                for (const item of bulletItems) items.push(item.replace(/^[-•*]\s*/, '').trim());
            }
        }

        if (items.length === 0) {
            const ordinals = original.match(/(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[,:\s]+([^,.]+)/gi);
            if (ordinals) {
                for (const item of ordinals) items.push(item.replace(/^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[,:\s]+/i, '').trim());
            }
        }

        if (items.length < 2) return null;

        const data: ListCardData = { title, items };
        return { type: 'list', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
    } catch { return null; }
}
