import { TINY_TTS_ASSETS } from './localAssets';
import { predictG2P } from './g2pPredict';

const SYMBOLS = ["_","\"","(",")","*","/",":","AA","E","EE","En","N","OO","Q","V","[","\\","]","^","a","a:","aa","ae","ah","ai","an","ang","ao","aw","ay","b","by","c","ch","d","dh","dy","e","e:","eh","ei","en","eng","er","ey","f","g","gy","h","hh","hy","i","i0","i:","ia","ian","iang","iao","ie","ih","in","ing","iong","ir","iu","iy","j","jh","k","ky","l","m","my","n","ng","ny","o","o:","ong","ou","ow","oy","p","py","q","r","ry","s","sh","t","th","ts","ty","u","u:","ua","uai","uan","uang","uh","ui","un","uo","uw","v","van","ve","vn","w","x","y","z","zh","zy","~","\u00e6","\u00e7","\u00f0","\u00f8","\u014b","\u0153","\u0250","\u0251","\u0252","\u0254","\u0255","\u0259","\u025b","\u025c","\u0261","\u0263","\u0265","\u0266","\u026a","\u026b","\u026c","\u026d","\u026f","\u0272","\u0275","\u0278","\u0279","\u027e","\u0281","\u0283","\u028a","\u028c","\u028e","\u028f","\u0291","\u0292","\u029d","\u02b2","\u02c8","\u02cc","\u02d0","\u0303","\u0329","\u03b2","\u03b8","\u1100","\u1101","\u1102","\u1103","\u1104","\u1105","\u1106","\u1107","\u1108","\u1109","\u110a","\u110b","\u110c","\u110d","\u110e","\u110f","\u1110","\u1111","\u1112","\u1161","\u1162","\u1163","\u1164","\u1165","\u1166","\u1167","\u1168","\u1169","\u116a","\u116b","\u116c","\u116d","\u116e","\u116f","\u1170","\u1171","\u1172","\u1173","\u1174","\u1175","\u11a8","\u11ab","\u11ae","\u11af","\u11b7","\u11b8","\u11bc","\u3138","!","?","\u2026",",",".","'","-","\u00bf","\u00a1","SP","UNK"];

const SYMBOL_TO_ID = new Map<string, number>(SYMBOLS.map((symbol, index) => [symbol, index]));
const LANG_ID = 2;
const TONE_OFFSET = 7;

type CmuDict = Record<string, string[]>;

let cmuPromise: Promise<CmuDict> | null = null;

const loadCmuDict = async (): Promise<CmuDict> => {
    if (!cmuPromise) {
        cmuPromise = (async () => {
            const response = await fetch(TINY_TTS_ASSETS.cmuDict);
            if (!response.ok) throw new Error(`Failed to load TinyTTS CMU dictionary: HTTP ${response.status}`);
            return await response.json() as CmuDict;
        })();
    }
    return cmuPromise;
};

const parsePhone = (phone: string): [string, number] => {
    const match = phone.match(/(\d)$/);
    if (!match) return [phone.toLowerCase(), 0];
    return [phone.slice(0, -1).toLowerCase(), Number(match[1]) + 1];
};

const parseSyllable = (phones: string[]): { phones: string[]; tones: number[] } => {
    const parsedPhones: string[] = [];
    const tones: number[] = [];
    for (const phone of phones) {
        const [mappedPhone, tone] = parsePhone(phone);
        parsedPhones.push(mappedPhone);
        tones.push(tone);
    }
    return { phones: parsedPhones, tones };
};

const mapPhoneme = (phoneme: string): string => {
    const replacements: Record<string, string> = {
        '\uFF1A': ',',
        '\uFF1B': ',',
        '\uFF0C': ',',
        '\u3002': '.',
        '\uFF01': '!',
        '\uFF1F': '?',
        '\n': '.',
        '\u00B7': ',',
        '\u3001': ',',
        '...': '\u2026',
        v: 'V',
    };
    const mapped = replacements[phoneme] ?? phoneme;
    return SYMBOL_TO_ID.has(mapped) ? mapped : 'UNK';
};

