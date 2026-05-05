// src/services/googleKeepAPI.ts

const KEEP_API_BASE = 'https://keep.googleapis.com/v1';

export interface KeepNote {
    name: string;
    title?: string;
    body?: {
        text?: { text: string };
    };
    trashed?: boolean;
    createTime?: string;
    updateTime?: string;
}

/**
 * Creates a new note in the user's Google Keep account.
 * Requires the 'https://www.googleapis.com/auth/keep' OAuth scope.
 *
 * @param accessToken The Google OAuth access token.
 * @param title Optional title for the note.
 * @param text The body text of the note.
 * @returns The created Keep note object.
 */
export async function createKeepNote(
    accessToken: string,
    title: string,
    text: string
): Promise<KeepNote> {
    const body: Record<string, unknown> = {
        body: {
            text: { text },
        },
    };

    if (title) {
        body.title = title.startsWith('[Curio]') ? title : `[Curio] ${title}`;
    }

    const response = await fetch(`${KEEP_API_BASE}/notes`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || `Google Keep API failed with status ${response.status}`);
    }

    return response.json();
}
