import { beforeEach, describe, expect, it } from 'vitest';

import {
  getActivePersonalityPrompt,
  getActivePersonalitySettings,
  getPersonalityId,
  setCustomPersonalityPrompt,
  setPersonalityId,
} from './settingsStorage';

describe('shared AI personality settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults every AI runtime to the default personality prompt', () => {
    const active = getActivePersonalitySettings();

    expect(getPersonalityId()).toBe('default');
    expect(active.id).toBe('default');
    expect(active.label).toBe('Default');
    expect(active.prompt).toContain('Be friendly and helpful');
    expect(getActivePersonalityPrompt()).toBe(active.prompt);
  });

  it('resolves a custom personality from the same shared setting', () => {
    setPersonalityId('custom');
    setCustomPersonalityPrompt('Speak like a calm studio producer.');

    expect(getActivePersonalitySettings()).toMatchObject({
      id: 'custom',
      label: 'Custom',
      prompt: 'Speak like a calm studio producer.',
      source: 'custom',
    });
    expect(getActivePersonalityPrompt()).toBe('Speak like a calm studio producer.');
  });

  it('falls back to default when saved storage contains an unknown personality id', () => {
    localStorage.setItem('curio_personality_id', 'mystery-mode');

    expect(getPersonalityId()).toBe('default');
    expect(getActivePersonalitySettings()).toMatchObject({
      id: 'default',
      source: 'preset',
    });
  });
});
