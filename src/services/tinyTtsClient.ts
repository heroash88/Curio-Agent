import {
  getSharedAudioContext,
  isAudioUnlocked,
  isStrictAudioPolicy,
  lockAudioSuspend,
  unlockAudioSuspend,
} from './audioContext';
import { reportTtsProgress } from './ttsProgress';
import { stripEmojiForSpeech } from './ttsTextSanitizer';
import { chunkText, preprocessText } from '../lib/kittenTts/preprocess';
import {
  TINY_TTS_SAMPLE_RATE,
  ensureTinyModelLoaded,
  releaseTinyModel,
  runTinyInference,
} from '../lib/tinyTts/tinyEngine';
import { releaseTinyTextCache } from '../lib/tinyTts/text';
import { releaseG2PModel } from '../lib/tinyTts/g2pPredict';
import { assertTinyTtsLocalAssetsAvailable } from '../lib/tinyTts/localAssets';

const INACTIVITY_RELEASE_MS = 45_000;

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let activePlayer: TinyAudioPlayer | null = null;
let aborted = false;

export const listTinyVoices = (): Array<{ id: string; label: string }> => [
  { id: 'MALE', label: 'Tiny - English male' },
];

const bumpInactivityTimer = (): void => {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    inactivityTimer = null;
    releaseTinyModels();
  }, INACTIVITY_RELEASE_MS);
};

class TinyAudioPlayer {
  private readonly ctx: AudioContext;
  private baseScheduleTime: number | null = null;
  private totalScheduledSec = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private closed = false;
  private suspendLockReleased = false;

  constructor(private readonly primeSec = 0.08) {
    this.ctx = getSharedAudioContext(false);
    lockAudioSuspend();
  }

  async playChunk(samples: Float32Array): Promise<void> {
    if (this.closed || samples.length === 0) return;
    if (this.ctx.state === 'suspended') {
      if (isStrictAudioPolicy() && !isAudioUnlocked()) {
        throw new Error('Audio is locked on Safari. Start playback from a direct user interaction first.');
      }
      await this.ctx.resume();
    }

    const copy = new Float32Array(samples.length);
    copy.set(samples);
    const buffer = this.ctx.createBuffer(1, copy.length, TINY_TTS_SAMPLE_RATE);
    buffer.getChannelData(0).set(copy);

    if (this.baseScheduleTime === null) {
      this.baseScheduleTime = this.ctx.currentTime + this.primeSec;
    }
    let startAt = this.baseScheduleTime + this.totalScheduledSec;
    if (startAt < this.ctx.currentTime) {
      const drift = this.ctx.currentTime - startAt;
      this.baseScheduleTime += drift;
      startAt = this.ctx.currentTime;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start(startAt);
    this.totalScheduledSec += buffer.duration;

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    };
  }

  async waitUntilFinished(): Promise<void> {
    if (this.closed || this.baseScheduleTime === null) return;
    const endTime = this.baseScheduleTime + this.totalScheduledSec;
    const remainingMs = Math.max(0, endTime - this.ctx.currentTime) * 1000;
    if (remainingMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const source of this.sources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may already be stopped.
      }
    }
    this.sources.clear();
    if (!this.suspendLockReleased) {
      this.suspendLockReleased = true;
      unlockAudioSuspend();
    }
  }
}

export const ensureTinyReady = async (): Promise<void> => {
  await assertTinyTtsLocalAssetsAvailable();
  await ensureTinyModelLoaded();
  bumpInactivityTimer();
};

export interface TinySpeakOptions {
  text: string;
  speed?: number;
}

export const speakWithTiny = async (options: TinySpeakOptions): Promise<void> => {
  const cleaned = preprocessText(stripEmojiForSpeech(options.text));
  const chunks = chunkText(cleaned, 220);
  if (chunks.length === 0) return;

  aborted = false;
  bumpInactivityTimer();

  await assertTinyTtsLocalAssetsAvailable();
  if (activePlayer) {
    await activePlayer.close();
    activePlayer = null;
  }

  activePlayer = new TinyAudioPlayer();
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      if (aborted) break;
      reportTtsProgress(`TinyTTS chunk ${index + 1}/${chunks.length}...`);
      const samples = await runTinyInference({
        text: chunks[index],
        speed: options.speed,
        shouldAbort: () => aborted,
      });
      if (!aborted) {
        reportTtsProgress('Playing audio...');
        await activePlayer.playChunk(samples);
      }
    }

    if (activePlayer && !aborted) {
      await activePlayer.waitUntilFinished();
    }
  } finally {
    bumpInactivityTimer();
    if (activePlayer) {
      await activePlayer.close();
      activePlayer = null;
    }
  }
};

export const stopTiny = async (): Promise<void> => {
  aborted = true;
  if (activePlayer) {
    await activePlayer.close();
    activePlayer = null;
  }
};

export const releaseTinyModels = (): void => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  void stopTiny();
  releaseTinyModel();
  releaseTinyTextCache();
  releaseG2PModel();
};
