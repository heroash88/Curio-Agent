
import { randomId } from '../utils/randomId';

export interface BookmarkItem {
    id: string;
    name: string;
    url: string;
    icon?: string;
    createdAt: number;
}

const STORAGE_KEY = 'etheros_bookmarks';
export const BOOKMARKS_EVENT = 'curio:bookmarks-changed';

export function getBookmarks(): BookmarkItem[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

export function saveBookmarks(bookmarks: BookmarkItem[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent(BOOKMARKS_EVENT));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
}

export function addBookmark(name: string, url: string) {
    const bookmarks = getBookmarks();
    const newBookmark: BookmarkItem = {
        id: randomId(),
        name,
        url: url.startsWith('http') ? url : `https://${url}`,
        createdAt: Date.now()
    };
    saveBookmarks([newBookmark, ...bookmarks]);
}

export function deleteBookmark(id: string) {
    const bookmarks = getBookmarks();
    saveBookmarks(bookmarks.filter(b => b.id !== id));
}
