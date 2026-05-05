import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDeferredSketchProjectWriter,
  createStoredSketchProject,
  deleteStoredSketchLibraryEntry,
  readStoredSketchLibrary,
  readStoredSketchProjectFromStorage,
  saveStoredSketchLibraryEntry,
  writeStoredSketchProjectToStorage,
} from './freeformSketchStore';

describe('freeformSketchStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds an in-app saved project without requiring an export download payload', () => {
    const items = [
      { id: 'a', kind: 'path', points: [{ x: 1, y: 2 }] },
      { id: 'b', kind: 'connector', from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 8, y: 8 } },
    ];

    const project = createStoredSketchProject(items, 1234);

    expect(project).toEqual({
      version: 2,
      savedAt: 1234,
      items,
    });
  });

  it('writes only the bounded project JSON into app storage', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const items = Array.from({ length: 5 }, (_, index) => ({ id: `${index}` }));

    writeStoredSketchProjectToStorage(storageLike, 'curio_sketch_test', {
      version: 2,
      savedAt: 99,
      items,
    }, 3);

    expect(JSON.parse(storage.get('curio_sketch_test') || '{}')).toEqual({
      version: 2,
      savedAt: 99,
      items: [{ id: '2' }, { id: '3' }, { id: '4' }],
    });
  });

  it('reads legacy item arrays as versioned projects', () => {
    const storageLike = {
      getItem: () => JSON.stringify([{ id: 'legacy-item' }]),
      setItem: () => undefined,
    };

    expect(readStoredSketchProjectFromStorage(storageLike, 'legacy', 42)).toEqual({
      version: 2,
      savedAt: 42,
      items: [{ id: 'legacy-item' }],
    });
  });

  it('saves and lists named in-app sketch snapshots newest first', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    const first = saveStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', {
      name: 'Morning map',
      project: createStoredSketchProject([{ id: 'a' }], 1000),
      thumbnail: 'data:image/svg+xml;base64,first',
    }, 1000);
    const second = saveStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', {
      name: 'Evening plan',
      project: createStoredSketchProject([{ id: 'b' }], 2000),
      thumbnail: 'data:image/svg+xml;base64,second',
    }, 2000);

    expect(readStoredSketchLibrary(storageLike, 'curio_sketch_library_test')).toEqual([
      {
        id: second.id,
        name: 'Evening plan',
        savedAt: 2000,
        thumbnail: 'data:image/svg+xml;base64,second',
        project: { version: 2, savedAt: 2000, items: [{ id: 'b' }] },
      },
      {
        id: first.id,
        name: 'Morning map',
        savedAt: 1000,
        thumbnail: 'data:image/svg+xml;base64,first',
        project: { version: 2, savedAt: 1000, items: [{ id: 'a' }] },
      },
    ]);
  });

  it('keeps the saved sketch library bounded and supports deletion', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    const first = saveStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', {
      name: 'First',
      project: createStoredSketchProject([{ id: 'first' }], 1000),
    }, 1000, 2);
    const second = saveStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', {
      name: 'Second',
      project: createStoredSketchProject([{ id: 'second' }], 2000),
    }, 2000, 2);
    const third = saveStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', {
      name: 'Third',
      project: createStoredSketchProject([{ id: 'third' }], 3000),
    }, 3000, 2);

    expect(readStoredSketchLibrary(storageLike, 'curio_sketch_library_test').map((entry) => entry.id)).toEqual([
      third.id,
      second.id,
    ]);

    expect(deleteStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', third.id)).toBe(true);
    expect(readStoredSketchLibrary(storageLike, 'curio_sketch_library_test').map((entry) => entry.id)).toEqual([
      second.id,
    ]);
    expect(deleteStoredSketchLibraryEntry(storageLike, 'curio_sketch_library_test', first.id)).toBe(false);
  });

  it('coalesces deferred current-sketch writes and flushes only the latest project', () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    };
    const writer = createDeferredSketchProjectWriter(storageLike, 'curio_sketch_current', 500);

    writer.schedule(createStoredSketchProject([{ id: 'first' }], 1000));
    writer.schedule(createStoredSketchProject([{ id: 'second' }], 2000));

    expect(storageLike.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(storageLike.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(storageLike.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.get('curio_sketch_current') || '{}')).toEqual({
      version: 2,
      savedAt: 2000,
      items: [{ id: 'second' }],
    });
  });

  it('flushes and cancels deferred sketch writes explicitly', () => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    };
    const writer = createDeferredSketchProjectWriter(storageLike, 'curio_sketch_current', 500);

    writer.schedule(createStoredSketchProject([{ id: 'flush' }], 3000));
    writer.flush();

    expect(storageLike.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.get('curio_sketch_current') || '{}').items).toEqual([{ id: 'flush' }]);

    writer.schedule(createStoredSketchProject([{ id: 'cancel' }], 4000));
    writer.cancel();
    vi.advanceTimersByTime(500);

    expect(storageLike.setItem).toHaveBeenCalledTimes(1);
  });
});
