/**
 * Shared emotion detection and face state types.
 *
 * Used by all robot face components (CurioFace, AstroFace, BenderFace)
 * and by CurioAgentMode for deriving emotion hints from transcripts.
 */

export type CurioState = 'idle' | 'warmup' | 'listening' | 'speaking' | 'thinking' | 'error' | 'capturing' | 'dancing';

/** Reduced engine mode set shared by face animation loops. */
export type EngineMode = 'idle' | 'listening' | 'speaking' | 'dancing';

/** Map 8 CurioStates -> 4 engine modes */
export const toEngineMode = (state: CurioState): EngineMode => {
  switch (state) {
    case 'listening': return 'listening';
    case 'speaking': return 'speaking';
    case 'thinking': return 'listening';
    case 'dancing': return 'dancing';
    default: return 'idle';
  }
};

// -- Lightweight keyword -> emotion mapper --
// Runs on every transcript update (~once per sentence). No regex, just includes().
const EMOTION_KEYWORDS: [string[], string][] = [
  [['sorry', 'sad', 'unfortunately', 'condolence', 'miss you', 'heartbreak', 'cry', 'tears', 'grief', 'loss', 'tragic', 'upset', 'depressed', 'lonely', 'pensive', 'melancholy'], 'sad'],
  [['love', 'adore', 'heart', 'sweetheart', 'darling', 'romance', 'valentine', 'crush', 'kiss', 'hug', 'affection', 'cherish', 'beloved'], 'love'],
  [['confused', 'hmm', 'not sure', 'unclear', 'puzzl', 'strange', 'weird', 'odd', 'perplex', 'baffl', 'what do you mean', 'don\'t understand', 'query'], 'confused'],
  [['excited', 'amazing', 'awesome', 'incredible', 'fantastic', 'wow', 'brilliant', 'outstanding', 'magnificent', 'thrilling', 'can\'t wait', 'eager'], 'excited'],
  [['haha', 'funny', 'lol', 'hilarious', 'joke', 'laugh', 'comedy', 'humor', 'amusing', 'giggle', 'crack up', 'joyful'], 'happy'],
  [['surprise', 'no way', 'really', 'seriously', 'unbelievable', 'shocking', 'whoa', 'oh my', 'didn\'t expect', 'astound'], 'surprised'],
  [['think', 'consider', 'ponder', 'reflect', 'wonder', 'curious', 'interest', 'fascin', 'intrigu', 'question', 'curiosity'], 'curious'],
  [['great', 'good', 'nice', 'wonderful', 'happy', 'glad', 'pleased', 'enjoy', 'delight', 'cheerful', 'yay', 'hooray', 'celebrate'], 'happy'],
  [['well actually', 'technically', 'to be fair', 'clever', 'smooth', 'sly', 'witty', 'sarcas', 'mischievous', 'smirk', 'trick'], 'smirk'],
  [['sleepy', 'tired', 'exhausted', 'yawn', 'drowsy', 'nap', 'bedtime', 'rest', 'snooze', 'fatigue'], 'sleepy'],
  [['unimpressed', 'bored', 'meh', 'whatever', 'tedious', 'dull', 'blah'], 'unimpressed'],
  [['skeptical', 'doubt', 'unsure', 'dubious', 'questionable', 'hard to believe'], 'skeptical'],
  [['determined', 'focus', 'serious', 'dedicated', 'resolve', 'mission', 'goal'], 'determined'],
  [['dazzled', 'shiny', 'sparkle', 'glitter', 'radiant', 'gleam'], 'dazzled'],
  [['disgusted', 'gross', 'yuck', 'eww', 'revolting', 'nasty', 'repelled'], 'disgusted'],
  [['panicked', 'fear', 'afraid', 'scared', 'terrified', 'horror', 'alarm', 'anxious'], 'panicked'],
  [['dreamy', 'fanciful', 'idealistic', 'lost in thought', 'whimsical'], 'dreamy'],
  [['mischievous', 'playful', 'sneaky', 'guile', 'cunning'], 'mischievous'],
  [['amazed', 'awe', 'stunned', 'speechless', 'mind-blowing'], 'amazed'],
  [['electronic', 'systemic', 'digital', 'circuit', 'processing', 'computing'], 'electronic'],
  [['target', 'lock', 'aim', 'focusing', 'scanning', 'detecting'], 'targeting'],
  [['melancholy', 'wistful', 'somber', 'gloomy'], 'melancholy'],
  [['raging', 'furious', 'incensed', 'outraged', 'extremely angry'], 'raging'],
  [['sassy', 'fierce', 'attitude', 'fabulous', 'bold', 'snarky'], 'sassy'],
  [['shy', 'timid', 'bashful', 'modest', 'coy', 'blush'], 'shy'],
  [['playful', 'fun', 'games', 'energetic', 'lively'], 'playful'],
  [['analytical', 'logic', 'data', 'evidence', 'proof', 'analysis', 'formulas'], 'analytical'],
  [['grumpy', 'irritable', 'cranky', 'cantankerous', 'sour'], 'grumpy'],
  [['zen', 'peaceful', 'calm', 'serene', 'tranquil', 'meditation'], 'zen'],
];

export function emotionFromText(text: string | null | undefined): string | null {
  if (!text || text.length < 3) return null;
  const lower = text.toLowerCase();
  for (const [keywords, emotion] of EMOTION_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return emotion;
    }
  }
  return null;
}

/**
 * Extract a live video stream from a MediaStream, returning null if
 * no live video track is available.
 */
export function getSharedVisionStream(stream: MediaStream | null): MediaStream | null {
  if (!stream) return null;
  const hasLiveVideoTrack = stream
    .getVideoTracks()
    .some((track) => track.readyState === 'live' && track.enabled);
  return hasLiveVideoTrack ? stream : null;
}
