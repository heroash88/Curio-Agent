import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { speakWithSafetyTimeout } from './browserSpeechSynthesis';

class MockSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  onend: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('browserSpeechSynthesis', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
  });

  it('speaks sanitized text and completes on the utterance end event', () => {
    const speak = vi.fn((utterance: MockSpeechSynthesisUtterance) => {
      utterance.onend?.();
    });
    const cancel = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, speak },
    });
    const onComplete = vi.fn();

    speakWithSafetyTimeout('Hello 🤖', onComplete);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toBe('Hello');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps CurioAgentMode from value-importing the heavy offline speech service', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/curio/CurioAgentMode.tsx'),
      'utf8',
    );

    expect(source).toContain(
      "import type { OfflineSpeechCallbacks } from '../../services/offlineSpeechService';",
    );
    expect(source).toContain(
      "import { speakWithSafetyTimeout } from '../../services/browserSpeechSynthesis';",
    );
    expect(source).not.toMatch(
      /import\s*\{\s*speakWithSafetyTimeout\s*\}\s*from\s*['"]\.\.\/\.\.\/services\/offlineSpeechService['"]/,
    );
  });
});
