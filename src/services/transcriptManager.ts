/**
 * TranscriptManager — manages user/assistant transcript accumulation and history.
 * Extracted from LiveClient to isolate transcript state.
 */

import { sanitizeLLMVisibleText } from './ai/llmProvider';

export interface TranscriptEntry {
    speaker: 'user' | 'ai';
    text: string;
}

/**
 * Merge an incoming transcript chunk with the current accumulated text.
 * Handles full containment, overlap detection, and mid-word joins.
 */
export function mergeTranscriptChunk(current: string, incoming: string): string {
    const next = incoming || '';
    if (!current) return next;
    if (!next) return current;

    // Full containment — the API often re-sends the full transcript
    if (next.startsWith(current)) return next;
    if (current.startsWith(next)) return current;

    // Overlap detection — find the longest suffix of current that matches a prefix of next
    const maxOverlap = Math.min(current.length, next.length);
    for (let overlap = maxOverlap; overlap > 0; overlap--) {
        if (current.slice(-overlap) === next.slice(0, overlap)) {
            return current + next.slice(overlap);
        }
    }

    // No overlap — join directly if mid-word continuation, else add space
    const currentEndsClean = /[\s.,!?;:)\]"']$/.test(current);
    const nextStartsLower = /^[a-z]/.test(next);
    if (!currentEndsClean && nextStartsLower) {
        return current + next;
    }

    const needsSpace = /[A-Za-z0-9]$/.test(current) && /^[A-Za-z0-9]/.test(next);
    return `${current}${needsSpace ? ' ' : ''}${next}`;
}

const MAX_HISTORY_ENTRIES = 100;

export class TranscriptManager {
    public history: TranscriptEntry[] = [];
    public pendingUser = '';
    public pendingAssistant = '';
    private rawPendingAssistant = '';
    private historySnapshotCache: TranscriptEntry[] = [];
    private historySnapshotDirty = true;

    /** Append an incoming user transcript chunk. */
    mergeUserChunk(text: string) {
        this.pendingUser = mergeTranscriptChunk(this.pendingUser, text);
    }

    /** Append an incoming assistant transcript chunk. */
    mergeAssistantChunk(text: string) {
        this.rawPendingAssistant = mergeTranscriptChunk(this.rawPendingAssistant, text);
        this.pendingAssistant = sanitizeLLMVisibleText(this.rawPendingAssistant);
    }

    /** Finalize the current turn: push pending transcripts to history and reset. */
    finalizeTurn(): { userCommitted: boolean } {
        let userCommitted = false;
        if (this.pendingUser.trim()) {
            this.history.push({ speaker: 'user', text: this.pendingUser });
            userCommitted = true;
        }
        if (this.pendingAssistant.trim()) {
            this.history.push({ speaker: 'ai', text: this.pendingAssistant });
        }
        // Cap history to prevent unbounded growth in long sessions
        if (this.history.length > MAX_HISTORY_ENTRIES) {
            this.history = this.history.slice(-MAX_HISTORY_ENTRIES);
        }
        this.historySnapshotDirty = true;
        this.pendingUser = '';
        this.pendingAssistant = '';
        this.rawPendingAssistant = '';
        return { userCommitted };
    }

    /** Clear only the assistant pending text (e.g. on vision assist). */
    clearPendingAssistant() {
        this.pendingAssistant = '';
        this.rawPendingAssistant = '';
    }

    /** Get a snapshot of the history array (for status callbacks). */
    getHistorySnapshot(): TranscriptEntry[] {
        if (this.historySnapshotDirty) {
            this.historySnapshotCache = [...this.history];
            this.historySnapshotDirty = false;
        }
        return this.historySnapshotCache;
    }
}
