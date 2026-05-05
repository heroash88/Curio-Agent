/**
 * VisionAssistManager — handles vision-request detection and camera-assisted Q&A.
 * Extracted from LiveClient to isolate vision assist concerns.
 */

const VISION_REQUEST_PATTERNS = [
    /\bwhat do you see\b/i,
    /\bwhat(?:'s| is) (?:this|that)\b/i,
    /\bwhat(?:'s| is) in my hand\b/i,
    /\bwhat am i holding\b/i,
    /\bwhat am i showing\b/i,
    /\bcan you see\b/i,
    /\bdo you see\b/i,
    /\bsee what (?:i am|i'm) holding\b/i,
    /\blook at (?:this|that|my)\b/i,
    /\blook (?:here|closely)\b/i,
    /\btell me what you see\b/i,
    /\bdescribe (?:this|that|what you see)\b/i,
    /\bidentify (?:this|that)\b/i,
    /\bwhat color is (?:this|that|it)\b/i,
    /\bwhat is this in my hand\b/i,
    /\bwhat (?:object|item) is this\b/i,
    /\bwhat am i holding up\b/i,
    /\bwhat am i pointing at\b/i,
    /\bread (?:this|that|it)\b/i,
];

const VISION_EXCLUDE_PATTERNS = [
    /\bweather\b/i, /\btemperature\b/i, /\bforecast\b/i, /\btimer\b/i,
    /\balarm\b/i, /\btime\b/i, /\bmusic\b/i, /\bsong\b/i, /\blight\b/i,
    /\bswitch\b/i, /\bdevice\b/i, /\bremind\b/i, /\bcalculate\b/i,
    /\bjoke\b/i, /\bstory\b/i, /\bnews\b/i,
];

const VISION_OBJECT_HINTS = [
    'hand', 'holding', 'hold', 'object', 'item', 'card',
    'label', 'color', 'face', 'room',
];

export function isVisionRequest(text: string): boolean {
    if (VISION_EXCLUDE_PATTERNS.some((p) => p.test(text))) return false;
    if (VISION_REQUEST_PATTERNS.some((p) => p.test(text))) return true;
    const normalized = text.toLowerCase();
    const hasVisionObject = VISION_OBJECT_HINTS.some((t) => normalized.includes(t));
    const hasExplicitLook = /\b(look|see|show me what|describe what)\b/i.test(text);
    return hasVisionObject && hasExplicitLook;
}

export interface VisionAssistDeps {
    getSession: () => Promise<any> | null;
    toggleCamera?: (enabled: boolean) => Promise<any> | any;
    isHaCameraStreaming: () => boolean;
    stopAudio: () => void;
}

export class VisionAssistManager {
    public question = '';
    public inFlight = false;
    public promptSentForTurn = false;
    private debounceTimer: number | null = null;
    private deps: VisionAssistDeps;

    constructor(deps: VisionAssistDeps) {
        this.deps = deps;
    }

    /** Clear all vision assist state. */
    clear() {
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.question = '';
        this.inFlight = false;
        this.promptSentForTurn = false;
    }

    /** Schedule a vision assist if the user text looks like a vision request. */
    schedule(userText: string) {
        if (!this.deps.toggleCamera) return;
        const normalized = userText.trim();
        if (!normalized || !isVisionRequest(normalized)) return;
        this.question = normalized;
        this.deps.stopAudio();
        if (this.promptSentForTurn || this.inFlight) return;
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        void this.run();
    }

    /** Execute the vision assist flow. */
    async run() {
        const sessionPromise = this.deps.getSession();
        if (!sessionPromise) return;
        if (!this.question || this.inFlight || this.promptSentForTurn) return;
        this.inFlight = true;
        try {
            const session = await sessionPromise;
            this.deps.stopAudio();

            // If HA camera is streaming, use that feed
            if (this.deps.isHaCameraStreaming()) {
                session.sendRealtimeInput({
                    text: `The user just asked a vision question: "${this.question}". A Home Assistant camera feed is currently streaming frames to you. Answer that exact question using only the current camera feed you are receiving. If the image is unclear, say so instead of guessing. Do NOT open the device camera.`,
                });
                this.promptSentForTurn = true;
                return;
            }

            // Fall back to device camera
            if (!this.deps.toggleCamera) return;
            const cameraResult = await this.deps.toggleCamera(true);
            if (!this.deps.getSession()) return;
            if (cameraResult?.success) {
                session.sendRealtimeInput({
                    text: `The user just asked a vision question: "${this.question}". Fresh live camera frames are available now. Answer that exact question using only the current camera feed. If the image is unclear, say so instead of guessing.`,
                });
            } else {
                session.sendRealtimeInput({
                    text: `The user asked a vision question: "${this.question}". The camera is not ready: ${cameraResult?.error || 'no fresh frame available'}. Tell the user you could not get a clear camera view and ask them to try again.`,
                });
            }
            this.promptSentForTurn = true;
        } catch (error) {
            console.warn('[VisionAssist] Vision assist failed:', error);
        } finally {
            this.inFlight = false;
        }
    }
}
