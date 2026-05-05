import { beforeEach, describe, expect, it, vi } from 'vitest';

type WorkerListener = (event: MessageEvent<any>) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];

  public readonly messages: any[] = [];
  private readonly listeners = new Map<string, WorkerListener[]>();

  constructor(public readonly url: string) {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: WorkerListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message: any): void {
    this.messages.push(message);
  }

  terminate(): void {
    // no-op
  }

  emit(message: any): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: message } as MessageEvent<any>);
    }
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Pocket TTS worker client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
  });

  it('serializes speak requests so one worker generation owns the ONNX sessions at a time', async () => {
    const { runInferenceInWorker } = await import('./workerClient');

    const first = runInferenceInWorker({
      tokenIds: [1],
      temperature: 0.7,
      lsdSteps: 1,
      framesAfterEos: 3,
      onChunk: async () => {},
    });
    const second = runInferenceInWorker({
      tokenIds: [2],
      temperature: 0.7,
      lsdSteps: 1,
      framesAfterEos: 3,
      onChunk: async () => {},
    });

    await tick();

    const worker = FakeWorker.instances[0];
    expect(worker.messages.filter((message) => message.type === 'speak')).toEqual([
      expect.objectContaining({ id: 1, tokenIds: [1] }),
    ]);

    worker.emit({ type: 'done', id: 1 });
    await first;
    await tick();

    expect(worker.messages.filter((message) => message.type === 'speak')).toEqual([
      expect.objectContaining({ id: 1, tokenIds: [1] }),
      expect.objectContaining({ id: 2, tokenIds: [2] }),
    ]);

    worker.emit({ type: 'done', id: 2 });
    await second;
  });
});
