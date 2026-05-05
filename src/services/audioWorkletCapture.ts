/**
 * Audio worklet capture with built-in downsampling to 16kHz.
 * Downsampling runs inside the worklet thread, freeing the main thread entirely.
 */

const PROCESSOR_PREFIX = 'curio-pcm-capture';
const MIN_BUFFER_SIZE = 128;
const TARGET_RATE = 16000;

const loadedProcessorsByContext = new WeakMap<AudioContext, Set<string>>();
const moduleUrlByProcessor = new Map<string, string>();

const normalizeBufferSize = (bufferSize: number): number => Math.max(MIN_BUFFER_SIZE, Math.floor(bufferSize));

const getProcessorName = (bufferSize: number): string => `${PROCESSOR_PREFIX}-${bufferSize}`;

const getProcessorModuleUrl = (processorName: string, bufferSize: number): string => {
    const cacheKey = `${processorName}:${bufferSize}`;
    const existingUrl = moduleUrlByProcessor.get(cacheKey);
    if (existingUrl) return existingUrl;

    const processorCode = `
class CurioPcmCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.outputBufferSize = ${bufferSize};
        this.gateThreshold = options.processorOptions?.gateThreshold || 0;

        // sampleRate is available in AudioWorkletGlobalScope
        this.nativeRate = sampleRate;
        this.targetRate = ${TARGET_RATE};
        this.needsDownsample = this.nativeRate !== this.targetRate;
        this.ratio = this.nativeRate / this.targetRate;

        // Output buffer collects downsampled (or passthrough) samples
        this.outBuffer = new Float32Array(this.outputBufferSize);
        this.outOffset = 0;

        // Fractional accumulator for downsampling
        // Tracks how many native-rate samples we've consumed toward the current output sample
        this.accumSamples = 0;
        this.accumSum = 0;
        this.accumCount = 0;
    }

    downsample(channelData) {
        // Simple averaging downsampler: accumulate native-rate samples,
        // emit one output sample every 'ratio' input samples.
        const ratio = this.ratio;

        for (let i = 0; i < channelData.length; i++) {
            this.accumSum += channelData[i];
            this.accumCount++;
            this.accumSamples++;

            if (this.accumSamples >= ratio) {
                // Emit averaged output sample
                this.outBuffer[this.outOffset] = this.accumCount > 0 ? this.accumSum / this.accumCount : 0;
                this.outOffset++;
                this.accumSamples -= ratio; // keep fractional remainder
                this.accumSum = 0;
                this.accumCount = 0;

                if (this.outOffset >= this.outputBufferSize) {
                    this.flushBuffer();
                }
            }
        }
    }

    passthrough(channelData) {
        let inputOffset = 0;
        while (inputOffset < channelData.length) {
            const remaining = this.outputBufferSize - this.outOffset;
            const available = channelData.length - inputOffset;
            const copyCount = Math.min(remaining, available);

            this.outBuffer.set(channelData.subarray(inputOffset, inputOffset + copyCount), this.outOffset);
            this.outOffset += copyCount;
            inputOffset += copyCount;

            if (this.outOffset >= this.outputBufferSize) {
                this.flushBuffer();
            }
        }
    }

    flushBuffer() {
        // Software noise gate
        if (this.gateThreshold > 0) {
            let sum = 0;
            for (let i = 0; i < this.outputBufferSize; i++) {
                sum += this.outBuffer[i] * this.outBuffer[i];
            }
            const rms = Math.sqrt(sum / this.outputBufferSize);
            if (rms < this.gateThreshold) {
                this.outBuffer.fill(0);
            }
        }

        this.port.postMessage(this.outBuffer);
        this.outBuffer = new Float32Array(this.outputBufferSize);
        this.outOffset = 0;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;
        const channelData = input[0];
        if (!channelData || channelData.length === 0) return true;

        if (this.needsDownsample) {
            this.downsample(channelData);
        } else {
            this.passthrough(channelData);
        }
        return true;
    }
}

registerProcessor('${processorName}', CurioPcmCaptureProcessor);
`;

    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);
    moduleUrlByProcessor.set(cacheKey, moduleUrl);
    return moduleUrl;
};

const ensureProcessorLoaded = async (audioContext: AudioContext, processorName: string, bufferSize: number): Promise<void> => {
    if (!audioContext.audioWorklet) {
        throw new Error('AudioWorklet is not supported in this browser.');
    }

    let loadedProcessors = loadedProcessorsByContext.get(audioContext);
    if (!loadedProcessors) {
        loadedProcessors = new Set<string>();
        loadedProcessorsByContext.set(audioContext, loadedProcessors);
    }

    if (loadedProcessors.has(processorName)) return;

    const moduleUrl = getProcessorModuleUrl(processorName, bufferSize);
    await audioContext.audioWorklet.addModule(moduleUrl);
    loadedProcessors.add(processorName);
};

/**
 * Create a PCM capture worklet node that outputs 16kHz Float32 chunks.
 * Downsampling from the native hardware rate happens inside the worklet thread.
 */
export const createPcmCaptureWorkletNode = async (
    audioContext: AudioContext,
    onChunk: (chunk: Float32Array) => void,
    bufferSize: number = 4096,
    gateThreshold: number = 0,
): Promise<AudioWorkletNode> => {

    const normalizedBufferSize = normalizeBufferSize(bufferSize);
    const processorName = getProcessorName(normalizedBufferSize);

    await ensureProcessorLoaded(audioContext, processorName, normalizedBufferSize);

    const node = new AudioWorkletNode(audioContext, processorName, {
        processorOptions: { gateThreshold }
    });

    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        onChunk(event.data);
    };
    return node;
};

/**
 * Revoke all cached blob URLs for audio worklet processor modules.
 * Call this during app teardown to prevent blob URL leaks.
 */
export const revokeProcessorBlobUrls = (): void => {
    for (const [, url] of moduleUrlByProcessor) {
        try { URL.revokeObjectURL(url); } catch {}
    }
    moduleUrlByProcessor.clear();
};
