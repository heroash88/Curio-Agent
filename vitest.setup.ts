import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const ensureStorageLike = (storage: Storage | undefined, key: 'localStorage' | 'sessionStorage') => {
  if (
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function' &&
    typeof storage.clear === 'function'
  ) {
    return;
  }

  const backingStore = new Map<string, string>();
  const storageShim: Storage = {
    get length() {
      return backingStore.size;
    },
    clear() {
      backingStore.clear();
    },
    getItem(name: string) {
      return backingStore.has(name) ? backingStore.get(name)! : null;
    },
    key(index: number) {
      return Array.from(backingStore.keys())[index] ?? null;
    },
    removeItem(name: string) {
      backingStore.delete(name);
    },
    setItem(name: string, value: string) {
      backingStore.set(name, String(value));
    },
  };

  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: storageShim,
  });
};

ensureStorageLike(globalThis.localStorage, 'localStorage');
ensureStorageLike(globalThis.sessionStorage, 'sessionStorage');

// Polyfill ResizeObserver for jsdom (used by MapPreview, PlacesCard, etc.)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(target: Element) {
      // Fire immediately with a reasonable default size so components render
      this.cb(
        [{ contentRect: { width: 300, height: 150 } } as unknown as ResizeObserverEntry],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
