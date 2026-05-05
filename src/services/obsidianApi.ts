// src/services/obsidianApi.ts
// Obsidian Local REST API client for reading, creating, searching, and appending notes.
// Requires the "Local REST API" community plugin enabled in Obsidian.
// Docs: https://github.com/coddingtonbear/obsidian-local-rest-api

import { getObsidianUrl, getObsidianApiKey } from '../utils/settingsStorage';

function baseUrl(): string {
    return getObsidianUrl().replace(/\/+$/, '');
}

function headers(): Record<string, string> {
    const key = getObsidianApiKey();
    const h: Record<string, string> = { 'Authorization': `Bearer ${key}` };
    return h;
}

async function throwOnError(res: Response, action: string): Promise<void> {
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Obsidian ${action} failed (${res.status}): ${body}`);
    }
}

// -- List files in vault (or subdirectory) --

export interface VaultFile {
    path: string;
    isDir: boolean;
}

export async function listVaultFiles(dir = '/'): Promise<VaultFile[]> {
    const path = dir === '/' ? '' : dir.replace(/^\//, '');
    const res = await fetch(`${baseUrl()}/vault/${path}`, {
        headers: { ...headers(), 'Accept': 'application/json' },
    });
    await throwOnError(res, 'list files');
    const data = await res.json();
    // API returns { files: [{ path, type }] } or similar
    if (Array.isArray(data.files)) {
        return data.files.map((f: any) => ({
            path: f.path || f,
            isDir: f.type === 'folder' || (typeof f === 'string' && f.endsWith('/')),
        }));
    }
    return [];
}

// -- Read a note --

export async function readNote(path: string): Promise<string> {
    const cleanPath = path.replace(/^\//, '');
    const res = await fetch(`${baseUrl()}/vault/${encodeURI(cleanPath)}`, {
        headers: { ...headers(), 'Accept': 'text/markdown' },
    });
    await throwOnError(res, 'read note');
    return res.text();
}

// -- Create or overwrite a note --

export async function createNote(path: string, content: string): Promise<void> {
    const cleanPath = path.replace(/^\//, '');
    const res = await fetch(`${baseUrl()}/vault/${encodeURI(cleanPath)}`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'text/markdown' },
        body: content,
    });
    await throwOnError(res, 'create note');
}

// -- Append to a note --

export async function appendToNote(path: string, content: string): Promise<void> {
    const cleanPath = path.replace(/^\//, '');
    const res = await fetch(`${baseUrl()}/vault/${encodeURI(cleanPath)}`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'text/markdown' },
        body: content,
    });
    await throwOnError(res, 'append to note');
}

// -- Search notes --

export interface SearchResult {
    filename: string;
    score?: number;
    matches?: Array<{ match: { start: number; end: number }; context: string }>;
}

export async function searchNotes(query: string): Promise<SearchResult[]> {
    const res = await fetch(
        `${baseUrl()}/search/simple/?query=${encodeURIComponent(query)}`,
        { method: 'POST', headers: headers() },
    );
    await throwOnError(res, 'search');
    const data = await res.json();
    if (Array.isArray(data)) {
        return data.map((r: any) => ({
            filename: r.filename || r.path || '',
            score: r.score,
            matches: r.matches,
        }));
    }
    return [];
}

// -- Delete a note --

export async function deleteNote(path: string): Promise<void> {
    const cleanPath = path.replace(/^\//, '');
    const res = await fetch(`${baseUrl()}/vault/${encodeURI(cleanPath)}`, {
        method: 'DELETE',
        headers: headers(),
    });
    await throwOnError(res, 'delete note');
}

// -- Check connection --

export async function checkConnection(): Promise<boolean> {
    try {
        const res = await fetch(`${baseUrl()}/`, { headers: headers() });
        return res.ok;
    } catch {
        return false;
    }
}
