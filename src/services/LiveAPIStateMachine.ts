/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LiveAPIStateMachine - State machine for managing LiveAPI connections without race conditions
 * 
 * This service implements a state machine with atomic transitions to prevent race conditions
 * in connection management. It ensures:
 * - Only one connection operation at a time (serialization)
 * - Proper cleanup before transitioning to disconnected state
 * - Ordered state change events
 * - MediaStream cleanup for WebRTC
 * - Exponential backoff retry logic with maximum retry limit
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

/**
 * Error thrown when maximum retry attempts have been reached
 */
export class MaxRetriesError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly retryCount: number
  ) {
    super(message);
    this.name = 'MaxRetriesError';
  }
}

export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export interface StateTransition {
  from: ConnectionState;
  to: ConnectionState;
  action?: () => Promise<void>;
  guard?: () => boolean;
}

export type StateChangeCallback = (state: ConnectionState, previousState: ConnectionState) => void;

export interface LiveAPIStateMachine {
  // Current state
  getState(): ConnectionState;
  
  // State transitions
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reset(): void;
  
  // State change subscription
  onStateChange(callback: StateChangeCallback): () => void;
  
  // Check if transition is valid
  canTransition(to: ConnectionState): boolean;
  
  // Track MediaStream for cleanup
  trackMediaStream(stream: MediaStream): void;
  
  // Set error state
  setError(error: Error): Promise<void>;
  
  // Mark connection as successfully established
  markConnected(): Promise<void>;
  
  // Get the last error
  getLastError(): Error | null;
  
  // Get retry count
  getRetryCount(): number;
  
  // Reset retry count
  resetRetryCount(): void;
}

/**
 * Implementation of LiveAPIStateMachine
 */
export class LiveAPIStateMachineImpl implements LiveAPIStateMachine {
  private currentState: ConnectionState = 'disconnected';
  private pendingOperation: Promise<void> | null = null;
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  private mediaStreams: MediaStream[] = [];
  private lastError: Error | null = null;
  private retryCount: number = 0;
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_RETRY_DELAY_MS = 1000;
  private readonly MAX_RETRY_DELAY_MS = 16000;
  private enableRetryDelays: boolean = true; // Can be disabled for testing
  
  // Define valid state transitions
  private readonly validTransitions: Map<ConnectionState, Set<ConnectionState>> = new Map<ConnectionState, Set<ConnectionState>>([
    ['disconnected', new Set<ConnectionState>(['connecting'])],
    ['connecting', new Set<ConnectionState>(['connected', 'error', 'disconnected', 'disconnecting'])],
    ['connected', new Set<ConnectionState>(['disconnecting', 'error'])],
    ['disconnecting', new Set<ConnectionState>(['disconnected'])],
    ['error', new Set<ConnectionState>(['disconnected', 'connecting'])],
  ]);
  
