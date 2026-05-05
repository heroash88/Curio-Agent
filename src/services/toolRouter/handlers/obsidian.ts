/**
 * Obsidian note handlers: search, read, create, append. All handlers gate
 * on getObsidianEnabled() so the LLM cannot silently write notes when the
 * integration is disconnected.
 */

import { getObsidianEnabled } from '../../../utils/settingsStorage';
import { register } from '../router';

register('obsidian_search_notes', async (args, ctx) => {
    if (!getObsidianEnabled()) return { result: { success: false, error: 'Obsidian integration is not enabled. Enable it in Settings > Accounts & Keys.' }, emittedCard: false };
    const query = String(args?.query || '').trim();
    if (!query) return { result: { success: false, error: 'A search query is required.' }, emittedCard: false };
    try {
        const { searchNotes } = await import('../../obsidianApi');
        const results = await searchNotes(query);
        if (ctx.onCardEvent && results.length > 0) {
            ctx.onCardEvent({
                type: 'obsidianNote',
                data: {
                    title: `Obsidian: "${query}"`,
                    content: '',
                    matches: results.slice(0, 10).map(r => ({ filename: r.filename, context: r.matches?.[0]?.context })),
                    mode: 'search',
                },
            });
        }
        return { result: { success: true, resultCount: results.length, results: results.slice(0, 10).map(r => ({ filename: r.filename })) }, emittedCard: results.length > 0 };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('obsidian_read_note', async (args, ctx) => {
    if (!getObsidianEnabled()) return { result: { success: false, error: 'Obsidian integration is not enabled.' }, emittedCard: false };
    const path = String(args?.path || '').trim();
    if (!path) return { result: { success: false, error: 'A note path is required.' }, emittedCard: false };
    try {
        const { readNote } = await import('../../obsidianApi');
        const { rememberObsidianNote } = await import('../../obsidianRecentNotesStore');
        const content = await readNote(path);
        const title = path.split('/').pop()?.replace(/\.md$/i, '') || path;
        rememberObsidianNote({
            path,
            title,
            preview: content.slice(0, 280),
            updatedAt: Date.now(),
        });
        if (ctx.onCardEvent) {
            ctx.onCardEvent({
                type: 'obsidianNote',
                data: { title, content: content.slice(0, 2000), path, mode: 'view' },
                persistent: true,
            });
        }
        return { result: { success: true, path, contentLength: content.length, preview: content.slice(0, 500) }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('obsidian_create_note', async (args, ctx) => {
    if (!getObsidianEnabled()) return { result: { success: false, error: 'Obsidian integration is not enabled.' }, emittedCard: false };
    const path = String(args?.path || '').trim();
    const content = String(args?.content || '');
    if (!path) return { result: { success: false, error: 'A note path is required.' }, emittedCard: false };
    try {
        const { createNote } = await import('../../obsidianApi');
        const { rememberObsidianNote } = await import('../../obsidianRecentNotesStore');
        await createNote(path, content);
        const title = path.split('/').pop()?.replace(/\.md$/i, '') || path;
        rememberObsidianNote({
            path,
            title,
            preview: content.slice(0, 280),
            updatedAt: Date.now(),
        });
        if (ctx.onCardEvent) {
            ctx.onCardEvent({
                type: 'obsidianNote',
                data: { title: `Created: ${title}`, content: content.slice(0, 500), path, mode: 'created' },
            });
        }
        return { result: { success: true, path, created: true }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});

register('obsidian_append_note', async (args, ctx) => {
    if (!getObsidianEnabled()) return { result: { success: false, error: 'Obsidian integration is not enabled.' }, emittedCard: false };
    const path = String(args?.path || '').trim();
    const content = String(args?.content || '');
    if (!path) return { result: { success: false, error: 'A note path is required.' }, emittedCard: false };
    try {
        const { appendToNote } = await import('../../obsidianApi');
        const { rememberObsidianNote } = await import('../../obsidianRecentNotesStore');
        await appendToNote(path, content);
        const title = path.split('/').pop()?.replace(/\.md$/i, '') || path;
        rememberObsidianNote({
            path,
            title,
            preview: content.slice(0, 280),
            updatedAt: Date.now(),
        });
        if (ctx.onCardEvent) {
            ctx.onCardEvent({
                type: 'obsidianNote',
                data: { title: `Updated: ${title}`, content: content.slice(0, 500), path, mode: 'appended' },
            });
        }
        return { result: { success: true, path, appended: true }, emittedCard: true };
    } catch (e) {
        return { result: { success: false, error: (e as Error).message }, emittedCard: false };
    }
});
