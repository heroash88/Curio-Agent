const DB_NAME = 'curio-dashboard-images';
const DB_VERSION = 1;
const STORE_GALLERY = 'gallery-images';
const MAX_GALLERY_IMAGE_EDGE = 1600;
const memoryGalleryImages = new Map<string, DashboardGalleryImageRecord>();

export interface DashboardGalleryImageRecord {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

const canUseIndexedDB = (): boolean =>
  typeof indexedDB !== 'undefined';

const openDashboardImageDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIndexedDB()) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_GALLERY)) {
        db.createObjectStore(STORE_GALLERY, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open image store.'));
  });

const createGalleryImageId = (): string =>
  `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const storeRecordInMemory = (record: DashboardGalleryImageRecord): void => {
  memoryGalleryImages.set(record.id, record);
};

const getMemoryRecord = (id: string): DashboardGalleryImageRecord | undefined =>
  memoryGalleryImages.get(id);

const putGalleryRecord = async (record: DashboardGalleryImageRecord): Promise<void> => {
  if (!canUseIndexedDB()) {
    storeRecordInMemory(record);
    return;
  }

  const db = await openDashboardImageDB();
  try {
    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    tx.objectStore(STORE_GALLERY).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save gallery image.'));
      tx.onabort = () => reject(tx.error || new Error('Failed to save gallery image.'));
    });
  } finally {
    db.close();
  }
};

const getGalleryRecord = async (id: string): Promise<DashboardGalleryImageRecord | null> => {
  if (!canUseIndexedDB()) {
    return getMemoryRecord(id) || null;
  }

  const db = await openDashboardImageDB();
  try {
    const tx = db.transaction(STORE_GALLERY, 'readonly');
    const store = tx.objectStore(STORE_GALLERY);
    return await new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve((request.result as DashboardGalleryImageRecord | undefined) || null);
      request.onerror = () => reject(request.error || new Error('Failed to read gallery image.'));
    });
  } finally {
    db.close();
  }
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [metadata = '', encoded = ''] = dataUrl.split(',', 2);
  const mimeMatch = metadata.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch) {
    throw new Error('Unsupported gallery image data URL.');
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeMatch[1] || 'image/jpeg' });
};

const resizeImageBlob = async (blob: Blob): Promise<Blob> =>
  new Promise((resolve) => {
    if (blob.size < 500_000 || typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(blob);
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const longestEdge = Math.max(image.width, image.height);
      if (longestEdge <= MAX_GALLERY_IMAGE_EDGE) {
        resolve(blob);
        return;
      }

      const scale = MAX_GALLERY_IMAGE_EDGE / longestEdge;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(blob);
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((resized) => resolve(resized || blob), 'image/jpeg', 0.85);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    image.src = objectUrl;
  });

const saveGalleryBlob = async (blob: Blob, name: string): Promise<string> => {
  const record: DashboardGalleryImageRecord = {
    id: createGalleryImageId(),
    name,
    blob,
    addedAt: Date.now(),
  };
  await putGalleryRecord(record);
  return record.id;
};

export const addDashboardGalleryImages = async (files: File[]): Promise<string[]> => {
  const ids: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const blob = await resizeImageBlob(file);
    ids.push(await saveGalleryBlob(blob, file.name));
  }
  return ids;
};

export const addDashboardGalleryDataUrls = async (dataUrls: string[]): Promise<string[]> => {
  const ids: string[] = [];
  for (const dataUrl of dataUrls) {
    if (!dataUrl.startsWith('data:image/')) continue;
    const blob = await resizeImageBlob(dataUrlToBlob(dataUrl));
    ids.push(await saveGalleryBlob(blob, 'Imported gallery image'));
  }
  return ids;
};

export const getDashboardGalleryImageBlobUrls = async (
  ids: string[],
): Promise<Record<string, string>> => {
  const urls: Record<string, string> = {};
  for (const id of ids) {
    const record = await getGalleryRecord(id);
    if (record) {
      urls[id] = URL.createObjectURL(record.blob);
    }
  }
  return urls;
};

export const listDashboardGalleryImages = async (): Promise<DashboardGalleryImageRecord[]> => {
  if (!canUseIndexedDB()) {
    return [...memoryGalleryImages.values()];
  }

  const db = await openDashboardImageDB();
  try {
    const tx = db.transaction(STORE_GALLERY, 'readonly');
    const store = tx.objectStore(STORE_GALLERY);
    return await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as DashboardGalleryImageRecord[]) || []);
      request.onerror = () => reject(request.error || new Error('Failed to list gallery images.'));
    });
  } finally {
    db.close();
  }
};

export const replaceDashboardGalleryImages = async (
  records: DashboardGalleryImageRecord[],
): Promise<void> => {
  memoryGalleryImages.clear();
  records.forEach(storeRecordInMemory);

  if (!canUseIndexedDB()) return;

  const db = await openDashboardImageDB();
  try {
    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    const store = tx.objectStore(STORE_GALLERY);
    store.clear();
    for (const record of records) {
      store.put(record);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to replace gallery images.'));
      tx.onabort = () => reject(tx.error || new Error('Failed to replace gallery images.'));
    });
  } finally {
    db.close();
  }
};

export const removeDashboardGalleryImage = async (id: string): Promise<void> => {
  memoryGalleryImages.delete(id);
  if (!canUseIndexedDB()) return;

  const db = await openDashboardImageDB();
  try {
    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    tx.objectStore(STORE_GALLERY).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to remove gallery image.'));
      tx.onabort = () => reject(tx.error || new Error('Failed to remove gallery image.'));
    });
  } finally {
    db.close();
  }
};
