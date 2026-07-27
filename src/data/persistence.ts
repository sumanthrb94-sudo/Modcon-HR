/**
 * Local persistence for the mutable seed collections.
 *
 * Several modules — attendance, assets, expenses, helpdesk, payroll,
 * onboarding — were held in React state seeded from a static array. Everything
 * a user did to them (marking attendance, approving a claim, resolving a
 * ticket, processing payroll) survived only until the next refresh, which is
 * indistinguishable from the app losing their work.
 *
 * The pattern already existed for leave, holidays and the employee directory;
 * this is that pattern extracted, so the remaining collections get it without a
 * sixth copy of the same read/write/notify boilerplate.
 *
 * Storage is namespaced per organisation (see lib/orgScope.ts) so two orgs on
 * one browser never read each other's records.
 */
import { orgScopedKey } from '@/lib/orgScope';

export interface PersistentCollection<T> {
  /** Window event dispatched on every write, for components to re-read on. */
  readonly changedEvent: string;
  /** Stored records if this org has any, else the seed. */
  get(): T[];
  save(next: T[]): T[];
  /** Applies a change to the current value and stores the result. */
  update(fn: (current: T[]) => T[]): T[];
}

export function persistentCollection<T>(
  baseKey: string,
  changedEvent: string,
  seed: () => T[],
): PersistentCollection<T> {
  function notify() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(changedEvent));
  }

  function read(): T[] | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(orgScopedKey(baseKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      // Anything that is not an array is treated as absent rather than thrown:
      // a corrupt entry should fall back to the seed, not break the page.
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  }

  const collection: PersistentCollection<T> = {
    changedEvent,

    get() {
      return read() ?? seed();
    },

    save(next) {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(orgScopedKey(baseKey), JSON.stringify(next));
        } catch {
          // Quota or private-mode failure: the in-memory value the caller
          // already holds still stands for this session.
        }
      }
      notify();
      return next;
    },

    update(fn) {
      return collection.save(fn(collection.get()));
    },
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === orgScopedKey(baseKey)) notify();
    });
  }

  return collection;
}
