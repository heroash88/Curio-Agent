/**
 * Centralized AudioContext Service
 * 
 * Provides a singleton AudioContext instance for the entire application.
 * This prevents memory leaks and browser warnings caused by creating too many
 * AudioContexts in different components.
 * 
 * iOS Safari / PWA Notes:
 * - AudioContext must be created/resumed in response to user gesture
 * - Call unlockAudioContext() on first user interaction (touch/click)
 */

declare global {
    interface Navigator {
        audioSession?: {
            type: string;
        };
    }

    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

let sharedAudioContext: AudioContext | null = null;
let suspendTimeout: any | null = null;
let suspendLocks = 0;
let isUnlocked = false;
const AUTO_SUSPEND_DELAY = 60000; // 1 minute

// State change listeners
type StateChangeListener = (state: AudioContextState) => void;
const stateChangeListeners: Set<StateChangeListener> = new Set();

// Auto-resume listener reference for cleanup
let autoResumeHandler: (() => void) | null = null;

// Queued operations for when context is not running
type QueuedOperation = () => void | Promise<void>;
const queuedOperations: QueuedOperation[] = [];

// Cross-browser AudioContext class
const AudioContextClass: typeof AudioContext | undefined =
    typeof window !== "undefined"
        ? window.AudioContext || window.webkitAudioContext
        : undefined;

// Detect Safari (macOS and iOS).  macOS Safari also has strict audio
// autoplay policies -- AudioContext starts suspended and requires a user
// gesture to resume -- so we treat it the same as iOS Safari.
// Exported so other modules can use the same reliable check without
// duplicating user-agent sniffing.
export const isSafariBrowser = /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent) &&
    !/Chromium/.test(navigator.userAgent) &&
    !/Edg/.test(navigator.userAgent);

/**
* Get the shared AudioContext instance.
* Creates one if it doesn't exist.
* Resumes the context if it is suspended and resumeIfSuspended is true.
*/
export function getSharedAudioContext(resumeIfSuspended: boolean = false): AudioContext {
    if (!sharedAudioContext) {
        if (!AudioContextClass) {
            throw new Error("AudioContext is not available in this execution context.");
        }
        try {
            // Force a stable sample rate if possible, but allow browser to pick if
            // the hardware driver is sensitive (prevents crashes on tablets).
            sharedAudioContext = new AudioContextClass();


            // Setup state change listener for debugging and notifications
            sharedAudioContext.onstatechange = () => {
                const state = sharedAudioContext?.state;
                // console.log(`AudioContext state: ${state}`);
                
                // Notify all listeners of state change
                if (state) {
                    notifyStateChange(state);
                }
                
                // Process queued operations when context becomes running
                if (state === 'running') {
                    processQueuedOperations();
                }
            };

            // Emit the initial state so subscribers can initialize immediately.
            notifyStateChange(sharedAudioContext.state);
        } catch (e) {
            console.error('Failed to create AudioContext:', e);
            throw e;
        }
    }

    // Cancel any pending suspend
    if (suspendTimeout) {
        clearTimeout(suspendTimeout);
        suspendTimeout = null;
    }

    // Auto-resume if requested
    if (resumeIfSuspended && sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch((err: any) => {
            console.warn('Failed to resume AudioContext:', err);
        });
    }

    // Schedule auto-suspend to save resources
    resetSuspendTimer();

    return sharedAudioContext;
}

/**
* Explicitly resume the audio context.
* Useful for user interactions (click handlers).
*/
export async function resumeAudioContext(): Promise<void> {
    const ctx = getSharedAudioContext(false);
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
    resetSuspendTimer();
}

/**
 * Remove auto-resume event listeners from document.
 * Safe to call even if no listeners are currently attached.
 */
function removeAutoResumeListeners(): void {
    if (autoResumeHandler) {
        document.removeEventListener('touchstart', autoResumeHandler);
        document.removeEventListener('touchend', autoResumeHandler);
        document.removeEventListener('click', autoResumeHandler);
        autoResumeHandler = null;
    }
}

/**
 * Setup automatic resume on user interaction when context is suspended.
 * This handles iOS Safari and Capacitor requirements.
 * Listeners self-remove once the AudioContext reaches 'running' state.
 */
export function setupAutoResumeOnInteraction(): void {
    removeAutoResumeListeners(); // Prevent duplicates

    const resumeOnInteraction = async () => {
        const ctx = getSharedAudioContext(false);
        
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
                console.log('AudioContext resumed on user interaction');
            } catch (error) {
                console.error('Failed to resume AudioContext on interaction:', error);
                return;
            }
        }

        if (ctx.state === 'running') {
            removeAutoResumeListeners();
        }
    };

    autoResumeHandler = resumeOnInteraction;
    
    // iOS Safari and Capacitor require touch events
    document.addEventListener('touchstart', resumeOnInteraction, { passive: true });
    document.addEventListener('touchend', resumeOnInteraction, { passive: true });
    
    // Fallback for desktop
    document.addEventListener('click', resumeOnInteraction, { passive: true });
}

