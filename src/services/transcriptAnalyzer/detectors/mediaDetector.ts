import type { CardEvent, YouTubeCardData, ImageCardData } from '../../cardTypes';

export function detectYouTube(_normalized: string, original: string): CardEvent | null {
    try {
        if (/YOUTUBE_CLOSE/i.test(original)) {
            window.dispatchEvent(new Event('curio:close-video'));
            return null;
        }

        const searchMatch = original.match(/YOUTUBE_SEARCH:\s*(.+?)(?:\n|$)/i);
        if (searchMatch) {
            return {
                type: 'youtube',
                data: { searchQuery: searchMatch[1].trim(), title: searchMatch[1].trim() } as unknown as Record<string, unknown>,
                persistent: true,
            };
        }

        const patterns = [
            /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/i,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
            /YOUTUBE_ID:\s*([a-zA-Z0-9_-]{11})/i,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
        ];
        for (const pattern of patterns) {
            const match = original.match(pattern);
            if (match) {
                const videoId = match[1];
                const urlIndex = original.indexOf(match[0]);
                const before = original.substring(0, urlIndex).trim();
                const after = original.substring(urlIndex + match[0].length).trim();
                const title = before || after || 'YouTube Video';

                const data: YouTubeCardData = { videoId, title };
                return { type: 'youtube', data: data as unknown as Record<string, unknown>, persistent: true };
            }
        }
        return null;
    } catch {
        return null;
    }
}

export function detectImage(_normalized: string, original: string): CardEvent | null {
    try {
        const imageUrlPattern = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff))/i;
        const match = original.match(imageUrlPattern);
        if (!match) return null;

        const imageUrl = match[1];
        const urlIndex = original.indexOf(match[0]);
        const before = original.substring(0, urlIndex).trim();
        const after = original.substring(urlIndex + match[0].length).trim();
        const caption = before || after || '';

        const data: ImageCardData = { imageUrl, caption };
        return { type: 'image', data: data as unknown as Record<string, unknown>, autoDismissMs: 8000 };
    } catch {
        return null;
    }
}
