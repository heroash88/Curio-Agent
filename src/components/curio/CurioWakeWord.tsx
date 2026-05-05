import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLiveAPIControls, useLiveAPIStreaming } from '../../contexts/LiveAPIContext';
import {
  getWakeWordDefinition,
  WAKE_WORD_DETECTED_EVENT,
  type WakeWordDetectedDetail
} from '../../services/wakeWordCatalog';
import {
  preloadWakeWordModel,
  startListening,
  stopListening,
  isListening,
  takePreparedMediaStream
} from '../../services/wakeWordService';
import {
  useLiveApiVoiceId,
  useSelectedWakeWordId,
  useWakeWordEnabled,
  useVoiceBackend,
  useSpeakerIdentificationEnabled,
  useSpeakerDefaultProfileId,
  useFaceRecognitionEnabled,
  useUserName,
  useWeatherCity,
  useTempUnit,
  useHomeLocation,
  useWorkLocation,
  useCustomLocations,
  useActivePersonalitySettings,
  useWakeWordThreshold,
  getEnabledGenericMcpServers,
} from '../../utils/settingsStorage';
import { createGlobalMascotHandler } from '../../utils/appPageCatalog';
import { SUBJECT_CONFIG, type LiveModuleMode } from '../../services/liveSessionConfig';
import { playCurioGreeting } from '../../services/audioService';
import { getCurioSystemPrompt } from './curioSystemPrompt';
import type { CurioSearchGroundingMode } from './curioSystemPrompt';
import { appendSpeakerContextToInstruction } from '../../services/speakerIdentity';
import { identifyResolvedSpeakerFromStream } from '../../services/speakerIdentityRuntime';
import { useSpeakerProfiles } from '../../services/speakerProfileStore';
import { applyResolvedSpeakerIdentity, getSpeakerSessionState } from '../../services/speakerSessionStore';
import { musicPlaybackService } from '../../services/musicPlaybackService';
import { getGeminiLiveModel } from '../../services/ai/config';
import {
  startContinuousOfflineListening,
  stopOfflineListening,
  isOfflineListening,
  isSpeechRecognitionSupported,
  unlockSpeechSynthesis,
  type OfflineSpeechCallbacks,
} from '../../services/offlineSpeechService';
import { stripEmojiForSpeech } from '../../services/ttsTextSanitizer';
import { isHaVoicePipelineConnected } from '../../services/haVoicePipelineService';
import { useCardManager } from '../../contexts/CardManagerContext';

const WAKE_WORD_IDLE_TIMEOUT_MS = 60_000;
const RECHECK_IDLE_MS = 1_000;

const resolveWakeWordSearchGroundingMode = (voiceBackend: string): CurioSearchGroundingMode => {
  if (voiceBackend === 'nova_sonic' && getEnabledGenericMcpServers().some((server) => server.kind === 'search')) {
    return 'external-mcp-search';
  }

  return !getGeminiLiveModel().includes('3.1')
    ? 'native-google-search'
    : 'live-search-proxy';
};

const DISCONNECT_COMMAND_PATTERNS = [
  /^stop$/,
  /^stop now$/,
  /^stop listening$/,
  /^disconnect$/,
  /^disconnect now$/,
  /^hang up$/,
  /^go offline$/,
  /^go away$/,
  /^goodbye$/,
  /^bye$/,
  /^end call$/,
  /^close connection$/,
  /^stop the connection$/
];

