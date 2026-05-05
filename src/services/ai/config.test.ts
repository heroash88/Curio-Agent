import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GEMINI_TEXT_MODEL,
  STORAGE_KEY_GEMINI_TEXT_MODEL,
  getGeminiTextModel,
  setGeminiTextModel,
} from './config';

describe('Gemini text model settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a custom Gemini text model after saving and reopening settings', () => {
    setGeminiTextModel('gemini-2.5-flash-preview-tts');

    expect(localStorage.getItem(STORAGE_KEY_GEMINI_TEXT_MODEL)).toBe('gemini-2.5-flash-preview-tts');
    expect(getGeminiTextModel()).toBe('gemini-2.5-flash-preview-tts');
  });

  it('uses the default Gemini text model when the saved model is blank', () => {
    setGeminiTextModel('   ');

    expect(getGeminiTextModel()).toBe(DEFAULT_GEMINI_TEXT_MODEL);
  });
});
