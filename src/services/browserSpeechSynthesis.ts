import { stripEmojiForSpeech } from './ttsTextSanitizer';

// iOS Safari requires speechSynthesis.speak() to be called during a user gesture
// before it will work asynchronously. Warm up the engine with an empty utterance
// so later async calls from callbacks can succeed.
let speechSynthUnlocked = false;

export function unlockSpeechSynthesis(): void {
  if (speechSynthUnlocked) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const warmup = new SpeechSynthesisUtterance('');
    warmup.volume = 0;
    warmup.rate = 1;
    window.speechSynthesis.speak(warmup);
    speechSynthUnlocked = true;
  } catch {
    // Worst case TTS remains unavailable on iOS.
  }
}

export function speakOffline(text: string): void {
  const speechText = stripEmojiForSpeech(text);
  if (!speechText || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
}

export function speakWithSafetyTimeout(
  text: string,
  onComplete: () => void,
): void {
  const speechText = stripEmojiForSpeech(text);

  if (!speechText || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    setTimeout(onComplete, 3000);
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const safetyTimer = setTimeout(onComplete, Math.max(5000, speechText.length * 80));

  utterance.onend = () => {
    clearTimeout(safetyTimer);
    onComplete();
  };

  window.speechSynthesis.speak(utterance);
}