/**
 * Queue an audio operation to be executed when context is running.
 * If context is already running, executes immediately.
 * 
 * @param operation - Function to execute when context is running
 */
export function queueAudioOperation(operation: QueuedOperation): void {
    const ctx = getSharedAudioContext(false);
    
    if (ctx.state === 'running') {
        // Execute immediately if context is running
        try {
            const result = operation();
            if (result instanceof Promise) {
                result.catch(err => console.error('Queued audio operation failed:', err));
            }
        } catch (error) {
            console.error('Queued audio operation failed:', error);
        }
    } else {
        // Queue for later execution
        queuedOperations.push(operation);
    }
}

/**
 * Process all queued audio operations.
 * Called automatically when context state changes to 'running'.
 */
function processQueuedOperations(): void {
    if (queuedOperations.length === 0) return;
    
    console.log(`Processing ${queuedOperations.length} queued audio operations`);
    
    // Execute all queued operations
    const operations = [...queuedOperations];
    queuedOperations.length = 0; // Clear the queue
    
    for (const operation of operations) {
        try {
            const result = operation();
            if (result instanceof Promise) {
                result.catch(err => console.error('Queued audio operation failed:', err));
            }
        } catch (error) {
            console.error('Queued audio operation failed:', error);
        }
    }
}

/**
 * Add a listener for AudioContext state changes.
 * 
 * @param listener - Callback function to be called on state changes
 * @returns Unsubscribe function
 */
export function onAudioContextStateChange(listener: StateChangeListener): () => void {
    stateChangeListeners.add(listener);

    // If a context already exists, immediately report current state.
    if (sharedAudioContext) {
        listener(sharedAudioContext.state);
    }
    
    // Return unsubscribe function
    return () => {
        stateChangeListeners.delete(listener);
    };
}

/**
 * Notify all listeners of a state change.
 */
function notifyStateChange(state: AudioContextState): void {
    for (const listener of stateChangeListeners) {
        try {
            listener(state);
        } catch (error) {
            console.error('State change listener error:', error);
        }
    }
}

/**
 * Get the current AudioContext state.
 * Returns null if context hasn't been created yet.
 */
export function getAudioContextState(): AudioContextState | null {
    return sharedAudioContext?.state ?? null;
}

/**
 * Unlock audio for iOS Safari and PWA.
 * MUST be called in response to a user gesture (touch/click).
 * Call this on first user interaction with the app.
 */
export async function unlockAudioContext(): Promise<boolean> {
    if (isUnlocked) return true;

    try {
        const ctx = getSharedAudioContext(false);

        // iOS Safari requires playing a silent buffer to unlock
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        // Configure AudioSession for both playback and recording if API exists
        if (navigator.audioSession) {
            try {
                navigator.audioSession.type = 'play-and-record';
            } catch (e) {
                console.warn('Failed to set AudioSession type in unlockAudioContext:', e);
            }
        }

        // Play a silent buffer to fully unlock on iOS
        const buffer = ctx.createBuffer(1, 1, 16000); 
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);

        isUnlocked = true;
        return true;
    } catch (e) {
        console.warn('Failed to unlock AudioContext:', e);
        return false;
    }
}

/**
 * Check if we're on Safari (strict audio policies apply to both macOS and iOS Safari)
 */
export function isStrictAudioPolicy(): boolean {
    return isSafariBrowser;
}

/**
 * Check if audio is unlocked
 */
export function isAudioUnlocked(): boolean {
    return isUnlocked;
}

/**
 * Prevent the AudioContext from auto-suspending.
 * Call this when starting a continuous live session.
 */
export function lockAudioSuspend(): void {
    suspendLocks++;
    if (suspendTimeout) {
        clearTimeout(suspendTimeout);
        suspendTimeout = null;
    }
}

/**
 * Allow the AudioContext to auto-suspend again.
 * Call this when ending a continuous live session.
 */
export function unlockAudioSuspend(): void {
    if (suspendLocks > 0) {
        suspendLocks--;
    }
    if (suspendLocks === 0 && sharedAudioContext && sharedAudioContext.state === 'running') {
        resetSuspendTimer();
    }
}

/**
* Reset the auto-suspend timer.
* Call this whenever audio is played.
*/
function resetSuspendTimer() {
    if (suspendLocks > 0) return;

    if (suspendTimeout) {
        clearTimeout(suspendTimeout);
    }

    suspendTimeout = setTimeout(() => {
        if (sharedAudioContext && sharedAudioContext.state === 'running') {
            // console.log('Auto-suspending AudioContext due to inactivity');
            sharedAudioContext.suspend();
        }
    }, AUTO_SUSPEND_DELAY);
}


/**
* Force close the context (rarely needed)
*/
export function closeAudioContext(): void {
    removeAutoResumeListeners();
    if (sharedAudioContext) {
        sharedAudioContext.close();
        sharedAudioContext = null;
    }
    if (suspendTimeout) {
        clearTimeout(suspendTimeout);
        suspendTimeout = null;
    }
    isUnlocked = false;
    suspendLocks = 0;
    
    // Clear queued operations
    queuedOperations.length = 0;
    
    // Clear state change listeners
    stateChangeListeners.clear();
}
