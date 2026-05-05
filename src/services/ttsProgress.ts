const TTS_PROGRESS_EVENT = 'curio:tts-progress';

export const reportTtsProgress = (message: string): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(TTS_PROGRESS_EVENT, { detail: message }));
};

export const subscribeTtsProgress = (
  listener: (message: string) => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<string>).detail);
  };

  window.addEventListener(TTS_PROGRESS_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(TTS_PROGRESS_EVENT, handler as EventListener);
  };
};
