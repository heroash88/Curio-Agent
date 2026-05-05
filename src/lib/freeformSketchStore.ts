export const FREEFORM_SKETCH_PROJECT_VERSION = 2;
export const FREEFORM_SKETCH_MAX_STORED_ITEMS = 420;
export const FREEFORM_SKETCH_MAX_LIBRARY_ENTRIES = 18;

export type FreeformStorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type FreeformLibraryStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface FreeformSketchProject<TItem = unknown> {
  version: number;
  savedAt: number;
  items: TItem[];
}

export interface FreeformSketchLibraryEntry<TItem = unknown> {
  id: string;
  name: string;
  savedAt: number;
  thumbnail?: string;
  project: FreeformSketchProject<TItem>;
}

export const createStoredSketchProject = <TItem>(
  items: TItem[],
  savedAt = Date.now(),
  maxItems = FREEFORM_SKETCH_MAX_STORED_ITEMS,
): FreeformSketchProject<TItem> => ({
  version: FREEFORM_SKETCH_PROJECT_VERSION,
  savedAt,
  items: items.slice(-maxItems),
});

export const readStoredSketchProjectFromStorage = <TItem>(
  storage: Pick<Storage, 'getItem'>,
  key: string,
  legacySavedAt = Date.now(),
): FreeformSketchProject<TItem> => {
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return { version: FREEFORM_SKETCH_PROJECT_VERSION, savedAt: 0, items: [] };
    }

    const parsed = JSON.parse(raw) as FreeformSketchProject<TItem> | TItem[];
    if (Array.isArray(parsed)) {
      return {
        version: FREEFORM_SKETCH_PROJECT_VERSION,
        savedAt: legacySavedAt,
        items: parsed,
      };
    }

    return {
      version: Number(parsed.version || FREEFORM_SKETCH_PROJECT_VERSION),
      savedAt: Number(parsed.savedAt || 0),
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { version: FREEFORM_SKETCH_PROJECT_VERSION, savedAt: 0, items: [] };
  }
};

export const writeStoredSketchProjectToStorage = <TItem>(
  storage: FreeformStorageLike,
  key: string,
  project: FreeformSketchProject<TItem>,
  maxItems = FREEFORM_SKETCH_MAX_STORED_ITEMS,
): boolean => {
  try {
    storage.setItem(
      key,
      JSON.stringify({
        ...project,
        items: project.items.slice(-maxItems),
      }),
    );
    return true;
  } catch {
    return false;
  }
};

export interface DeferredSketchProjectWriter<TItem = unknown> {
  schedule: (project: FreeformSketchProject<TItem>) => void;
  flush: () => boolean;
  cancel: () => void;
}

export const createDeferredSketchProjectWriter = <TItem>(
  storage: FreeformStorageLike,
  key: string,
  delayMs = 650,
  maxItems = FREEFORM_SKETCH_MAX_STORED_ITEMS,
): DeferredSketchProjectWriter<TItem> => {
  let pendingProject: FreeformSketchProject<TItem> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimeout = () => {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };

  const flush = () => {
    clearPendingTimeout();
    if (!pendingProject) return false;
    const project = pendingProject;
    pendingProject = null;
    return writeStoredSketchProjectToStorage(storage, key, project, maxItems);
  };

  return {
    schedule(project) {
      pendingProject = project;
      clearPendingTimeout();
      timeoutId = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    flush,
    cancel() {
      clearPendingTimeout();
      pendingProject = null;
    },
  };
};

const createLibraryEntryId = (savedAt: number) => (
  `sketch_library_${savedAt}_${Math.random().toString(36).slice(2, 8)}`
);

const normalizeLibraryEntry = <TItem>(
  entry: Partial<FreeformSketchLibraryEntry<TItem>> | null | undefined,
): FreeformSketchLibraryEntry<TItem> | null => {
  if (!entry || !entry.project) return null;
  const project = entry.project;
  return {
    id: String(entry.id || createLibraryEntryId(Number(entry.savedAt || Date.now()))),
    name: String(entry.name || 'Untitled sketch').trim() || 'Untitled sketch',
    savedAt: Number(entry.savedAt || project.savedAt || Date.now()),
    thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : undefined,
    project: {
      version: Number(project.version || FREEFORM_SKETCH_PROJECT_VERSION),
      savedAt: Number(project.savedAt || entry.savedAt || 0),
      items: Array.isArray(project.items) ? project.items : [],
    },
  };
};

export const readStoredSketchLibrary = <TItem>(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): Array<FreeformSketchLibraryEntry<TItem>> => {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeLibraryEntry<TItem>(entry as Partial<FreeformSketchLibraryEntry<TItem>>))
      .filter((entry): entry is FreeformSketchLibraryEntry<TItem> => Boolean(entry))
      .sort((left, right) => right.savedAt - left.savedAt);
  } catch {
    return [];
  }
};

export const saveStoredSketchLibraryEntry = <TItem>(
  storage: FreeformStorageLike,
  key: string,
  entry: {
    name: string;
    project: FreeformSketchProject<TItem>;
    thumbnail?: string;
  },
  savedAt = Date.now(),
  maxEntries = FREEFORM_SKETCH_MAX_LIBRARY_ENTRIES,
): FreeformSketchLibraryEntry<TItem> => {
  const normalized: FreeformSketchLibraryEntry<TItem> = {
    id: createLibraryEntryId(savedAt),
    name: entry.name.trim() || 'Untitled sketch',
    savedAt,
    thumbnail: entry.thumbnail,
    project: createStoredSketchProject(entry.project.items, savedAt),
  };
  const next = [normalized, ...readStoredSketchLibrary<TItem>(storage, key)]
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, maxEntries);
  storage.setItem(key, JSON.stringify(next));
  return normalized;
};

export const deleteStoredSketchLibraryEntry = (
  storage: FreeformLibraryStorageLike,
  key: string,
  entryId: string,
): boolean => {
  const current = readStoredSketchLibrary(storage, key);
  const next = current.filter((entry) => entry.id !== entryId);
  if (next.length === current.length) return false;
  if (next.length === 0) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(next));
  }
  return true;
};