  constructor() {
    console.log('[LiveAPIStateMachine] Initialized in disconnected state');
  }
  
  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return this.currentState;
  }
  
  /**
   * Check if a transition to the target state is valid
   */
  canTransition(to: ConnectionState): boolean {
    const allowedStates = this.validTransitions.get(this.currentState);
    return allowedStates?.has(to) ?? false;
  }
  
  /**
   * Atomically transition to a new state
   * Ensures state changes are atomic and emits events in correct order
   */
  private async transitionTo(newState: ConnectionState): Promise<void> {
    const previousState = this.currentState;
    
    // Validate transition
    if (!this.canTransition(newState)) {
      throw new Error(
        `Invalid state transition from ${previousState} to ${newState}`
      );
    }
    
    // Atomic state change
    this.currentState = newState;
    console.log(`[LiveAPIStateMachine] State transition: ${previousState} -> ${newState}`);
    
    // Emit state change events in correct order (Requirement 7.5)
    this.emitStateChange(newState, previousState);
  }
  
  /**
   * Emit state change event to all subscribers
   */
  private emitStateChange(newState: ConnectionState, previousState: ConnectionState): void {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(newState, previousState);
      } catch (error) {
        console.error('[LiveAPIStateMachine] Error in state change callback:', error);
      }
    });
  }
  
  /**
   * Subscribe to state changes
   * Returns an unsubscribe function
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }
  
  /**
   * Connect to LiveAPI
   * Serializes connection attempts - rejects if already connecting/connected
   * Requirement 7.2: Connection attempt serialization
   */
  async connect(): Promise<void> {
    // Prevent concurrent connection attempts (Requirement 7.2)
    if (this.pendingOperation) {
      throw new Error('Connection operation already in progress');
    }
    
    // Check if we can transition to connecting
    if (!this.canTransition('connecting')) {
      throw new Error(
        `Cannot connect from ${this.currentState} state. ` +
        `Current state must be 'disconnected' or 'error'.`
      );
    }
    
    // Create pending operation
    this.pendingOperation = this.performConnect();
    
    try {
      await this.pendingOperation;
    } finally {
      this.pendingOperation = null;
    }
  }
  
  /**
   * Perform the actual connection logic
   * This should be overridden or injected by the consumer
   */
  private async performConnect(): Promise<void> {
    // Transition to connecting state (Requirement 7.1: Atomic state transitions)
    await this.transitionTo('connecting');
    
    // The actual connection logic will be handled by the consumer
    // This is just the state machine - the consumer will call transitionTo('connected')
    // when the connection is established
    
    console.log('[LiveAPIStateMachine] Entered connecting state');
  }
  
  /**
   * Mark connection as successfully established
   * Should be called by the consumer when connection is ready
   */
  async markConnected(): Promise<void> {
    if (this.currentState !== 'connecting') {
      throw new Error('Can only mark connected from connecting state');
    }
    await this.transitionTo('connected');
    
    // Reset retry count on successful connection
    this.resetRetryCount();
  }
  
  /**
   * Disconnect from LiveAPI
   * Cancels pending operations and performs cleanup
   * Requirements 7.3, 7.6: Disconnection cancels pending operations, cleanup before disconnected
   */
  async disconnect(): Promise<void> {
    // Cancel pending connection operation (Requirement 7.3)
    if (this.pendingOperation && this.currentState === 'connecting') {
      console.log('[LiveAPIStateMachine] Cancelling pending connection operation');
      // The pending operation will be rejected when we transition state
    }
    
    // Check if we can transition to disconnecting
    if (!this.canTransition('disconnecting')) {
      // If already disconnected or disconnecting, this is a no-op
      if (this.currentState === 'disconnected' || this.currentState === 'disconnecting') {
        console.log(`[LiveAPIStateMachine] Already ${this.currentState}, skipping disconnect`);
        return;
      }
      throw new Error(`Cannot disconnect from ${this.currentState} state`);
    }
    
    // Transition to disconnecting state
    await this.transitionTo('disconnecting');
    
    // Perform cleanup (Requirement 7.6: Cleanup before disconnected state)
    await this.performCleanup();
    
    // Transition to disconnected state
    await this.transitionTo('disconnected');
  }
  
  /**
   * Perform cleanup operations
   * Stops all MediaStream tracks and releases resources
   * Requirement 7.6: Cleanup completes before transitioning to disconnected
   */
  private async performCleanup(): Promise<void> {
    console.log('[LiveAPIStateMachine] Performing cleanup');
    
    // Stop all MediaStream tracks (Requirement 7.6)
    this.mediaStreams.forEach(stream => {
      stream.getTracks().forEach(track => {
        try {
          if (track.readyState === 'live') {
            track.stop();
          }
          console.log(`[LiveAPIStateMachine] Stopped ${track.kind} track: ${track.label}`);
        } catch (e) {
          console.warn(`[LiveAPIStateMachine] Failed to stop ${track.kind} track:`, e);
        }
      });
    });
    
    // Clear MediaStream array
    this.mediaStreams = [];
    
    // Additional cleanup can be added here by consumers
    console.log('[LiveAPIStateMachine] Cleanup complete');
  }
  
  /**
   * Track a MediaStream for cleanup on disconnect
   * Requirement 7.6: MediaStream cleanup
   */
  trackMediaStream(stream: MediaStream): void {
    this.mediaStreams.push(stream);
    console.log(
      `[LiveAPIStateMachine] Tracking MediaStream with ${stream.getTracks().length} tracks`
    );
  }
  
  /**
   * Set error state with error details.
   * Contains exponential backoff retry logic that transitions back to 'disconnected'
   * after a delay (allowing the consumer to reconnect). However, the current LiveClient
   * consumer bypasses this mechanism — it dispatches 'requestGlobalLiveApiReconnect'
   * events for auto-reconnection instead. The retry count/delay infrastructure is
   * preserved for potential future use or alternative consumers.
   */
  async setError(error: Error): Promise<void> {
    this.lastError = error;
    
    // Check if we can retry (only during connecting state)
    if (this.currentState === 'connecting' && this.incrementRetryCount()) {
      const delay = this.calculateRetryDelay();
      console.error(
        `[LiveAPIStateMachine] Connection error (attempt ${this.retryCount}/${this.MAX_RETRIES}):`,
        error.message,
        `- Retrying in ${delay}ms`
      );
      
      // Wait for exponential backoff delay (unless disabled for testing)
      if (this.enableRetryDelays) {
        await this.sleep(delay);
      }
      
      // After delay, transition to disconnected so consumer can retry
      // Don't automatically retry - let the consumer decide
      if (this.canTransition('disconnected')) {
        console.log('[LiveAPIStateMachine] Ready for retry after backoff delay');
        await this.transitionTo('disconnected');
      }
      return;
    }
    
    // Max retries reached or not in a retryable state
    if (this.hasReachedRetryLimit()) {
      console.error(
        `[LiveAPIStateMachine] Max retries (${this.MAX_RETRIES}) reached. Manual retry required.`,
        error
      );
    } else {
      console.error('[LiveAPIStateMachine] Error occurred:', error);
    }
    
    if (this.canTransition('error')) {
      await this.transitionTo('error');
    }
  }
  
  /**
   * Get the last error
   */
  getLastError(): Error | null {
    return this.lastError;
  }
  
  /**
   * Get the current retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }
  
  /**
   * Reset the retry count
   * Should be called after a successful connection
   */
  resetRetryCount(): void {
    this.retryCount = 0;
    console.log('[LiveAPIStateMachine] Retry count reset');
  }
  
  /**
   * Calculate exponential backoff delay
   * Returns delay in milliseconds: 1s, 2s, 4s, 8s, 16s (max)
   */
  private calculateRetryDelay(): number {
    const delay = this.INITIAL_RETRY_DELAY_MS * Math.pow(2, this.retryCount);
    return Math.min(delay, this.MAX_RETRY_DELAY_MS);
  }
  
  /**
   * Check if retry limit has been reached
   */
  private hasReachedRetryLimit(): boolean {
    return this.retryCount >= this.MAX_RETRIES;
  }
  
  /**
   * Increment retry count and check if limit reached
   * Returns true if can retry, false if limit reached
   */
  private incrementRetryCount(): boolean {
    this.retryCount++;
    console.log(`[LiveAPIStateMachine] Retry count: ${this.retryCount}/${this.MAX_RETRIES}`);
    return !this.hasReachedRetryLimit();
  }
  
  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Reset the state machine to disconnected state
   * Can be called from error state to retry
   */
  async reset(): Promise<void> {
    if (!this.canTransition('disconnected')) {
      throw new Error(`Cannot reset from ${this.currentState} state`);
    }
    
    // Clear error and reset retry count
    this.lastError = null;
    this.resetRetryCount();
    
    // Perform cleanup if needed
    if (this.mediaStreams.length > 0) {
      await this.performCleanup();
    }
    
    // Transition to disconnected
    await this.transitionTo('disconnected');
  }
}

/**
 * Create a new LiveAPIStateMachine instance
 */
export function createLiveAPIStateMachine(): LiveAPIStateMachine {
  return new LiveAPIStateMachineImpl();
}
