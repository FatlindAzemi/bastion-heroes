/**
 * Key/value storage wrapper (spec 11.9). On the web it uses `localStorage`, on a
 * device the M6 Capacitor Preferences adapter will replace it. When storage is
 * blocked (private mode, quota, no DOM in tests) an in-memory fallback keeps the
 * session playable instead of crashing.
 */

/** The minimal storage surface the save layer needs. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();
let injected: StorageAdapter | null = null;

/** In-memory adapter used when the browser storage is unavailable. */
const memoryAdapter: StorageAdapter = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
};

/** Returns the browser storage when it is usable, otherwise the memory fallback. */
function browserAdapter(): StorageAdapter {
  if (typeof localStorage === 'undefined') {
    return memoryAdapter;
  }
  try {
    const probe = '__bh_storage_probe__';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryAdapter;
  }
}

/** The active adapter; tests can swap it with `setStorageAdapterForTests`. */
function activeAdapter(): StorageAdapter {
  return injected ?? browserAdapter();
}

/** Reads one key; null when it does not exist or storage throws. */
export function readStorage(key: string): string | null {
  try {
    return activeAdapter().getItem(key);
  } catch {
    return memoryAdapter.getItem(key);
  }
}

/** Writes one key; falls back to memory when the persistent storage is full. */
export function writeStorage(key: string, value: string): void {
  try {
    activeAdapter().setItem(key, value);
  } catch {
    memoryAdapter.setItem(key, value);
  }
}

/** Removes one key. */
export function removeStorage(key: string): void {
  try {
    activeAdapter().removeItem(key);
  } catch {
    memoryAdapter.removeItem(key);
  }
}

/** Test-only adapter injection; pass null to restore the browser/memory adapter. */
export function setStorageAdapterForTests(adapter: StorageAdapter | null): void {
  injected = adapter;
}

/** Test-only reset of the in-memory fallback. */
export function resetStorageForTests(): void {
  memory.clear();
  injected = null;
}
