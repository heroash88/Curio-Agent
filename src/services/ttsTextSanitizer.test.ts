import { describe, expect, it } from 'vitest';

import { stripEmojiForSpeech } from './ttsTextSanitizer';

describe('stripEmojiForSpeech', () => {
  it('removes common emoji forms while preserving speakable text', () => {
    expect(stripEmojiForSpeech('Nice work 😊🚀 1️⃣ from the crew 👨‍👩‍👧‍👦!')).toBe('Nice work from the crew!');
    expect(stripEmojiForSpeech('Status: good 👍🏽. Flag 🇺🇸. Heart ❤️.')).toBe('Status: good. Flag. Heart.');
  });

  it('returns an empty string when text only contains emoji', () => {
    expect(stripEmojiForSpeech('😊 🚀 ❤️ 1️⃣ 🇺🇸')).toBe('');
  });
});