const normalizeTranscript = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isDisconnectCommand = (value: string): boolean => {
  const normalized = normalizeTranscript(value);
  if (!normalized) return false;
  return DISCONNECT_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isWakeWordStartAbort = (error: unknown): boolean =>
  error instanceof Error && error.message === 'Wake word start aborted';

export const CurioWakeWord: React.FC = () => {
  const enableWakeWord = useWakeWordEnabled();
  const voiceBackend = useVoiceBackend();
  const speakerIdentificationEnabled = useSpeakerIdentificationEnabled();
  const defaultSpeakerProfileId = useSpeakerDefaultProfileId();
  const faceRecognitionEnabled = useFaceRecognitionEnabled();
  const speakerProfiles = useSpeakerProfiles();
  const selectedWakeWordId = useSelectedWakeWordId();
  const liveApiVoiceId = useLiveApiVoiceId();
  const activePersonality = useActivePersonalitySettings();
  const userThresholdOverride = useWakeWordThreshold();
  const { userName, weatherCity, tempUnit, homeLocation, workLocation, customLocations } = {
    userName: useUserName(),
    weatherCity: useWeatherCity(),
    tempUnit: useTempUnit(),
    homeLocation: useHomeLocation(),
    workLocation: useWorkLocation(),
    customLocations: useCustomLocations(),
  };
  const {
    isConnected,
    isConnecting,
    isMuted,
    connect,
    disconnect,
    globalMode,
    globalNavigate,
    unlockAudio,
    toggleCamera,
  } = useLiveAPIControls();
  const {
    isSpeaking,
    transcriptHistory,
  } = useLiveAPIStreaming();

  const lastWakeHandledAtRef = useRef(0);
  const lastUserSpeechAtRef = useRef(0);
  const lastObservedUserTranscriptRef = useRef('');
  const idleTimerRef = useRef<number | null>(null);

  const selectedWakeWord = useMemo(
    () => getWakeWordDefinition(selectedWakeWordId),
    [selectedWakeWordId]
  );

  const buildHandler = useCallback(
    () => createGlobalMascotHandler(globalNavigate, toggleCamera),
    [globalNavigate, toggleCamera]
  );

  const getConnectionConfig = useCallback(() => {
    if (globalMode !== null) {
      const config = SUBJECT_CONFIG[globalMode];
      if (config) {
        return {
          mode: config.modeStr,
          systemInstruction: `You are Curio, acting as a guide for ${config.name}. ${config.context}`,
        };
      }
    }

    return {
      mode: 'global' as LiveModuleMode,
      systemInstruction: getCurioSystemPrompt(
        userName,
        weatherCity,
        tempUnit,
        undefined,
        undefined,
        resolveWakeWordSearchGroundingMode(voiceBackend),
        activePersonality.prompt,
        homeLocation,
        workLocation,
        customLocations,
      ),
    };
  }, [globalMode, userName, weatherCity, tempUnit, homeLocation, workLocation, customLocations, activePersonality.prompt, voiceBackend]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const scheduleIdleCheck = useCallback(() => {
    clearIdleTimer();

    if (!isConnected) {
      return;
    }

    const remainingMs = lastUserSpeechAtRef.current
      ? Math.max(RECHECK_IDLE_MS, WAKE_WORD_IDLE_TIMEOUT_MS - (Date.now() - lastUserSpeechAtRef.current))
      : WAKE_WORD_IDLE_TIMEOUT_MS;

    idleTimerRef.current = window.setTimeout(() => {
      if (!isConnected || isConnecting) {
        return;
      }

      const idleForMs = Date.now() - lastUserSpeechAtRef.current;
      if (isSpeaking || idleForMs < WAKE_WORD_IDLE_TIMEOUT_MS) {
        scheduleIdleCheck();
        return;
      }

      console.log('[CurioWakeWord] Disconnecting Live API after one minute of user silence.');
      void disconnect();
    }, remainingMs);
  }, [clearIdleTimer, disconnect, isConnected, isConnecting, isSpeaking]);

  const noteUserSpeech = useCallback(() => {
    lastUserSpeechAtRef.current = Date.now();
    if (isConnected) {
      scheduleIdleCheck();
    }
  }, [isConnected, scheduleIdleCheck]);

  const offlineActiveRef = useRef(false);

  const startOfflineSession = useCallback(() => {
    if (offlineActiveRef.current || isOfflineListening()) return;

    const wasPlaying = musicPlaybackService.getState().playbackState === 'playing';
    window.dispatchEvent(new CustomEvent('curio:wake', { detail: { wasPlaying } }));
    if (wasPlaying) void musicPlaybackService.pause();

    stopListening();
    offlineActiveRef.current = true;
    unlockSpeechSynthesis();
    window.dispatchEvent(new CustomEvent('curio:offline-status', { detail: { status: 'listening' } }));

    const cbs: OfflineSpeechCallbacks = {
      onStatusChange: (status) => {
        window.dispatchEvent(new CustomEvent('curio:offline-status', { detail: { status } }));
      },
      onTranscript: (text, isFinal) => {
        window.dispatchEvent(new CustomEvent('curio:offline-transcript', { detail: { text, isFinal } }));
      },
      onCardEvent: (event) => {
        window.dispatchEvent(new CustomEvent('curio:offline-card', { detail: event }));
      },
      onSpeak: (text) => {
        const speechText = stripEmojiForSpeech(text);
        if (speechText && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(speechText);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        }
        window.dispatchEvent(new CustomEvent('curio:offline-speak', { detail: { text } }));
      },
      onError: (error) => {
        console.warn('[CurioWakeWord] Offline speech error:', error);
        window.dispatchEvent(new CustomEvent('curio:offline-status', { detail: { status: 'error', error } }));
      },
    };

    if (!isSpeechRecognitionSupported()) {
      console.warn('[CurioWakeWord] Speech recognition not supported in this browser.');
      offlineActiveRef.current = false;
      return;
    }

    setTimeout(() => playCurioGreeting(), 100);
    startContinuousOfflineListening(cbs);
  }, []);

  useEffect(() => {
    return () => {
      if (offlineActiveRef.current) {
        stopOfflineListening();
        offlineActiveRef.current = false;
      }
    };
  }, []);

  const connectFromWakeWord = useCallback(async () => {
    if (isConnected || isConnecting) return;

    if (voiceBackend === 'custom_llm') {
      // Custom LLM is text-only on the wire; we still let the user speak by
      // transcribing via the Web Speech API and sending the resulting text
      // through the same text-turn pipeline. CurioAgentMode owns that flow.
      stopListening();
      const wasPlaying = musicPlaybackService.getState().playbackState === 'playing';
      if (wasPlaying) void musicPlaybackService.pause();
      window.dispatchEvent(new CustomEvent('curio:wake', { detail: { wasPlaying } }));
      window.dispatchEvent(new CustomEvent('curio:wake-connect', { detail: { backend: 'custom_llm' } }));
      return;
    }

    if (voiceBackend === 'offline') {
      startOfflineSession();
      return;
    }

    if (voiceBackend === 'ha_voice_pipeline') {
      stopListening();
      window.dispatchEvent(new CustomEvent('curio:wake-connect', { detail: { backend: 'ha_voice_pipeline' } }));
      return;
    }

    try {
      const wasPlaying = musicPlaybackService.getState().playbackState === 'playing';
      noteUserSpeech();
      window.dispatchEvent(new CustomEvent('curio:wake', { detail: { wasPlaying } }));

      if (wasPlaying) void musicPlaybackService.pause();
      window.dispatchEvent(new Event('curio:media-playing'));

      await unlockAudio();

      const preparedMicStream = takePreparedMediaStream() ?? undefined;
      console.info(`[CurioWakeWord] Wake-word handoff stream ${preparedMicStream ? 'reused' : 'not available'}, continuing into session connect.`);
      const resolvedSpeakerIdentity = await identifyResolvedSpeakerFromStream({
        enabled: speakerIdentificationEnabled,
        stream: preparedMicStream,
        profiles: speakerProfiles,
        defaultProfileId: defaultSpeakerProfileId,
      });
      if (resolvedSpeakerIdentity) {
        applyResolvedSpeakerIdentity(resolvedSpeakerIdentity);
      }
      const activeSessionIdentity =
        (speakerIdentificationEnabled || faceRecognitionEnabled)
          ? {
            profileId: getSpeakerSessionState().activeProfileId,
            profileName: getSpeakerSessionState().activeProfileName,
            source: getSpeakerSessionState().source,
            recognizedBy: getSpeakerSessionState().recognizedBy,
            confidence: getSpeakerSessionState().confidence,
          }
          : null;

      stopListening();
      const connectionConfig = getConnectionConfig();

      await connect(
        connectionConfig.mode,
        buildHandler(),
        (speakerIdentificationEnabled || faceRecognitionEnabled)
          ? appendSpeakerContextToInstruction(connectionConfig.systemInstruction, activeSessionIdentity ?? resolvedSpeakerIdentity)
          : connectionConfig.systemInstruction,
        liveApiVoiceId || 'Aoede',
        preparedMicStream
      );

      setTimeout(() => playCurioGreeting(), 150);
    } catch (error) {
      console.error('[CurioWakeWord] Failed to connect after wake word:', error);
    }
  }, [
    buildHandler,
    connect,
    getConnectionConfig,
    isConnected,
    isConnecting,
    liveApiVoiceId,
    noteUserSpeech,
    unlockAudio,
    speakerIdentificationEnabled,
    faceRecognitionEnabled,
    speakerProfiles,
    defaultSpeakerProfileId,
    voiceBackend,
    startOfflineSession,
  ]);

  useEffect(() => {
    console.log('[CurioWakeWord] Component mounted.');
  }, []);

  useEffect(() => {
    if (!enableWakeWord) return;

    let isCancelled = false;

    const preloadRuntime = async () => {
      try {
        await preloadWakeWordModel({ wakeWordId: selectedWakeWord.id });
      } catch (error) {
        if (!isCancelled) {
          console.warn(`[CurioWakeWord] Failed to preload "${selectedWakeWord.phrase}" runtime:`, error);
        }
      }
    };

    void preloadRuntime();

    return () => {
      isCancelled = true;
    };
  }, [enableWakeWord, selectedWakeWord.id, selectedWakeWord.phrase]);

  useEffect(() => {
    if (!enableWakeWord || isConnected || isConnecting || isMuted) {
      if (isMuted && isListening()) {
        console.info('[CurioWakeWord] Wake word suspended while microphone is muted.');
      }
      stopListening();
      return;
    }

    if (offlineActiveRef.current || isOfflineListening() || isHaVoicePipelineConnected()) {
      return;
    }

    let isCancelled = false;
    let retryTimeout: number | undefined;
    let attempt = 0;

    const startWithRetry = async () => {
      attempt += 1;
      try {
        console.info(`[CurioWakeWord] Arming "${selectedWakeWord.phrase}" listener (attempt ${attempt}).`);
        await startListening({
          wakeWordId: selectedWakeWord.id,
          detectionThreshold: userThresholdOverride ?? selectedWakeWord.threshold,
        });
        console.info(`[CurioWakeWord] "${selectedWakeWord.phrase}" listener armed.`);
      } catch (error) {
        if (!isCancelled && !isWakeWordStartAbort(error)) {
          console.warn(`[CurioWakeWord] Failed to start "${selectedWakeWord.phrase}" listener:`, error);
          console.info(`[CurioWakeWord] Scheduling "${selectedWakeWord.phrase}" re-arm retry in 3000ms.`);
          retryTimeout = window.setTimeout(startWithRetry, 3000);
        }
      }
    };

    void startWithRetry();

    return () => {
      isCancelled = true;
      if (retryTimeout) window.clearTimeout(retryTimeout);
      stopListening();
    };
  }, [enableWakeWord, isConnected, isConnecting, isMuted, selectedWakeWord.id, selectedWakeWord.phrase, selectedWakeWord.threshold, userThresholdOverride]);

  useEffect(() => {
    if (voiceBackend !== 'offline' || !enableWakeWord) return;

    const handleOfflineStatus = (e: Event) => {
      const { status } = (e as CustomEvent).detail || {};
      if (status === 'idle' || status === 'error') {
        if (!isOfflineListening()) {
          offlineActiveRef.current = false;
        }
      }
    };

    window.addEventListener('curio:offline-status', handleOfflineStatus);
    return () => window.removeEventListener('curio:offline-status', handleOfflineStatus);
  }, [voiceBackend, enableWakeWord]);

  useEffect(() => {
    const handleWakeWord = (event: Event) => {
      const detail = (event as CustomEvent<WakeWordDetectedDetail>).detail;
      const now = Date.now();

      if (now - lastWakeHandledAtRef.current < 1500) return;

      lastWakeHandledAtRef.current = now;
      console.log(`[CurioWakeWord] Wake word detected: ${detail?.phrase || selectedWakeWord.phrase}`);
      void connectFromWakeWord();
    };

    window.addEventListener(WAKE_WORD_DETECTED_EVENT, handleWakeWord);
    return () => window.removeEventListener(WAKE_WORD_DETECTED_EVENT, handleWakeWord);
  }, [connectFromWakeWord, selectedWakeWord.phrase]);

  const latestUserTranscript = useMemo(() => {
    const history = transcriptHistory ?? [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (item.speaker === 'user' && item.text) {
        return item.text;
      }
    }
    return '';
  }, [transcriptHistory]);

  useEffect(() => {
    const normalizedTranscript = normalizeTranscript(latestUserTranscript);
    if (!isConnected || !normalizedTranscript) return;
    if (normalizedTranscript === lastObservedUserTranscriptRef.current) return;

    lastObservedUserTranscriptRef.current = normalizedTranscript;
    noteUserSpeech();

    if (isDisconnectCommand(normalizedTranscript)) {
      console.log('[CurioWakeWord] Disconnect command heard from user transcript.');
      void disconnect();
    }
  }, [disconnect, isConnected, latestUserTranscript, noteUserSpeech]);

  useEffect(() => {
    if (isConnected) {
      noteUserSpeech();
      return;
    }
    lastObservedUserTranscriptRef.current = '';
    clearIdleTimer();
  }, [clearIdleTimer, isConnected, noteUserSpeech]);

  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  const { emitCardEvent } = useCardManager();
  useEffect(() => {
    if (voiceBackend !== 'offline') return;

    const handleOfflineCard = (e: Event) => {
      const event = (e as CustomEvent).detail;
      if (event) emitCardEvent(event);
    };

    window.addEventListener('curio:offline-card', handleOfflineCard);
    return () => window.removeEventListener('curio:offline-card', handleOfflineCard);
  }, [voiceBackend, emitCardEvent]);

  return <></>;
};
