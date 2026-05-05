const DEFAULT_MAX_CHARS = 360;
const DEFAULT_MAX_WORDS = 64;

interface SplitPocketTtsTextOptions {
  maxChars?: number;
  maxWords?: number;
}

const normalizeSpeechText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const wordCount = (text: string): number => (
  text.match(/\S+/g) ?? []
).length;

const isWithinLimit = (text: string, maxChars: number, maxWords: number): boolean => (
  text.length <= maxChars && wordCount(text) <= maxWords
);

const splitIntoSentences = (text: string): string[] => {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!/[.!?]/.test(char)) continue;

    let end = index + 1;
    while (end < text.length && /["')\]]/.test(text[end])) {
      end += 1;
    }

    if (end >= text.length || /\s/.test(text[end])) {
      const sentence = text.slice(start, end).trim();
      if (sentence) sentences.push(sentence);
      start = end;
    }
  }

  const trailing = text.slice(start).trim();
  if (trailing) sentences.push(trailing);
  return sentences;
};

const splitLongPhrase = (text: string, maxChars: number, maxWords: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  let currentWords = 0;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && (candidate.length > maxChars || currentWords + 1 > maxWords)) {
      chunks.push(current);
      current = word;
      currentWords = 1;
    } else {
      current = candidate;
      currentWords += 1;
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

export const splitPocketTtsText = (
  raw: string,
  options: SplitPocketTtsTextOptions = {},
): string[] => {
  const text = normalizeSpeechText(raw);
  if (!text) return [];

  const maxChars = Math.max(40, Math.floor(options.maxChars ?? DEFAULT_MAX_CHARS));
  const maxWords = Math.max(1, Math.floor(options.maxWords ?? DEFAULT_MAX_WORDS));
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    const normalized = normalizeSpeechText(current);
    if (normalized) chunks.push(normalized);
    current = '';
  };

  const appendPart = (part: string) => {
    const normalized = normalizeSpeechText(part);
    if (!normalized) return;

    const candidate = current ? `${current} ${normalized}` : normalized;
    if (current && !isWithinLimit(candidate, maxChars, maxWords)) {
      pushCurrent();
    }
    current = current ? `${current} ${normalized}` : normalized;
  };

  for (const sentence of splitIntoSentences(text)) {
    const parts = isWithinLimit(sentence, maxChars, maxWords)
      ? [sentence]
      : splitLongPhrase(sentence, maxChars, maxWords);

    for (const part of parts) {
      appendPart(part);
    }
  }

  pushCurrent();
  return chunks;
};
