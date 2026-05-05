export interface StoredVoiceProfile {
  id: string;
  name: string;
  embedding: number[] | Float32Array;
  embeddingVersion: number;
  createdAt: number;
  updatedAt: number;
  source: 'recording' | 'upload';
  sampleRate: number;
  durationMs: number;
}

export interface VoiceProfileStoreAdapter {
  put(profile: StoredVoiceProfile): Promise<void>;
  get(profileId: string): Promise<StoredVoiceProfile | null>;
  list(): Promise<StoredVoiceProfile[]>;
  delete(profileId: string): Promise<void>;
}

const DB_NAME = 'curio-voice-profiles';
const DB_VERSION = 1;
const STORE_NAME = 'voices';

let storeAdapterOverride: VoiceProfileStoreAdapter | null = null;
let indexedDbAdapter: VoiceProfileStoreAdapter | null = null;

const normalizeVoiceProfile = (profile: StoredVoiceProfile): StoredVoiceProfile | null => {
  if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') {
    return null;
  }

  let embedding = profile.embedding;
  if (!embedding || (!Array.isArray(embedding) && !(embedding instanceof Float32Array))) {
    return null;
  }

  if (embedding.length === 0) {
    return null;
  }

  const createdAt = Number.isFinite(profile.createdAt) ? profile.createdAt : Date.now();
  const updatedAt = Number.isFinite(profile.updatedAt) ? profile.updatedAt : createdAt;

  return {
    id: profile.id.trim(),
    name: profile.name.trim() || 'Custom Voice',
    embedding,
    embeddingVersion: Number.isFinite(profile.embeddingVersion) ? profile.embeddingVersion : 1,
    createdAt,
    updatedAt,
    source: profile.source === 'recording' ? 'recording' : 'upload',
    sampleRate: Number.isFinite(profile.sampleRate) && profile.sampleRate > 0 ? profile.sampleRate : 16000,
    durationMs: Number.isFinite(profile.durationMs) && profile.durationMs > 0 ? profile.durationMs : 0,
  };
};

const openDb = async (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available.');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const createIndexedDbAdapter = (): VoiceProfileStoreAdapter => ({
  async put(profile) {
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(profile);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async get(profileId) {
    const db = await openDb();

    return new Promise<StoredVoiceProfile | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(profileId);
      request.onsuccess = () => resolve((request.result as StoredVoiceProfile | undefined) || null);
      request.onerror = () => reject(request.error);
    });
  },

  async list() {
    const db = await openDb();

    return new Promise<StoredVoiceProfile[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as StoredVoiceProfile[]) || []);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(profileId) {
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(profileId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
});

const getAdapter = (): VoiceProfileStoreAdapter => {
  if (storeAdapterOverride) {
    return storeAdapterOverride;
  }

  if (!indexedDbAdapter) {
    indexedDbAdapter = createIndexedDbAdapter();
  }

  return indexedDbAdapter;
};

export const setVoiceProfileStoreAdapter = (adapter: VoiceProfileStoreAdapter | null): void => {
  storeAdapterOverride = adapter;
};

export const saveVoiceProfile = async (profile: StoredVoiceProfile): Promise<void> => {
  const normalized = normalizeVoiceProfile(profile);
  if (!normalized) {
    throw new Error('Invalid voice profile.');
  }

  await getAdapter().put(normalized);
};

export const getVoiceProfile = async (profileId: string): Promise<StoredVoiceProfile | null> => {
  const profile = await getAdapter().get(profileId);
  return profile ? normalizeVoiceProfile(profile) : null;
};

export const listVoiceProfiles = async (): Promise<StoredVoiceProfile[]> => {
  const profiles = await getAdapter().list();
  return profiles
    .map(normalizeVoiceProfile)
    .filter((profile): profile is StoredVoiceProfile => Boolean(profile))
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

export const renameVoiceProfile = async (profileId: string, name: string): Promise<void> => {
  const nextName = name.trim();
  if (!nextName) {
    return;
  }

  const profile = await getVoiceProfile(profileId);
  if (!profile) {
    return;
  }

  await saveVoiceProfile({
    ...profile,
    name: nextName,
    updatedAt: Date.now(),
  });
};

export const deleteVoiceProfile = async (profileId: string): Promise<void> => {
  await getAdapter().delete(profileId);
};

export const replaceVoiceProfiles = async (profiles: StoredVoiceProfile[]): Promise<void> => {
  const existingProfiles = await listVoiceProfiles();
  for (const profile of existingProfiles) {
    await deleteVoiceProfile(profile.id);
  }
  for (const profile of profiles) {
    await saveVoiceProfile(profile);
  }
};
