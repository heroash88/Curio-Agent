import { friendlyGoogleError } from '../utils/googleApiErrors';

export interface GooglePhotosAlbum {
    id: string;
    title: string;
    productUrl: string;
    mediaItemsCount: string;
    coverPhotoBaseUrl: string;
    coverPhotoMediaItemId: string;
}

export interface GooglePhotosMediaItem {
    id: string;
    productUrl: string;
    baseUrl: string;
    mimeType: string;
    mediaMetadata: {
        creationTime: string;
        width: string;
        height: string;
        photo?: Record<string, any>;
        video?: Record<string, any>;
    };
    filename: string;
}



export const fetchAlbums = async (accessToken: string): Promise<GooglePhotosAlbum[]> => {
    let allAlbums: GooglePhotosAlbum[] = [];
    let pageToken = '';

    do {
        const url = `https://photoslibrary.googleapis.com/v1/albums?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error('UNAUTHORIZED');
            if (response.status === 403) {
                const err = await response.json().catch(() => null);
                throw new Error(friendlyGoogleError(new Error(err?.error?.message || 'Photos API access denied')));
            }
            throw new Error(`Failed to fetch albums: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.albums) {
            allAlbums.push(...data.albums);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return allAlbums;
};

export const fetchSharedAlbums = async (accessToken: string): Promise<GooglePhotosAlbum[]> => {
    let allShared: GooglePhotosAlbum[] = [];
    let pageToken = '';

    do {
        const url = `https://photoslibrary.googleapis.com/v1/sharedAlbums?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error('UNAUTHORIZED');
            if (response.status === 403) {
                const err = await response.json().catch(() => null);
                throw new Error(friendlyGoogleError(new Error(err?.error?.message || 'Photos API access denied')));
            }
            throw new Error(`Failed to fetch shared albums: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.sharedAlbums) {
            allShared.push(...data.sharedAlbums);
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return allShared;
};

export const fetchAlbumMedia = async (accessToken: string, albumId: string): Promise<GooglePhotosMediaItem[]> => {
    const response = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            albumId,
            pageSize: 100,
        }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('UNAUTHORIZED');
        }
        throw new Error(`Failed to fetch album media: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter to only include photos
    const mediaItems = data.mediaItems || [];
    return mediaItems.filter((item: GooglePhotosMediaItem) => item.mimeType?.startsWith('image/'));
};
