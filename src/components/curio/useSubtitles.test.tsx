import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSubtitles } from '../../hooks/useSubtitles';

const baseProps = {
  isConnected: true,
  isSpeaking: false,
  userTranscript: null as string | null,
  modelTranscript: null as string | null,
  subtitlesEnabled: true,
  turnKey: 0,
};

describe('useSubtitles', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps model subtitles visible after speech ends until a new user turn arrives', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(useSubtitles, {
      initialProps: {
        ...baseProps,
        isSpeaking: true,
        userTranscript: 'hello',
        modelTranscript: 'A local TTS answer.',
        turnKey: 1,
      },
    });

    expect(result.current.showTranscript).toBe(true);
    expect(result.current.latchedModel).toBe('A local TTS answer.');

    rerender({
      ...baseProps,
      userTranscript: 'hello',
      modelTranscript: null,
      turnKey: 1,
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.showTranscript).toBe(true);
    expect(result.current.latchedModel).toBe('A local TTS answer.');

    rerender({
      ...baseProps,
      userTranscript: 'next question',
      modelTranscript: null,
      turnKey: 2,
    });

    expect(result.current.showTranscript).toBe(true);
    expect(result.current.latchedUser).toBe('next question');
    expect(result.current.latchedModel).toBeNull();
  });

  it('keeps text-only subtitles visible through a brief inactive render', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(useSubtitles, {
      initialProps: {
        ...baseProps,
        userTranscript: 'write a short haiku',
        modelTranscript: 'Soft circuits awaken.',
        inactiveHideDelayMs: 500,
      } as typeof baseProps & { inactiveHideDelayMs: number },
    });

    expect(result.current.showTranscript).toBe(true);
    expect(result.current.latchedUser).toBe('write a short haiku');
    expect(result.current.latchedModel).toBe('Soft circuits awaken.');

    rerender({
      ...baseProps,
      isConnected: false,
      userTranscript: 'write a short haiku',
      modelTranscript: 'Soft circuits awaken.',
      inactiveHideDelayMs: 500,
    } as typeof baseProps & { inactiveHideDelayMs: number });

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.showTranscript).toBe(true);
    expect(result.current.latchedUser).toBe('write a short haiku');
    expect(result.current.latchedModel).toBe('Soft circuits awaken.');

    rerender({
      ...baseProps,
      userTranscript: 'write a short haiku',
      modelTranscript: 'Soft circuits awaken.',
      inactiveHideDelayMs: 500,
    } as typeof baseProps & { inactiveHideDelayMs: number });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.showTranscript).toBe(true);
    expect(result.current.latchedUser).toBe('write a short haiku');
    expect(result.current.latchedModel).toBe('Soft circuits awaken.');
  });
});