const appendPhones = (
    targetPhones: string[],
    targetTones: number[],
    phones: string[],
    tones: number[],
): void => {
    for (const phone of phones) targetPhones.push(mapPhoneme(phone));
    targetTones.push(...tones);
};

const resolveWordPhones = async (
    word: string,
    cmu: CmuDict,
): Promise<{ phones: string[]; tones: number[] } | null> => {
    if (word.includes("'")) {
        const phones: string[] = [];
        const tones: number[] = [];
        const parts = word.split("'");

        for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
            const part = parts[partIndex];
            if (partIndex > 0) {
                phones.push("'");
                tones.push(0);
            }
            if (!part) continue;

            const cmuEntry = cmu[part.toUpperCase()];
            if (cmuEntry) {
                const parsed = parseSyllable(cmuEntry);
                phones.push(...parsed.phones);
                tones.push(...parsed.tones);
                continue;
            }

            const predicted = await predictG2P(part);
            if (!predicted?.length) return null;
            const parsed = parseSyllable(predicted);
            phones.push(...parsed.phones);
            tones.push(...parsed.tones);
        }

        return phones.length > 0 ? { phones, tones } : null;
    }

    const cmuEntry = cmu[word.toUpperCase()];
    if (cmuEntry) return parseSyllable(cmuEntry);

    const predicted = await predictG2P(word);
    if (predicted?.length) return parseSyllable(predicted);
    return null;
};

export interface TinyTokenizedText {
    phoneIds: number[];
    toneIds: number[];
    langIds: number[];
}

export const textToPhonemeIds = async (rawText: string): Promise<TinyTokenizedText> => {
    const cmu = await loadCmuDict();
    const text = rawText.toLowerCase().trim();
    const words = text.split(/\s+/).filter(Boolean);
    const phones: string[] = [];
    const tones: number[] = [];

    for (const word of words) {
        const lead = word.match(/^[^a-z0-9]*/)?.[0] || '';
        const trail = word.match(/[^a-z0-9']*$/)?.[0] || '';
        const core = word.slice(lead.length, word.length - trail.length);

        for (const char of lead) {
            phones.push(mapPhoneme(char));
            tones.push(0);
        }

        if (core.length > 0) {
            const resolved = await resolveWordPhones(core, cmu);
            if (resolved) {
                appendPhones(phones, tones, resolved.phones, resolved.tones);
            } else {
                for (const char of core.replace(/'/g, '')) {
                    phones.push(char.toLowerCase());
                    tones.push(0);
                }
            }
        }

        for (const char of trail) {
            phones.push(mapPhoneme(char));
            tones.push(0);
        }
    }

    phones.unshift('_');
    phones.push('_');
    tones.unshift(0);
    tones.push(0);

    const phoneIds = phones.map((phone) => SYMBOL_TO_ID.get(phone) ?? SYMBOL_TO_ID.get('UNK')!);
    const toneIds = tones.map((tone) => tone + TONE_OFFSET);
    const langIds = new Array(phoneIds.length).fill(LANG_ID);

    const size = phoneIds.length * 2 + 1;
    const phoneIdsWithBlanks = new Array<number>(size).fill(0);
    const toneIdsWithBlanks = new Array<number>(size).fill(0);
    const langIdsWithBlanks = new Array<number>(size).fill(0);

    for (let index = 0; index < phoneIds.length; index += 1) {
        const targetIndex = 1 + index * 2;
        phoneIdsWithBlanks[targetIndex] = phoneIds[index];
        toneIdsWithBlanks[targetIndex] = toneIds[index];
        langIdsWithBlanks[targetIndex] = langIds[index];
    }

    return {
        phoneIds: phoneIdsWithBlanks,
        toneIds: toneIdsWithBlanks,
        langIds: langIdsWithBlanks,
    };
};

export const releaseTinyTextCache = (): void => {
    cmuPromise = null;
};
