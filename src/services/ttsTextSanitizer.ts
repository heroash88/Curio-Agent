const EMOJI_SEQUENCE =
  /(?:[0-9#*]\uFE0F?\u20E3)|(?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?)*)|(?:\p{Emoji_Presentation})/gu;

const EMOJI_RESIDUE = /[\u200D\uFE0E\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu;

export const stripEmojiForSpeech = (text: string): string =>
  text
    .replace(EMOJI_SEQUENCE, ' ')
    .replace(EMOJI_RESIDUE, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
