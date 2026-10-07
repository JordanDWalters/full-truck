/**
 * Storage adapters (docs/SPEC.md §0: "Local-first, cloud sync optional").
 *
 * `src/sim/` stays headless (AGENTS.md rule 3), so the browser-facing side of
 * persistence lives here. The `SaveStore` port is defined in src/sim/save.ts;
 * this file only implements it.
 */

import type { SaveStore } from '../sim/save';

/** The subset of the Web Storage API we use, so tests can pass a fake. */
export interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One save slot per key; a real app can have several warehouses. */
export const SAVE_KEY = 'full-truck:save:v1';

export function localStorageStore(key: string = SAVE_KEY): SaveStore {
  return webStorageStore(globalThis.localStorage, key);
}

export function webStorageStore(storage: WebStorage, key: string = SAVE_KEY): SaveStore {
  return {
    load: () => storage.getItem(key),
    save: (raw) => {
      storage.setItem(key, raw);
    },
    clear: () => {
      storage.removeItem(key);
    },
  };
}
