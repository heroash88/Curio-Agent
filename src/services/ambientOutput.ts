export type AmbientSpeechReason = 'notification' | 'routine';

export interface AmbientSpeechRequest {
  text: string;
  reason?: AmbientSpeechReason;
}

const AMBIENT_SPEECH_EVENT = 'curio:ambient-speak';

export const requestAmbientSpeech = (request: AmbientSpeechRequest): void => {
  if (typeof window === 'undefined' || !request.text.trim()) {
    return;
  }

  window.dispatchEvent(new CustomEvent<AmbientSpeechRequest>(AMBIENT_SPEECH_EVENT, {
    detail: request,
  }));
};

export const subscribeAmbientSpeech = (
  listener: (request: AmbientSpeechRequest) => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<AmbientSpeechRequest>).detail;
    if (!detail?.text) {
      return;
    }

    listener(detail);
  };

  window.addEventListener(AMBIENT_SPEECH_EVENT, handleEvent);
  return () => window.removeEventListener(AMBIENT_SPEECH_EVENT, handleEvent);
};
