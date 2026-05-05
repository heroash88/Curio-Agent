import { describe, expect, it } from 'vitest';

import { buildCustomLLMFollowupSystemPrompt, buildCustomLLMSystemPrompt } from './customLlmRuntime';

describe('customLlmRuntime', () => {
  it('builds a first-turn system prompt with tool context and no-thinking guardrails', () => {
    const prompt = buildCustomLLMSystemPrompt({
      systemInstruction: 'You are Curio.\n\n[PERSONALITY]\nBe calm, concise, and warm.',
      homeAssistantToolCount: 6,
      homeAssistantEntityCount: 42,
      providerSupportsTools: true,
    });

    expect(prompt).toContain('You are Curio.');
    expect(prompt).toContain('[PERSONALITY]\nBe calm, concise, and warm.');
    expect(prompt).toContain('Home Assistant tools loaded: 6.');
    expect(prompt).toContain('Home Assistant entities loaded: 42.');
    expect(prompt).toContain('Never reveal hidden reasoning');
    expect(prompt).toContain('When a tool is available and helpful, call it');
    expect(prompt).toContain('spoken aloud');
    expect(prompt).toContain('Default to one short sentence');
    expect(prompt).toContain('Ask at most one short clarifying question');
    expect(prompt).toContain('Do not include raw URLs');
    expect(prompt).toContain('For live or ongoing sports');
    expect(prompt).not.toContain('<think>');
  });

  it('builds a compact follow-up prompt without repeating the full system instruction', () => {
    const prompt = buildCustomLLMFollowupSystemPrompt({
      contextDigest: 'User: Hero. City: Los Angeles. Weather: Sunny.',
      homeAssistantToolCount: 6,
      homeAssistantEntityCount: 42,
      providerSupportsTools: true,
    });

    expect(prompt).toContain('Follow-up Custom Text LLM runtime contract');
    expect(prompt).toContain('User: Hero. City: Los Angeles.');
    expect(prompt).toContain('Home Assistant tools loaded: 6.');
    expect(prompt).toContain('Never reveal hidden reasoning');
    expect(prompt).toContain('Default to one short sentence');
    expect(prompt).not.toContain('[PERSONALITY]');
  });
});
