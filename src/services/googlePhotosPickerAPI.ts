// src/services/googlePhotosPickerAPI.ts
// Google Photos Picker API (the official replacement for the deprecated Library API)
// Scope: https://www.googleapis.com/auth/photospicker.mediaitems.readonly

import { friendlyGoogleError } from '../utils/googleApiErrors';

const PICKER_API_BASE = 'https://photospicker.googleapis.com/v1';

export interface PickerSession {
    id: string;
    pickerUri: string;
    mediaItemsSet: boolean;
    pollingConfig?: {
        pollInterval: string; // e.g. "5s"
        timeoutIn: string;
    };
}

export interface PickerMediaItem {
    id: string;
    createTime: string;
    type: 'PHOTO' | 'VIDEO';
    mediaFile: {
        baseUrl: string;
        mimeType: string;
        mediaFileMetadata?: {
            width: number;
            height: number;
        };
    };
}

export async function getPickerSession(accessToken: string, sessionId: string): Promise<PickerSession> {
    const res = await fetch(`${PICKER_API_BASE}/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        const raw = err?.error?.message || `Picker session fetch failed: ${res.status}`;
        throw new Error(friendlyGoogleError(new Error(raw)));
    }
    return res.json();
}

/** Step 1: Create a new picker session. Returns session with pickerUri to open. */
export async function createPickerSession(accessToken: string): Promise<PickerSession> {
    const res = await fetch(`${PICKER_API_BASE}/sessions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        const raw = err?.error?.message || `Picker session create failed: ${res.status}`;
        throw new Error(friendlyGoogleError(new Error(raw)));
    }
    return res.json();
}

/** Step 2: Poll session until mediaItemsSet = true. Returns final session. */
export async function pollPickerSession(
    accessToken: string,
    sessionId: string,
    onUpdate?: (session: PickerSession) => void,
    timeoutMs = 300_000 // 5 min
): Promise<PickerSession> {
    const deadline = Date.now() + timeoutMs;
    let interval = 4000; // start at 4s

    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, interval));

        const session = await getPickerSession(accessToken, sessionId);
        onUpdate?.(session);

        if (session.mediaItemsSet) return session;

        // Respect recommended poll interval from API if provided
        if (session.pollingConfig?.pollInterval) {
            const secs = parseFloat(session.pollingConfig.pollInterval.replace('s', ''));
            if (!isNaN(secs)) interval = secs * 1000;
        }
    }
    throw new Error('Picker session timed out waiting for user selection.');
}

/** Step 3: List media items selected in the session (photos only). */
export async function listPickerMediaItems(
    accessToken: string,
    sessionId: string
): Promise<PickerMediaItem[]> {
    const allItems: PickerMediaItem[] = [];
    let pageToken = '';

    do {
        const url = `${PICKER_API_BASE}/mediaItems?sessionId=${sessionId}&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            const raw = err?.error?.message || `Picker media list failed: ${res.status}`;
            throw new Error(friendlyGoogleError(new Error(raw)));
        }
        const data = await res.json();
        const items: PickerMediaItem[] = (data.mediaItems || []).filter(
            (item: PickerMediaItem) => item.type === 'PHOTO'
        );
        allItems.push(...items);
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return allItems;
}
