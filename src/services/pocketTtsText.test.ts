import { describe, expect, it } from 'vitest';

import { splitPocketTtsText } from './pocketTtsText';

describe('splitPocketTtsText', () => {
  it('batches nearby sentences into speakable chunks to avoid choppy playback', () => {
    const text = [
      'Pocket needs shorter phrases to stay intelligible during local generation.',
      'Short neighboring sentences should stay together.',
      'Splitting the response keeps each inference bounded while preserving the original wording.',
    ].join(' ');

    const chunks = splitPocketTtsText(text, { maxChars: 220, maxWords: 20 });

    expect(chunks).toEqual([
      'Pocket needs shorter phrases to stay intelligible during local generation. Short neighboring sentences should stay together.',
      'Splitting the response keeps each inference bounded while preserving the original wording.',
    ]);
    expect(chunks.every((chunk) => chunk.length <= 220)).toBe(true);
  });

  it('keeps normal long sentences intact on desktop-sized limits', () => {
    const text = 'A normal assistant sentence can be fairly long without needing to stop in the middle, because cutting it too early makes Pocket sound hesitant even when the local machine is fast enough to continue.';

    expect(splitPocketTtsText(text)).toEqual([text]);
  });

  it('splits very long sentences by word count when punctuation is sparse', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';

    expect(splitPocketTtsText(text, { maxChars: 80, maxWords: 5 })).toEqual([
      'one two three four five',
      'six seven eight nine ten',
      'eleven twelve thirteen fourteen fifteen',
    ]);
  });

  it('normalizes whitespace and ignores empty chunks', () => {
    expect(splitPocketTtsText('  Hello   there.\n\nThis   is Curio.  ', { maxChars: 80, maxWords: 10 })).toEqual([
      'Hello there. This is Curio.',
    ]);
  });
});
