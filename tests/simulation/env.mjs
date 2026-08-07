/**
 * A browser-shaped environment for the domain modules, and the org-switch
 * mechanic the app relies on.
 *
 * `src/data/*` read `orgScopedKey(...)` — and therefore the active organisation
 * key — at plain module-evaluation time. In the browser, switching organisation
 * is followed by `window.location.reload()` (src/lib/orgScope.ts), which is what
 * makes every module re-evaluate under the new namespace; the isolation spec
 * calls that reload "not cosmetic".
 *
 * Node has no reload, so `loadAppFor(orgKey)` emulates one: set the key, then
 * import the bundle under a fresh URL. ESM caches per URL, so a distinct query
 * string yields a fresh module graph — the same effect, and the same
 * requirement made explicit rather than assumed.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = pathToFileURL(resolve(here, '.build/app.mjs')).href;

/** localStorage, kept per key exactly as the browser does. */
class MemoryStorage {
  #map = new Map();
  getItem(key) { return this.#map.has(key) ? this.#map.get(key) : null; }
  setItem(key, value) { this.#map.set(key, String(value)); }
  removeItem(key) { this.#map.delete(key); }
  clear() { this.#map.clear(); }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  get length() { return this.#map.size; }
  /** Every key currently held — used to assert the per-org namespacing. */
  keys() { return [...this.#map.keys()]; }
}

export const storage = new MemoryStorage();

export function installBrowserEnvironment() {
  const listeners = new Map();
  const win = {
    localStorage: storage,
    addEventListener(type, fn) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) {
      listeners.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
    location: { hostname: 'simulation.local', reload() {} },
  };
  globalThis.window = win;
  globalThis.localStorage = storage;
  if (typeof globalThis.Event === 'undefined') {
    globalThis.Event = class { constructor(type) { this.type = type; } };
  }
}

let generation = 0;

/**
 * The app as an organisation's user sees it: active key set, module graph
 * evaluated fresh underneath it.
 */
export async function loadAppFor(orgKey) {
  storage.setItem('modcon.hr.activeOrgKey', orgKey);
  generation += 1;
  return import(`${BUNDLE}?org=${encodeURIComponent(orgKey)}&gen=${generation}`);
}
